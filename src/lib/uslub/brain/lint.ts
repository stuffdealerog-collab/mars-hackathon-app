/**
 * Deterministic checks (spec §E, code part). Pure.
 * GROUNDED: every "fact number" must match the display/value of an id cited in the same string.
 */
import { lexiconHits, normApos } from "./stats";
import { ID_RE, type Goal, type LedgerEntry } from "./types";
import { contactsIn } from "../ending";
import { clip } from "../text";

export function extractIds(text: string): string[] {
  return [...new Set(text.match(ID_RE) ?? [])];
}

const UNIT = String.raw`(%|so'?m|сўм|сум|\$|usd|ming|минг|тыс|k\b|yil|год)`;

export function parseNumber(raw: string, unit?: string): number | null {
  let s = raw.replace(/\s/g, "");
  if (/,\d{3}(?!\d)/.test(s) && !/\.\d/.test(s)) s = s.replace(/,/g, "");
  else s = s.replace(",", ".");
  if (/\.\d{3}(?!\d)/.test(s) && (s.match(/\./g)?.length ?? 0) >= 1 && !/%/.test(unit ?? "") && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const v = Number.parseFloat(s);
  if (!Number.isFinite(v)) return null;
  const u = (unit ?? "").toLowerCase();
  return /^(ming|минг|тыс|k)$/.test(u) ? v * 1000 : v;
}

/** Numbers in a claim that need grounding (ids, times, dates, links and small bare counts are exempt). */
export function factNumbers(text: string): { raw: string; value: number; unit: string }[] {
  const t = normApos(text)
    .replace(/\[[^\]]*\]/g, " ")
    .replace(ID_RE, " ")
    .replace(/https?:\/\/\S+|\{\{LINK\}\}/g, " ")
    .replace(/\b\d{1,2}:\d{2}\b/g, " ")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
    .replace(/\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/g, " ")
    .replace(/\b\d{1,2}\s?[–-]\s?\d{1,2}\b(?!\s?%)/g, " ") // hour ranges like 19–22
    .replace(/\bn\s?=\s?\d+/gi, " ");
  // A number is either thousands-grouped with ONE consistent separator ("450 000", "450.000", "1,600,000") or
  // plain with an optional decimal part ("3.5", "2,60"). So "450.000, 600.000" and "450.000 450.000" stay two numbers.
  const re = new RegExp(String.raw`(?<num>\d{1,3}(?<sep>[ .,\u00a0])\d{3}(?:\k<sep>\d{3})*(?!\d)|\d+(?:[.,]\d+)?)\s?(?<unit>${UNIT})?`, "gi");
  const out: { raw: string; value: number; unit: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const unit = m.groups?.unit ?? "";
    const value = parseNumber((m.groups?.num ?? "").replace(/\u00a0/g, " "), unit);
    if (value == null) continue;
    if (!unit && value < 11) continue;
    out.push({ raw: m[0].trim(), value, unit });
  }
  return out;
}

function candidates(e: LedgerEntry): number[] {
  const c: number[] = [];
  if (typeof e.value === "number") c.push(e.value, e.value * 100);
  if (e.n != null) c.push(e.n);
  for (const n of factNumbers(`${e.display} ${typeof e.value === "string" ? e.value : ""} ${e.quote ?? ""}`)) c.push(n.value);
  return c;
}

const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.005 * Math.abs(b), 0.051);

export type CheckFail = { check: string; quote: string; reason: string };

export function groundedCheck(text: string, ledger: Map<string, LedgerEntry>, extraIds: string[] = []): CheckFail[] {
  const fails: CheckFail[] = [];
  const ids = [...new Set([...extractIds(text), ...extraIds])];
  for (const id of ids) if (!ledger.has(id)) fails.push({ check: "GROUNDED", quote: id, reason: `cited id ${id} does not exist` });
  const cands = ids.flatMap((id) => (ledger.has(id) ? candidates(ledger.get(id) as LedgerEntry) : []));
  for (const n of factNumbers(text)) {
    if (!cands.some((c) => close(n.value, c) || (n.unit === "%" && close(n.value / 100, c))))
      fails.push({ check: "GROUNDED", quote: n.raw, reason: `number ${n.raw} does not match any cited id` });
  }
  return fails;
}

export const URGENCY_RE = /faqat bugun|oxirgi imkoniyat|joylar cheklangan|shoshiling|только сегодня|успейте|last chance/i;
export const GREETING_RE = /^\s*(assalomu alaykum|hurmatli mijoz|здравствуйте|добрый день|dear|hello|salom)/i;
const HIDDEN_PRICE_RE = /narx(i|ini)?\s*(lichka|shaxsiy|direkt|dm)|narxini bilish uchun|цен[аыу]\s*(в\s*)?(лс|личк|директ)|пишите в (лс|директ)/i;

