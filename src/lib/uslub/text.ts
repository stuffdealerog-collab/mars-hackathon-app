/**
 * Unicode-safe text for everything we send out (Claude, Telegram). A JS string is UTF-16: cutting it with slice()
 * can split an emoji into a lone surrogate, which is not valid Unicode. JSON.stringify writes such a half as an
 * escape ("\ud83d"), and the Anthropic API answers 400 "The request body is not valid JSON"; Telegram refuses it too.
 * Pure (no I/O, no server-only), so client code and tests can use it.
 */

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** `s` without lone surrogates (half an emoji is dropped, never sent). Valid pairs are kept. */
export const wellFormed = (s: string): string => s.replace(LONE_SURROGATE, "");

const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff;

/** The first `max` UTF-16 units of `s` (the same budget as slice(0, max)), never ending in half an emoji. */
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  if (max <= 0) return "";
  return s.slice(0, isHigh(s.charCodeAt(max - 1)) ? max - 1 : max);
}

/** The last `max` UTF-16 units of `s`, never starting with half an emoji. */
export function clipEnd(s: string, max: number): string {
  if (s.length <= max) return s;
  if (max <= 0) return "";
  const start = s.length - max;
  return s.slice(isHigh(s.charCodeAt(start - 1)) ? start + 1 : start);
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/**
 * Every string inside plain objects and arrays made well-formed (a new value; the input is not changed). Anything
 * else (a class instance such as a file upload, a function) is kept as it is.
 */
export function wellFormedDeep<T>(v: T): T {
  if (typeof v === "string") return wellFormed(v) as T;
  if (Array.isArray(v)) return v.map(wellFormedDeep) as T;
  if (isPlainObject(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [wellFormed(k), wellFormedDeep(x)])) as T;
  return v;
}

/**
 * A JSON text without escaped lone surrogates. JSON.stringify writes a lone surrogate as an escape ("\ud83d") and a
 * valid pair as the characters themselves, so a \uD800–\uDFFF escape that is not an escaped pair is half an emoji.
 * An escaped backslash before "u" ("\\ud83d", plain text) is not an escape and stays.
 */
export function dropLoneSurrogateEscapes(json: string): string {
  return json.replace(
    /(?<!\\)((?:\\\\)*)(\\u[dD][89abAB][0-9a-fA-F]{2}\\u[dD][c-fC-F][0-9a-fA-F]{2}|\\u[dD][89a-fA-F][0-9a-fA-F]{2})/g,
    (_m, slashes: string, esc: string) => (esc.length === 12 ? slashes + esc : slashes),
  );
}

/**
 * A fetch for API clients (the Anthropic SDK's `fetch` option): a JSON body is made well-formed right before it
 * leaves, so no caller (system prompt, messages, tool input, an assistant turn sent back) can send half an emoji.
 */
export function wellFormedFetch(base?: typeof fetch): typeof fetch {
  return (input, init) => {
    const send = base ?? globalThis.fetch;
    if (init && typeof init.body === "string") return send(input, { ...init, body: dropLoneSurrogateEscapes(wellFormed(init.body)) });
    return send(input, init);
  };
}

/* ------------------------------------------------------------ sentences */

/**
 * Words that end with a period but never end a sentence: they stand before a name or a number ("ул. Навои",
 * "д. 5", "Toshkent sh. Chilonzor", "Dr. Karimova"). Lowercase, apostrophes as "'", without the final period.
 * "a.m.", "ч.", "см.", "т.д." are not here: they often end a sentence ("30 см. Цена…"), so a capital after them
 * starts a new one. A wrong guess either way never leaves debris: at worst two sentences are handled as one.
 */
const NO_END = new Set([
  // ru
  "г", "гг", "ул", "д", "пр", "просп", "пер", "кв", "им", "тел", "мкр", "стр", "корп", "оф", "напр", "т.е", "т.к", "т.н",
  "обл", "р-н", "пл", "наб", "проф", "доц", "акад", "св",
  // uz
  "ko'ch", "kv", "mkr", "tel", "sh", "tum", "mah", "prof", "dots", "akad",
  // en
  "mr", "mrs", "ms", "dr", "st", "approx", "vs", "e.g", "i.e", "apt", "jr", "sr", "mt",
]);

const TERMINAL_RE = /[.!?…]/;
const CLOSER_RE = /["»”’')\]]/;
const SPACE_RE = /\s/;
const LOWER_RE = /\p{Ll}/u;

/** Does the period-ended word before `end` (exclusive) keep the sentence going ("ул.", "A.", a list number "1.")? */
function periodContinues(text: string, sentenceStart: number, punctStart: number): boolean {
  let wordStart = punctStart;
  while (wordStart > sentenceStart && !SPACE_RE.test(text[wordStart - 1])) wordStart--;
  const word = text.slice(wordStart, punctStart).replace(/^[^\p{L}\p{N}]+/u, "");
  const bare = word.toLowerCase().replace(/['‘’ʻʼ`]/g, "'");
  // "2026 г." after a number is a year and can end a sentence ("Акция до 31 декабря 2026 г. Звоните…"); "г. Ташкент"
  // (a city) goes on.
  if ((bare === "г" || bare === "гг") && /\d\s*$/.test(text.slice(sentenceStart, wordStart))) return false;
  if (NO_END.has(bare)) return true;
  if (/^\p{Lu}$/u.test(word)) return true; // an initial: "A. Karimov"
  // A list number that opens the sentence ("1. Napoleon"), not a number that ends one ("…narxi 50.").
  return /^\d{1,3}$/.test(word) && !text.slice(sentenceStart, wordStart).trim();
}

/**
 * A text cut into sentences; the pieces joined give the text back exactly. A sentence ends at . ! ? … (plus closing
 * quotes or brackets) only when whitespace follows and the next word does not start with a lowercase letter; a line
 * break always ends one. So "7 a.m. to 9 p.m.", "1.5 kg", "t.me/somebakery", "23.11.2026", "12.000 so‘m",
 * "с 9 ч. утра" and "ул. Навои, д. 5" stay whole. Each piece keeps the whitespace that follows it.
 */
export function splitSentences(text: string): string[] {
  if (!text) return [text];
  const out: string[] = [];
  let start = 0;
  let i = 0;
  const cut = (at: number) => {
    out.push(text.slice(start, at));
    start = at;
  };
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\n") {
      let k = i;
      while (k < text.length && SPACE_RE.test(text[k])) k++;
      cut(k);
      i = k;
      continue;
    }
    if (!TERMINAL_RE.test(ch)) {
      i++;
      continue;
    }
    const punctStart = i;
    let j = i;
    while (j < text.length && TERMINAL_RE.test(text[j])) j++;
    const onlyPeriod = j - punctStart === 1 && ch === ".";
    while (j < text.length && CLOSER_RE.test(text[j])) j++;
    if (j < text.length && !SPACE_RE.test(text[j])) {
      i = j; // "a.m", "1.5", "t.me/…", "?start=…": the sentence goes on
      continue;
    }
    let k = j;
    while (k < text.length && text[k] !== "\n" && SPACE_RE.test(text[k])) k++;
    if (k >= text.length) break; // only whitespace after it: the last sentence
    if (text[k] === "\n") {
      i = k; // the line break ends it (and takes the whitespace)
      continue;
    }
    if (LOWER_RE.test(text[k]) || (onlyPeriod && periodContinues(text, start, punctStart))) {
      i = k;
      continue;
    }
    cut(k);
    i = k;
  }
  if (start < text.length) out.push(text.slice(start));
  return out;
}

/**
 * Post HTML with every line break as "\n", minus the lines that are only link labels ("Сайт | Telegram |
 * Instagram"): once the tags go, those words point nowhere and would teach the writer a dead signature line.
 * A line with one link (a call to action) or a link whose label is the address itself stays.
 */
export function withoutLinkLabelLines(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div)>/gi, "\n")
    .split("\n")
    .filter((line) => {
      const labels = [...line.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
      if (labels.length < 2 || labels.some((l) => /[./@:]/.test(l) || !/^[\p{L}\p{M} '’‘-]{2,24}$/u.test(l))) return true;
      const rest = line.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, "").replace(/<[^>]+>/g, "").replace(/&[#\w]+;/g, " ");
      return /[\p{L}\d]/u.test(rest);
    })
    .join("\n");
}
