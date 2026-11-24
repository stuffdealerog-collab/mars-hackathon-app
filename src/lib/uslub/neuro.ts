/**
 * "Neuro-words" filter: phrases that make copy sound machine-written.
 *
 * Pure (no server-only imports): detection and the human score run in tests,
 * the browser and the server. The LLM rewrite pass lives in `editor.ts`.
 */
import type { NeuroHit, Script } from "./contract";
import { latinToCyrillic } from "./translit";

type Rule = { re: RegExp; suggestion: string };

const L = "\\p{L}*"; // any word ending (inflection)
const flags = "giu";
const bounded = (body: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${body})(?![\\p{L}\\p{N}])`, flags);

/* ------------------------------------------------------------------ RU */
const RU: Array<[string, string]> = [
  ["в современном мире", "уберите вступление, начните с сути"],
  ["в наше время", "уберите, начните с сути"],
  [`в мире,? где`, "начните с конкретного факта"],
  [`погруз${L} в (?:мир|атмосфер${L})`, "опишите, что конкретно увидит клиент"],
  [`окунит${L}`, "опишите конкретно, что будет"],
  [`уникальн${L} возможност${L}`, "назовите конкретную выгоду"],
  [`не упусти${L} (?:свой )?(?:шанс|возможност${L})`, "назовите срок: «до пятницы»"],
  [`открой${L} для себя`, "попробуйте"],
  [`незабываем${L}`, "опишите конкретное впечатление"],
  [`широк${L} ассортимент${L}`, "назовите 2–3 позиции"],
  [`высочайш${L} качеств${L}`, "покажите факт: материал, срок, гарантию"],
  [`индивидуальн${L} подход${L}`, "скажите, что именно подстраиваете"],
  [`идеальн${L} выбор${L}`, "скажите, кому и для чего подходит"],
  [`(?:это )?не просто [\\p{L}-]+,? а`, "скажите прямо, что это"],
  [`на новый уровень`, "назовите конкретное улучшение"],
  [`неотъемлем${L} част${L}`, "уберите"],
  [`(?:важно|стоит) отметить`, "уберите, скажите сразу"],
  [`ключев${L} рол${L}`, "уберите"],
  [`волшебн${L} атмосфер${L}`, "опишите место конкретно"],
  [`мы рады (?:предложить|сообщить|представить)`, "сразу к новости"],
  [`истинн${L} наслаждени${L}`, "опишите вкус конкретно"],
  [`гармони${L} вкус${L}`, "опишите вкус конкретно"],
  [`кажд${L} найд[её]т (?:что-то )?для себя`, "назовите, кому подойдёт"],
  [`(?:настоящ${L} )?шедевр${L}`, "уберите превосходную степень"],
  [`подар${L} (?:себе )?незабываем${L}`, "опишите конкретно"],
];

/* ------------------------------------------------------------------ EN */
const EN: Array<[string, string]> = [
  ["in today'?s (?:fast-paced |digital |modern )?world", "cut the intro, start with the point"],
  ["unlock(?:s|ed|ing)?", "get / open"],
  ["elevat(?:e|es|ed|ing)", "improve / make better"],
  ["seamless(?:ly)?", "easy / smooth"],
  ["dive into", "try / read"],
  ["delv(?:e|es|ing)", "look at"],
  ["game[- ]changer", "say what changes"],
  ["look no further", "cut"],
  ["embark(?:s|ed|ing)? on", "start"],
  ["tapestry", "mix"],
  ["unleash(?:es|ed|ing)?", "use"],
  ["revolutioni[sz](?:e|es|ed|ing)", "change"],
  ["cutting[- ]edge", "new"],
  ["state[- ]of[- ]the[- ]art", "modern / name the feature"],
  ["whether you'?re", "cut, name one reader"],
  ["nestled", "located"],
  ["vibrant", "lively / be specific"],
  ["(?:a )?testament to", "shows"],
  ["don'?t miss out", "give a deadline"],
  ["unparalleled", "be specific"],
  ["top[- ]notch", "be specific"],
  ["boasts?", "has"],
  ["to the next level", "say what improves"],
  ["more than just", "say what it is"],
  ["immerse yourself", "try"],
  ["curated", "picked"],
  ["meticulous(?:ly)?", "careful"],
  ["in the realm of", "in"],
  ["harness the power", "use"],
  ["(?:a )?world of", "be specific"],
  ["journey", "be specific"],
];

/* ------------------------------------------------------------------ UZ
 * Written as plain Latin words so the same list works for Cyrillic.
 * A trailing "*" allows any suffix (Uzbek is agglutinative). */
const UZ: Array<[string, string]> = [
  ["bugungi zamonaviy dunyoda", "kirishni olib tashlang, darrov mavzuga o'ting"],
  ["zamonaviy dunyoda", "kirishni olib tashlang, darrov mavzuga o'ting"],
  ["noyob imkoniyat*", "aniq foydani yozing"],
  ["betakror imkoniyat*", "aniq foydani yozing"],
  ["ajoyib imkoniyat*", "aniq foydani yozing"],
  ["imkoniyatni qo'ldan boy bermang", "muddatni yozing: «juma kunigacha»"],
  ["qo'ldan boy bermang", "muddatni yozing: «juma kunigacha»"],
  ["o'z ichiga oladi", "«bor» yoki «kiradi» deb yozing"],
  ["kashf eting", "sinab ko'ring"],
  ["kashf qiling", "sinab ko'ring"],
  ["dunyosiga sho'ng'*", "aniq nima bo'lishini yozing"],
  ["sho'ng'ing", "aniq nima bo'lishini yozing"],
  ["unutilmas taassurot*", "aniq taassurotni yozing"],
  ["unutilmas lahza*", "aniq lahzani yozing"],
  ["mukammal tanlov*", "kimga mosligini yozing"],
  ["ideal tanlov*", "kimga mosligini yozing"],
  ["yuqori sifat kafolat*", "faktni yozing: material, kafolat muddati"],
  ["eng yuqori sifat*", "faktni yozing"],
  ["keng assortiment*", "2–3 ta mahsulotni nomlang"],
  ["individual yondashuv*", "nimani moslashtirishingizni yozing"],
  ["yangi bosqichga olib chiq*", "aniq yaxshilanishni yozing"],
  ["yangi darajaga olib chiq*", "aniq yaxshilanishni yozing"],
  ["muhim ahamiyatga ega", "olib tashlang"],
  ["alohida ta'kidlash joiz", "olib tashlang"],
  ["ta'kidlash joiz", "olib tashlang"],
  ["shuni ta'kidlash kerak*", "olib tashlang"],
  ["hech kimni befarq qoldirmaydi", "aniq natijani yozing"],
  ["befarq qoldirmaydi", "aniq natijani yozing"],
  ["sehrli muhit*", "joyni aniq tasvirlang"],
  ["sehrli atmosfera*", "joyni aniq tasvirlang"],
  ["sizni kutmoqda", "«bor» / «keling» deb yozing"],
  ["betakror ta'm*", "ta'mni aniq tasvirlang"],
  ["betakror lazzat*", "ta'mni aniq tasvirlang"],
  ["haqiqiy san'at asari", "olib tashlang"],
];

const APOS_RE = /['‘’ʻʼ`´]/g;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function uzPattern(phrase: string, cyrillic: boolean): string {
  return phrase
    .split(/\s+/)
    .map((word) => {
      const star = word.endsWith("*");
      const bare = word.replace(/\*$/, "");
      const text = cyrillic ? latinToCyrillic(bare).toLowerCase() : bare.replace(APOS_RE, "'");
      return escapeRe(text) + (star ? L : "");
    })
    .join("\\s+");
}

