import "server-only";
import { GrammyError, InlineKeyboard, type Api } from "grammy";
import { type Locale, t } from "@/lib/i18n";
import { safeLogEvent } from "@/lib/track";
import type { MemberInfo } from "./access";
import {
  callbackData,
  claimDecision,
  otherScripts,
  parsePublishPayload,
  pickScript,
  shownHash,
  shownPhoto,
  shownText,
  splitForPhoto,
  type ClaimDecision,
} from "./botpublish-core";
import type { PostDraft, Script } from "./contract";
import { errorText } from "./errors";
import { publishErrorCode } from "./publish-errors";
import { addBotAsAdminLink, publishPost } from "./publish";
import { parseChannelUsername } from "./scrape";
import {
  claimBrand,
  clearPendingPublish,
  getBrand,
  getPendingPublish,
  getPost,
  linkBrandChannel,
  setPendingPublish,
  type StoredBrand,
} from "./store";

/**
 * Publishing from the bot — the last step of the demo: the Studio sends the owner to
 * t.me/<bot>?start=publish_<postId>; the bot shows the post (and its picture) with a "Kanalga joylash" button.
 * An unowned web brand is claimed by the first Telegram user who is the channel's creator or an admin with
 * post rights (verified with getChatMember, bot rights first). A fresh brand without a channel asks for one.
 * The actual send goes through publishPost (owner + own channel + admin re-checks, photo when ready).
 */

type User = { id: number };

async function memberInfo(api: Api, chat: string, userId: number): Promise<MemberInfo> {
  try {
    const m = await api.getChatMember(chat, userId);
    return { status: m.status, can_post_messages: m.status === "administrator" ? m.can_post_messages : undefined };
  } catch (err) {
    if (err instanceof GrammyError) return null; // chat not found / bot not in the channel
    throw err;
  }
}

/** Can this user publish this brand's posts to `channel`? Claims an unowned brand on success. */
async function authorize(api: Api, brand: StoredBrand, channel: string, user: User): Promise<ClaimDecision> {
  if (brand.ownerTelegramId != null) return claimDecision({ ownerTelegramId: brand.ownerTelegramId, userId: user.id, user: null, bot: null });
  const me = await api.getMe();
  const chat = `@${channel.replace(/^@/, "")}`;
  const [userM, botM] = await Promise.all([memberInfo(api, chat, user.id), memberInfo(api, chat, me.id)]);
  const decision = claimDecision({ ownerTelegramId: null, userId: user.id, user: userM, bot: botM });
  if (!decision.ok) return decision;
  // Atomic: only while nobody owns it. Someone faster wins; everyone else is refused.
  const owner = await claimBrand(brand.id, user.id);
  return owner === user.id ? { ok: true, claim: true } : { ok: false, reason: "not_owner" };
}

/**
 * Why the user cannot publish here. With `retry` (a button press) a missing bot admin offers the button again;
 * without it (the user typed a channel name) the text asks them to send the channel name again instead.
 */
function refusal(api: Api, chatId: number, locale: Locale, reason: Exclude<ClaimDecision, { ok: true }>["reason"], channel: string, retry?: string) {
  const botKey = retry ? "pub.bot_not_admin" : "pub.bot_not_admin_send";
  const key = reason === "not_owner" ? "pub.not_yours" : reason === "user_not_admin" ? "pub.user_not_admin" : reason === "user_cannot_post" ? "pub.user_cannot_post" : botKey;
  const kb = new InlineKeyboard();
  if (reason === "bot_not_admin") {
    kb.url(t(locale, "pub.add_bot"), addBotAsAdminLink()).row();
    if (retry) kb.text(t(locale, "pub.button", { channel }), retry);
  }
  return api.sendMessage(chatId, t(locale, key, { channel }), reason === "bot_not_admin" ? { reply_markup: kb } : {});
}

/** "Kanalga joylash" button bound to the text and picture the owner is looking at (see publishFromButton). */
const publishData = (post: PostDraft, script: Script) => callbackData("pb", post.id, script, shownHash(post, script));

