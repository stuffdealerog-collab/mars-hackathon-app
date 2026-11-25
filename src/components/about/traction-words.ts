import type { Lang } from "../ui/format";

/**
 * The traction counter's words (pure). The number prints on the LED (a measured number); the words around it say
 * exactly what was counted. People is a floor (src/lib/traction.ts), so it always prints a figure below the count, with
 * "more than" in the words: the line can never say more than was measured. Channels are exact.
 */

export type TractionKind = "people" | "channels";

/** Below these the line is not shown: an honest count that small says nothing to a visitor. */
export const MIN_SHOWN: Record<TractionKind, number> = { people: 20, channels: 5 };

/**
 * The largest figure people read at a glance that is strictly below the count: tens up to 100, fifties up to 1 000,
 * hundreds after that. 66 gives 60, 60 gives 50, 100 gives 90, 1 234 gives 1 200. Always below `n`, so "more than
 * {figure}" is true whenever the count is.
 */
export function figureBelow(n: number): number {
  const whole = Math.floor(n);
  if (!Number.isFinite(whole) || whole <= 1) return 0;
  const step = whole <= 100 ? 10 : whole <= 1000 ? 50 : 100;
  return Math.max(0, Math.ceil(whole / step) * step - step);
}

type Forms = { one: string; few: string; many: string };
type Words = {
  /** words before the people figure ("More than") */
  moreBefore: string;
  /** words after the people figure */
  moreAfter: string;
  channels: Forms;
  /** what the people count is, under the lines on /about */
  note: string;
  /** the whole line for a screen reader: {n} is the figure */
  sentence: { people: string; channels: Forms };
};

const WORDS: Record<Lang, Words> = {
  uz: {
    moreBefore: "",
    moreAfter: "dan ortiq kishi Mercat’ni sinab ko‘rdi",
    // Uzbek keeps a noun singular after a number.
    channels: { one: "ta kanal tahlil qilindi", few: "ta kanal tahlil qilindi", many: "ta kanal tahlil qilindi" },
    note: "Telegram’da Mercat’ni ochganlar, jamoamizsiz. Saytga anonim kirganlar qo‘shilmagan. Har 10 daqiqada yangilanadi.",
    sentence: {
      people: "{n} dan ortiq kishi Mercat’ni sinab ko‘rdi",
      channels: { one: "{n} ta kanal tahlil qilindi", few: "{n} ta kanal tahlil qilindi", many: "{n} ta kanal tahlil qilindi" },
    },
  },
  ru: {
    moreBefore: "Больше",
    // After "больше 60" the noun is genitive plural, whatever the figure ends in.
    moreAfter: "человек попробовали Mercat",
    channels: { one: "канал уже разобрал Mercat", few: "канала уже разобрал Mercat", many: "каналов уже разобрал Mercat" },
    note: "Те, кто открыл Mercat в Telegram, без нашей команды. Анонимные посетители сайта не считаются. Обновляется раз в 10 минут.",
    sentence: {
      people: "Больше {n} человек попробовали Mercat",
      channels: { one: "{n} канал уже разобрал Mercat", few: "{n} канала уже разобрал Mercat", many: "{n} каналов уже разобрал Mercat" },
    },
  },
  en: {
    moreBefore: "More than",
    moreAfter: "people have tried Mercat",
    channels: { one: "channel analysed so far", few: "channels analysed so far", many: "channels analysed so far" },
    note: "People who opened Mercat in Telegram, our team left out. Anonymous website visitors are not counted. Updated every 10 minutes.",
    sentence: {
      people: "More than {n} people have tried Mercat",
      channels: { one: "{n} channel analysed so far", few: "{n} channels analysed so far", many: "{n} channels analysed so far" },
    },
  },
};

/** What the people line counts, in a short note for under the lines. */
export const tractionNote = (lang: Lang) => WORDS[lang].note;

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

/**
 * The line for one count, or null when it is missing or too small to show. People print a figure strictly below the
 * count with "more than" (the count is a floor); channels are exact.
 */
export function tractionLine(lang: Lang, kind: TractionKind, n: number | null | undefined): TractionLine | null {
  if (typeof n !== "number" || !Number.isFinite(n) || n < MIN_SHOWN[kind]) return null;
  const w = WORDS[lang];
  if (kind === "people") {
    const figure = figureBelow(n);
    return { figure, before: w.moreBefore, after: w.moreAfter, sentence: w.sentence.people.replace("{n}", groupDigits(figure, lang)) };
  }
  const figure = Math.floor(n);
  const form = pluralForm(lang, figure);
  return { figure, before: "", after: w.channels[form], sentence: w.sentence.channels[form].replace("{n}", groupDigits(figure, lang)) };
}
