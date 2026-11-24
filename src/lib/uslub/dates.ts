/**
 * Calendar dates written in a post or a fact (pure, no I/O): "03.11.2026", "2026-11-03", "3-noyabr",
 * "3 ноября", "November 3". Used to keep an event that already happened from being announced as upcoming.
 */

// Whole words only: Uzbek "3 marta" (three times) or "martaba" must never read as March.
const UZ = "(?:da|dan|gacha|ga|ning|dagi)?";
const MONTHS: [RegExp, number][] = [
  [new RegExp(`^(?:yanvar${UZ}|январ[яьею]|january|jan)$`, "i"), 1],
  [new RegExp(`^(?:fevral${UZ}|феврал[яьею]|february|feb)$`, "i"), 2],
  [new RegExp(`^(?:mart${UZ}|март[ае]?|march|mar)$`, "i"), 3],
  [new RegExp(`^(?:aprel${UZ}|апрел[яьею]|april|apr)$`, "i"), 4],
  [new RegExp(`^(?:may${UZ}|ма[яйе]|may)$`, "i"), 5],
  [new RegExp(`^(?:iyun${UZ}|июн[яьею]|june|jun)$`, "i"), 6],
  [new RegExp(`^(?:iyul${UZ}|июл[яьею]|july|jul)$`, "i"), 7],
  [new RegExp(`^(?:avgust${UZ}|август[ае]?|august|aug)$`, "i"), 8],
  [new RegExp(`^(?:sent[y]?abr${UZ}|сентябр[яьею]|september|sept?)$`, "i"), 9],
  [new RegExp(`^(?:okt[y]?abr${UZ}|октябр[яьею]|october|oct)$`, "i"), 10],
  [new RegExp(`^(?:noyabr${UZ}|ноябр[яьею]|november|nov)$`, "i"), 11],
  [new RegExp(`^(?:dekabr${UZ}|декабр[яьею]|december|dec)$`, "i"), 12],
];

const monthOf = (word: string): number | null => MONTHS.find(([re]) => re.test(word))?.[1] ?? null;

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO date if it is a real calendar day, else null. */
function iso(y: number, m: number, d: number): string | null {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100)) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** A day and month with no year: the nearest one to `ref` (a date half a year back is still this year's). */
function nearest(m: number, d: number, ref: string): string | null {
  const year = Number(ref.slice(0, 4));
  const cands = [year - 1, year, year + 1].map((y) => iso(y, m, d)).filter((x): x is string => Boolean(x));
  const dist = (x: string) => Math.abs(Date.parse(x) - Date.parse(ref));
  return cands.sort((a, b) => dist(a) - dist(b))[0] ?? null;
}

const LETTER = "A-Za-zА-Яа-яЁёЎўҚқҒғҲҳ";

/**
 * Every date written in `text`, as ISO "YYYY-MM-DD", in order. `ref` (ISO date) resolves dates written without a
 * year ("3-noyabr", "3 ноября", "03.11") to the nearest such day. Times ("20.40") and prices are not dates.
 */
export function datesIn(text: string, ref: string): string[] {
  const out: string[] = [];
  const t = text.normalize("NFC");
  // 2026-11-03
  for (const m of t.matchAll(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g)) {
    const x = iso(Number(m[1]), Number(m[2]), Number(m[3]));
    if (x) out.push(x);
  }
  // 03.11.2026, 3/11/2026, 03.11.26
  for (const m of t.matchAll(/(?<![\d.])(\d{1,2})[./](\d{1,2})[./](20\d{2}|\d{2})(?![\d.])/g)) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const x = iso(y, Number(m[2]), Number(m[1]));
    if (x) out.push(x);
  }
  // 03.11 (day.month, no year): only with a leading zero or a day above 12, so "20.40" or "1.5" stay numbers.
  for (const m of t.matchAll(/(?<![\d.,])(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])(?![\d.,]|\s?(?:so['‘’ʻ]?m|сум|сўм|ming|тыс|%))/g)) {
    const x = nearest(Number(m[2]), Number(m[1]), ref);
    if (x) out.push(x);
  }
  // 3-noyabr, 3 noyabr 2026, 3 ноября, 3-го ноября
  const dm = new RegExp(`(?<![\\d${LETTER}])(\\d{1,2})(?:-?(?:go|го|chi|nchi|th|st|nd|rd))?[\\s-]+([${LETTER}]{3,})(?:\\s+(20\\d{2}))?`, "g");
  for (const m of t.matchAll(dm)) {
    const month = monthOf(m[2]);
    if (!month) continue;
    const x = m[3] ? iso(Number(m[3]), month, Number(m[1])) : nearest(month, Number(m[1]), ref);
    if (x) out.push(x);
  }
  // November 3, noyabr 3
  const md = new RegExp(`(?<![${LETTER}])([${LETTER}]{3,})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d{2}))?(?![\\d.:])`, "g");
  for (const m of t.matchAll(md)) {
    const month = monthOf(m[1]);
    if (!month) continue;
    const x = m[3] ? iso(Number(m[3]), month, Number(m[2])) : nearest(month, Number(m[2]), ref);
    if (x) out.push(x);
  }
  return [...new Set(out)];
}

/** Dates in `text` that fall before `day` (ISO), i.e. events that will already be history on that day. */
export function pastDatesIn(text: string, day: string): string[] {
  return datesIn(text, day).filter((x) => x < day);
}

/** "2026-11-03" -> "03.11.2026" (how posts in Tashkent write a date). */
export const dotted = (isoDate: string) => `${isoDate.slice(8, 10)}.${isoDate.slice(5, 7)}.${isoDate.slice(0, 4)}`;
