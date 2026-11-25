import "server-only";
import { after } from "next/server";
import { type Api, Bot, InlineKeyboard } from "grammy";
import { isAiConfigured } from "./ai";
import { registerAutopilot } from "./autopilot/bot-handlers";
import { getSql, isDbConfigured } from "./db";
import { getEnv, getPublicUrl } from "./env";
import { formatDay, type Locale, pickLocale, t } from "./i18n";
import { eventStartPayload } from "./source-category";
import { logPostRegenerated } from "./stats-events";
import { botEventMeta } from "./stats-meta";
import { parseSource, safeLogEvent, track } from "./track";
import { botHandle, botProfile, syncBotProfile } from "./uslub/bot-profile";
import { answerPendingText, clearPending, registerBotFlows } from "./uslub/botflow/flows";
import { REBUILD_RE } from "./uslub/botflow/questions-core";
import { registerVideoFlow, startVideo } from "./uslub/botflow/video";
import { spenderKey, takeUnits } from "./uslub/budget-core";
import { learnFor } from "./uslub/brain/learn-run";
import { latestPlanForOwner, ORDER_BUCKETS, planByTag, recordOutcome } from "./uslub/brain/memory";
import { verifiedPlanBusiness } from "./uslub/brain/plan-owner";
import { scrapeChannelData } from "./uslub/brain/scrape";
import { answerPendingChannel, publishFromButton, startPublish, switchScript } from "./uslub/botpublish";
import { CALLBACK_RE, parseCallback } from "./uslub/botpublish-core";
import { flushUsage, runWithContext } from "./uslub/context";
import { getBrand } from "./uslub/store";
import { clip, wellFormedDeep } from "./uslub/text";
import {
  classifyOnboardText,
  gateMessage,
  onboardGate,
  onboardPrompt,
  type OnboardInput,
  publishFromBot,
  RETRY_ONBOARD_RE,
  runOnboardingInTime,
} from "./uslub/onboard";

/**
 * Runs slow work after the webhook has answered Telegram (no retries on slow
 * AI calls). Outside a Next request scope, falls back to awaiting it.
 */
async function runLater(task: () => Promise<void>): Promise<void> {
  try {
    after(task);
  } catch {
    await task();
  }
}

/**
 * The bot's Telegram profile (name, descriptions, commands, menu button; bot-profile.ts) is brought up to date on
 * the first update an instance handles, after the webhook has answered. It reads before it writes, so a cold start
 * with nothing changed costs a few reads. Failures are logged, never shown to the user.
 */
let profileSyncStarted = false;

/** The language a user's Telegram app uses (app_users), for messages the bot sends them unprompted. */
async function userLocale(telegramId: number): Promise<Locale> {
  if (!isDbConfigured()) return pickLocale(undefined);
  try {
    const rows = (await getSql()`SELECT language_code FROM app_users WHERE telegram_id = ${telegramId}`) as { language_code: string | null }[];
    return pickLocale(rows[0]?.language_code);
  } catch {
    return pickLocale(undefined);
  }
}

function syncProfileOnce(api: Api): void {
  if (profileSyncStarted) return;
  profileSyncStarted = true;
  // MENU_BUTTON_TEXT is optional and not validated in env.ts (lead's file): read as is, empty = "Mercat".
  const want = botProfile(getPublicUrl(), process.env.MENU_BUTTON_TEXT, botHandle());
  void runLater(async () => {
    try {
      const { changed, failed } = await syncBotProfile(api, want);
      if (changed.length || failed.length) console.info(`[bot-profile] changed: ${changed.join(", ") || "none"}; failed: ${failed.join(", ") || "none"}`);
    } catch (err) {
      console.warn("[bot-profile] sync failed:", err instanceof Error ? err.message : err);
    }
  });
}

/**
 * The bot is built lazily on the first webhook request, so `next build`
 * works without TELEGRAM_BOT_TOKEN.
 */
let bot: Bot | null = null;

const PLAN_LINK_RE = /^src_([a-z0-9]{6})_(\d{1,2})$/;

const escapeHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Customer tapped a plan post's link: ask before passing their contact to the business owner. The business is named
 * only when the plan's owner is a verified admin of the brand's channel (plan-owner.ts); otherwise the question
 * speaks for "the post's author".
 */
async function customerFromPlanLink(ctx: { reply: (text: string, other?: object) => Promise<unknown>; api: Api }, tag: string, slot: number, locale: Locale) {
  const plan = await planByTag(tag);
  if (!plan?.ownerTelegramId) {
    await ctx.reply(t(locale, "bot.link_inactive"));
    return;
  }
  const named = await verifiedPlanBusiness(plan, (chat, id) => ctx.api.getChatMember(chat, id));
  await ctx.reply(named ? t(locale, "bot.link_ask_named", { name: named.name, channel: named.channel }) : t(locale, "bot.link_ask"), {
    reply_markup: new InlineKeyboard().text(t(locale, "bot.link_yes"), `lead:${tag}:${slot}`),
  });
}

/**
 * Starts a bot onboarding (channel link or business description): checks AI and the spend gate, says "working",
 * then runs it after the webhook has answered, within its time budget (a late run tells the owner instead of
 * going silent). Claude usage is logged as one llm_usage event (route "bot/onboard"). `onStarted` runs once the run is
 * really on (every gate and the budget passed): analytics that must not count a refused start.
 */
async function startOnboarding(
  ctx: { reply: (text: string, other?: object) => Promise<unknown>; replyWithChatAction: (a: "typing") => Promise<unknown>; api: Api },
  chatId: number,
  userId: number,
  locale: Locale,
  input: Exclude<OnboardInput, null>,
  onStarted?: () => Promise<void>,
): Promise<void> {
  if (!isAiConfigured()) {
    await ctx.reply(t(locale, "bot.ai_unavailable"));
    return;
  }
  // LLM spend guard: one onboarding in flight per user, at most 5 per hour.
  const gate = onboardGate.enter(userId);
  if (!gate.ok) {
    await ctx.reply(gateMessage(gate, locale));
    return;
  }
  // The app-wide daily Claude budget (shared with the API), as the Studio spends it for the same run: a channel run is
  // a brand, an analysis, a plan and posts (4 units); a description is a brand, a launch plan and posts (3). A signed-in
  // Telegram user has no per-user daily cap beyond the hourly gate above.
  const weight = "channel" in input ? 4 : 3;
  const budget = await takeUnits({ actor: spenderKey(userId, ""), anonymous: false, weight, route: "bot/onboard" }).catch(() => "ok" as const);
  if (budget !== "ok") {
    onboardGate.leave(userId);
    await ctx.reply(t(locale, "bot.budget_exhausted"));
    return;
  }
  // A new run: whatever the bot was still asking about an earlier one is moot (the new run asks again).
  await clearPending(userId);
  await onStarted?.().catch(() => undefined);
  try {
    await ctx.reply("channel" in input ? t(locale, "bot.working_channel", { channel: input.channel }) : t(locale, "bot.working_text"));
    await ctx.replyWithChatAction("typing").catch(() => undefined);
  } catch (err) {
    onboardGate.leave(userId);
    throw err;
  }
  const api = ctx.api;
  await runLater(() =>
    runWithContext({ route: "bot/onboard", lang: locale, telegramId: userId }, async () => {
      try {
        const run = await runOnboardingInTime(api, chatId, userId, input, locale);
        // After "this is taking long" the owner has an answer, but the run itself goes on: keep the spend gate (and
        // this after() task, so the function stays up) until it really ends — a retry tap meanwhile is "busy".
        await run.settled;
      } finally {
        onboardGate.leave(userId);
        await flushUsage();
      }
    }),
  );
}

export function getBot(): Bot {
  if (bot) return bot;
  const token = getEnv().TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  // No Bot API call may hang for grammY's default 500 s: a send cut off at 60 s ends as "may have reached the
  // channel" (never resent on its own), long before its publish claim could be taken over (store.ts, 330 s).
  const instance = new Bot(token, { client: { timeoutSeconds: 60 } });
  // Every Bot API call (bot.api, ctx.api, publish.ts) leaves without half an emoji: Telegram rejects text that is
  // not valid UTF-8. Uploads (InputFile) and keyboards pass through untouched.
  instance.api.config.use((prev, method, payload, signal) => prev(method, wellFormedDeep(payload), signal));
  registerHandlers(instance);
  bot = instance;
  return instance;
}

