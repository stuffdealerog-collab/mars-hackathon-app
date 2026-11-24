/** Pure text helpers for the UI (no React): link parsing and number formatting. */

export type Lang = "uz" | "ru" | "en";

/** Accepts t.me/x, https://t.me/x, t.me/s/x, @x or a bare username. */
export function parseChannel(v: string): string | null {
  const m = v.trim().match(/^(?:https?:\/\/)?(?:t(?:elegram)?\.me\/(?:s\/)?|@)?([A-Za-z][A-Za-z0-9_]{3,31})\/?$/);
  return m ? m[1] : null;
}

/** "{n} ta post" + { n: 5 } -> "5 ta post" */
export function fmt(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/**
 * 8860 -> "8 860" and 3.2 -> "3,2" (uz, ru) or "8,860" / "3.2" (en).
 * Built by hand: browsers ship thin Uzbek locale data and fall back to English separators.
 */
export function num(n: number, lang: Lang, digits = 0): string {
  const en = new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
  if (lang === "en") return en;
  return en.replace(/,/g, "\u00a0").replace(".", ",");
}

/** Keeps "12 000" on one line in running text. */
export function keepNumbers(text: string): string {
  return text.replace(/(\d)[ \u202f](?=\d{3}(?!\d))/g, "$1\u00a0");
}

/** "2026-11-30" -> weekday index (0 = Sunday) without timezone drift. */
export function weekday(iso: string): number | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay();
}
