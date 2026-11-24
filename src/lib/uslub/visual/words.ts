import type { VisualStyle } from "../contract";

/**
 * The learned picture style in the owner's words. The style analysis writes it in every UI language
 * at once (the owner can switch language without a new analysis); the English `prompt` and the
 * English descriptors stay as they are, for the image model. Pure: runs in the browser too.
 */

export const STYLE_LANGS = ["uz", "ru", "en"] as const;
export type StyleLang = (typeof STYLE_LANGS)[number];

/** One language's text for the Studio's style card (Uslub tavsifi, Yorug‘lik, Kompozitsiya, Kayfiyat, Rasmlarda bo‘lmaydi). */
export interface StyleWords {
  /** "Uslub tavsifi": one or two plain sentences on how the brand's photos look. */
  summary: string;
  light: string;
  composition: string;
  mood: string;
  /** What never appears in their photos; the first item is always "no text or logos". */
  avoid: string[];
}

/**
 * VisualStyle as saved on the brand, plus `ownerText`. Styles learned before 2026-11-25 have none.
 * (`ownerText` is not in contract.ts yet; it travels in the same JSON as the rest of the style.)
 */
export type VisualStyleWithWords = VisualStyle & { ownerText?: Partial<Record<StyleLang, StyleWords>> };

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** The owner's words for `lang`, or null when this style has none (learned before they existed). */
export function styleWords(visual: VisualStyle | null | undefined, lang: StyleLang): StyleWords | null {
  const raw: unknown = (visual as VisualStyleWithWords | null | undefined)?.ownerText?.[lang];
  if (!raw || typeof raw !== "object") return null;
  const w = raw as Record<string, unknown>;
  const words: StyleWords = {
    summary: str(w.summary),
    light: str(w.light),
    composition: str(w.composition),
    mood: str(w.mood),
    avoid: Array.isArray(w.avoid) ? w.avoid.map(str).filter(Boolean) : [],
  };
  return words.summary || words.light || words.composition || words.mood || words.avoid.length ? words : null;
}
