/**
 * The Videographer's pure parts (no I/O; client-safe and unit-tested). video.ts makes the Claude calls.
 *
 * - Which posts are video posts: a plan slot with format "video", or a video idea (a post with a script and no slot).
 * - The script's language: the brand's post language (dna.languages, the first one the post has text for), else the
 *   owner's screen language. Uzbek Cyrillic is written in Latin and converted by code, like every post.
 * - What the script is for: a growth channel (blog, expert, media, community, or the owner's goal "more subscribers")
 *   gets hooks for reach and engagement and no sales pitch; a business gets one clear call to order. The last scene's
 *   call to action follows the channel's own ending (owner correction 1): its contact as written, or nothing.
 * - Facts only from the brand: a number, price, phone or promo word the brand never gave is cut from the script and
 *   the caption by code.
 * - The caption: short, in the channel's voice and ending, up to Telegram's 1024-character caption limit.
 */
import type { ChannelType, Goal, PostDraft, PostEnding, Script, VideoPlan } from "./contract";
import { applyPostEnding, dropTrackedLinks, endingBrief, type EndingOptions } from "./ending";
import { factKeys, newFactKeys } from "./fact-keys";
import { alignProductNames, fixMixedScript, oneContactRoute, replaceHiddenPrice } from "./postguard";
import { normalizePrices } from "./price";
import { clip, splitSentences } from "./text";
import { latinToCyrillic, polishUzLatin } from "./translit";

/** Telegram's caption limit (sendVideo, sendDocument): a longer text follows the video as its own message. */
export const VIDEO_CAPTION_LIMIT = 1024;
/** What the caption writer aims for, so the channel's ending still fits under the limit. */
export const VIDEO_CAPTION_TARGET = 600;

const SCRIPTS: readonly Script[] = ["uz_latn", "uz_cyrl", "ru", "en"];

/** A video post: a plan slot whose format is "video", or a video idea (a script, no slot). */
export const isVideoPost = (p: Pick<PostDraft, "slot" | "video">): boolean => p.slot?.format === "video" || (!p.slot && !!p.video);

/** A video idea from the Video tab: no plan slot, so it is never part of a week's batch. */
export const isVideoIdea = (p: Pick<PostDraft, "slot" | "video">): boolean => !p.slot && !!p.video;

export type UiLang = "uz" | "ru" | "en";

const UI_SCRIPT: Record<UiLang, Script> = { uz: "uz_latn", ru: "ru", en: "en" };

/**
 * The language the script is written in: the brand's post language (the first of dna.languages that the post has
 * text for, or simply the first one for a new idea), else the owner's screen language.
 */
export function videoLang(o: { languages?: readonly Script[] | null; variants?: Partial<Record<Script, string>> | null; uiLang?: UiLang }): Script {
  const langs = (o.languages ?? []).filter((s) => SCRIPTS.includes(s));
  const has = (s: Script) => !o.variants || (o.variants[s] ?? "").trim().length > 0 || (s === "uz_cyrl" && (o.variants.uz_latn ?? "").trim().length > 0);
  return langs.find(has) ?? langs[0] ?? UI_SCRIPT[o.uiLang ?? "uz"];
}

export type VideoMode = "growth" | "sales";

/**
 * Growth or sales: the owner's main goal wins (grow = growth, sale = sales); else a plan slot meant to engage or grow;
 * else the channel type (anything but a business is a growth channel). Unknown = sales, as for posts.
 */
export function videoMode(o: { channelType?: ChannelType; brandGoal?: Goal; slotGoal?: Goal }): VideoMode {
  if (o.brandGoal === "grow" || o.brandGoal === "engage") return "growth";
  if (o.brandGoal === "sale") return "sales";
  if (o.slotGoal === "grow" || o.slotGoal === "engage") return "growth";
  return o.channelType && o.channelType !== "business" ? "growth" : "sales";
}

const LANG_RULE: Record<Script, string> = {
  uz_latn: "Uzbek in Latin script, as people in Tashkent speak: o‘ and g‘ with the ‘ sign, short sentences",
  // Written in Latin and converted to Cyrillic by code (one source for both scripts).
  uz_cyrl: "Uzbek in Latin script, as people in Tashkent speak: o‘ and g‘ with the ‘ sign, short sentences",
  ru: "Russian, natural spoken Russian, short sentences",
  en: "English, natural spoken English, short sentences",
};

const GOAL_RULE: Record<VideoMode, string> = {
  growth:
    "This channel grows an audience (a blog, an expert, media or a community). The video earns views, shares and reactions: a hook that makes people stop, something useful, surprising or personal, a reason to share or comment. No sales pitch, no prices, no 'order now'. The last scene asks for one small action that fits the channel: subscribe, share with a friend, answer a question in the comments, or wait for the next part.",
  sales:
    "This is a business. The video shows the product or the place for real, so people want to buy or come. The last scene is one clear call to action that follows the channel's ending below.",
};

