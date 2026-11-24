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

const CYR_TO_LAT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "s", ч: "ch", ш: "sh", щ: "sh", ъ: "’", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
  ў: "o‘", қ: "q", ғ: "g‘", ҳ: "h",
};

/**
 * Uzbek Latin text with a word that mixes scripts ("adminдан", "Toshkentда"): the Cyrillic letters inside that
 * word become Latin. Words fully in one script (a Russian quote, a brand name) are left alone.
 */
export function fixMixedScript(text: string): string {
  return text.replace(/[\p{L}’‘ʻ'-]+/gu, (word) => {
    if (!/[A-Za-z]/.test(word) || !/[Ѐ-ӿ]/.test(word)) return word;
    return Array.from(word)
      .map((ch) => {
        const low = ch.toLowerCase();
        const lat = CYR_TO_LAT[low];
        if (lat === undefined) return ch;
        return ch === low ? lat : lat.charAt(0).toUpperCase() + lat.slice(1);
      })
      .join("");
  });
}

/* ------------------------------------------------------------ contact and price lines */

type Lang3 = "uz_latn" | "ru" | "en";

const sentencesOf = (line: string) => line.match(/[^.!?…]+(?:[.!?…]+|$)\s*/gu) ?? [line];

/** Rewrites a text sentence by sentence (line breaks kept); `fn` returns the new sentence, or null to drop it. */
function mapSentences(text: string, fn: (sentence: string) => string | null): string {
  const out = text
    .split("\n")
    .map((line) => {
      const kept = sentencesOf(line)
        .map((s) => fn(s))
        .filter((s): s is string => s != null)
        .join("")
        .trim();
      return line.trim() && !kept ? null : kept;
    })
    .filter((l): l is string => l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return out || text;
}

/** "Price in DM" lines: the channel hides its price, which costs it orders (rule R.HIDDEN_PRICE). */
const HIDDEN_PRICE_RE =
  /narx(i|ini|lar(i|ini)?)?\s+(lichka|lichkada|shaxsiy|direkt|dm|admin)|narx(i|ini)?\s*(bilish|so['‘’ʻ]?rash|aniqlash)\s+uchun|narx(i|ini)?\s+haqida\s+(admin|lichka)|(?<!\p{L})цен(а|у|ы|е|ой)?\s+(уточн|узна|спрашива|в\s+(лс|личк|директ))|(?<!\p{L})(уточн|узна)\p{L}*\s+(\p{L}+\s+)?цен|price\s+(in|via|on)\s+(dm|direct|request)|(ask|message|dm|contact)\s+(us|the admin|our admin)\s+(for|about)\s+(the\s+)?price/iu;

const PRICE_BLANK: Record<Lang3, string> = { uz_latn: "Narxi: [narx].", ru: "Цена: [цена].", en: "Price: [price]." };

/**
 * Never "ask the admin for the price": the first such sentence becomes a price blank the owner fills before
 * publishing (approve refuses a post with a blank), later ones go.
 */
export function replaceHiddenPrice(text: string, script: Lang3): string {
  if (!HIDDEN_PRICE_RE.test(text)) return text;
  let done = false;
  return mapSentences(text, (sentence) => {
    if (!HIDDEN_PRICE_RE.test(sentence)) return sentence;
    if (done) return null;
    done = true;
    return `${PRICE_BLANK[script]}${/\s$/.test(sentence) ? " " : ""}`;
  });
}

/** "Direct" is Instagram's inbox: a Telegram post never sends people there. */
const DIRECT_RE = /(?<!\p{L})(direct|direkt|директ)\p{L}*/iu;

const CONTACT_VERB_RE = /(?<!\p{L})(yoz|qo['‘’ʻ]ng['‘’ʻ]iroq|murojaat|bog['‘’ʻ]lan|пиш|напиш|звон|позвон|обращ|свяж|write|call|message|contact|dm)\p{L}*/iu;
const PHONE_RE = /(\+?998[\s-]?\(?\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2})|(\(\d{2}\)\s?\d{3}[\s-]?\d{2}[\s-]?\d{2})/;
const TRACKED_RE = /t\.me\/\w+\?start=src_[\w-]+/i;

/**
 * One way to reach the business per post. With the plan's tracked link in the post, other "write to / call"
 * sentences (an @admin, a phone, Direct) go; "Direct" never stays. The address and hours stay as they are.
 */
export function oneContactRoute(text: string): string {
  const tracked = TRACKED_RE.test(text);
  return mapSentences(text, (sentence) => {
    if (DIRECT_RE.test(sentence) && !TRACKED_RE.test(sentence)) return null;
    if (!tracked || TRACKED_RE.test(sentence)) return sentence;
    const otherRoute = /(?<![\w/])@\w{4,}/.test(sentence) || PHONE_RE.test(sentence);
    return otherRoute && CONTACT_VERB_RE.test(sentence) ? null : sentence;
  });
}

/** A way to contact the business in its own knowledge: phone, @handle, link. */
export const hasContact = (knowledge: string) => PHONE_RE.test(knowledge) || /(?<![\w/])@\w{4,}|t\.me\/|https?:\/\/|wa\.me|instagram\.com/i.test(knowledge);

const ASK_ADMIN_RE = /(?<!\p{L})(admin|administrator|админ|администратор)\p{L}*/iu;
const CONTACT_BLANK: Record<Lang3, string> = { uz_latn: "Buyurtma uchun: [kontakt].", ru: "Для заказа: [контакт].", en: "To order: [contact]." };

/**
 * A new channel whose owner gave no contact: "write to the admin" names nobody, so it becomes a contact blank the
 * owner fills before publishing. A sentence with a real link, @handle or phone is left alone.
 */
export function contactBlankIfNone(text: string, script: Lang3): string {
  let done = false;
  return mapSentences(text, (sentence) => {
    if (!ASK_ADMIN_RE.test(sentence) || !CONTACT_VERB_RE.test(sentence)) return sentence;
    if (/(?<![\w/])@\w{4,}|t\.me\/|https?:\/\//i.test(sentence) || PHONE_RE.test(sentence)) return sentence;
    if (done) return null;
    done = true;
    return `${CONTACT_BLANK[script]}${/\s$/.test(sentence) ? " " : ""}`;
  });
}

/* ------------------------------------------------------------ the owner's grammatical gender (ru) */

/**
 * How the owner speaks about themself in Russian posts: "я приготовила", "сама", "рада" (f) or "я приготовил",
 * "сам", "рад" (m). Null when the posts say "мы" or there are fewer than two clear signs.
 */
export function ruFirstPersonGender(posts: string[]): "f" | "m" | null {
  let f = 0;
  let m = 0;
  for (const text of posts) {
    for (const x of text.matchAll(/(?<!\p{L})я\s+(?:уже\s+|сегодня\s+|снова\s+|опять\s+|тоже\s+)?(\p{L}+?)(ла|л)(?:а?сь)?(?!\p{L})/giu)) {
      if (x[2].toLowerCase() === "ла") f++;
      else m++;
    }
    f += (text.match(/(?<!\p{L})(сама|рада|готова|уверена|благодарна)(?!\p{L})/giu) ?? []).length;
    m += (text.match(/(?<!\p{L})(сам|рад|готов|уверен|благодарен)(?!\p{L})/giu) ?? []).length;
  }
  if (f + m < 2) return null;
  if (f >= 2 && f > 2 * m) return "f";
  if (m >= 2 && m > 2 * f) return "m";
  return null;
}