export function trigrams(s: string): Set<string> {
  const w = normApos(s).toLowerCase().replace(/[^\p{L}\d\s']/gu, " ").split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + 2 < w.length; i++) out.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export interface LintItem {
  slot: number;
  goal: Goal;
  hook: string;
  cta: string;
  brief: string;
  factIds: string[];
  /** The slot carries the opt-in tracked link (code puts it where {{LINK}} is, or at the end). Missing = false. */
  link?: boolean;
}

export interface LintCtx {
  ledger: Map<string, LedgerEntry>;
  priceFacts: LedgerEntry[]; // F entries of type price
  deadlineFacts: number;
  recentHooks: string[];
  competitorTexts: string[];
  emojiCap: number;
  address: "siz" | "sen";
  /**
   * Contact keys (ending.ts contactsIn) of the channel's own ending and the owner's answered contact. A CTA that ends
   * with the channel's contact line as written ("☎️ +998 90 123 45 67 | @admin") is one route, not two.
   */
  endingContactKeys?: string[];
}

/**
 * Contacts in a CTA besides the channel's own (its ending's contacts all count as one route): distinct phones and
 * @handles, plus partial "+998 90" phones contactsIn does not see as a whole number.
 */
function extraContacts(cta: string, own: readonly string[] = []): number {
  const ownSet = new Set(own);
  // Mercat's tracked link is checked above ({{LINK}}), never counted as the channel's contact here.
  const text = cta.replace(/(?:https?:\/\/)?t\.me\/\w+\?start=\S*/gi, " ");
  const found = contactsIn(text);
  const keys = new Set(found.map((c) => c.key).filter((k) => !ownSet.has(k)));
  const partialPhones = (text.replace(/\+?998[\s-]?\(?\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/g, " ").match(/\+?998[\s-]?\d{2}/g) ?? []).length;
  return keys.size + partialPhones + (found.some((c) => ownSet.has(c.key)) ? 1 : 0);
}

/** Code checks for one plan item: GROUNDED, PRICE, URGENCY, ONE_CTA, HOOK, NEURO, VOICE (code part), ORIGINALITY. */
export function lintItem(item: LintItem, ctx: LintCtx): CheckFail[] {
  const fails: CheckFail[] = [];
  const all = `${item.hook}\n${item.cta}\n${item.brief}`;
  fails.push(...groundedCheck(`${item.hook} ${item.cta} ${item.brief}`, ctx.ledger, item.factIds));

  if (HIDDEN_PRICE_RE.test(normApos(all))) fails.push({ check: "PRICE", quote: normApos(all).match(HIDDEN_PRICE_RE)?.[0] ?? "", reason: "hidden-price phrase" });
  if (item.goal === "sale" && ctx.priceFacts.length) {
    const cited = new Set([...extractIds(all), ...item.factIds]);
    if (!ctx.priceFacts.some((p) => cited.has(p.id))) fails.push({ check: "PRICE", quote: item.hook, reason: "sale item lacks a KB price fact" });
  }
  const urg = normApos(all).match(URGENCY_RE);
  if (urg && ctx.deadlineFacts === 0) fails.push({ check: "URGENCY", quote: urg[0], reason: "urgency without a deadline/capacity fact" });

  const tokens = (item.cta.match(/\{\{LINK\}\}/g) ?? []).length;
  const links = tokens + (all.match(/https?:\/\//g) ?? []).length;
  // The tracked link is opt-in and put in by code (owner correction 1): a token where there is no link, or twice, fails.
  if (tokens > 1 || (tokens > 0 && !item.link)) fails.push({ check: "ONE_CTA", quote: item.cta, reason: item.link ? "{{LINK}} more than once" : "this slot has no tracked link: remove {{LINK}}" });
  if ((item.goal === "reach" || item.goal === "engage" || item.goal === "grow") && links > 0) fails.push({ check: "ONE_CTA", quote: item.cta, reason: `${item.goal} item must not carry a link` });
  if (extraContacts(item.cta, ctx.endingContactKeys) > 1) fails.push({ check: "ONE_CTA", quote: item.cta, reason: "more than one contact in the CTA" });

  const hook = item.hook.trim();
  if (hook.length > 90) fails.push({ check: "HOOK", quote: hook, reason: `hook is ${hook.length} chars (>90)` });
  if (GREETING_RE.test(hook)) fails.push({ check: "HOOK", quote: clip(hook, 30), reason: "hook opens with a greeting" });
  if (!/\d/.test(hook) && !hook.includes("?") && extractIds(hook).length === 0 && item.factIds.length === 0)
    fails.push({ check: "HOOK", quote: hook, reason: "hook has no specific (number, product, place or real question)" });
  const tg = trigrams(hook);
  if (ctx.recentHooks.some((h) => jaccard(tg, trigrams(h)) >= 0.6)) fails.push({ check: "HOOK", quote: hook, reason: "too similar to a recent own hook" });

  for (const hit of lexiconHits(all)) fails.push({ check: "NEURO", quote: hit, reason: "lexicon phrase" });

  const emoji = (all.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  if (emoji > ctx.emojiCap) fails.push({ check: "VOICE", quote: `${emoji} emoji`, reason: `more than ${ctx.emojiCap} emoji` });
  if ((all.match(/#[\p{L}\d_]+/gu) ?? []).length > 2) fails.push({ check: "VOICE", quote: "#", reason: "more than 2 hashtags" });
  const mixed = all.split(/\s+/).find((w) => /[a-z]/i.test(w) && /[а-яёўқғҳ]/i.test(w));
  if (mixed) fails.push({ check: "VOICE", quote: mixed, reason: "word mixes Cyrillic and Latin letters" });
  const wrongForm = ctx.address === "siz" ? /\b(sen|senga|seni|sening)\b/i : /\b(sizga|sizni|sizning)\b/i;
  const wf = `${item.hook} ${item.cta}`.match(wrongForm);
  if (wf) fails.push({ check: "VOICE", quote: wf[0], reason: `address form should be ${ctx.address}` });

  const itg = trigrams(`${item.hook} ${item.cta}`);
  if (ctx.competitorTexts.some((t) => jaccard(itg, trigrams(t)) >= 0.5)) fails.push({ check: "ORIGINALITY", quote: item.hook, reason: "copies competitor wording" });
  return fails;
}
