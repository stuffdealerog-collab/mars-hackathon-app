/**
 * Deterministic Uzbek Latin -> Uzbek Cyrillic transliteration.
 *
 * Pure (no server-only imports) so it runs in tests, the browser and the bot.
 * Preserves URLs, e-mails, @handles, #hashtags, numbers, emoji and words that
 * cannot be Uzbek Latin (they contain "w" or a "c" outside "ch": brand names
 * such as "Wildberries" or "Click").
 */

/** Every apostrophe variant people type for o‘ / g‘ and the tutuq belgisi. */
const APOSTROPHES = "'‘’ʻʼ`´";
const APOS_RE = new RegExp(`[${APOSTROPHES}]`, "g");
const APOS = "'";

const VOWELS = new Set(["a", "e", "i", "o", "u", "o‘"]);

/** Whole-word / stem overrides for Russian loanwords (lowercase Latin, no apostrophes). */
const LOANWORDS: Array<[string, string, { softEnd?: boolean }]> = [
  ["sentyabr", "сентябр", { softEnd: true }],
  ["sentabr", "сентябр", { softEnd: true }],
  ["oktyabr", "октябр", { softEnd: true }],
  ["oktabr", "октябр", { softEnd: true }],
  ["noyabr", "ноябр", { softEnd: true }],
  ["dekabr", "декабр", { softEnd: true }],
  ["yanvar", "январ", { softEnd: true }],
  ["fevral", "феврал", { softEnd: true }],
  ["aprel", "апрел", { softEnd: true }],
  ["iyun", "июн", { softEnd: true }],
  ["iyul", "июл", { softEnd: true }],
  ["kompyuter", "компьютер", {}],
  ["obyekt", "объект", {}],
  ["subyekt", "субъект", {}],
  ["podyezd", "подъезд", {}],
  ["film", "фильм", {}],
  ["konsert", "концерт", {}],
  ["sirk", "цирк", {}],
  ["sement", "цемент", {}],
  ["litsey", "лицей", {}],
  ["ofitsiant", "официант", {}],
  ["aksiya", "акция", {}],
  ["stansiya", "станция", {}],
  ["sentr", "центр", {}],
];

/** Words that only look like stems above (e.g. "filmlar" is fine, "filmora" is not). */
const LOANWORD_EXACT_ONLY = new Set(["sirk", "film", "sentr", "aksiya"]);

const SINGLE: Record<string, string> = {
  a: "а",
  b: "б",
  c: "ц",
  d: "д",
  e: "е",
  f: "ф",
  g: "г",
  h: "ҳ",
  i: "и",
  j: "ж",
  k: "к",
  l: "л",
  m: "м",
  n: "н",
  o: "о",
  p: "п",
  q: "қ",
  r: "р",
  s: "с",
  t: "т",
  u: "у",
  v: "в",
  x: "х",
  y: "й",
  z: "з",
};

type Chunk = { cyr: string; upper: boolean };

const isUpper = (ch: string) => ch !== ch.toLowerCase() && ch === ch.toUpperCase();