/** The Videographer's system prompt for one language and goal. */
export function videoSystem(lang: Script, mode: VideoMode): string {
  return `You are the "Videograf" of an AI marketing department for a small business or channel in Uzbekistan.
Write a vertical Reels/Telegram video plan (15-40 s total) that the owner shoots on a phone, alone, in one go.
Language of every text field: ${LANG_RULE[lang]}.
Rules:
- hook: what is seen and said in the first 2 seconds; it must stop the scroll (a question, a close-up, a number from the brand data, a surprise).
- 4-6 scenes; seconds = duration of each scene (2-8 s). visual = a concrete shot: what to film and how (close-up, from above, hands, the counter, the street sign). Only what the owner really has.
- voiceover: what the owner says, like a real person talking, no AI clichés, no hype.
- caption: on-screen text for the scene, at most 5 words.
- ${GOAL_RULE[mode]}
- FACTS: only from the brand data below (products, prices, address, hours, contact). Never invent a price, a phone, a discount, a date or a number.
- musicMood: one short phrase.`;
}

/** What the brief and the plan slot say the video is about. */
export interface VideoBriefInput {
  /** The brand's DNA (sent without its ending, which gets its own block). */
  dna: Record<string, unknown>;
  knowledge: string;
  samplePost?: string;
  ending?: PostEnding;
  /** The plan slot's opening idea and call to action, when the video is for a slot. */
  hook?: string;
  cta?: string;
  /** The slot's brief, or the owner's own words for a new idea. */
  brief: string;
  /** The post already written for the slot: its facts and angle. */
  postText?: string;
}

