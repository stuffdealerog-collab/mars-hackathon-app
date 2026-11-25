import "server-only";
import { type Api, type Bot, InlineKeyboard } from "grammy";
import { getPublicUrl } from "../env";
import { type Locale, pickLocale, t } from "../i18n";
import { eventStartPayload } from "../source-category";
import { parseSource, safeLogEvent, track } from "../track";
import { ORDER_BUCKETS, recordOutcome } from "../uslub/brain/memory";
import { authorize, refusal } from "../uslub/botpublish";
import { addBotAsAdminLink } from "../uslub/publish";
import { getBrand, listPosts, type StoredBrand } from "../uslub/store";
import { approveWeek } from "./approve";
import { say, whenLabel } from "./copy";
import { memberKey } from "./member-key";
import { loadAutopilotRow, saveBotAdmin, saveGoal, saveMemberEvent, saveReactions, touchUser, weekPlan } from "./repo";
import { setAutopilot } from "./service";
import { chatKey, memberChange, reactionTotals } from "./signals";
import { botAdminFrom, readAutopilot, trialDaysLeft } from "./state";
import { isoWeek, weekBounds } from "./time";
import { selectWeekBatch } from "./week";
import { APPROVE_WEEK_RE, AUTOPILOT_RE, GOAL_RE, ORDERS_RE, WEEK_RETRY_RE, weekMessage } from "./week-message";

/**
 * The autopilot in the bot (registered once in src/lib/bot.ts with registerAutopilot(bot), before the bot's own
 * /start handler):
 * - /start week_<brandId>: the Telegram continuation of «approve the week» (anonymous web, or a brand nobody owns
 *   yet: claimed by a channel admin with post rights, the same rule as publish_ links), shows the week;
 * - every button tap counts as the person being active (the autopilot's 14-day gate), whoever's button it is;
 * - [Approve all] (apw:), the autopilot switch (apa:), the Monday orders answer without a plan (apo:) and the goal
 *   answer (apg:): brand owner only; "check again" (apr:) after the bot was made an admin re-runs the week_ link;
 * - my_chat_member: the bot's rights in a channel, stored on the brands of that channel, and one line to the person
 *   who changed them (only for a channel that has a Mercat brand);
 * - chat_member: joins and leaves, the member kept only as a keyed hash;
 * - message_reaction_count: reactions per channel message.
 * Channel updates do O(1) work and never message anyone but the person who changed the bot's rights.
 */

const WEEK_START_RE = /^week_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

type User = { id: number; language_code?: string };
type MemberLike = { status: string; can_post_messages?: boolean; can_invite_users?: boolean };

async function sendWeekView(api: Api, chatId: number, locale: Locale, brand: StoredBrand, kind: "week" | "changed"): Promise<void> {
  const posts = await listPosts(brand.id, 50);
  const batch = selectWeekBatch({ posts, channel: brand.channel, languages: brand.dna?.languages, now: Date.now() });
  const auto = readAutopilot((await loadAutopilotRow(brand.id))?.autopilot);
  const msg = weekMessage(locale, { kind, brandId: brand.id, posts, batch, appUrl: getPublicUrl(), autopilotOn: auto.on, owned: brand.ownerTelegramId != null });
  await api.sendMessage(chatId, msg.text, { link_preview_options: { is_disabled: true }, ...(msg.keyboard ? { reply_markup: msg.keyboard } : {}) });
}

/** /start week_<brandId>: the owner's week, after claiming a brand nobody owns (channel admins only). */
export async function startWeek(api: Api, chatId: number, user: User, locale: Locale, brandId: string): Promise<void> {
  const brand = await getBrand(brandId);
  if (!brand) return void (await api.sendMessage(chatId, say(locale, "not_found")));
  if (brand.ownerTelegramId != null && brand.ownerTelegramId !== user.id) return void (await api.sendMessage(chatId, say(locale, "not_owner")));
  if (brand.ownerTelegramId == null) {
    if (!brand.channel) return void (await sendWeekView(api, chatId, locale, brand, "week"));
    const decision = await authorize(api, brand, brand.channel, user);
    if (!decision.ok && decision.reason === "bot_not_admin") {
      // The autopilot's own message: add the bot, then "check again" runs this link once more. (The publish flow's
      // refusal asks to send the channel name again, which here would start a new onboarding instead.)
      const kb = new InlineKeyboard().url(t(locale, "pub.add_bot"), addBotAsAdminLink()).row().text(say(locale, "week_retry"), `apr:${brand.id}`);
      return void (await api.sendMessage(chatId, say(locale, "week_bot_not_admin", { channel: brand.channel }), { reply_markup: kb }));
    }
    if (!decision.ok) return void (await refusal(api, chatId, locale, decision.reason, brand.channel));
  }
  const fresh = (await getBrand(brand.id)) ?? brand;
  await sendWeekView(api, chatId, locale, fresh, "week");
}