function registerHandlers(b: Bot) {
  // /stats: every event logged while handling an update is tagged surface "bot" (stats-meta.ts).
  b.use(botEventMeta);
  b.use((ctx, next) => {
    syncProfileOnce(ctx.api);
    return next();
  });
  registerAutopilot(b); // week_ links, week/autopilot/orders buttons, channel rights, joins, reactions (before /start below)
  // What the bot waits for after a run (the owner's questions, photos, a video): oq:/oph: buttons, photos, videos.
  registerBotFlows(b, { later: runLater });
  registerVideoFlow(b); // the owner's video for a video post: video_ links, the wait, [Approve] / [Cancel]
  const pm = b.chatType("private");

  // /start <payload> — deep links like https://t.me/<bot>?start=src_booth1
  pm.command("start", async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    const locale = pickLocale(from.language_code);
    const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
    await track(from, "start", { payload: eventStartPayload(payload) }, { source: parseSource(payload) });
    // Starting over (or a publish link, whose next message may be a channel name): no earlier question is still open.
    await clearPending(from.id);

    // The Studio's "Kanalga joylash": t.me/<bot>?start=publish_<postId>[_<script>] — show the post, then publish.
    if (payload.startsWith("publish_")) {
      if (await startPublish(ctx.api, ctx.chat.id, from, locale, payload)) return;
    }

    // The Video tab's "Send the video to the bot": t.me/<bot>?start=video_<postId> — wait for the owner's video.
    if (payload.startsWith("video_")) {
      if (await startVideo(ctx.api, ctx.chat.id, from, locale, payload)) return;
    }

    // A customer who tapped a tracked link in a plan post (src_<planTag>_<slot>): not an owner, no onboarding.
    const planLink = PLAN_LINK_RE.exec(payload);
    if (planLink) {
      await customerFromPlanLink(ctx, planLink[1], Number(planLink[2]), locale);
      return;
    }

    const name = from.first_name || "👋";
    const appUrl = getPublicUrl();
    if (appUrl?.startsWith("https://")) {
      await ctx.reply(t(locale, "bot.greeting", { name }), {
        reply_markup: new InlineKeyboard().webApp(t(locale, "bot.open_app"), `${appUrl}/tg`),
      });
    } else {
      await ctx.reply(t(locale, "bot.greeting_no_app", { name }));
    }
    await ctx.reply(onboardPrompt(locale));
  });

  // /natija — the owner's weekly results for their latest plan + one-tap order count.
  pm.command("natija", async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    const locale = pickLocale(from.language_code);
    const plan = await latestPlanForOwner(from.id);
    if (!plan) {
      await ctx.reply(t(locale, "bot.results_no_plan"));
      return;
    }
    await ctx.replyWithChatAction("typing").catch(() => undefined);
    let lines: string[] = [];
    if (plan.channel) {
      try {
        const data = await scrapeChannelData(plan.channel);
        const r = await learnFor(data.channel, data.posts, Date.now(), locale, { ownerReports: true });
        const mine = r.outcomes.filter((o) => o.planTag === plan.tag);
        const measured = mine.filter((o) => o.status === "final" || o.status === "early");
        const starts = mine.reduce((a, o) => a + o.starts, 0);
        lines = [
          t(locale, "bot.results_summary", { week: formatDay(plan.weekOf, locale), n: plan.items.length, found: mine.filter((o) => o.status !== "not_found").length, measured: measured.length }),
          t(locale, "bot.results_starts", { n: starts }),
          ...r.changes.slice(0, 4).map((c) => `• ${c.replace(/\s*\[[^\]]*\]\s*$/, "")}`),
        ];
      } catch {
        lines = [t(locale, "bot.results_unreadable", { week: formatDay(plan.weekOf, locale) })];
      }
    }
    await ctx.reply([...lines, "", t(locale, "bot.results_question")].join("\n"), {
      reply_markup: new InlineKeyboard()
        .text("0", `ord:${plan.tag}:0`)
        .text("1–3", `ord:${plan.tag}:1`)
        .text("4–10", `ord:${plan.tag}:4`)
        .text("10+", `ord:${plan.tag}:10`),
    });
  });

  pm.command("help", async (ctx) => {
    await ctx.reply(t(pickLocale(ctx.from?.language_code), "bot.help", { bot: botHandle() }));
  });

  // Any other private text: Mercat onboarding (channel link or business description).
  pm.on("message:text", async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    const locale = pickLocale(from.language_code);
    const text = ctx.message.text;
    if (text.startsWith("/")) {
      await ctx.reply(t(locale, "bot.help", { bot: botHandle() }));
      return;
    }
    await track(from, "message", { length: text.length });
    // The bot asked the owner something after a run (goal, how customers order, prices, what the channel is about):
    // the pending-state dispatcher reads the answer first; a channel link or a description falls through.
    if (await answerPendingText(ctx.api, ctx.chat.id, from, locale, clip(text, 4000))) return;
    // The bot asked "which channel?" for a post (publish flow): a channel name answers that, not onboarding.
    if ((!/\s/.test(text.trim()) || /@|t\.me\//i.test(text)) && (await answerPendingChannel(ctx.api, ctx.chat.id, from, locale, text))) return;
    const input = classifyOnboardText(clip(text, 4000));
    if (!input) {
      await ctx.reply(onboardPrompt(locale));
      return;
    }
    await startOnboarding(ctx, ctx.chat.id, from.id, locale, input);
  });

  // "Try again" after a channel onboarding that took too long (see runOnboardingInTime).
  b.callbackQuery(RETRY_ONBOARD_RE, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const locale = pickLocale(ctx.from.language_code);
    await startOnboarding(ctx, ctx.chat?.id ?? ctx.from.id, ctx.from.id, locale, { channel: ctx.match[1] });
  });

  // "Rebuild the week" after the owner chose another goal than the plan was made for: the channel run once more
  // (the owner's row comes back with its answers, so the plan and posts follow the new goal). Owner only.
  b.callbackQuery(REBUILD_RE, async (ctx) => {
    const locale = pickLocale(ctx.from.language_code);
    const brand = await getBrand(ctx.match[1]);
    if (!brand || brand.ownerTelegramId !== ctx.from.id || !brand.channel) {
      await ctx.answerCallbackQuery({ text: t(locale, "bot.not_your_brand") }).catch(() => undefined);
      return;
    }
    await ctx.answerCallbackQuery().catch(() => undefined);
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
    // Counted only once the run really starts: a busy gate, the hourly limit, the daily budget or AI off is no rebuild.
    const ownerId = ctx.from.id;
    await startOnboarding(ctx, ctx.chat?.id ?? ownerId, ownerId, locale, { channel: brand.channel }, () =>
      logPostRegenerated(ownerId, { brandId: brand.id, why: "another_version" }),
    );
  });

  // "📢 Publish" under a generated post. ctx.from is trusted (comes from Telegram).
  b.callbackQuery(/^pub:([0-9a-f-]{36})$/, async (ctx) => {
    const locale = pickLocale(ctx.from.language_code);
    await ctx.answerCallbackQuery({ text: t(locale, "pub.publishing") }).catch(() => undefined);
    const result = await publishFromBot(ctx.match[1], ctx.from.id, locale);
    if (!result) return; // a repeat press while the first one is still sending: that one reports
    await ctx.reply(result.text, {
      link_preview_options: { is_disabled: true },
      ...(result.addAdminUrl
        ? { reply_markup: new InlineKeyboard().url(t(locale, "pub.add_bot"), result.addAdminUrl).row().text(t(locale, "pub.button_retry"), ctx.match[0]) }
        : {}),
    });
  });

  // Publish flow buttons: "pb" = Kanalga joylash (authorize/claim, then publish), "pv" = show in another script.
  b.callbackQuery(CALLBACK_RE, async (ctx) => {
    const data = parseCallback(ctx.callbackQuery.data ?? "");
    const chatId = ctx.chat?.id ?? ctx.from.id;
    const locale = pickLocale(ctx.from.language_code);
    if (!data) return void (await ctx.answerCallbackQuery().catch(() => undefined));
    await ctx.answerCallbackQuery(data.kind === "pb" ? { text: t(locale, "pub.publishing") } : {}).catch(() => undefined);
    if (data.kind === "pb") await publishFromButton(ctx.api, chatId, ctx.from, locale, data.postId, data.script, data.hash);
    else await switchScript(ctx.api, chatId, ctx.from, locale, data.postId, data.script);
  });

  // Customer agreed to share their contact: tell the owner (one lead), with a "Sotildi" button for them.
  b.callbackQuery(/^lead:([a-z0-9]{6}):(\d{1,2})$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const locale = pickLocale(ctx.from.language_code);
    const plan = await planByTag(ctx.match[1]);
    const slot = Number(ctx.match[2]);
    if (!plan?.ownerTelegramId) {
      await ctx.reply(t(locale, "bot.link_expired"));
      return;
    }
    const u = ctx.from;
    const item = plan.items.find((i) => i.slot === slot);
    // The alert goes to the owner: their language, not the customer's.
    const ownerLocale = await userLocale(plan.ownerTelegramId);
    const name = escapeHtml([u.first_name, u.last_name].filter(Boolean).join(" ") || t(ownerLocale, "bot.lead_customer"));
    const who = `<a href="tg://user?id=${u.id}">${name}</a>${u.username ? ` (@${u.username})` : ""}`;
    const post = item?.hook ? `«${escapeHtml(clip(item.hook, 80))}»` : t(ownerLocale, "bot.lead_post", { slot });
    try {
      await ctx.api.sendMessage(plan.ownerTelegramId, t(ownerLocale, "bot.lead_alert", { who, post, day: formatDay(item?.day ?? plan.weekOf, ownerLocale) }), {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text(t(ownerLocale, "bot.lead_sold"), `sold:${plan.tag}:${slot}`),
      });
      await safeLogEvent(u.id, "lead", { src: `src_${plan.tag}_${slot}` });
      await ctx.editMessageText(t(locale, "bot.link_sent")).catch(() => undefined);
    } catch {
      await ctx.reply(t(locale, "bot.link_failed"));
    }
  });

  // Owner taps "Sotildi" under a lead, or answers the weekly order question. Only the plan's owner may.
  b.callbackQuery(/^(sold|ord):([a-z0-9]{6}):(\d{1,2})$/, async (ctx) => {
    const [, kind, tag, n] = ctx.match;
    const locale = pickLocale(ctx.from.language_code);
    const plan = await planByTag(tag);
    if (!plan || plan.ownerTelegramId !== ctx.from.id) {
      await ctx.answerCallbackQuery({ text: t(locale, "bot.not_your_plan") }).catch(() => undefined);
      return;
    }
    if (kind === "sold") {
      await recordOutcome(plan.id, Number(n), "sold", 1, ctx.from.id);
      await ctx.answerCallbackQuery({ text: t(locale, "bot.sold_recorded") }).catch(() => undefined);
      await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard().text(t(locale, "bot.sold_again"), `sold:${tag}:${n}`) }).catch(() => undefined);
      return;
    }
    const bucket = ORDER_BUCKETS[n];
    if (!bucket) return;
    await recordOutcome(plan.id, null, "orders_week", bucket.value, ctx.from.id);
    await ctx.answerCallbackQuery({ text: t(locale, "bot.orders_recorded", { label: bucket.label }) }).catch(() => undefined);
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
  });

  // Telegram Business: log connections (the bot was added to a business account).
  b.on("business_connection", async (ctx) => {
    const connection = ctx.businessConnection;
    await track(connection.user, "business_connection", { is_enabled: connection.is_enabled });
  });

  b.on("business_message", async (ctx) => {
    await safeLogEvent(ctx.businessMessage.from?.id ?? null, "business_message");
  });
}