/** The user prompt: the brand, how its posts end, and what this video is about. */
export function videoPrompt(i: VideoBriefInput): string {
  const dna = { ...i.dna, postEnding: undefined };
  const ending = endingBrief(i.ending);
  return [
    `BRAND DNA:\n${JSON.stringify(dna)}`,
    `BRAND FACTS (the only source of facts):\n${clip(i.knowledge, 3000) || "(only the channel posts)"}`,
    i.samplePost ? `A RECENT POST OF THE CHANNEL (its voice):\n${clip(i.samplePost, 600)}` : "",
    ending ? `${ending}\nThe last scene's call to action ends the same way: the same contact written the same way, or no contact at all when the posts just end.` : "",
    i.postText ? `THE POST WRITTEN FOR THIS SLOT (same topic and facts):\n${clip(i.postText, 1200)}` : "",
    i.hook ? `PLAN SLOT: ${clip(i.hook, 200)}${i.cta ? ` / call to action: ${clip(i.cta, 200)}` : ""}` : "",
    `VIDEO BRIEF: ${clip(i.brief, 1000) || "a short video that shows the brand at its best"}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const TIME_RE = /(?<!\d)([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)/g;
const timesIn = (text: string) => new Set([...text.matchAll(TIME_RE)].map((m) => `${Number(m[1])}:${m[2]}`));

/**
 * A guard over the brand's facts: it keeps the sentences of a text that bring no fact the brand never gave — a price
 * or another number of 100 and more, a phone, a percent, a promo or urgency word, a weekday or month, a clock time.
 * Small counts ("3 ta sabab", "15 soniyada") are a script's own words, not facts, and stay.
 */
export function factGuard(facts: string): (text: string) => string {
  const allowed = factKeys(facts);
  const times = timesIn(facts);
  const invents = (s: string) =>
    newFactKeys(allowed, s).some((k) => !/^\d+$/.test(k) || Number(k) >= 100) || [...timesIn(s)].some((t) => !times.has(t));
  return (text) => {
    if (!invents(text)) return text;
    return splitSentences(text)
      .filter((s) => !invents(s))
      .join("")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  };
}

const uzText = (s: string) => polishUzLatin(fixMixedScript(s.trim()));

/** The model's plan, made safe: 1-6 scenes, 1-10 s each, captions of five words, no invented facts, one script. */
export function finishPlan(raw: { hook: string; scenes: { seconds: number; visual: string; voiceover: string; caption: string }[]; musicMood: string }, lang: Script, facts: string): VideoPlan {
  const guard = factGuard(facts);
  const uz = lang === "uz_latn" || lang === "uz_cyrl";
  const one = (s: string) => {
    const t = guard(String(s ?? "").trim());
    if (!uz) return t;
    const latn = uzText(t);
    return lang === "uz_cyrl" ? latinToCyrillic(latn) : latn;
  };
  const words = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 6).join(" ");
  return {
    hook: one(raw.hook),
    scenes: raw.scenes.slice(0, 6).map((s) => ({
      seconds: Math.max(1, Math.min(10, Math.round(Number(s.seconds) || 3))),
      visual: one(s.visual),
      voiceover: one(s.voiceover),
      caption: words(one(s.caption)),
    })),
    musicMood: one(clip(raw.musicMood ?? "", 80)),
    lang,
  };
}

/** Total length of a plan in seconds. */
export const planSeconds = (plan: Pick<VideoPlan, "scenes">) => plan.scenes.reduce((a, s) => a + (Number(s.seconds) || 0), 0);

/* ------------------------------------------------------------------------------------------------- caption */

/** The caption writer's system prompt. */
export const CAPTION_SYSTEM = `You are the "Copywriter" of an AI marketing department. You write the caption under a short video in a Telegram channel.
Rules:
- Short: 2-4 short lines, under ${VIDEO_CAPTION_TARGET} characters before the channel's usual ending. It goes under the video, so it does not retell the video; it gives a reason to watch and the one fact that matters.
- The channel's voice: copy the post you are given (address form siz/sen, emoji density, line breaks).
- FACTS: only facts from the post and the brand facts. Never invent a price, a phone, a date, a discount or a number.
- Never describe the video frame by frame and never promise what is not in it.
- No AI clichés, no hype, plain text, no Markdown.
- The ending follows the channel (see below): the channel's own contact written the same way, its hashtags, or nothing.
- Three versions of the same caption: uz_latn (Uzbek, Latin script, o‘ and g‘ with the ‘ sign), ru, en. One language per version.
Return JSON {uz_latn, ru, en}.`;

/** What the caption is for: a growth channel's caption never leans toward ordering (owner correction 2). */
const CAPTION_GOAL: Record<VideoMode, string> = {
  growth: "This channel grows an audience: give a reason to watch, share or comment; no price, no 'order now'.",
  sales: "One clear reason to buy or come, using the channel's ending.",
};

/** The caption writer's prompt: the post as it is, the script, what the channel is for, the facts and its ending. */
export function captionPrompt(i: { postText: string; plan: VideoPlan; mode: VideoMode; knowledge: string; ending?: PostEnding; products: readonly string[] }): string {
  const ending = endingBrief(i.ending);
  return [
    `THE POST (its voice and facts):\n${clip(i.postText, 1500) || "(none yet)"}`,
    `THE VIDEO: ${clip(i.plan.hook, 200)} / ${i.plan.scenes.map((s) => clip(s.voiceover, 160)).join(" / ")}`,
    `GOAL: ${CAPTION_GOAL[i.mode]}`,
    `BRAND FACTS:\n${clip(i.knowledge, 2000) || "(only the post)"}`,
    `PRODUCT NAMES (write them this way): ${i.products.join(", ") || "-"}`,
    ending,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Fits a caption under `limit` characters: the last paragraph (the channel's ending: contact, hashtags) stays, the
 * body loses sentences from its end. Telegram counts UTF-16 code units, like String.length.
 */
export function fitCaption(text: string, limit = VIDEO_CAPTION_LIMIT): string {
  const t = text.trim();
  if (t.length <= limit) return t;
  const paras = t.split(/\n{2,}/);
  const last = paras.length > 1 ? paras.at(-1)!.trim() : "";
  if (!last || last.length > limit / 2) return clip(t, limit);
  const room = limit - last.length - 2;
  let body = "";
  for (const s of splitSentences(paras.slice(0, -1).join("\n\n"))) {
    if ((body + s).trimEnd().length > room) break;
    body += s;
  }
  body = body.trim();
  return body ? `${body}\n\n${last}` : clip(t, limit);
}

export interface CaptionContext {
  /** The post's text in every version (facts the caption may repeat) and the brand facts. */
  facts: string;
  products: readonly string[];
  /** How the channel's posts end (the caption ends the same way). */
  ending?: PostEnding;
  endingOptions?: EndingOptions;
  /** Contact keys that stay whatever happens (the channel's own, the owner's answer). */
  keepKeys?: readonly string[];
  /** Brand words kept in Latin inside the Cyrillic version. */
  keep?: string[];
  /** The post's current text: used for a version that comes back empty. */
  fallback: Partial<Record<Script, string>>;
}

/**
 * The model's caption, made safe by the same code pass as a post: no invented facts, no hidden price, one contact
 * route, the channel's ending, one price format, the DNA's product names, no Mercat tracked link (opt-in only, never
 * here), under the caption limit. uz_cyrl is converted from uz_latn.
 */
export function finishCaption(raw: { uz_latn: string; ru: string; en: string }, ctx: CaptionContext): Record<Script, string> {
  const guard = factGuard(ctx.facts);
  const out = {} as Record<Script, string>;
  for (const script of ["uz_latn", "ru", "en"] as const) {
    let text = guard(String(raw[script] ?? "").trim());
    if (text.length < 10) text = (ctx.fallback[script] ?? "").trim();
    if (script === "uz_latn") text = fixMixedScript(text);
    text = oneContactRoute(replaceHiddenPrice(text, script), ctx.keepKeys ?? []);
    text = applyPostEnding(text, ctx.ending, script, ctx.endingOptions ?? {});
    text = dropTrackedLinks(text, ctx.endingOptions?.bot);
    text = alignProductNames(normalizePrices(text, script), ctx.products, { wholeWord: script === "en" });
    text = fitCaption(script === "uz_latn" ? polishUzLatin(text) : text);
    out[script] = text;
  }
  out.uz_cyrl = fitCaption(latinToCyrillic(out.uz_latn, ctx.keep ?? []));
  return out;
}

/** "0:23", "1:05": a video's length for the owner. */
export function fmtDuration(seconds?: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "";
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
