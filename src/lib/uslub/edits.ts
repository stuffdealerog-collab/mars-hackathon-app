/**
 * The owner's own edits to a post, applied at approval (pure). What the owner approved is exactly what the
 * bot publishes: edited variants replace the generated ones, and when Uzbek Latin was edited without a
 * Cyrillic version, the Cyrillic one is regenerated from it deterministically so the two never disagree.
 */
import type { NeuroHit, Script } from "./contract";
import { analyzeNeuro } from "./neuro";
import { latinToCyrillic } from "./translit";

export const SCRIPTS: readonly Script[] = ["uz_latn", "uz_cyrl", "ru", "en"];
/** Telegram's message limit. */
export const MAX_VARIANT = 4096;

// Built from code points so this source file stays plain ASCII.
const ch = (codes: number[]) => codes.map((c) => String.fromCharCode(c)).join("");
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
/** C0 controls except tab (9) and line feed (10), DEL, zero-width space, line/paragraph separators, BOM. */
const UNWANTED = new RegExp(`[${ch([...range(0, 8), 11, 12, ...range(14, 31), 127, 0x200b, 0x2028, 0x2029, 0xfeff])}]`, "g");

/** Removes control and invisible characters (keeps line breaks and tabs), normalises line ends, trims. */
export function cleanEdit(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(UNWANTED, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

/** Latin words that look like brand names stay in Latin inside the Cyrillic variant (as the copywriter does). */
export function brandWords(name: string, channel?: string): string[] {
  const words = `${name} ${channel ?? ""}`.match(/[A-Za-z][A-Za-z0-9]{2,}/g) ?? [];
  return [...new Set(words.filter((w) => /^[A-Z]/.test(w) || w === channel))];
}

export type EditResult =
  | { ok: true; variants: Record<Script, string>; changed: Script[]; neuroHits: Partial<Record<Script, NeuroHit[]>>; humanScore: number }
  | { ok: false; field: Script };

/**
 * Merges the owner's edits into the post's variants. Unknown keys must be rejected by the caller's schema;
 * an empty or over-long edit is refused (field named). Unchanged texts are not counted as edits.
 */
export function mergeVariants(current: Record<Script, string>, edits: Partial<Record<Script, string>>, keep: string[] = []): EditResult {
  const next = { ...current };
  const changed: Script[] = [];
  for (const s of SCRIPTS) {
    const raw = edits[s];
    if (raw == null) continue;
    const text = cleanEdit(raw);
    if (!text || text.length > MAX_VARIANT) return { ok: false, field: s };
    if (text !== (current[s] ?? "").trim()) {
      next[s] = text;
      changed.push(s);
    }
  }
  if (changed.includes("uz_latn") && !changed.includes("uz_cyrl")) {
    next.uz_cyrl = latinToCyrillic(next.uz_latn, keep);
    if (next.uz_cyrl !== current.uz_cyrl) changed.push("uz_cyrl");
  }
  const neuroHits: Partial<Record<Script, NeuroHit[]>> = {};
  let sum = 0;
  for (const s of SCRIPTS) {
    const a = analyzeNeuro(next[s] ?? "", s);
    if (a.hits.length) neuroHits[s] = a.hits;
    sum += a.humanScore;
  }
  return { ok: true, variants: next, changed, neuroHits, humanScore: Math.round(sum / SCRIPTS.length) };
}
