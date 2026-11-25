/**
 * "Neuro-words" filter: phrases that make copy sound machine-written.
 *
 * Pure (no server-only imports): detection and the human score run in tests,
 * the browser and the server. The LLM rewrite pass lives in `editor.ts`.
 */
import type { NeuroHit, Script } from "./contract";
import { splitSentences } from "./text";
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
  [`открыва${L} (?:для вас )?нов${L} горизонт${L}`, "скажите, что конкретно получит клиент"],
  [`нов${L} горизонт${L}`, "скажите, что конкретно получит клиент"],
  [`гаранти${L} качеств${L}`, "покажите факт: срок гарантии, материал"],
  [`лучш${L} выбор${L}`, "скажите, кому и для чего подходит"],
  [`специальн${L} для вас`, "уберите"],
  [`непревзойд[её]нн${L}`, "уберите превосходную степень"],
  [`беспрецедентн${L}`, "уберите превосходную степень"],
  [`(?:высок${L} )?качеств${L} и надёжност${L}`, "покажите факт"],
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
  ["unlock(?:s|ed|ing)? new horizons", "say what the customer gets"],
  ["(?:open(?:s|ing)? )?new horizons", "say what the customer gets"],
  ["(?:a )?guarantee of quality", "show the fact: warranty, material"],
  ["quality guaranteed", "show the fact: warranty, material"],
  ["(?:the )?best choice", "say who it fits and why"],
  ["(?:made |designed )?(?:especially|specially) for you", "cut"],
  ["unforgettable", "describe the moment"],
  ["(?:an )?unrivall?ed", "be specific"],
  ["second to none", "be specific"],
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
  ["yangi ufq* ochib ber*", "mijoz aniq nima olishini yozing"],
  ["yangi ufq*", "mijoz aniq nima olishini yozing"],
  ["sifat va ishonch kafolat*", "faktni yozing: kafolat muddati, material"],
  ["sifat kafolat*", "faktni yozing: kafolat muddati, material"],
  ["eng yaxshi tanlov*", "kimga va nima uchun mosligini yozing"],
  ["siz uchun maxsus", "olib tashlang"],
  ["beqiyos tajriba*", "aniq tajribani tasvirlang"],
  ["beqiyos", "aniqroq so'z tanlang"],
  ["tengsiz", "aniqroq so'z tanlang"],
  ["yuqori sifat va ishonchlilik", "faktni yozing"],
  ["orzuingizdagi*", "aniq nima ekanini yozing"],
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

/* ------------------------------------------------- Russian inside Uzbek
 * An Uzbek Latin post with a Russian word in it ("Pereshlite do‘stlaringizga", "Звоните") reads as a careless
 * translation. Each such word is a hit, so the editor writes it in Uzbek. Words Uzbek people use every day
 * ("zakaz", "dostavka", "aksiya") are not flagged: only Russian verb forms, set phrases and whole Cyrillic words. */

export const RU_IN_UZ_HINT = "o‘zbekcha, lotin harflarida yozing";

/** Russian calls to action written in Latin letters (lowercase, apostrophes dropped). */
const RU_LATIN = new Set([
  "pereshlite", "pereshli", "podpishites", "podpisyvaytes", "zakazhite", "zakajite", "zakazyvayte", "zvonite", "pozvonite", "pishite",
  "napishite", "prihodite", "prixodite", "prikhodite", "zahodite", "zaxodite", "zakhodite", "uznayte", "uznaite", "spasibo", "pozhaluysta",
  "pojaluysta", "pozhalujsta", "kupite", "pokupayte", "zhdite", "jdite", "zhdem", "jdem", "zhdyom", "jdyom", "priglashaem", "speshite",
  "toropites", "uspeyte", "uspeite", "smotrite", "dobro", "pozhalovat", "pojalovat", "ostavlyayte", "obrashchaytes", "obrashaytes",
]);
/** English words in Latin that end like a Russian imperative ("-ite"). */
const EN_ITE = new Set(["website", "websites", "favorite", "favorites", "favourite", "favourites", "opposite", "definite", "infinite", "satellite", "appetite", "composite", "exquisite", "requisite", "graphite", "granite", "dynamite", "parasite", "parasites"]);

