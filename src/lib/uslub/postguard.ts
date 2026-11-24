/**
 * Last checks on a written post before the owner sees it (pure, no I/O).
 * - A picture post never talks about a video ("Videoni saqlab qo‘ying" under a photo).
 * - A post never announces as upcoming something dated before its own day (an opening that already happened).
 */
import type { Script } from "./contract";
import { dotted, pastDatesIn } from "./dates";

const VIDEO_RE = /(?<!\p{L})(video|видео|ролик|reels?)\p{L}*/iu;

/**
 * Removes every sentence that mentions a video. Line breaks, emoji lines and the rest of the post stay as written;
 * a line left empty by the removal is dropped. Returns the text unchanged if nothing mentions a video.
 */
export function dropVideoMentions(text: string): string {
  if (!VIDEO_RE.test(text)) return text;
  const lines = text.split("\n").map((line) => {
    if (!VIDEO_RE.test(line)) return line;
    const sentences = line.match(/[^.!?…]+(?:[.!?…]+|$)\s*/gu) ?? [line];
    const kept = sentences.filter((s) => !VIDEO_RE.test(s)).join("").trim();
    return kept ? kept : null;
  });
  const out = lines.filter((l): l is string => l !== null).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return out || text;
}

export type NoteLang = "uz" | "ru" | "en";

const PAST_NOTE: Record<NoteLang, (dates: string) => string> = {
  uz: (d) => `Postda o‘tib ketgan sana bor (${d}): bu voqea allaqachon bo‘lgan. Matnni tekshiring — uni kelayotgan voqea deb e’lon qilmang.`,
  ru: (d) => `В посте есть прошедшая дата (${d}): это событие уже было. Проверьте текст — не анонсируйте его как предстоящее.`,
  en: (d) => `The post names a date that has passed (${d}): that event already happened. Check the text — don't announce it as upcoming.`,
};

/** Dates in any variant that are before the post's day, as "DD.MM.YYYY". */
export function pastDatesInPost(variants: Partial<Record<Script, string>>, day: string): string[] {
  const all = (["uz_latn", "ru", "en"] as Script[]).flatMap((s) => pastDatesIn(variants[s] ?? "", day));
  return [...new Set(all)].sort().map(dotted);
}

/** The owner's note for a post that names a past date, or null. */
export function pastDateNote(variants: Partial<Record<Script, string>>, day: string, lang: NoteLang): string | null {
  const past = pastDatesInPost(variants, day);
  return past.length ? PAST_NOTE[lang](past.join(", ")) : null;
}
