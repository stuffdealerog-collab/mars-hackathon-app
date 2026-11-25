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

/**
 * Month-first ("November 3", "noyabr 3") takes a bare month word only. Uzbek writes the day first, so in
 * "23-noyabrdan 10-dekabrgacha" the words "noyabrdan 10" end one date and start the next, never 10 November; and
 * Russian "ноября 10" is never a date either.
 */
const BARE_MONTH =
  /^(?:yanvar|fevral|mart|aprel|may|iyun|iyul|avgust|sent[y]?abr|okt[y]?abr|noyabr|dekabr|january|jan|february|feb|march|mar|april|apr|june|jun|july|jul|august|aug|september|sept?|october|oct|november|nov|december|dec)$/i;

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

/** A date found in a text: where it is written and its month word (for ranges). */
interface DateSpan {
  iso: string;
  at: number;
  end: number;
  /** The month word as written ("noyabrdan", "dekabrgacha"), when the date has one. */
  word?: string;
}

const DAY_MONTH = new RegExp(`(?<![\\d${LETTER}])(\\d{1,2})(?:-?(?:go|го|chi|nchi|th|st|nd|rd))?[\\s-]+([${LETTER}]{3,})(?:\\s+(20\\d{2}))?`, "g");
const MONTH_DAY = new RegExp(`(?<![${LETTER}])([${LETTER}]{3,})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d{2}))?(?![\\d.:])`, "g");
const MONTH_DAYS = new RegExp(
  `(?<![${LETTER}])([${LETTER}]{3,})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:[-–—]|to|until|till|through|thru)\\s*(\\d{1,2})(?:st|nd|rd|th)?(?![\\d.:])`,
  "gi",
);

/** Every date in `text` (NFC) with its position, in order of appearance; overlapping matches keep the first one. */
function dateSpans(t: string, ref: string): DateSpan[] {
  const found: DateSpan[] = [];
  const add = (x: string | null, at: number, len: number, word?: string) => {
    if (x) found.push({ iso: x, at, end: at + len, ...(word ? { word } : {}) });
  };
  // 2026-11-03
  for (const m of t.matchAll(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g)) add(iso(Number(m[1]), Number(m[2]), Number(m[3])), m.index, m[0].length);
  // 03.11.2026, 3/11/2026, 03.11.26
  for (const m of t.matchAll(/(?<![\d.])(\d{1,2})[./](\d{1,2})[./](20\d{2}|\d{2})(?![\d.])/g)) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    add(iso(y, Number(m[2]), Number(m[1])), m.index, m[0].length);
  }
  // 03.11 (day.month, no year): only with a leading zero or a day above 12, so "20.40" or "1.5" stay numbers.
  for (const m of t.matchAll(/(?<![\d.,])(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])(?![\d.,]|\s?(?:so['‘’ʻ]?m|сум|сўм|ming|тыс|%))/g))
    add(nearest(Number(m[2]), Number(m[1]), ref), m.index, m[0].length);
  // 3-noyabr, 3 noyabr 2026, 3 ноября, 3-го ноября
  for (const m of t.matchAll(DAY_MONTH)) {
    const month = monthOf(m[2]);
    if (month) add(m[3] ? iso(Number(m[3]), month, Number(m[1])) : nearest(month, Number(m[1]), ref), m.index, m[0].length, m[2]);
  }
  // November 3, noyabr 3
  for (const m of t.matchAll(MONTH_DAY)) {
    const month = BARE_MONTH.test(m[1]) ? monthOf(m[1]) : null;
    if (month) add(m[3] ? iso(Number(m[3]), month, Number(m[2])) : nearest(month, Number(m[2]), ref), m.index, m[0].length, m[1]);
  }
  // November 1–20, Nov 1-20, November 1 to 20: the month is written once, so the end day is a date of that month too
  // (two spans, which rangeStarts joins into one period).
  for (const m of t.matchAll(MONTH_DAYS)) {
    const month = BARE_MONTH.test(m[1]) ? monthOf(m[1]) : null;
    if (!month) continue;
    const firstAt = m.index + m[1].length + m[0].slice(m[1].length).search(/\d/);
    add(nearest(month, Number(m[2]), ref), m.index, firstAt + m[2].length - m.index, m[1]);
    const endAt = m.index + (/\d{1,2}(?:st|nd|rd|th)?$/i.exec(m[0])?.index ?? 0);
    add(nearest(month, Number(m[3]), ref), endAt, m.index + m[0].length - endAt);
  }
  found.sort((a, b) => a.at - b.at || b.end - a.end);
  const out: DateSpan[] = [];
  for (const d of found) if (!out.length || d.at >= out[out.length - 1].end) out.push(d);
  return out;
}

/**
 * Every date written in `text`, as ISO "YYYY-MM-DD", in order. `ref` (ISO date) resolves dates written without a
 * year ("3-noyabr", "3 ноября", "03.11") to the nearest such day. Times ("20.40") and prices are not dates.
 */
export function datesIn(text: string, ref: string): string[] {
  return [...new Set(dateSpans(text.normalize("NFC"), ref).map((d) => d.iso))];
}

// What joins the two ends of a period: a dash, "по" / "до" (ru), "to" / "until" / "through" (en).
const RANGE_GAP = /^\s*(?:[-–—]|по|до|to|until|till|through|thru)\s*$/iu;
// Uzbek: "23-noyabrdan 10-dekabrgacha", "… 10-dekabr gacha", "… 10-dekabrga qadar".
const UZ_FROM = /(?:dan|дан)$/iu;
const UZ_TO_WORD = /(?:gacha|гача|ga|га)$/iu;
const UZ_TO_AFTER = /^\s*-?\s*(?:gacha|гача|ga\s+qadar|га\s+қадар)(?!\p{L})/iu;

/** Starts of the periods written in `t` ("с 23 ноября по 10 декабря"): indexes into `spans`. */
function rangeStarts(t: string, spans: DateSpan[]): Set<number> {
  const starts = new Set<number>();
  for (let i = 0; i + 1 < spans.length; i++) {
    const a = spans[i];
    const b = spans[i + 1];
    const gap = t.slice(a.end, b.at);
    const uz =
      a.word != null && UZ_FROM.test(a.word) && /^[\s,]*$/.test(gap) && ((b.word != null && UZ_TO_WORD.test(b.word)) || UZ_TO_AFTER.test(t.slice(b.end)));
    if ((uz || RANGE_GAP.test(gap)) && b.iso >= a.iso) {
      starts.add(i);
      i++;
    }
  }
  return starts;
}

/**
 * Dates in `text` that fall before `day` (ISO), i.e. events that will already be history on that day. A period
 * ("23-noyabrdan 10-dekabrgacha", "с 23 ноября по 10 декабря", "from November 23 to December 10", "23.11–10.12")
 * is named by its end: a promotion still running on `day` has no past date, one that is over has its end date.
 */
export function pastDatesIn(text: string, day: string): string[] {
  const t = text.normalize("NFC");
  const spans = dateSpans(t, day);
  const starts = rangeStarts(t, spans);
  return [...new Set(spans.filter((d, i) => !starts.has(i) && d.iso < day).map((d) => d.iso))];
}

/** "2026-11-03" -> "03.11.2026" (how posts in Tashkent write a date). */
export const dotted = (isoDate: string) => `${isoDate.slice(8, 10)}.${isoDate.slice(5, 7)}.${isoDate.slice(0, 4)}`;
