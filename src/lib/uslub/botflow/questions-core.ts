/**
 * The owner's questions in the bot chat (pure): how a question from the engine (runQuestions) becomes a message with
 * buttons, what a typed answer means (prices, a contact, an option named in words), callback data, and which Telegram
 * photo size goes to the designer. Every question has a skip button: nothing here ever blocks the owner.
 */
import { type Locale, t } from "../../i18n";
import { contactsIn, PHONE_RE } from "../ending";
import type { AskedKey, FlowQuestion, QuestionFlow } from "./pending-core";

export type { FlowQuestion } from "./pending-core";

/* ------------------------------------------------------------------------------------------- callback data */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * Prefixes this module owns: oq (owner question) and oph (owner photos). The autopilot owns apr/apg/apw/apa/apo, the
 * bot ord/sold/lead/pub/ob, the publish flow pb/pv.
 */
export const FLOW_CALLBACK_PREFIXES = ["oq", "oph"] as const;

/** g = goal answer, o = how customers order, s = skip the question named by the value. */
export type QuestionOp = "g" | "o" | "s";
export const questionData = (op: QuestionOp, brandId: string, value: string) => `oq:${op}:${brandId}:${value}`;
export const QUESTION_RE = new RegExp(`^oq:([gos]):(${UUID}):([a-z_]{1,12})$`);

/** Rebuild this week's plan and posts for the goal the owner just chose. */
export const rebuildData = (brandId: string) => `oq:r:${brandId}`;
export const REBUILD_RE = new RegExp(`^oq:r:(${UUID})$`);

/** d = done sending photos (learn the style now), s = skip the photos. */
export const photosData = (op: "d" | "s", brandId: string) => `oph:${op}:${brandId}`;
export const PHOTOS_RE = new RegExp(`^oph:([ds]):(${UUID})$`);

/* ---------------------------------------------------------------------------------------------- rendering */

export interface Button {
  text: string;
  data: string;
}

export interface RenderedQuestion {
  text: string;
  rows: Button[][];
}

const optionLabel = (q: FlowQuestion, value: string | undefined) => q.options?.find((o) => o.value === value)?.label;

/**
 * One question as a message. Choices are buttons (the pre-filled one first; for a brand read from its channel the goal
 * also says which answer the posts suggest); prices, about and the contact are typed. The last row is always "skip".
 */
export function renderQuestion(q: FlowQuestion, brandId: string, locale: Locale, opts: { fromChannel?: boolean } = {}): RenderedQuestion {
  const lines = [q.text];
  const rows: Button[][] = [];
  const prefill = typeof q.prefill === "string" ? q.prefill : undefined;
  if (q.input === "choice" && q.options?.length) {
    if (q.key === "goal" && opts.fromChannel) {
      const label = optionLabel(q, prefill);
      if (label) lines.push(t(locale, "bot.q_suggested", { label }));
    }
    const ordered = prefill ? [...q.options].sort((a, b) => Number(b.value === prefill) - Number(a.value === prefill)) : q.options;
    const op: QuestionOp = q.key === "goal" ? "g" : "o";
    const buttons = ordered.map((o) => ({ text: o.label, data: questionData(op, brandId, o.value) }));
    // Two short goal answers share a row; the order options are long, one per row.
    if (q.key === "goal") rows.push(buttons);
    else for (const b of buttons) rows.push([b]);
  } else if (q.input === "prices") {
    const names = Array.isArray(q.prefill) ? q.prefill.map((p) => p.name).filter(Boolean).slice(0, 3) : [];
    const example = (names.length ? names : [t(locale, "bot.q_price_example_name")]).map((n) => `${n} — `).join("\n");
    lines.push("", t(locale, "bot.q_prices_how"), example);
  }
  if (q.hint) lines.push("", q.hint);
  rows.push([{ text: t(locale, "bot.q_skip"), data: questionData("s", brandId, q.key) }]);
  return { text: lines.join("\n"), rows };
}

/** The bot's own follow-up after "phone", "@manager", "our bot" or "website" when no contact is known yet. */
export function contactQuestion(orderHow: string, locale: Locale): FlowQuestion {
  const key =
    orderHow === "phone" ? "bot.q_contact_phone" : orderHow === "own_bot" ? "bot.q_contact_bot" : orderHow === "site" ? "bot.q_contact_site" : "bot.q_contact_manager";
  return { key: "contact", text: t(locale, key), input: "text" };
}

/* ------------------------------------------------------------------------------------------------- the flow */

/** The next question to ask: the first one in the queue the owner did not skip. */
export function nextQuestion(flow: Pick<QuestionFlow, "queue" | "skipped">): FlowQuestion | null {
  return flow.queue.find((q) => !flow.skipped.includes(q.key)) ?? null;
}

