/** Uzbek Latin -> Cyrillic (deterministic, mock-side twin of the engine's converter). */
const PAIRS: [string, string][] = [
  ["o'", "ў"], ["g'", "ғ"], ["sh", "ш"], ["ch", "ч"], ["yo", "ё"], ["yu", "ю"], ["ya", "я"], ["ye", "е"],
];
const SINGLE: Record<string, string> = {
  a: "а", b: "б", d: "д", e: "е", f: "ф", g: "г", h: "ҳ", i: "и", j: "ж", k: "к", l: "л", m: "м", n: "н",
  o: "о", p: "п", q: "қ", r: "р", s: "с", t: "т", u: "у", v: "в", x: "х", y: "й", z: "з", c: "с", w: "в",
  "'": "ъ",
};

function word(w: string): string {
  if (/^[@#]|^https?:/.test(w)) return w;
  let out = "";
  let i = 0;
  const norm = w.replace(/[‘’ʻʼ`]/g, "'");
  while (i < norm.length) {
    const ch = norm[i];
    const lower = ch.toLowerCase();
    const isUpper = ch !== lower;
    const two = norm.slice(i, i + 2).toLowerCase();
    const pair = PAIRS.find(([l]) => l === two);
    let rep: string;
    if (pair) {
      rep = pair[1];
      i += 2;
    } else if (lower === "e" && (i === 0 || !/[a-z']/i.test(norm[i - 1]))) {
      rep = "э";
      i += 1;
    } else if (SINGLE[lower] !== undefined) {
      rep = SINGLE[lower];
      i += 1;
    } else {
      rep = ch;
      i += 1;
    }
    out += isUpper ? rep.toUpperCase() : rep;
  }
  return out;
}

export function toCyrillic(text: string): string {
  return text.split(/(\s+)/).map((t) => (/\s/.test(t) ? t : word(t))).join("");
}
