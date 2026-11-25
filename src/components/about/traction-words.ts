import type { Lang } from "../ui/format";

/**
 * The traction counter's words (pure). The number prints on the LED (a measured number); the words around it say
 * exactly what was counted. A rounded number is always "more than" in the words, never a bare round figure.
 */

export type TractionKind = "people" | "channels";

/** Below these the line is not shown: an honest count that small says nothing to a visitor. */
export const MIN_SHOWN: Record<TractionKind, number> = { people: 10, channels: 5 };

/**
 * A count rounded down to a figure people read at a glance: exact under 20, then tens, fifties from 100 and hundreds
 * from 1 000. `more` is true when the figure is below the count, so the words must say "more than".
 */
export function friendlyCount(n: number): { value: number; more: boolean } {
  const whole = Math.max(0, Math.floor(n));
  const step = whole < 20 ? 1 : whole < 100 ? 10 : whole < 1000 ? 50 : 100;
  const value = Math.floor(whole / step) * step;
  return { value, more: value < whole };
}

type Forms = { one: string; few: string; many: string };
type Words = {
  /** words before the number for a rounded people count ("More than") */
  moreBefore: string;
  /** words after the number for a rounded people count */
  moreAfter: string;
  people: Forms;
  channels: Forms;
  /** the whole line for a screen reader: {n} is the figure */
  sentence: { peopleMore: string; people: Forms; channels: Forms };
};

const WORDS: Record<Lang, Words> = {
  uz: {
    moreBefore: "",
    moreAfter: "dan ortiq kishi Mercat’ni sinab ko‘rdi",
    // Uzbek keeps a noun singular after a number.
    people: { one: "kishi Mercat’ni sinab ko‘rdi", few: "kishi Mercat’ni sinab ko‘rdi", many: "kishi Mercat’ni sinab ko‘rdi" },
    channels: { one: "ta kanal tahlil qilindi", few: "ta kanal tahlil qilindi", many: "ta kanal tahlil qilindi" },
    sentence: {
      peopleMore: "{n} dan ortiq kishi Mercat’ni sinab ko‘rdi",
      people: { one: "{n} kishi Mercat’ni sinab ko‘rdi", few: "{n} kishi Mercat’ni sinab ko‘rdi", many: "{n} kishi Mercat’ni sinab ko‘rdi" },
      channels: { one: "{n} ta kanal tahlil qilindi", few: "{n} ta kanal tahlil qilindi", many: "{n} ta kanal tahlil qilindi" },
    },
  },
  ru: {
    moreBefore: "Больше",
    // After "больше 60" the noun is genitive plural; a rounded figure always ends in 0.
    moreAfter: "человек попробовали Mercat",
    people: { one: "человек попробовал Mercat", few: "человека попробовали Mercat", many: "человек попробовали Mercat" },
    channels: { one: "канал уже разобрал Mercat", few: "канала уже разобрал Mercat", many: "каналов уже разобрал Mercat" },
    sentence: {
      peopleMore: "Больше {n} человек попробовали Mercat",
      people: { one: "{n} человек попробовал Mercat", few: "{n} человека попробовали Mercat", many: "{n} человек попробовали Mercat" },
      channels: { one: "{n} канал уже разобрал Mercat", few: "{n} канала уже разобрал Mercat", many: "{n} каналов уже разобрал Mercat" },
    },
  },
  en: {
    moreBefore: "More than",
    moreAfter: "people have tried Mercat",
    people: { one: "person has tried Mercat", few: "people have tried Mercat", many: "people have tried Mercat" },
    channels: { one: "channel analysed so far", few: "channels analysed so far", many: "channels analysed so far" },
    sentence: {
      peopleMore: "More than {n} people have tried Mercat",
      people: { one: "{n} person has tried Mercat", few: "{n} people have tried Mercat", many: "{n} people have tried Mercat" },
      channels: { one: "{n} channel analysed so far", few: "{n} channels analysed so far", many: "{n} channels analysed so far" },
    },
  },
};

/** Russian has one / few / many after a number; Uzbek and English need one form or two. */
export function pluralForm(lang: Lang, n: number): keyof Forms {
  if (lang === "ru") {
    const d = n % 10;
    const h = n % 100;
    if (d === 1 && h !== 11) return "one";
    if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return "few";
    return "many";
  }
  return n === 1 ? "one" : "many";
}

/** Thousands with a thin gap (uz, ru) or a comma (en), as the post formatter writes prices. */
export const groupDigits = (n: number, lang: Lang) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, lang === "en" ? "," : " ");

export type TractionLine = {
  /** the figure on the LED, digits only */
  figure: number;
  before: string;
  after: string;
  /** the whole line in words, for a screen reader */
  sentence: string;
};

/** The line for one count, or null when it is too small to show. Channels are exact; people round down with "more than". */
export function tractionLine(lang: Lang, kind: TractionKind, n: number): TractionLine | null {
  if (!Number.isFinite(n) || n < MIN_SHOWN[kind]) return null;
  const w = WORDS[lang];
  const { value, more } = kind === "people" ? friendlyCount(n) : { value: Math.floor(n), more: false };
  const shown = groupDigits(value, lang);
  if (more) return { figure: value, before: w.moreBefore, after: w.moreAfter, sentence: w.sentence.peopleMore.replace("{n}", shown) };
  const form = pluralForm(lang, value);
  return { figure: value, before: "", after: w[kind][form], sentence: w.sentence[kind][form].replace("{n}", shown) };
}