/** Which goal a queue of questions was made for: sales questions (order, prices) or growth ones (about). */
export function branchOf(queue: FlowQuestion[]): "sale" | "grow" | null {
  if (queue.some((q) => q.key === "order" || q.key === "prices")) return "sale";
  if (queue.some((q) => q.key === "about")) return "grow";
  return null;
}

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’ʻ`']/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3);

/**
 * The option a typed answer names, or null: its number ("2"), or words that occur in exactly one option's label
 * ("obunachi" -> "Ko‘proq obunachi"). Words shared by several options decide nothing.
 */
export function matchOption(text: string, options: { value: string; label: string }[]): string | null {
  const s = text.trim();
  const n = /^\d$/.test(s) ? Number(s) : 0;
  if (n >= 1 && n <= options.length) return options[n - 1].value;
  const typed = words(s);
  if (!typed.length) return null;
  const labels = options.map((o) => words(o.label));
  const fits = (w: string, label: string[]) => label.some((l) => l.startsWith(w) || w.startsWith(l));
  // Only words that point at one option count: a word several options share ("ko‘proq") decides nothing.
  const hits = new Set<number>();
  for (const w of typed) {
    const where = labels.flatMap((label, i) => (fits(w, label) ? [i] : []));
    if (where.length === 1) hits.add(where[0]);
  }
  return hits.size === 1 ? options[[...hits][0]].value : null;
}

/* ---------------------------------------------------------------------------------------- typed answers */

const UNIT = "(?:so['‘’ʻ`]?m|сўм|сум|sum|uzs|ming|минг|тыс\\.?|тысяч|\\$|usd|y\\.?e\\.?|у\\.?е\\.?)";
const PRICE_LINE = new RegExp(String.raw`^(.*?\p{L}.*?)[\s:=—–-]*?(\d[\d\s.,]*\d|\d)\s*(${UNIT})?\s*\.?$`, "iu");

/**
 * Product + price pairs as the owner typed them ("Medovik — 180 000 so'm", one per line, or separated by ";" or by
 * ", " before the next name). At most 5. A line without a name or without a number is not a price.
 */
export function parsePrices(text: string): { name: string; price: string }[] {
  const parts = text
    .split(/\n|;/)
    .flatMap((line) => line.split(/,\s+(?=\p{L})/u))
    .map((s) => s.trim())
    .filter(Boolean);
  const out: { name: string; price: string }[] = [];
  for (const part of parts) {
    const m = PRICE_LINE.exec(part);
    if (!m) continue;
    const name = m[1].replace(/[\s:=—–-]+$/u, "").trim();
    if (!/\p{L}{2}/u.test(name)) continue;
    const price = [m[2].trim(), m[3]].filter(Boolean).join(" ");
    out.push({ name: name.slice(0, 120), price: price.slice(0, 40) });
    if (out.length === 5) break;
  }
  return out;
}

const SITE_RE = /(?:https?:\/\/|www\.)[^\s]+|(?<![@\w.])[\w-]+\.(?:uz|com|ru|org|net|me|io|shop|store)(?:\/[^\s]*)?/i;
const LOCAL_PHONE_RE = /(?<!\d)(?:\+?\d[\d\s()-]{7,}\d)(?!\d)/;

/**
 * The contact customers use, as typed: a phone (Uzbek or any 9+ digit number), a @username, a t.me / wa.me link, or
 * a website. Mercat's own bot is never the business's contact. null when there is none.
 */
export function parseContact(text: string, opts: { bot?: string } = {}): string | null {
  const s = text.trim();
  const tg = contactsIn(s, { bot: opts.bot });
  if (tg.length) return tg[0].raw;
  if (opts.bot && new RegExp(`@${opts.bot}\\b|t\\.me/${opts.bot}\\b`, "i").test(s)) return null;
  const site = SITE_RE.exec(s);
  if (site) return site[0].replace(/[.,;)]+$/, "");
  PHONE_RE.lastIndex = 0;
  const phone = LOCAL_PHONE_RE.exec(s);
  if (phone && phone[0].replace(/\D/g, "").length >= 9) return phone[0].trim();
  return null;
}

/* ------------------------------------------------------------------------------------------------- photos */

export interface PhotoSize {
  file_id: string;
  width: number;
  height: number;
  file_size?: number;
}

/** Claude's per-image limit (visual/images.ts MAX_IMAGE_BYTES). */
const MAX_PHOTO_BYTES = 5_000_000;

/**
 * The photo size the designer studies: the largest up to 1600 px on the long side, else the largest one under 5 MB
 * (Telegram lists sizes small to large). null when every size is too big.
 */
export function pickPhotoSize(sizes: PhotoSize[]): PhotoSize | null {
  const ok = sizes.filter((s) => (s.file_size ?? 0) <= MAX_PHOTO_BYTES);
  const byArea = [...ok].sort((a, b) => b.width * b.height - a.width * a.height);
  return byArea.find((s) => Math.max(s.width, s.height) <= 1600) ?? byArea[0] ?? null;
}

/** A skipped key the owner may still be asked on a later run (typed for the flow's skipped list). */
export const asKey = (value: string): AskedKey | null =>
  value === "goal" || value === "order" || value === "prices" || value === "about" || value === "contact" ? value : null;
