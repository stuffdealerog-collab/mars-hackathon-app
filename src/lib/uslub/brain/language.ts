/**
 * Which language a piece of owner text is in (pure, letters and a few marker words): the strategy must be in the UI
 * language, and the strategist's input is full of Uzbek labels that leak into a Russian plan.
 */
import type { Lang } from "./types";

const UZ_MARKERS =
  /o['‘’ʻ`]|g['‘’ʻ`]|(?<![\p{L}])(va|uchun|bilan|kerak|qiling|sizning|bizning|emas|bo['‘’ʻ]l\p{L}*|haqida|mijoz\p{L}*|post\p{L}*lar|yangi|narx\p{L}*|kanal\p{L}*)(?![\p{L}])/giu;
const EN_MARKERS = /(?<![\p{L}])(the|and|for|with|your|you|our|this|that|from|post|posts|people|customers|is|are|of|to)(?![\p{L}])/giu;

/** The language of `text`, or "unknown" when it has too few letters to tell (names, numbers, emoji). */
export function langOf(text: string): Lang | "unknown" {
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (letters.length < 12) return "unknown";
  const cyr = (letters.match(/[Ѐ-ӿ]/g) ?? []).length;
  if (cyr > letters.length / 2) return /[ўқғҳЎҚҒҲ]/.test(letters) ? "uz" : "ru";
  const uz = (text.match(UZ_MARKERS) ?? []).length;
  const en = (text.match(EN_MARKERS) ?? []).length;
  if (uz === 0 && en === 0) return "unknown";
  return uz >= en ? "uz" : "en";
}

/** True when `text` is clearly in another language than `lang` (unknown never counts). */
export function wrongLanguage(text: string, lang: Lang): boolean {
  const l = langOf(text);
  return l !== "unknown" && l !== lang;
}