/** Spans of links, @handles and #hashtags: a word inside them is a name, never a Russian word in the text. */
const NAME_SPAN_RE = /(?:https?:\/\/|www\.|t\.me\/)\S+|[@#][\p{L}\p{N}_]+|\S+\.(?:uz|ru|com|me|org|net)(?:\/\S*)?/giu;

/**
 * A Latin word that is Russian: a known call to action, or a Russian imperative ending on a long word. A word in
 * capitals is usually a brand ("AMBRELITE" in the golden corpus), so only the known words count there.
 */
function russianInLatin(word: string): boolean {
  const w = word.toLowerCase().replace(/['‘’ʻʼ`]/g, "");
  if (RU_LATIN.has(w)) return true;
  if (word === word.toUpperCase()) return false;
  if (w.length >= 6 && /(?:ayte|aytes|yte|ytes)$/.test(w)) return true;
  return w.length >= 8 && /(?:ite|ites)$/.test(w) && !EN_ITE.has(w);
}

/** Russian words inside Uzbek Latin text: whole Cyrillic words (3+ letters) and Russian written in Latin letters. */
export function russianInUzbek(text: string): NeuroHit[] {
  const names = [...text.matchAll(NAME_SPAN_RE)].map((m) => [m.index, m.index + m[0].length] as const);
  const inName = (i: number) => names.some(([a, b]) => i >= a && i < b);
  const hits: NeuroHit[] = [];
  for (const m of text.matchAll(/[\p{L}'‘’ʻʼ`]+/gu)) {
    const word = m[0].replace(/^['‘’ʻʼ`]+|['‘’ʻʼ`]+$/g, "");
    const index = m.index + m[0].indexOf(word);
    if (!word || inName(index)) continue;
    const cyrillic = /^[Ѐ-ӿ]+$/.test(word);
    if ((cyrillic && word.length >= 3) || (!cyrillic && /^[A-Za-z'‘’ʻʼ`]+$/.test(word) && russianInLatin(word)))
      hits.push({ phrase: word, index, suggestion: RU_IN_UZ_HINT });
  }
  return hits;
}

/** Finds neuro-words. Overlapping matches keep the longest one; sorted by index. */
export function detectNeuro(text: string, script: Script): NeuroHit[] {
  if (!text) return [];
  const haystack = normalizeForMatch(text);
  const found: NeuroHit[] = script === "uz_latn" ? russianInUzbek(text) : [];
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

/* ------------------------------------------------------- invented-fact guard
 * An editor may only remove or soften clichés. Anything that looks like a new
 * fact, offer or pressure (numbers, dates, weekdays, %, promo or urgency words)
 * that is not already in the input means the rewrite made something up. */

const FACT_PATTERNS: RegExp[] = [
  /\d+(?:[.,]\d+)?/g, // numbers, prices, dates
  /%/g,
  // weekdays and months: uz (latn + cyrl), ru, en
  /(?<![\p{L}])(dushanba|seshanba|chorshanba|payshanba|juma|shanba|yakshanba|душанба|сешанба|чоршанба|пайшанба|жума|шанба|якшанба|понедельник\p{L}*|вторник\p{L}*|сред[аеуы]|четверг\p{L}*|пятниц\p{L}*|суббот\p{L}*|воскресень\p{L}*|monday|tuesday|wednesday|thursday|friday|saturday|sunday|yanvar|fevral|mart|aprel|iyun|iyul|avgust|sentabr|sentyabr|oktabr|oktyabr|noyabr|dekabr|январ\p{L}*|феврал\p{L}*|март\p{L}*|апрел\p{L}*|ма[йя]|июн\p{L}*|июл\p{L}*|август\p{L}*|сентябр\p{L}*|октябр\p{L}*|ноябр\p{L}*|декабр\p{L}*|january|february|march|april|june|july|august|september|october|november|december|bugun|ertaga|сегодня|завтра|today|tomorrow)/giu,
  // promo / offer words
  /(aksiya|aktsiya|chegirma|bepul|tekin|sovg['ʻ’‘`]?a|bonus|keshbek|promokod|акци|скидк|бесплатн|подар|кешбэк|промокод|sale|discount|free|gift|cashback|promo)/giu,
  // urgency / pressure
  /(shoshiling|ulguring|tezroq|faqat bugun|cheklangan|спеши|успей|торопи|только сегодня|ограниченн|срочно|hurry|limited|last chance|only today)/giu,
];

function factTokens(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  const norm = text.toLowerCase().replace(/['ʻ’‘`]/g, "'");
  for (const re of FACT_PATTERNS) {
    for (const m of norm.matchAll(re)) {
      const key = m[0].replace(/\s+/g, " ");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

/** New fact-like tokens in `rewritten` that are not in `original` (empty = safe). */
export function inventedFacts(original: string, rewritten: string): string[] {
  const before = factTokens(original);
  const out: string[] = [];
  for (const [token, n] of factTokens(rewritten)) {
    if (n > (before.get(token) ?? 0)) out.push(token);
  }
  return out;
}

/**
 * Minimal deletion-based edit (no new words): a cliché that opens a sentence
 * ("Zamonaviy dunyoda, …") is cut; a sentence with a cliché anywhere else is
 * dropped. If nothing would be left, the original text is returned unchanged.
 */
export function deletionEdit(text: string, hits: NeuroHit[]): string {
  if (!hits.length) return text;
  const parts = splitSentences(text);
  let offset = 0;
  const kept: string[] = [];
  for (const part of parts) {
    const start = offset;
    const end = offset + part.length;
    offset = end;
    const inside = hits.filter((h) => h.index >= start && h.index < end);
    if (!inside.length) {
      kept.push(part);
      continue;
    }
    const lead = part.length - part.trimStart().length;
    // A Russian word is never cut out of its sentence ("Pereshlite do‘stlaringizga" -> "Do‘stlaringizga"): the sentence goes.
    const onlyLeading = inside.length === 1 && inside[0].index - start === lead && inside[0].suggestion !== RU_IN_UZ_HINT;
    if (!onlyLeading) continue; // drop the sentence
    const rest = part.slice(lead + inside[0].phrase.length).replace(/^[\s,;:—–-]+/, "");
    if ((rest.match(/\p{L}+/gu) ?? []).length < 2) continue;
    kept.push(part.slice(0, lead) + rest.charAt(0).toUpperCase() + rest.slice(1));
  }
  const out = kept.join("").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return out.length ? out : text;
}