function publishKeyboard(locale: Locale, post: PostDraft, script: Script, channel?: string): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (channel) kb.text(t(locale, "pub.button", { channel }), publishData(post, script)).row();
  for (const s of otherScripts(post.variants, script)) kb.text(t(locale, `pub.script.${s}`), callbackData("pv", post.id, s));
  return kb;
}

/** Sends the post as it will appear (picture first when it is ready) with the publish button. */
async function sendPreview(api: Api, chatId: number, locale: Locale, post: PostDraft, script: Script, channel?: string) {
  const text = shownText(post, script);
  const kb = publishKeyboard(locale, post, script, channel);
  const photo = shownPhoto(post);
  if (photo) {
    const { caption, rest } = splitForPhoto(text);
    try {
      await api.sendPhoto(chatId, photo, caption ? { caption, reply_markup: kb } : {});
      if (rest) await api.sendMessage(chatId, rest, { reply_markup: kb, link_preview_options: { is_disabled: true } });
      return;
    } catch (err) {
      console.warn("[botpublish] photo preview failed, sending text", err instanceof Error ? err.message : err);
    }
  }
  await api.sendMessage(chatId, text.slice(0, 4096), { reply_markup: kb, link_preview_options: { is_disabled: true } });
}

/**
 * Why a publish failed, in the user's language. publishPost's own messages are Uzbek (some carry Telegram's
 * English error), so the code behind them picks the sentence; the bot's own wording is used where it has one.
 */
export function publishError(locale: Locale, status: number, error: string | undefined, addAdminUrl: string | undefined, channel: string): string {
  const code = publishErrorCode(status, error, addAdminUrl);
  if (code === "bot_not_admin") return t(locale, "pub.bot_not_admin", { channel });
  if (code === "channel_admin_required") return t(locale, "pub.user_not_admin", { channel });
  if (code === "brand_forbidden") return t(locale, "pub.not_yours");
  return errorText(code, locale);
}

/** A reply is a channel answer only when it looks like one: "@name" or a t.me link (not any single word). */
const looksLikeChannel = (text: string) => /(^|\s)@[A-Za-z]|(t|telegram)\.me\//i.test(text);

/** /start publish_<postId>[_<script>]. Returns false when the payload is not a publish link. */
export async function startPublish(api: Api, chatId: number, user: User, locale: Locale, payload: string): Promise<boolean> {
  const parsed = parsePublishPayload(payload);
  if (!parsed) return false;
  const post = await getPost(parsed.postId);
  const brand = post ? await getBrand(post.brandId) : null;
  if (!post || !brand) {
    await api.sendMessage(chatId, t(locale, "pub.not_found"));
    return true;
  }
  // A link is not ownership: someone else's owned post is never shown.
  if (brand.ownerTelegramId != null && brand.ownerTelegramId !== user.id) {
    await api.sendMessage(chatId, t(locale, "pub.not_yours"));
    return true;
  }
  if (post.status === "published" && post.publishedUrl) {
    await api.sendMessage(chatId, t(locale, "pub.already", { url: post.publishedUrl }), { link_preview_options: { is_disabled: true } });
    return true;
  }
  const script = pickScript(post.variants, parsed.script, brand.dna?.languages);
  await safeLogEvent(user.id, "publish_link_opened", { post_id: post.id, brand_id: brand.id, script });
  await api.sendMessage(chatId, t(locale, "pub.preview"));
  await sendPreview(api, chatId, locale, post, script, brand.channel);
  if (!brand.channel) {
    await setPendingPublish(user.id, post.id, script);
    await api.sendMessage(chatId, t(locale, "pub.ask_channel"), { reply_markup: new InlineKeyboard().url(t(locale, "pub.add_bot"), addBotAsAdminLink()) });
  } else if (await getPendingPublish(user.id)) {
    // A newer link replaces an older "which channel?" question.
    await clearPendingPublish(user.id);
  }
  return true;
}

