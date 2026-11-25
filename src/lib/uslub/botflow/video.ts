import "server-only";
import { type Api, type Bot, InlineKeyboard } from "grammy";
import { approveWeek } from "../../autopilot/approve";
import { skipReason, whenLabel } from "../../autopilot/copy";
import { getPublicUrl } from "@/lib/env";
import { type Locale, pickLocale, t } from "@/lib/i18n";
import { safeLogEvent } from "@/lib/track";
import { authorize, refusal, startPublish } from "../botpublish";
import { pickScript, publishPayload, shownHash, shownText } from "../botpublish-core";
import type { PostDraft } from "../contract";
import { findPlaceholders, placeholderNote } from "../placeholders";
import { getBrand, getPost, setPostVideoFile, type StoredBrand } from "../store";
import { clip } from "../text";
import { fmtDuration, isVideoPost, planSeconds } from "../video-core";
import { registerVideoHandler, type VideoHandler } from "./flows";
import { clearPending, getPending, setPending } from "./pending";
import {
  isNewRunText,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  MIN_VIDEO_SECONDS,
  parseVideoPayload,
  VIDEO_APPROVE_RE,
  VIDEO_CANCEL_RE,
  VIDEO_WAIT_RE,
  videoApproveData,
  videoCancelData,
  videoProblem,
} from "./video-core";

/**
 * The owner's video for a video post, through the bot (no storage of our own: Telegram keeps the file, the post keeps
 * its file_id).
 * - t.me/<bot>?start=video_<postId> (the Video tab) or [Send the video] (the publish flow): for the post's owner only.
 *   An unowned web brand is claimed here like at a publish (the channel's admin with post rights, bot rights first).
 *   The bot then waits 24 hours for that user's next video (one pending state per user, flows.ts dispatches it).
 * - A video message or a video file: checked (length, size, a video file), stored on the post, the wait ends, and
 *   the bot answers with the caption that goes out and [Approve] (bound to that text and video) and [Open in the app].
 *   Photos and other messages are ignored while it waits; a short text gets a reminder, a channel link or a business
 *   description starts a new run as usual.
 * - [Approve]: a plan slot is approved and queued for its time (approve-week's own selector); a video idea (no slot),
 *   or a slot whose time has passed, gets the usual publish preview with [Publish to @channel].
 */

type User = { id: number; language_code?: string };

const hookOf = (post: PostDraft) => clip((post.slot?.hook || post.video?.plan?.hook || post.brief || "").replace(/\s+/g, " ").trim(), 80);
const appUrl = () => {
  const u = getPublicUrl();
  return u?.startsWith("https://") ? u : null;
};

/** The post and its brand when `userId` may send its video: the owner, or a channel admin who claims an unowned brand. */
async function postFor(api: Api, chatId: number, user: User, locale: Locale, postId: string): Promise<{ post: PostDraft; brand: StoredBrand } | null> {
  const post = await getPost(postId);
  const brand = post ? await getBrand(post.brandId) : null;
  if (!post || !brand) {
    await api.sendMessage(chatId, t(locale, "vid.not_found"));
    return null;
  }
  if (brand.ownerTelegramId == null) {
    // A brand made on the web without Telegram: claimed by the channel's admin, as at a publish.
    if (!brand.channel) {
      await api.sendMessage(chatId, t(locale, "vid.needs_channel"));
      return null;
    }
    const decision = await authorize(api, brand, brand.channel, user);
    if (!decision.ok) {
      await refusal(api, chatId, locale, decision.reason, brand.channel);
      return null;
    }
  } else if (brand.ownerTelegramId !== user.id) {
    await api.sendMessage(chatId, t(locale, "pub.not_yours"));
    return null;
  }
  if (post.status === "published" && post.publishedUrl) {
    await api.sendMessage(chatId, t(locale, "pub.already", { url: post.publishedUrl }), { link_preview_options: { is_disabled: true } });
    return null;
  }
  if (!isVideoPost(post)) {
    await api.sendMessage(chatId, t(locale, "vid.not_video"));
    return null;
  }
  return { post, brand: (await getBrand(brand.id)) ?? brand };
}