const buildRules = (list: Array<[string, string]>, toBody: (p: string) => string): Rule[] =>
  list.map(([p, suggestion]) => ({ re: bounded(toBody(p)), suggestion }));

const NAFAQAT_LATN: Rule = {
  re: bounded("nafaqat[^.!?\\n]{1,80}?balki"),
  suggestion: "bitta fikrni oddiy gap bilan yozing",
};
const NAFAQAT_CYRL: Rule = {
  re: bounded("нафақат[^.!?\\n]{1,80}?балки"),
  suggestion: "битта фикрни оддий гап билан ёзинг",
};

const RULES: Record<Script, Rule[]> = {
  ru: buildRules(RU, (p) => p),
  en: buildRules(EN, (p) => p),
  uz_latn: [...buildRules(UZ, (p) => uzPattern(p, false)), NAFAQAT_LATN],
  uz_cyrl: [
    ...UZ.map(([p, s]) => ({ re: bounded(uzPattern(p, true)), suggestion: latinToCyrillic(s) })),
    NAFAQAT_CYRL,
  ],
};

/** Same-length normalization so match indexes map back onto the original text. */
const normalizeForMatch = (text: string) => text.replace(APOS_RE, "'");

/** Finds neuro-words. Overlapping matches keep the longest one; sorted by index. */
export function detectNeuro(text: string, script: Script): NeuroHit[] {
  if (!text) return [];
  const haystack = normalizeForMatch(text);
  const found: NeuroHit[] = [];
  for (const rule of RULES[script]) {
    rule.re.lastIndex = 0;
    for (const m of haystack.matchAll(rule.re)) {
      const index = m.index ?? 0;
      found.push({ phrase: text.slice(index, index + m[0].length), index, suggestion: rule.suggestion });
    }
  }
  found.sort((a, b) => a.index - b.index || b.phrase.length - a.phrase.length);
  const out: NeuroHit[] = [];
  let end = -1;
  for (const hit of found) {
    if (hit.index < end) continue; // overlaps a longer/earlier hit
    out.push(hit);
    end = hit.index + hit.phrase.length;
  }
  return out;
}

const EMOJI_RE = /\p{Extended_Pictographic}/gu;

/**
 * 0-100, higher = sounds more human. Penalizes neuro-words most, then the
 * usual machine tells: exclamation spam, emoji walls, em-dash habits, hashtag piles.
 */
export function humanScore(text: string, script: Script, hits = detectNeuro(text, script)): number {
  if (!text.trim()) return 0;
  let score = 100;
  score -= Math.min(60, hits.length * 12);
  const exclamations = (text.match(/!/g) ?? []).length;
  if (exclamations > 3) score -= Math.min(15, (exclamations - 3) * 5);
  const emoji = (text.match(EMOJI_RE) ?? []).length;
  const words = text.split(/\s+/).filter(Boolean).length || 1;
  if (emoji > 8 || emoji / words > 0.2) score -= 10;
  const dashes = (text.match(/—/g) ?? []).length;
  if (dashes > 2) score -= Math.min(10, (dashes - 2) * 3);
  const hashtags = (text.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
  if (hashtags > 6) score -= 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Detection + score in one call. */
export function analyzeNeuro(text: string, script: Script): { hits: NeuroHit[]; humanScore: number } {
  const hits = detectNeuro(text, script);
  return { hits, humanScore: humanScore(text, script, hits) };
}

/** Number of curated phrases per script (for the UI / pitch). */
export const NEURO_LIST_SIZE: Record<Script, number> = {
  ru: RU.length,
  en: EN.length,
  uz_latn: UZ.length + 1,
  uz_cyrl: UZ.length + 1,
};