/** Transliterates a single Latin word (letters and apostrophes only). */
function transliterateWord(word: string): string {
  const normalized = word.replace(APOS_RE, APOS);
  const lower = normalized.toLowerCase();
  const letters = lower.replace(/'/g, "");
  // Not Uzbek Latin: "w", a "c" outside "ch", English "th", or camelCase (iPhone, TikTok).
  if (/w/.test(letters) || /c(?!h)/.test(lower) || /th/.test(lower) || /[a-z][A-Z]/.test(word)) return word;

  const allCaps = /[a-z]/i.test(word) && word === word.toUpperCase() && letters.length > 1;

  // Loanword stems (checked on the apostrophe-free form).
  for (const [stem, cyr, opts] of LOANWORDS) {
    if (!letters.startsWith(stem) || lower.includes(APOS)) continue;
    if (LOANWORD_EXACT_ONLY.has(stem) && letters !== stem && !/^(lar|ni|da|dan|ga|ning|i|imiz|ingiz)/.test(letters.slice(stem.length))) continue;
    const rest = normalized.slice(stem.length);
    let out = cyr + (opts.softEnd && rest.length === 0 ? "ь" : "") + (rest ? transliterateWord(rest).toLowerCase() : "");
    if (allCaps) out = out.toUpperCase();
    else if (isUpper(normalized[0])) out = out[0].toUpperCase() + out.slice(1);
    return out;
  }

  const chunks: Chunk[] = [];
  let prevSound: string | null = null; // last emitted Latin sound, for the e -> э rule
  let i = 0;
  while (i < lower.length) {
    const c = lower[i];
    const n = lower[i + 1];
    const n2 = lower[i + 2];
    const upper = isUpper(normalized[i]);

    if (c === APOS) {
      // Tutuq belgisi between letters -> ъ, except s'h (s + h, no sign) and at the word edges.
      const prev = lower[i - 1];
      if (i > 0 && n !== undefined && /[a-z]/.test(n) && !(prev === "s" && n === "h")) {
        chunks.push({ cyr: "ъ", upper: false });
      } else if (i === 0 || n === undefined) {
        chunks.push({ cyr: word[i], upper: false }); // a quote mark, keep it
      }
      prevSound = "'";
      i += 1;
      continue;
    }

    // o' -> ў, g' -> ғ
    if ((c === "o" || c === "g") && n === APOS) {
      chunks.push({ cyr: c === "o" ? "ў" : "ғ", upper });
      prevSound = c === "o" ? "o‘" : "g‘";
      i += 2;
      continue;
    }
    // sh, ch (but not s'h, which is handled by the apostrophe branch)
    if ((c === "s" || c === "c") && n === "h") {
      chunks.push({ cyr: c === "s" ? "ш" : "ч", upper });
      prevSound = c + "h";
      i += 2;
      continue;
    }
    // ye / yo / yu / ya (but "yo'" is й + ў)
    if (c === "y" && n && "eoua".includes(n) && !(n === "o" && n2 === APOS)) {
      const map: Record<string, string> = { e: "е", o: "ё", u: "ю", a: "я" };
      chunks.push({ cyr: map[n], upper });
      prevSound = "y" + n;
      i += 2;
      continue;
    }
    // ts + iy (informatsiya, militsiya, operatsiya) -> ц
    if (c === "t" && n === "s" && n2 === "i" && lower[i + 3] === "y" && i > 0) {
      chunks.push({ cyr: "ц", upper });
      prevSound = "ts";
      i += 2;
      continue;
    }
    if (c === "e") {
      const initial = prevSound === null || prevSound === "'" || VOWELS.has(prevSound);
      chunks.push({ cyr: initial ? "э" : "е", upper });
      prevSound = "e";
      i += 1;
      continue;
    }
    const mapped = SINGLE[c];
    chunks.push({ cyr: mapped ?? normalized[i], upper });
    prevSound = mapped ? c : prevSound;
    i += 1;
  }

  const out = chunks.map((ch) => (ch.upper ? ch.cyr.toUpperCase() : ch.cyr)).join("");
  return allCaps ? out.toUpperCase() : out;
}

// Spans that must never be transliterated.
const PROTECTED =
  /(https?:\/\/[^\s]+|www\.[^\s]+|[\w.+-]+@[\w-]+\.[\w.]+|@[A-Za-z0-9_]{2,}|#[\p{L}\p{N}_]+|\b[\w-]+\.(?:uz|com|ru|org|net|io|me|app)(?:\/[^\s]*)?)/gu;

// A Latin word: letters, with apostrophes allowed inside or right after o/g.
const WORD = new RegExp(`[A-Za-z](?:[A-Za-z]|[${APOSTROPHES}](?=[A-Za-z])|(?<=[OoGg])[${APOSTROPHES}])*`, "g");

/**
 * Uzbek Latin -> Uzbek Cyrillic. Non-Latin text passes through unchanged.
 * `keep`: words to leave in Latin (brand names), matched case-insensitively.
 */
export function latinToCyrillic(text: string, keep: string[] = []): string {
  if (!text) return text;
  const kept = new Set(keep.map((w) => w.toLowerCase()));
  // Words glued to digits are model/product codes (PS5, A54, 4K): keep them.
  const tr = (w: string, offset: number, all: string) =>
    kept.has(w.toLowerCase()) || /\d/.test(all[offset - 1] ?? "") || /\d/.test(all[offset + w.length] ?? "")
      ? w
      : transliterateWord(w);
  let out = "";
  let last = 0;
  for (const m of text.matchAll(PROTECTED)) {
    const start = m.index ?? 0;
    out += text.slice(last, start).replace(WORD, tr);
    out += m[0];
    last = start + m[0].length;
  }
  out += text.slice(last).replace(WORD, tr);
  return out;
}

/** Normalizes o‘/g‘ to the official ʻ (U+02BB) and the tutuq belgisi to ʼ (U+02BC). */
export function normalizeUzLatin(text: string): string {
  return text
    .replace(new RegExp(`([OoGg])[${APOSTROPHES}]`, "g"), "$1\u02BB")
    .replace(new RegExp(`([A-Za-z])[${APOSTROPHES.replace("ʻ", "")}](?=[A-Za-z])`, "g"), "$1\u02BC");
}
