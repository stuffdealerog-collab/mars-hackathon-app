import "server-only";
import { type Api, type Bot, InlineKeyboard } from "grammy";
import { getEnv } from "@/lib/env";
import { type Locale, pickLocale, t } from "@/lib/i18n";
import { safeLogEvent } from "@/lib/track";
import type { OrderHow, OwnerAnswers } from "../brain/answers";
import { loadAnswers } from "../brain/answers-store";
import { questionsForBrand } from "../brain/brand-questions";
import { runQuestions } from "../brain/questions";
import { flushUsage, runWithContext } from "../context";
import { getBrand, type StoredBrand } from "../store";
import { styleWords } from "../visual/words";
import { VisualLimitError } from "../visual/service";
import { addPendingPhoto, clearPending, getPending, ownsABrand, setPending, takePendingPhotos } from "./pending";
import type { Pending, QuestionFlow } from "./pending-core";
import { learnFromOwnerPhotos, telegramPhoto } from "./photos";
import type { IncomingVideo } from "./video-core";
import { saveOwnerAnswers } from "./answers";
import {
  asKey,
  branchOf,
  type Button,
  contactBadKey,
  contactQuestion,
  matchOption,
  nextQuestion,
  orderedOptions,
  parseContact,
  parsePrices,
  PHOTOS_RE,
  photosData,
  pickPhotoSize,
  QUESTION_RE,
  rebuildData,
  renderQuestion,
} from "./questions-core";

/**
 * The bot's conversation after a run (one pending-state dispatcher, read before classifyOnboardText in bot.ts):
 * - the engine's questions (runQuestions): the goal first, pre-filled from the channel type; then, for a business,
 *   how customers order (and the contact behind it) and the 3 main prices; for a blog, expert, media or community
 *   channel, what the channel is about. Every question can be skipped; answers go to the answers store and are
 *   reused by every weekly plan and post;
 * - then, on a brand's first run, up to 3 photos of the product or place, which become the designer's style
 *   references (the Studio's visual path). Skippable, never blocking;
 * - a video for a post (kind "video") is waited for here too; its handler is botflow/video.ts (registered with
 *   registerVideoHandler), so the bot has one dispatcher for everything it waits for.
 * Every handler that touches a brand is for its owner only. Callback prefixes: oq: and oph: (questions-core.ts).
 */

type User = { id: number; language_code?: string };

/** Up to this many photos per ask. */
export const MAX_BOT_PHOTOS = 3;

export interface FlowDeps {
  /** Runs slow work after the webhook answered (bot.ts runLater). */
  later: (task: () => Promise<void>) => Promise<void>;
  /** How long an album's photos may keep arriving before the bot answers them (ms). */
  settleMs?: number;
}

const botName = () => getEnv().BOT_USERNAME?.replace(/^@/, "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function keyboard(rows: Button[][]): InlineKeyboard {
  const kb = new InlineKeyboard();
  rows.forEach((row, i) => {
    for (const b of row) kb.text(b.text, b.data);
    if (i < rows.length - 1) kb.row();
  });
  return kb;
}

/** The brand, only when this user owns it. */
async function ownedBrand(brandId: string, userId: number): Promise<StoredBrand | null> {
  const brand = await getBrand(brandId);
  return brand && brand.ownerTelegramId === userId ? brand : null;
}

/** A channel name or link: a new run, never the answer to a question. */
const isChannelText = (text: string) => /^@[A-Za-z]\w{3,31}$/.test(text.trim()) || /(?:^|\s|\/\/)(?:t|telegram)\.me\//i.test(text);

/** The goal answers' labels in the owner's language (the engine's own wording). */
function goalLabel(goal: "sale" | "grow", locale: Locale): string {
  return runQuestions({ lang: locale })[0]?.options?.find((o) => o.value === goal)?.label ?? goal;
}

/* ------------------------------------------------------------------------------------------------- questions */

/**
 * Starts the questions after a run (onboard.ts): the first open question is sent, the rest wait in the pending state.
 * With nothing to ask it goes straight to the photos (when asked for) or does nothing.
 */
