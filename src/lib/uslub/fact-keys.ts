/**
 * Fact keys that mean the same in every language of one post, for the rewrite guard (copywriter.rewritePost): the
 * owner's phrase is in one language, the post has three versions, and "narxi 210 000" must be allowed to become
 * "210 000 сум" and "210,000 UZS".
 * - numbers: digit groups are collapsed ("210 000", "210,000", "210.000" -> 210000) and thousands or millions words
 *   expanded ("210 ming", "210 тыс", "210k" -> 210000; "1,5 mln" -> 1500000); then every run of digits is a key;
 * - phones: one key per phone (its last 9 digits), however it is written;
 * - weekdays and months: one key per day or month in uz (Latin and Cyrillic), ru and en ("dushanba", "понедельник",
 *   "Monday" -> wd:1); today and tomorrow too;
 * - percent, promo and urgency words: one key per meaning ("chegirma", "скидка", "discount" -> promo:discount).
 * Pure (no I/O).
 */
import { PHONE_RE } from "./ending";

/** A word starts here (a Cyrillic-safe \b). */
const L = String.raw`(?<![\p{L}])`;
/** A word ends here. */
const R = String.raw`(?![\p{L}])`;

/** [key, stems]: a stem matches the start of a word, so case and suffix forms count ("понедельникам", "dushanbadan"). */
const WORDS: [string, string][] = [
  ["wd:1", "dushanba|душанба|понедельник|monday"],
  ["wd:2", "seshanba|сешанба|вторник|tuesday"],
  ["wd:3", `chorshanba|чоршанба|сред[аеуы]${R}|wednesday`],
  ["wd:4", "payshanba|пайшанба|четверг|thursday"],
  ["wd:5", "juma|жума|пятниц|friday"],
  ["wd:6", "shanba|шанба|суббот|saturday"],
  ["wd:7", "yakshanba|якшанба|воскресень|sunday"],
  ["mo:1", "yanvar|январ|january"],
  ["mo:2", "fevral|феврал|february"],
  // "marta" is "times" in Uzbek ("2 marta"), not March.
  ["mo:3", "mart(?!a)|март|march"],
  ["mo:4", "aprel|апрел|april"],
  ["mo:5", `ма[йяе]${R}`],
  ["mo:6", "iyun|июн|june"],
  ["mo:7", "iyul|июл|july"],
  ["mo:8", "avgust|август|august"],
  ["mo:9", "sentabr|sentyabr|сентябр|september"],
  ["mo:10", "oktabr|oktyabr|октябр|october"],
  ["mo:11", "noyabr|ноябр|november"],
  ["mo:12", "dekabr|декабр|december"],
  ["day:0", "bugun|бугун|сегодня|today"],
  // "завтрак" is breakfast.
  ["day:1", `ertaga|эртага|завтра${R}|tomorrow`],
  ["%", "foiz|фоиз|процент|percent"],
  ["promo:sale", `aksiya|aktsiya|акци|promo(?!kod|\\s?code)|sale${R}`],
  ["promo:discount", "chegirma|чегирма|скидк|discount"],
  ["promo:free", `bepul|tekin|бепул|бесплатн|free${R}`],
  ["promo:gift", "sovg'?a|совға|подар|gift"],
  ["promo:bonus", "bonus|бонус"],
  ["promo:cashback", "keshbek|кешбэк|кэшбэк|cashback"],
  ["promo:code", "promokod|промокод|promo\\s?code"],
  ["urgent", "shoshiling|ulguring|tezroq|faqat bugun|cheklangan|спеши|успей|торопи|только сегодня|ограниченн|срочно|hurry|limited|last chance|only today"],
];

const WORD_RES = WORDS.map(([key, stems]) => [key, new RegExp(`${L}(?:${stems})`, "iu")] as const);

/** A number with a thousands or millions word after it ("210 ming", "1,5 mln", "210k", "210 тыс."). */
const SCALED_RE = /(\d+(?:[.,]\d+)?)\s?(mlrd|млрд|mln|млн|million|миллион|ming|минг|тыс|k(?![\p{L}\d])|к(?![\p{L}\d]))\p{L}*\.?/giu;
const SCALE: Record<string, number> = { mlrd: 1e9, млрд: 1e9, mln: 1e6, млн: 1e6, million: 1e6, миллион: 1e6, ming: 1e3, минг: 1e3, тыс: 1e3, k: 1e3, к: 1e3 };

/** "210 000", "210,000", "210.000", "1 000 000" (one separator, used throughout) -> digits only. */
const GROUPED_RE = /(?<![\d.,])\d{1,3}([ .,])\d{3}(?:\1\d{3})*(?!\d|[.,]\d)/g;

/** The fact keys of a text (see the module comment). */
export function factKeys(text: string): Set<string> {
  const keys = new Set<string>();
  let t = text.toLowerCase().replace(/[‘’ʻʼ`]/g, "'").replace(/[   ]/g, " ");
  for (const m of t.matchAll(PHONE_RE)) keys.add(`tel:${m[0].replace(/\D/g, "").slice(-9)}`);
  t = t
    .replace(PHONE_RE, " ")
    .replace(GROUPED_RE, (m) => m.replace(/\D/g, ""))
    .replace(SCALED_RE, (m, num: string, unit: string) => {
      const value = Number.parseFloat(num.replace(",", ".")) * (SCALE[unit] ?? 1);
      return Number.isFinite(value) ? ` ${Math.round(value)} ` : m;
    });
  for (const m of t.matchAll(/\d+/g)) keys.add(m[0].length > 15 ? m[0] : String(Number(m[0])));
  if (t.includes("%")) keys.add("%");
  for (const [key, re] of WORD_RES) if (re.test(t)) keys.add(key);
  return keys;
}

/** Fact keys in `rewritten` that `allowed` (a text or its keys) does not have: empty = nothing new was made up. */
export function newFactKeys(allowed: string | Set<string>, rewritten: string): string[] {
  const have = typeof allowed === "string" ? factKeys(allowed) : allowed;
  return [...factKeys(rewritten)].filter((k) => !have.has(k));
}