/** "pv" button: show the same post in another script. */
export async function switchScript(api: Api, chatId: number, user: User, locale: Locale, postId: string, script: Script): Promise<void> {
  const post = await getPost(postId);
  const brand = post ? await getBrand(post.brandId) : null;
  if (!post || !brand) return void (await api.sendMessage(chatId, t(locale, "pub.not_found")));
  if (brand.ownerTelegramId != null && brand.ownerTelegramId !== user.id) return void (await api.sendMessage(chatId, t(locale, "pub.not_yours")));
  const chosen = pickScript(post.variants, script, brand.dna?.languages);
  // A brand still waiting for its channel remembers the script the owner switched to.
  if (!brand.channel && (await getPendingPublish(user.id))?.postId === post.id) await setPendingPublish(user.id, post.id, chosen);
  await sendPreview(api, chatId, locale, post, chosen, brand.channel);
}

/**
 * "pb" button ("Kanalga joylash"): authorize (claim an unowned brand), then publish through publishPost.
 * The button carries a hash of the text and picture the owner saw; if either changed since (an edit in the Studio,
 * a new picture), nothing is published — the bot shows the new version with a fresh button instead.
 */
export async function publishFromButton(api: Api, chatId: number, user: User, locale: Locale, postId: string, wanted: Script, seenHash?: string): Promise<void> {
  const post = await getPost(postId);
  const brand = post ? await getBrand(post.brandId) : null;
  if (!post || !brand) return void (await api.sendMessage(chatId, t(locale, "pub.not_found")));
  if (brand.ownerTelegramId != null && brand.ownerTelegramId !== user.id) return void (await api.sendMessage(chatId, t(locale, "pub.not_yours")));
  // A forged or stale button may name an empty variant: fall back to one the post has.
  const script = pickScript(post.variants, wanted, brand.dna?.languages);
  if (post.status === "published" && post.publishedUrl) {
    await api.sendMessage(chatId, t(locale, "pub.already", { url: post.publishedUrl }), { link_preview_options: { is_disabled: true } });
    return;
  }
  if (!brand.channel) {
    await setPendingPublish(user.id, post.id, script);
    await api.sendMessage(chatId, t(locale, "pub.ask_channel"), { reply_markup: new InlineKeyboard().url(t(locale, "pub.add_bot"), addBotAsAdminLink()) });
    return;
  }
  if (seenHash !== shownHash(post, script)) {
    // Never publish a text or picture the owner has not seen in Telegram.
    await api.sendMessage(chatId, t(locale, "pub.changed"));
    await sendPreview(api, chatId, locale, post, script, brand.channel);
    return;
  }
  const decision = await authorize(api, brand, brand.channel, user);
  if (!decision.ok) return void (await refusal(api, chatId, locale, decision.reason, brand.channel, publishData(post, script)));
  // The rights checks above take a few Telegram round trips: read the post again right before sending, so an edit
  // made meanwhile is caught too. (publishPost reads it once more; that last gap is milliseconds.)
  const fresh = await getPost(post.id);
  if (!fresh || seenHash !== shownHash(fresh, script)) {
    await api.sendMessage(chatId, t(locale, "pub.changed"));
    if (fresh) await sendPreview(api, chatId, locale, fresh, script, brand.channel);
    return;
  }
  // expectedText / expectedImageUrl: publish.ts (images) re-checks them right before sending and answers 409 when
  // they changed. Passed as a plain object so this also compiles against a publishPost that predates them.
  const publishArgs = { postId: post.id, script, chat: brand.channel, userId: user.id, expectedText: shownText(fresh, script), expectedImageUrl: shownPhoto(fresh) };
  const res = await publishPost(publishArgs);
  if (res.ok) {
    await api.sendMessage(chatId, t(locale, "pub.done", { url: res.url ?? "" }), { link_preview_options: { is_disabled: true } });
    return;
  }
  if (res.status === 409) {
    // Changed in the last milliseconds before sending: show the new version, publish nothing.
    const latest = await getPost(post.id);
    await api.sendMessage(chatId, t(locale, "pub.changed"));
    if (latest) await sendPreview(api, chatId, locale, latest, script, brand.channel);
    return;
  }
  const kb = res.addAdminUrl ? new InlineKeyboard().url(t(locale, "pub.add_bot"), res.addAdminUrl).row().text(t(locale, "pub.button", { channel: brand.channel }), publishData(post, script)) : undefined;
  await api.sendMessage(chatId, t(locale, "pub.failed", { error: publishError(locale, res.status, res.error, res.addAdminUrl, brand.channel) }), {
    ...(kb ? { reply_markup: kb } : {}),
    link_preview_options: { is_disabled: true },
  });
}

