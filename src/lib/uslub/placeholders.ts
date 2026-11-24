/**
 * Unfilled template slots in a post ("Kod: [kod]", "Narxi: {narx}", "+998 XX XXX XX XX", "____") — pure.
 * A post must never reach a channel with one: the copywriter is told not to write them, a fix pass after the editor
 * rewrites what slipped through, and approve / publish refuse what is still left (code "placeholder_left").
 */
import type { Script } from "./contract";

const PATTERNS: RegExp[] = [
  /\{\{[^{}\n]{1,40}\}\}/gu, // {{LINK}}
  /\{[^{}\n]{1,40}\}/gu, // {narx}
  /\[[^[\]\n]{1,40}\]/gu, // [kod], [narx], [telefon]
  /<[^<>\n]{1,30}>/gu, // <telefon>
  /_{3,}/gu, // ____
  /(?<![\p{L}\d])[XxХх]{3,}(?![\p{L}\d])/gu, // XXX, ХХХ (Latin or Cyrillic), e.g. "+998 XX XXX XX XX"
];

/** Bracketed text that is real content, not a slot: footnote numbers and links. */
const isContent = (token: string) => /^\[\d{1,3}\]$/.test(token) || /https?:|t\.me\/|www\./i.test(token);

/** The unfilled slots in one text, in order of appearance, without duplicates. */
export function findPlaceholders(text: string): string[] {
  const hits: { at: number; token: string }[] = [];
  for (const re of PATTERNS) {
    for (const m of text.matchAll(re)) {
      if (isContent(m[0])) continue;
      // "{{LINK}}" also matches the single-brace pattern; keep the longest token at a position.
      if (hits.some((h) => m.index >= h.at && m.index < h.at + h.token.length)) continue;
      hits.push({ at: m.index, token: m[0] });
    }
  }
  return [...new Set(hits.sort((a, b) => a.at - b.at).map((h) => h.token))];
}

/** Slots left in the given scripts of a post (only non-empty variants are checked). */
export function placeholdersIn(variants: Partial<Record<Script, string>>, scripts: readonly Script[]): { script: Script; tokens: string[] }[] {
  const out: { script: Script; tokens: string[] }[] = [];
  for (const s of scripts) {
    const text = variants[s];
    if (!text?.trim()) continue;
    const tokens = findPlaceholders(text);
    if (tokens.length) out.push({ script: s, tokens });
  }
  return out;
}

const NOTE = {
  uz: (t: string) => `Postda to‘ldirilmagan joy qoldi: ${t}. Shu ma’lumotni yozing yoki o‘sha gapni o‘chiring — shundan keyin post kanalga chiqadi.`,
  ru: (t: string) => `В посте осталось незаполненное место: ${t}. Впишите эти данные или удалите это предложение — после этого пост можно публиковать.`,
  en: (t: string) => `The post still has a blank to fill: ${t}. Add that detail or delete the sentence — then the post can go out.`,
} as const;

/** Owner-readable note naming the blanks ("«[kod]», «[narx]»"). */
export function placeholderNote(tokens: string[], lang: "uz" | "ru" | "en"): string {
  const list = [...new Set(tokens)].slice(0, 5).map((t) => `«${t}»`).join(", ");
  return NOTE[lang](list);
}