/** Starts waiting for the video of `post` (saved before the message goes out, so a quick video finds it). */
async function askForVideo(api: Api, chatId: number, userId: number, locale: Locale, brand: StoredBrand, post: PostDraft): Promise<void> {
  await setPending(userId, { kind: "video", brandId: brand.id, postId: post.id, at: Date.now() });
  const plan = post.video?.plan;
  const lines = [
    t(locale, "vid.ask", { hook: hookOf(post), max: MAX_VIDEO_SECONDS / 60 }),
    plan?.scenes.length ? t(locale, "vid.ask_plan", { n: plan.scenes.length, seconds: planSeconds(plan) }) : "",
    post.video?.fileId ? t(locale, "vid.ask_replace") : "",
  ].filter(Boolean);
  await api.sendMessage(chatId, lines.join("\n\n"), { reply_markup: new InlineKeyboard().text(t(locale, "vid.cancel"), videoCancelData(post.id)) });
  await safeLogEvent(userId, "video_asked", { brand_id: brand.id, post_id: post.id });
}

/** /start video_<postId>. false when the payload is not a video link. */
export async function startVideo(api: Api, chatId: number, user: User, locale: Locale, payload: string): Promise<boolean> {
  const postId = parseVideoPayload(payload);
  if (!postId) return false;
  const found = await postFor(api, chatId, user, locale, postId);
  if (found) await askForVideo(api, chatId, user.id, locale, found.brand, found.post);
  return true;
}

/** What goes out, and [Approve] bound to exactly that (no button while a blank is left in the text). */
async function confirmVideo(api: Api, chatId: number, locale: Locale, brand: StoredBrand, post: PostDraft, head: "vid.got" | "vid.changed"): Promise<void> {
  const script = pickScript(post.variants, undefined, brand.dna?.languages);
  const text = shownText(post, script);
  const blanks = findPlaceholders(text);
  const kb = new InlineKeyboard();
  if (!blanks.length) kb.text(t(locale, "vid.approve"), videoApproveData(post.id, shownHash(post, script)));
  const app = appUrl();
  if (app) kb.webApp(t(locale, "vid.open_app"), `${app}/tg`);
  const parts = [
    t(locale, head, { duration: fmtDuration(post.video?.duration) || "—", hook: hookOf(post) }),
    clip(text, 3000),
    post.video?.as === "document" ? t(locale, "vid.as_file") : "",
  ].filter(Boolean);
  await api.sendMessage(chatId, parts.join("\n\n"), { reply_markup: kb, link_preview_options: { is_disabled: true } });
  if (blanks.length) await api.sendMessage(chatId, placeholderNote(blanks, locale));
}

const handleVideo: VideoHandler = async (api, chatId, user, locale, pending, input) => {
  if (input.type === "text") {
    // A channel link or a business description is a new run: this wait ends here, so a later video never lands on
    // this post unasked. Anything short gets a reminder.
    if (isNewRunText(input.text)) {
      await clearPending(user.id);
      return false;
    }
    await api.sendMessage(chatId, t(locale, "vid.waiting"), { reply_markup: new InlineKeyboard().text(t(locale, "vid.cancel"), videoCancelData(pending.postId)) });
    return true;
  }
  const brand = await getBrand(pending.brandId);
  const post = await getPost(pending.postId);
  if (!brand || brand.ownerTelegramId !== user.id || !post || post.brandId !== brand.id) {
    await clearPending(user.id);
    await api.sendMessage(chatId, t(locale, "vid.not_found"));
    return true;
  }
  const problem = videoProblem(input);
  if (problem) {
    // The wait goes on: the owner sends another one.
    const key = problem === "too_long" ? "vid.too_long" : problem === "too_short" ? "vid.too_short" : problem === "too_big" ? "vid.too_big" : "vid.not_video_file";
    await api.sendMessage(chatId, t(locale, key, { duration: fmtDuration(input.duration), max: MAX_VIDEO_SECONDS / 60, min: MIN_VIDEO_SECONDS, mb: Math.round(MAX_VIDEO_BYTES / 1024 / 1024) }));
    return true;
  }
  const saved = await setPostVideoFile(post.id, {
    fileId: input.fileId,
    as: input.as ?? "video",
    ...(input.fileUniqueId ? { fileUniqueId: input.fileUniqueId } : {}),
    ...(input.duration != null ? { duration: input.duration } : {}),
    ...(input.width != null ? { width: input.width } : {}),
    ...(input.height != null ? { height: input.height } : {}),
    ...(input.size != null ? { size: input.size } : {}),
    ...(input.mime ? { mime: input.mime } : {}),
    ...(input.thumbFileId ? { thumbFileId: input.thumbFileId } : {}),
  });
  await clearPending(user.id);
  if (!saved) {
    await api.sendMessage(chatId, t(locale, "vid.not_saved"));
    return true;
  }
  // Codes and numbers only: never a file id.
  await safeLogEvent(user.id, "video_received", { brand_id: brand.id, post_id: post.id, seconds: input.duration ?? null, as: input.as ?? "video" });
  await confirmVideo(api, chatId, locale, brand, saved, "vid.got");
  return true;
};