const ownedBy = (brand: StoredBrand | null, userId: number) => Boolean(brand && brand.ownerTelegramId === userId);

export function registerAutopilot(b: Bot): void {
  // Any button tap (the Monday report's ord:/sold:, publish buttons, the autopilot's own) counts as the person being
  // active, so an owner who answers every week is never paused as inactive. At most one write per hour (touchUser).
  b.on("callback_query", (ctx, next) => {
    void touchUser(ctx.from.id);
    return next();
  });

  const pm = b.chatType("private");

  pm.command("start", async (ctx, next) => {
    const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
    const m = WEEK_START_RE.exec(payload);
    if (!m || !ctx.from) return next();
    const locale = pickLocale(ctx.from.language_code);
    await track(ctx.from, "start", { payload: eventStartPayload(payload) }, { source: parseSource(payload) });
    await startWeek(ctx.api, ctx.chat.id, ctx.from, locale, m[1].toLowerCase());
  });

  // [Approve all]: only the posts the owner was shown (hash), only by the owner.
  b.callbackQuery(APPROVE_WEEK_RE, async (ctx) => {
    const [, brandId, hash] = ctx.match;
    const locale = pickLocale(ctx.from.language_code);
    const chatId = ctx.chat?.id ?? ctx.from.id;
    const brand = await getBrand(brandId);
    if (!ownedBy(brand, ctx.from.id)) return void (await ctx.answerCallbackQuery({ text: say(locale, "not_owner") }).catch(() => undefined));
    await ctx.answerCallbackQuery().catch(() => undefined);
    const owned = brand as StoredBrand;
    const posts = await listPosts(owned.id, 50);
    // Only the week shown (hash): any change, or nothing left to approve, shows the week again.
    const res = await approveWeek({ brand: owned, ownerTelegramId: ctx.from.id, api: ctx.api, posts, hash });
    if (res.changed) return void (await sendWeekView(ctx.api, chatId, locale, owned, "changed"));
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
    const byId = new Map(posts.map((p) => [p.id, p]));
    const lines = [say(locale, "week_done"), ...res.queued.map((q) => `• ${whenLabel(Date.parse(q.dueAt), locale)} — ${(byId.get(q.postId)?.slot?.hook ?? "").slice(0, 60)}`)];
    let kb: InlineKeyboard | undefined;
    if (owned.channel && !res.admin.canPost) {
      lines.push("", say(locale, "week_bot_cannot_post", { channel: owned.channel }));
      kb = new InlineKeyboard().url(t(locale, "pub.add_bot"), res.addAdminUrl ?? addBotAsAdminLink());
    }
    await ctx.api.sendMessage(chatId, lines.join("\n"), { link_preview_options: { is_disabled: true }, ...(kb ? { reply_markup: kb } : {}) });
  });

  // The autopilot switch («Har hafta shunday tayyorlab bering»).
  b.callbackQuery(AUTOPILOT_RE, async (ctx) => {
    const [, on, brandId] = ctx.match;
    const locale = pickLocale(ctx.from.language_code);
    const brand = await getBrand(brandId);
    if (!ownedBy(brand, ctx.from.id)) return void (await ctx.answerCallbackQuery({ text: say(locale, "not_owner") }).catch(() => undefined));
    await ctx.answerCallbackQuery().catch(() => undefined);
    const state = await setAutopilot(brandId, on === "1", ctx.from.id);
    const text = state.on ? say(locale, "autopilot_on", { days: trialDaysLeft(state, Date.now()) ?? 7 }) : say(locale, "autopilot_off");
    await ctx.api.sendMessage(ctx.chat?.id ?? ctx.from.id, text);
  });

  // The Monday orders answer for a brand without last week's plan (with one, the report uses the bot's ord: buttons).
  b.callbackQuery(ORDERS_RE, async (ctx) => {
    const [, brandId, bucketKey] = ctx.match;
    const locale = pickLocale(ctx.from.language_code);
    const brand = await getBrand(brandId);
    const bucket = ORDER_BUCKETS[bucketKey];
    if (!ownedBy(brand, ctx.from.id) || !bucket) return void (await ctx.answerCallbackQuery({ text: say(locale, "not_owner") }).catch(() => undefined));
    const bounds = weekBounds(Date.now());
    const plan = await weekPlan(brandId, bounds.weekOf).catch(() => null);
    if (plan) await recordOutcome(plan.id, null, "orders_week", bucket.value, ctx.from.id);
    await safeLogEvent(ctx.from.id, "orders_week", { brand_id: brandId, week: isoWeek(bounds.start), value: bucket.value });
    await ctx.answerCallbackQuery({ text: say(locale, "orders_recorded", { label: bucket.label }) }).catch(() => undefined);
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
  });

  // "Check again" after the bot was made an admin: the week_ link once more (claims the brand, shows the week).
  b.callbackQuery(WEEK_RETRY_RE, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const locale = pickLocale(ctx.from.language_code);
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
    await startWeek(ctx.api, ctx.chat?.id ?? ctx.from.id, ctx.from, locale, ctx.match[1]);
  });

  // The Monday report's goal question (channel type and goal unknown): stored as the brand's goal, owner only.
  b.callbackQuery(GOAL_RE, async (ctx) => {
    const [, brandId, goal] = ctx.match;
    const locale = pickLocale(ctx.from.language_code);
    const brand = await getBrand(brandId);
    if (!ownedBy(brand, ctx.from.id)) return void (await ctx.answerCallbackQuery({ text: say(locale, "not_owner") }).catch(() => undefined));
    await saveGoal(brandId, goal as "sale" | "grow");
    await safeLogEvent(ctx.from.id, "goal_confirmed", { brand_id: brandId, goal, from: "weekly_report" });
    const label = say(locale, goal === "sale" ? "goal_sale" : "goal_grow");
    await ctx.answerCallbackQuery({ text: say(locale, "goal_saved", { label }) }).catch(() => undefined);
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
  });

  // The bot's own rights in a channel changed.
  b.on("my_chat_member", async (ctx) => {
    const u = ctx.myChatMember;
    if (u.chat.type !== "channel" || !u.chat.username) return;
    const channel = u.chat.username.toLowerCase();
    const now = Date.now();
    const before = botAdminFrom(u.old_chat_member as MemberLike, now);
    const after = botAdminFrom(u.new_chat_member as MemberLike, now);
    const brands = await saveBotAdmin(channel, after).catch(() => 0);
    await safeLogEvent(u.from.id, "bot_channel_rights", { channel, status: after.status, can_invite: after.canInvite, brands });
    // A channel without a Mercat brand gets no message: there is nothing of ours to go out there.
    if (!brands || u.from.is_bot || (before.status === after.status && before.canPost === after.canPost)) return;
    const locale = pickLocale(u.from.language_code);
    const key = after.status === "admin" ? "admin_ok" : after.status === "no_post_right" ? "admin_no_post" : "admin_removed";
    const kb = after.status === "admin" ? undefined : new InlineKeyboard().url(t(locale, "pub.add_bot"), addBotAsAdminLink());
    // Only someone who opened the bot can get this; anyone else is skipped quietly.
    await ctx.api.sendMessage(u.from.id, say(locale, key, { channel }), kb ? { reply_markup: kb } : {}).catch(() => undefined);
  });

  // Joins and leaves (only from channels where the bot is an admin). Never the member's Telegram id.
  b.on("chat_member", async (ctx) => {
    const u = ctx.chatMember;
    if (u.chat.type !== "channel" || u.new_chat_member.user.is_bot) return;
    const kind = memberChange(u.old_chat_member, u.new_chat_member);
    if (!kind) return;
    await saveMemberEvent(chatKey(u.chat), memberKey(u.new_chat_member.user.id), kind, kind === "join" ? (u.invite_link?.invite_link ?? null) : null).catch(() => undefined);
  });

  // Reaction counts of channel posts (anonymous in channels: totals only).
  b.on("message_reaction_count", async (ctx) => {
    const u = ctx.messageReactionCount;
    if (u.chat.type !== "channel") return;
    const { total, counts } = reactionTotals(u.reactions);
    await saveReactions(chatKey(u.chat), u.message_id, total, counts).catch(() => undefined);
  });
}
