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
