/** Customer-facing copy helpers for the planner (pure). */
import { normalizePrices } from "../price";

const ID = String.raw`(?:S\.[A-Za-z_][\w-]*(?:\.[\w-]+)*|F\d+|W\d+|P\.\w+\/\d+|R\.[A-Z_]+)`;
// Unambiguous: ids separated by commas, so the engine never backtracks between two ways to split a list.
const ID_LIST = new RegExp(String.raw`\s*[[(]\s*${ID}(?:\s*,\s*${ID})*\s*[\])]`, "g");

/** Removes ledger id citations ("[F3, F21]", "(S.reachRate)") from customer-facing copy (input capped at 600 chars). */
export const stripIds = (t: string) => Array.from(t).slice(0, 600).join("").replace(ID_LIST, "").replace(/\s{2,}/g, " ").trim();

/**
 * After ids are stripped, a few model habits still point at the fact list: "shart F'da ko'rsatilmagan",
 * "условия в F", "Faktlar: [F3]." -> "Faktlar:.". They are reworded for the owner; line breaks are kept.
 * (JavaScript's \b ignores Cyrillic, so Russian words are bounded with Unicode letter look-arounds.)
 */
const LABELS: Record<string, Record<"uz" | "ru" | "en", string>> = {
  angle: { uz: "Burchak", ru: "Подача", en: "Angle" },
  facts: { uz: "Faktlar", ru: "Факты", en: "Facts" },
  photo: { uz: "Surat", ru: "Фото", en: "Photo" },
  shoot: { uz: "Suratga olish", ru: "Съёмка", en: "Shoot" },
  video: { uz: "Video", ru: "Видео", en: "Video" },
  audience: { uz: "Auditoriya", ru: "Аудитория", en: "Audience" },
  pain: { uz: "Muammo", ru: "Боль", en: "Pain" },
};

export function ownerText(t: string, lang: "uz" | "ru" | "en"): string {
  const ref = { uz: "ma’lumotlaringiz", ru: "ваших данных", en: "your details" }[lang];
  // A plan writes prices the way its posts will: 12 000 soʻm · 12 000 сум · 12,000 UZS.
  return normalizePrices(t, lang === "uz" ? "uz_latn" : lang)
    // English labels the model leaves in a uz or ru brief ("Angle: …", "Facts: …"), and the word "ledger".
    .replace(/(^|[\n;.]\s*|\s—\s*)(Angle|Facts|Photo|Shoot|Video|Audience|Pain)\s*:/g, (_m, pre: string, label: string) => `${pre}${LABELS[label.toLowerCase()][lang]}:`)
    .replace(/\b(the |our |your )?ledger\b/gi, ref)
    .replace(/\bF['’‘`]?(da|dan|ga)\b/g, (_m, suf: string) => `${ref}${lang === "uz" ? suf : ""}`)
    .replace(/(^|[\s(])(в|из) F(?![\p{L}\d])/gu, `$1$2 ${ref}`)
    .replace(/\b(in|from) F\b/g, `$1 ${ref}`)
    .replace(/(?<![\p{L}\d])(Faktlar|Факты|Facts)\s*:\s*(?=[.;,]|$)[.;,]?[ \t]*/giu, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/* Bare ids the model writes outside brackets: "Faktlar F16, F7 va F14 dan…", "Use facts F16, F7, F14, F10",
 * "по фактам F16 и F10". Only in owner text (briefs, strategy), never in a hook: "F1 poygasi" may be a real name. */
const BARE = String.raw`(?<![\p{L}\d.\/])(?:[FW]\d{1,3}|S\.[A-Za-z_][\w-]*(?:\.[\w-]+)*|R\.[A-Z_]{3,}|P\.\w+\/\d+)(?![\p{L}\d])`;
const SEP = String.raw`\s*(?:,|;|va|и|and|&)\s*`;
const LEAD = String.raw`(?:(?:use|using|from|based on|with)\s+(?:the\s+)?facts?|(?:по|из|на основе)\s+факт\p{L}*|(?:используй\p{L}*|используя)\s+факт\p{L}*|faktlar\p{L}*|fakt\p{L}*|факт\p{L}*|facts?)\s*:?\s*`;
const SUFFIX = String.raw`(?:\s*(?:dan|da|ga|ni|lardan|larga)(?!\p{L}))?`;
// A list of ids, one id after "facts", one id right before punctuation, or any S./R. code. A lone "F1" before a word
// ("F1 poygasi") stays: it may be a real name.
const BARE_RE = new RegExp(
  String.raw`(?:${LEAD})?${BARE}(?:${SEP}${BARE})+${SUFFIX}|${LEAD}${BARE}${SUFFIX}|${BARE}${SUFFIX}(?=\s*(?:[,.;:)]|$))`,
  "giu",
);
// Case-sensitive: "S.reachRate", "R.LOW_REACH" are codes; "S.Rahimov" is a name.
const CODE_RE = /(?<![\p{L}\d])(?:S\.[a-z][\w-]*(?:\.[\w-]+)*|R\.[A-Z][A-Z_]{2,})(?![\p{L}\d])/gu;

/** Removes bare ledger ids and the "facts:" words around them, then tidies the punctuation they leave (":,;" → ":"). */
export function stripBareIds(t: string): string {
  return t
    .replace(BARE_RE, "")
    .replace(CODE_RE, "")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/([,;:])(?:\s*[,;:])+/g, "$1")
    .replace(/[,;:]\s*\./g, ".")
    .replace(/(^|\n)[ \t]*[,.;:]+[ \t]*/g, "$1")
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

/**
 * stripIds for owner text of any length: line by line (line breaks kept), a very long line in 500-char pieces,
 * so nothing is cut off and the regex never sees more than 600 characters at once. Bare ids ("F16, F7 va F14") go too.
 */
export function stripIdsAll(t: string): string {
  return t
    .split("\n")
    .map((line) => {
      const chars = Array.from(line);
      if (chars.length <= 600) return stripBareIds(stripIds(line));
      const parts: string[] = [];
      for (let i = 0; i < chars.length; i += 500) parts.push(stripBareIds(stripIds(chars.slice(i, i + 500).join(""))));
      return parts.filter(Boolean).join(" ");
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