/** [Approve] under a received video: a slot is queued for its time; an idea (or a passed slot) gets the publish preview. */
async function approveVideo(api: Api, chatId: number, user: User, locale: Locale, postId: string, seenHash: string): Promise<void> {
  const post = await getPost(postId);
  const brand = post ? await getBrand(post.brandId) : null;
  if (!post || !brand) return void (await api.sendMessage(chatId, t(locale, "vid.not_found")));
  if (brand.ownerTelegramId !== user.id) return void (await api.sendMessage(chatId, t(locale, "pub.not_yours")));
  if (post.status === "published" && post.publishedUrl) {
    return void (await api.sendMessage(chatId, t(locale, "pub.already", { url: post.publishedUrl }), { link_preview_options: { is_disabled: true } }));
  }
  const script = pickScript(post.variants, undefined, brand.dna?.languages);
  // Never approve a text or video the owner has not seen here.
  if (shownHash(post, script) !== seenHash) return void (await confirmVideo(api, chatId, locale, brand, post, "vid.changed"));
  if (!post.slot || !brand.channel) {
    await startPublish(api, chatId, user, locale, publishPayload(post.id, script));
    return;
  }
  // The post as checked above is what gets queued (its hash), so an edit landing meanwhile stops the send at the slot.
  const r = await approveWeek({ brand, ownerTelegramId: user.id, postIds: [post.id], api, posts: [post] });
  if (r.changed) return void (await confirmVideo(api, chatId, locale, brand, post, "vid.changed"));
  const queued = r.queued[0];
  if (queued) {
    const kb = r.addAdminUrl ? new InlineKeyboard().url(t(locale, "pub.add_bot"), r.addAdminUrl) : undefined;
    await api.sendMessage(chatId, t(locale, "vid.queued", { when: whenLabel(Date.parse(queued.dueAt), locale), channel: brand.channel.replace(/^@/, "") }), kb ? { reply_markup: kb } : {});
    return;
  }
  const skip = r.skipped[0];
  // Its time has passed: it can still go out now, through the usual preview and [Publish].
  if (!skip || skip.reason === "slot_passed" || skip.reason === "no_slot") {
    await startPublish(api, chatId, user, locale, publishPayload(post.id, script));
    return;
  }
  await api.sendMessage(chatId, t(locale, "vid.not_queued", { reason: skipReason(locale, skip.reason, skip) }));
}

/** The video wait's handler and its buttons (one registration line in bot.ts). */
export function registerVideoFlow(b: Bot): void {
  registerVideoHandler(handleVideo);

  b.callbackQuery(VIDEO_APPROVE_RE, async (ctx) => {
    const locale = pickLocale(ctx.from.language_code);
    await ctx.answerCallbackQuery().catch(() => undefined);
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
    try {
      await approveVideo(ctx.api, ctx.chat?.id ?? ctx.from.id, ctx.from, locale, ctx.match[1], ctx.match[2]);
    } catch (err) {
      console.warn("[botflow/video] approve failed", err instanceof Error ? err.message : err);
      await ctx.api.sendMessage(ctx.chat?.id ?? ctx.from.id, t(locale, "bot.error")).catch(() => undefined);
    }
  });

  b.callbackQuery(VIDEO_CANCEL_RE, async (ctx) => {
    const locale = pickLocale(ctx.from.language_code);
    const pending = await getPending(ctx.from.id);
    await ctx.answerCallbackQuery().catch(() => undefined);
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
    if (pending?.kind === "video" && pending.postId === ctx.match[1]) await clearPending(ctx.from.id);
    await ctx.api.sendMessage(ctx.chat?.id ?? ctx.from.id, t(locale, "vid.cancelled"));
  });

  // [Send the video] from the publish flow (a video post without its video).
  b.callbackQuery(VIDEO_WAIT_RE, async (ctx) => {
    const locale = pickLocale(ctx.from.language_code);
    await ctx.answerCallbackQuery().catch(() => undefined);
    const chatId = ctx.chat?.id ?? ctx.from.id;
    const found = await postFor(ctx.api, chatId, ctx.from, locale, ctx.match[1]);
    if (found) await askForVideo(ctx.api, chatId, ctx.from.id, locale, found.brand, found.post);
  });
}
