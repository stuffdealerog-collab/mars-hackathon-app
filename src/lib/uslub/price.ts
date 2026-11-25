/**
 * One way to write a price in each script (pure, no I/O): 12 000 soʻm · 12 000 сўм · 12 000 сум · 12,000 UZS.
 * A post or plan that says "12,000 sum" in one line and "12 000 UZS" in the next reads as careless.
 */
import type { Script } from "./contract";

/** The currency word per script. uz_latn uses the official ʻ (U+02BB), as polishUzLatin writes oʻ and gʻ. */
export const SUM_UNIT: Record<Script, string> = { uz_latn: "soʻm", uz_cyrl: "сўм", ru: "сум", en: "UZS" };

/** 12000 -> "12 000" (uz, ru: a plain space, as the posts write it) or "12,000" (en). Below 1 000 it stays as is. */
export function groupDigits(n: number, script: Script): string {
  const int = String(Math.round(Math.abs(n)));
  const grouped = int.length > 3 ? int.replace(/\B(?=(\d{3})+(?!\d))/g, script === "en" ? "," : " ") : int;
  return n < 0 ? `-${grouped}` : grouped;
}

/** An amount in soʻm written the script's way: formatSum(12000, "en") -> "12,000 UZS". */
export const formatSum = (amount: number, script: Script): string => `${groupDigits(amount, script)} ${SUM_UNIT[script]}`;

// A number: grouped thousands ("12 000", "12.000", "12,000", "1 200 000") or plain digits. "1.5" or "12,5" are left alone.
// An item number or a count never starts it: "Set №3 150 000" is set 3 at 150 000, not 3 150 000 (nor "x2 150 000").
const NUM = String.raw`(?<![\d.,№#×])(?<!(?<!\p{L})[xX])(?:\d{1,3}(?:(?:[^\S\n]|[.,])\d{3})+|\d+)(?![\d]|[.,]\d)`;
// "ming", "тыс.", "k", "mln": the amount is written in words, so only its currency word is touched.
const MULT = String.raw`(?:ming|минг|тыс\.?|тысяч\p{L}*|thousand|mln|млн|million|k)`;
// The currency word, with an Uzbek suffix kept ("soʻmdan", "сўмга"); Russian forms and English plurals drop theirs.
const UNIT = String.raw`(so['‘’ʻʼ]?m|сўм|sum|soum|сум|uzs)((?:dan|ga|gacha|lik|ni|da|dagi|дан|га|гача|лик|ни|да|даги|ов|а|ы|s)?)(?![\p{L}\d])`;

const PRICE_RE = new RegExp(`(${NUM})(\\s*[-–—]\\s*${NUM})?(\\s*${MULT})?\\s*${UNIT}`, "giu");

const LATIN_SUFFIX = /^(?:dan|ga|gacha|lik|ni|da|dagi)$/i;
const CYR_SUFFIX: Record<string, string> = { dan: "дан", ga: "га", gacha: "гача", lik: "лик", ni: "ни", da: "да", dagi: "даги" };
const LAT_SUFFIX: Record<string, string> = Object.fromEntries(Object.entries(CYR_SUFFIX).map(([l, c]) => [c, l]));

const toNumber = (s: string) => Number(s.replace(/[^\d]/g, ""));

/** The Uzbek case suffix a currency word carried ("soʻmdan" -> "dan"), in the target script; "" for anything else. */
function uzSuffix(suffix: string, script: Script): string {
  const s = suffix.toLowerCase();
  if (script === "uz_latn") return LATIN_SUFFIX.test(s) ? s : (LAT_SUFFIX[s] ?? "");
  if (script === "uz_cyrl") return CYR_SUFFIX[s] ?? (Object.values(CYR_SUFFIX).includes(s) ? s : "");
  return "";
}

/**
 * Every price in `text` (a number with a soʻm word) written the script's way: "12000 sum" -> "12,000 UZS" (en),
 * "12 000 so'mdan" -> "12 000 soʻmdan" (uz), "от 12.000 сумов" -> "от 12 000 сум" (ru). A price in words
 * ("150 ming soʻm") keeps its words and gets the script's currency word. The word "sum" with no number before it
 * ("a sum of") is not a price and stays.
 */
export function normalizePrices(text: string, script: Script): string {
  return text.replace(PRICE_RE, (_all, num: string, range: string | undefined, mult: string | undefined, _unit: string, suffix: string) => {
    const unit = `${SUM_UNIT[script]}${uzSuffix(suffix, script)}`;
    if (mult) return `${num}${range ?? ""}${mult} ${unit}`;
    const to = range ? range.replace(/\d[\d\s.,]*$/, (n) => groupDigits(toNumber(n), script)) : "";
    return `${groupDigits(toNumber(num), script)}${to} ${unit}`;
  });
}