/**
 * A private text while the bot waits for "which channel?": verify bot and user rights there, claim the brand
 * if unowned, link the channel, and offer the publish button. Returns false when nothing was pending, so the
 * message goes on to the normal onboarding.
 */
export async function answerPendingChannel(api: Api, chatId: number, user: User, locale: Locale, text: string): Promise<boolean> {
  if (!looksLikeChannel(text)) return false;
  const pending = await getPendingPublish(user.id);
  if (!pending) return false;
  const word = text.trim().split(/\s+/).find((w) => /^@|t\.me|telegram\.me/i.test(w)) ?? text.trim();
  const channel = parseChannelUsername(word);
  if (!channel) {
    await api.sendMessage(chatId, t(locale, "pub.channel_bad"));
    return true;
  }
  const post = await getPost(pending.postId);
  const brand = post ? await getBrand(post.brandId) : null;
  if (!post || !brand) {
    await clearPendingPublish(user.id);
    await api.sendMessage(chatId, t(locale, "pub.not_found"));
    return true;
  }
  if (brand.channel && brand.channel.toLowerCase() !== channel.toLowerCase()) {
    await clearPendingPublish(user.id);
    await api.sendMessage(chatId, t(locale, "pub.channel_taken", { channel: brand.channel }));
    return true;
  }
  // The user must administer the channel with post rights (and the bot too) before it is linked — even for
  // a brand they already own, so nobody links a channel they do not run.
  const me = await api.getMe();
  const chat = `@${channel}`;
  const [userM, botM] = await Promise.all([memberInfo(api, chat, user.id), memberInfo(api, chat, me.id)]);
  const rights = claimDecision({ ownerTelegramId: null, userId: user.id, user: userM, bot: botM });
  if (!rights.ok) {
    await refusal(api, chatId, locale, rights.reason, channel);
    return true; // still pending: they can fix the rights and send the name again
  }
  if (brand.ownerTelegramId == null) {
    const owner = await claimBrand(brand.id, user.id);
    if (owner !== user.id) {
      await clearPendingPublish(user.id);
      await api.sendMessage(chatId, t(locale, "pub.not_yours"));
      return true;
    }
  } else if (brand.ownerTelegramId !== user.id) {
    await clearPendingPublish(user.id);
    await api.sendMessage(chatId, t(locale, "pub.not_yours"));
    return true;
  }
  await linkBrandChannel(brand.id, channel);
  const linked = await getBrand(brand.id);
  if (linked?.channel?.toLowerCase() !== channel.toLowerCase()) {
    await clearPendingPublish(user.id);
    await api.sendMessage(chatId, t(locale, "pub.channel_taken", { channel: linked?.channel ?? channel }));
    return true;
  }
  await clearPendingPublish(user.id);
  await safeLogEvent(user.id, "brand_channel_linked", { brand_id: brand.id, channel });
  // A fresh, full preview (text + picture) in the script the owner chose, with a button bound to exactly that.
  await api.sendMessage(chatId, t(locale, "pub.channel_linked", { channel }));
  const current = (await getPost(post.id)) ?? post;
  await sendPreview(api, chatId, locale, current, pickScript(current.variants, pending.script, brand.dna?.languages), channel);
  return true;
}