export async function startQuestions(api: Api, chatId: number, userId: number, brandId: string, flow: QuestionFlow, locale: Locale): Promise<void> {
  await askNext(api, chatId, userId, brandId, { ...flow, skipped: flow.skipped ?? [], answered: 0 }, locale);
}

async function askNext(api: Api, chatId: number, userId: number, brandId: string, flow: QuestionFlow, locale: Locale): Promise<void> {
  const q = nextQuestion(flow);
  if (!q) {
    await clearPending(userId);
    if (flow.answered) await api.sendMessage(chatId, t(locale, "bot.q_done"));
    if (flow.askPhotos) await askPhotos(api, chatId, userId, brandId, locale);
    return;
  }
  // Saved before the question goes out: a quick tap must find it.
  const at = Date.now();
  await setPending(userId, q.key === "goal" ? { kind: "goal", brandId, flow, at } : { kind: "fact", key: q.key, brandId, flow, at });
  const r = renderQuestion(q, brandId, locale, { fromChannel: flow.fromChannel });
  await api.sendMessage(chatId, r.text, { reply_markup: keyboard(r.rows) });
}

/** The flow a button or a typed answer continues: the pending one for this brand, else the brand's open questions. */
async function flowFor(pending: Pending | null, brand: StoredBrand, locale: Locale): Promise<QuestionFlow> {
  if (pending && (pending.kind === "goal" || pending.kind === "fact") && pending.brandId === brand.id) return pending.flow;
  const answers = await loadAnswers(brand.id).catch(() => null);
  return { queue: questionsForBrand(brand, answers, locale, { bot: botName() }), skipped: [], fromChannel: Boolean(brand.channel) && brand.mode !== "fresh" };
}

async function answered(userId: number, brand: StoredBrand, key: string, given: OwnerAnswers, locale: Locale): Promise<OwnerAnswers> {
  const answers = await saveOwnerAnswers(brand, given, locale);
  // Codes only: never what the owner typed.
  await safeLogEvent(userId, "bot_answer", { brand_id: brand.id, key });
  return answers;
}

async function answerGoal(api: Api, chatId: number, user: User, locale: Locale, brand: StoredBrand, goal: "sale" | "grow", flow: QuestionFlow): Promise<void> {
  const answers = await answered(user.id, brand, "goal", { goal }, locale);
  await safeLogEvent(user.id, "goal_confirmed", { brand_id: brand.id, goal, from: "bot_onboarding" });
  let queue = flow.queue.filter((q) => q.key !== "goal");
  // The questions that follow belong to the goal: a shop that wants subscribers is asked what the channel is about.
  if ((branchOf(queue) ?? flow.planGoal ?? null) !== goal) queue = questionsForBrand(brand, answers, locale, { bot: botName() }).filter((q) => q.key !== "goal");
  if (flow.planGoal && flow.planGoal !== goal && flow.rebuildable && brand.channel) {
    await api.sendMessage(chatId, t(locale, "bot.q_goal_changed", { plan: goalLabel(flow.planGoal, locale), label: goalLabel(goal, locale) }), {
      reply_markup: new InlineKeyboard().text(t(locale, "bot.q_rebuild"), rebuildData(brand.id)),
    });
  }
  await askNext(api, chatId, user.id, brand.id, { ...flow, queue, answered: (flow.answered ?? 0) + 1 }, locale);
}

const ORDER_HOWS: readonly OrderHow[] = ["phone", "manager", "own_bot", "site", "mercat_link"];
const isOrderHow = (v: string): v is OrderHow => (ORDER_HOWS as readonly string[]).includes(v);

async function answerOrder(api: Api, chatId: number, user: User, locale: Locale, brand: StoredBrand, orderHow: OrderHow, flow: QuestionFlow, contact?: string): Promise<void> {
  const asked = flow.queue.find((q) => q.key === "order");
  const answers = await answered(user.id, brand, "order", { orderHow, ...(contact ? { contact } : {}) }, locale);
  let queue = flow.queue.filter((q) => q.key !== "order");
  // "Phone" or "@manager" with no contact on record (the question did not already name the one from the posts):
  // one more short question, so posts never end with a blank where the number goes.
  const confirmed = typeof asked?.prefill === "string" && asked.prefill === orderHow;
  if (orderHow !== "mercat_link" && !answers.contact && !confirmed) queue = [contactQuestion(orderHow, locale), ...queue];
  await askNext(api, chatId, user.id, brand.id, { ...flow, queue, answered: (flow.answered ?? 0) + 1 }, locale);
}

