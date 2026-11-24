/** Customer-facing copy helpers for the planner (pure). */
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
  return t
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

/**
 * stripIds for owner text of any length: line by line (line breaks kept), a very long line in 500-char pieces,
 * so nothing is cut off and the regex never sees more than 600 characters at once.
 */
export function stripIdsAll(t: string): string {
  return t
    .split("\n")
    .map((line) => {
      const chars = Array.from(line);
      if (chars.length <= 600) return stripIds(line);
      const parts: string[] = [];
      for (let i = 0; i < chars.length; i += 500) parts.push(stripIds(chars.slice(i, i + 500).join("")));
      return parts.filter(Boolean).join(" ");
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