async function answerFact(api: Api, chatId: number, user: User, locale: Locale, brand: StoredBrand, key: "prices" | "about" | "contact", given: OwnerAnswers, flow: QuestionFlow): Promise<void> {
  await answered(user.id, brand, key, given, locale);
  await askNext(api, chatId, user.id, brand.id, { ...flow, queue: flow.queue.filter((q) => q.key !== key), answered: (flow.answered ?? 0) + 1 }, locale);
}

/** How a typed contact orders: a number is a phone, a site is a site, a @name is a manager (or a bot). */
const orderHowOf = (contact: string): OrderHow => (/\d{2}[\s-]?\d{3}/.test(contact) && !/[a-z]{3}/i.test(contact) ? "phone" : /^@|t\.me\//i.test(contact) ? (/bot\b/i.test(contact) ? "own_bot" : "manager") : "site");

/** A typed answer to the question the bot is waiting on. false = not an answer: the message is read as usual. */
async function answerTyped(api: Api, chatId: number, user: User, locale: Locale, pending: Extract<Pending, { kind: "goal" | "fact" }>, text: string): Promise<boolean> {
  const brand = await ownedBrand(pending.brandId, user.id);
  if (!brand) {
    await clearPending(user.id);
    return false;
  }
  const flow = pending.flow;
  const s = text.trim();
  if (pending.kind === "goal") {
    // A new channel or a business description starts a new run.
    if (isChannelText(s) || s.length >= 40) return false;
    // A typed "1" is the first button the owner sees (the pre-filled answer), not the engine's first option.
    const goalQ = flow.queue.find((q) => q.key === "goal");
    const goal = goalQ ? matchOption(s, orderedOptions(goalQ)) : null;
    if (goal === "sale" || goal === "grow") await answerGoal(api, chatId, user, locale, brand, goal, flow);
    else await api.sendMessage(chatId, t(locale, "bot.q_tap"));
    return true;
  }
  switch (pending.key) {
    case "order": {
      // A channel (a t.me link or a bare @name, as the onboarding prompt asks for one) is a new run, or the answer to
      // a publish "which channel?" wait: never the brand's contact. A typed number is how customers order; a manager's
      // @username comes in the contact follow-up, after "@manager" is tapped.
      if (isChannelText(s)) return false;
      const contact = parseContact(s, { bot: botName() });
      if (contact) {
        await answerOrder(api, chatId, user, locale, brand, orderHowOf(contact), flow, contact);
        return true;
      }
      const orderQ = flow.queue.find((q) => q.key === "order");
      const how = orderQ ? matchOption(s, orderedOptions(orderQ)) : null;
      if (how && isOrderHow(how)) await answerOrder(api, chatId, user, locale, brand, how, flow);
      else await api.sendMessage(chatId, t(locale, "bot.q_tap"));
      return true;
    }
    case "prices": {
      if (isChannelText(s)) return false;
      const prices = parsePrices(s);
      if (!prices.length) await api.sendMessage(chatId, t(locale, "bot.q_prices_bad"));
      else await answerFact(api, chatId, user, locale, brand, "prices", { prices }, flow);
      return true;
    }
    case "about": {
      if (isChannelText(s)) return false;
      if (s.length < 8) await api.sendMessage(chatId, t(locale, "bot.q_about_short"));
      else await answerFact(api, chatId, user, locale, brand, "about", { about: s }, flow);
      return true;
    }
    case "contact": {
      // A @name or a t.me link here is the contact the bot asked for.
      const contact = parseContact(s, { bot: botName() });
      if (contact) await answerFact(api, chatId, user, locale, brand, "contact", { contact }, flow);
      else await api.sendMessage(chatId, t(locale, contactBadKey(flow.queue.find((q) => q.key === "contact"))));
      return true;
    }
  }
}

/* ---------------------------------------------------------------------------------------------------- photos */

/** Asks for up to 3 photos of the product or place (skippable). */
export async function askPhotos(api: Api, chatId: number, userId: number, brandId: string, locale: Locale): Promise<void> {
  await setPending(userId, { kind: "photos", brandId, fileIds: [], at: Date.now() });
  await api.sendMessage(chatId, t(locale, "bot.photos_ask"), { reply_markup: new InlineKeyboard().text(t(locale, "bot.photos_skip"), photosData("s", brandId)) });
}

/** Learns the brand's picture style with these photos (after the webhook answered) and tells the owner. */
async function learnPhotos(api: Api, chatId: number, user: User, locale: Locale, brandId: string, fileIds: string[]): Promise<void> {
  await runWithContext({ route: "bot/photos", lang: locale, telegramId: user.id }, async () => {
    try {
      await api.sendMessage(chatId, t(locale, "bot.photos_learning"));
      const brand = await ownedBrand(brandId, user.id);
      if (!brand) return;
      const images = (await Promise.all(fileIds.map((id) => telegramPhoto(api, id)))).filter((x): x is string => Boolean(x));
      if (!images.length) {
        await api.sendMessage(chatId, t(locale, "bot.photos_failed"));
        return;
      }
      const visual = await learnFromOwnerPhotos(brand, images, user.id);
      await safeLogEvent(user.id, "visual_learned", {
        brand_id: brand.id,
        refs: visual.refs.length,
        owner_refs: visual.refs.filter((r) => r.source === "owner").length,
        from: "bot",
      });
      const summary = styleWords(visual, locale)?.summary;
      await api.sendMessage(chatId, summary ? t(locale, "bot.photos_learned", { summary }) : t(locale, "bot.photos_learned_plain"));
    } catch (err) {
      if (!(err instanceof VisualLimitError)) console.warn("[botflow/photos] style not learned", err instanceof Error ? err.message : err);
      await api.sendMessage(chatId, t(locale, err instanceof VisualLimitError ? "bot.photos_limit" : "bot.photos_failed")).catch(() => undefined);
    } finally {
      await flushUsage();
    }
  });
}

async function receivePhoto(api: Api, chatId: number, user: User, locale: Locale, pending: Extract<Pending, { kind: "photos" }>, fileId: string, deps: FlowDeps): Promise<void> {
  const brand = await ownedBrand(pending.brandId, user.id);
  if (!brand) {
    await clearPending(user.id);
    return;
  }
  const ids = await addPendingPhoto(user.id, brand.id, fileId, MAX_BOT_PHOTOS);
  if (!ids) return; // a repeat, or a 4th photo of an album: the first three are already on their way
  if (ids.length >= MAX_BOT_PHOTOS) {
    // Taken atomically: a "Done" tap at the same moment finds nothing, so the style is learned once.
    const taken = await takePendingPhotos(user.id, brand.id);
    if (taken?.length) await deps.later(() => learnPhotos(api, chatId, user, locale, brand.id, taken));
    return;
  }
  // An album arrives as several updates at once: only the last photo in answers, once they have settled.
  await deps.later(async () => {
    await sleep(deps.settleMs ?? 1500);
    const now = await getPending(user.id);
    if (now?.kind !== "photos" || now.brandId !== brand.id || now.fileIds.at(-1) !== fileId) return;
    await api.sendMessage(chatId, t(locale, "bot.photos_got", { n: now.fileIds.length }), {
      reply_markup: new InlineKeyboard().text(t(locale, "bot.photos_done"), photosData("d", brand.id)).text(t(locale, "bot.photos_skip"), photosData("s", brand.id)),
    });
  });
}

/* ----------------------------------------------------------------------------------------------------- video */

/**
 * What arrives while a video wait is pending: a text, or a video (a video message, or a video sent as a file) with
 * what Telegram says about it (botflow/video-core.ts IncomingVideo).
 */
export type VideoInput = { type: "text"; text: string } | ({ type: "video" } & IncomingVideo);
export type VideoHandler = (api: Api, chatId: number, user: User, locale: Locale, pending: Extract<Pending, { kind: "video" }>, input: VideoInput) => Promise<boolean>;

let videoHandler: VideoHandler | null = null;

/** The media stream's handler for a video wait (one line where it registers; returns true when it took the input). */
export function registerVideoHandler(handler: VideoHandler | null): void {
  videoHandler = handler;
}

/** Waits for a video for a post of the user's brand (the media stream sets it when it asks for one). */
export async function waitForVideo(userId: number, brandId: string, postId: string): Promise<void> {
  await setPending(userId, { kind: "video", brandId, postId, at: Date.now() });
}

/* ------------------------------------------------------------------------------------------------ dispatcher */

/**
 * A private text message, before it is read as a channel link or a business description: the answer to what the bot
 * is waiting for, if anything. false = nothing pending took it (the message is read as usual).
 */
export async function answerPendingText(api: Api, chatId: number, user: User, locale: Locale, text: string): Promise<boolean> {
  const pending = await getPending(user.id);
  if (!pending) return false;
  if (pending.kind === "goal" || pending.kind === "fact") {
    try {
      return await answerTyped(api, chatId, user, locale, pending, text);
    } catch (err) {
      // The answer was not saved: say so (the question stays open), never silence.
      console.warn("[botflow] typed answer not saved", err instanceof Error ? err.message : err);
      await api.sendMessage(chatId, t(locale, "bot.error")).catch(() => undefined);
      return true;
    }
  }
  if (pending.kind === "video") return videoHandler ? videoHandler(api, chatId, user, locale, pending, { type: "text", text }) : false;
  return false; // photos: a text is not a photo
}

/** A video message or file: to the video wait's handler when one is pending. false = nothing took it. */
async function onVideo(api: Api, chatId: number, user: User, input: VideoInput): Promise<boolean> {
  if (!videoHandler) return false;
  const pending = await getPending(user.id);
  if (pending?.kind !== "video") return false;
  return videoHandler(api, chatId, user, pickLocale(user.language_code), pending, input);
}

export { clearPending };

export function registerBotFlows(b: Bot, deps: FlowDeps): void {
  // An answer button (goal, how customers order) or "skip": owner only.
  b.callbackQuery(QUESTION_RE, async (ctx) => {
    const [, op, brandId, value] = ctx.match;
    const locale = pickLocale(ctx.from.language_code);
    const brand = await ownedBrand(brandId, ctx.from.id);
    if (!brand) return void (await ctx.answerCallbackQuery({ text: t(locale, "bot.not_your_brand") }).catch(() => undefined));
    const chatId = ctx.chat?.id ?? ctx.from.id;
    const flow = await flowFor(await getPending(ctx.from.id), brand, locale);
    if (op === "s") {
      const key = asKey(value);
      await ctx.answerCallbackQuery().catch(() => undefined);
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
      if (key) await safeLogEvent(ctx.from.id, "bot_answer_skipped", { brand_id: brand.id, key });
      await askNext(ctx.api, chatId, ctx.from.id, brand.id, { ...flow, skipped: key ? [...flow.skipped, key] : flow.skipped }, locale);
      return;
    }
    if ((op === "g" && value !== "sale" && value !== "grow") || (op === "o" && !isOrderHow(value))) return void (await ctx.answerCallbackQuery().catch(() => undefined));
    try {
      if (op === "g") await answerGoal(ctx.api, chatId, ctx.from, locale, brand, value as "sale" | "grow", flow);
      else await answerOrder(ctx.api, chatId, ctx.from, locale, brand, value as OrderHow, flow);
    } catch (err) {
      // Not saved: the buttons stay, the owner can tap again.
      console.warn("[botflow] answer not saved", err instanceof Error ? err.message : err);
      return void (await ctx.answerCallbackQuery({ text: t(locale, "bot.error") }).catch(() => undefined));
    }
    // "Saved" only once it is: the answer is stored and the next question is on its way.
    await ctx.answerCallbackQuery({ text: t(locale, "bot.q_saved") }).catch(() => undefined);
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
  });

  // Photos: "done" learns from what came so far; "later" skips. Owner only.
  b.callbackQuery(PHOTOS_RE, async (ctx) => {
    const [, op, brandId] = ctx.match;
    const locale = pickLocale(ctx.from.language_code);
    const brand = await ownedBrand(brandId, ctx.from.id);
    if (!brand) return void (await ctx.answerCallbackQuery({ text: t(locale, "bot.not_your_brand") }).catch(() => undefined));
    const chatId = ctx.chat?.id ?? ctx.from.id;
    const pending = await getPending(ctx.from.id);
    const waiting = pending?.kind === "photos" && pending.brandId === brand.id ? pending : null;
    if (op === "d") {
      if (!waiting?.fileIds.length) return void (await ctx.answerCallbackQuery({ text: t(locale, "bot.photos_need_one") }).catch(() => undefined));
      await ctx.answerCallbackQuery().catch(() => undefined);
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
      // Taken atomically: of two quick taps (or a tap and a 3rd photo) only one starts the paid style analysis.
      const taken = await takePendingPhotos(ctx.from.id, brand.id);
      const user = ctx.from;
      if (taken?.length) await deps.later(() => learnPhotos(ctx.api, chatId, user, locale, brand.id, taken));
      return;
    }
    await ctx.answerCallbackQuery().catch(() => undefined);
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
    if (waiting) await clearPending(ctx.from.id);
    await safeLogEvent(ctx.from.id, "bot_photos_skipped", { brand_id: brand.id });
    await ctx.api.sendMessage(chatId, t(locale, "bot.photos_skipped"));
  });

  const pm = b.chatType("private");

  // A photo (or an image sent as a file): the photos the bot asked for; otherwise a hint, never a paid run.
  const onImage = async (api: Api, chatId: number, user: User, fileId: string | null, album: boolean) => {
    const locale = pickLocale(user.language_code);
    const pending = await getPending(user.id);
    if (pending?.kind === "photos") {
      if (fileId) await receivePhoto(api, chatId, user, locale, pending, fileId, deps);
      else await api.sendMessage(chatId, t(locale, "bot.photos_failed"));
      return;
    }
    // A question is open: the photo is not its answer and needs no reply of its own. Nor does a 4th photo of an album
    // that arrives after the first three were taken.
    if (pending || album) return;
    // An owner (a 4th single photo just after the first three, or photos some days later): photos go to the Studio.
    // Anyone else has no brand to put them on yet.
    await api.sendMessage(chatId, t(locale, (await ownsABrand(user.id)) ? "bot.photos_has_brand" : "bot.photos_unexpected"));
  };
  pm.on("message:photo", async (ctx) => {
    if (!ctx.from) return;
    await onImage(ctx.api, ctx.chat.id, ctx.from, pickPhotoSize(ctx.message.photo)?.file_id ?? null, Boolean(ctx.message.media_group_id));
  });
  pm.on("message:document", async (ctx, next) => {
    const doc = ctx.message.document;
    // A video sent as a file, while the bot waits for one.
    if (ctx.from && /^video\//i.test(doc.mime_type ?? "")) {
      const input: VideoInput = {
        type: "video",
        as: "document",
        fileId: doc.file_id,
        fileUniqueId: doc.file_unique_id,
        size: doc.file_size,
        mime: doc.mime_type,
        thumbFileId: doc.thumbnail?.file_id,
      };
      if (await onVideo(ctx.api, ctx.chat.id, ctx.from, input)) return;
      return next();
    }
    if (!ctx.from || !/^image\/(jpeg|png|webp)$/i.test(doc.mime_type ?? "")) return next();
    await onImage(ctx.api, ctx.chat.id, ctx.from, (doc.file_size ?? 0) <= 5_000_000 ? doc.file_id : null, Boolean(ctx.message.media_group_id));
  });

  // A video for a post, when the bot waits for one (botflow/video.ts).
  pm.on("message:video", async (ctx, next) => {
    if (!ctx.from) return next();
    const v = ctx.message.video;
    const input: VideoInput = {
      type: "video",
      as: "video",
      fileId: v.file_id,
      fileUniqueId: v.file_unique_id,
      duration: v.duration,
      width: v.width,
      height: v.height,
      size: v.file_size,
      mime: v.mime_type,
      thumbFileId: v.thumbnail?.file_id,
    };
    if (!(await onVideo(ctx.api, ctx.chat.id, ctx.from, input))) return next();
  });
}
