/** Customer-facing copy helpers for the planner (pure). */
const ID = String.raw`(?:S\.[A-Za-z_][\w-]*(?:\.[\w-]+)*|F\d+|W\d+|P\.\w+\/\d+|R\.[A-Z_]+)`;
// Unambiguous: ids separated by commas, so the engine never backtracks between two ways to split a list.
const ID_LIST = new RegExp(String.raw`\s*[[(]\s*${ID}(?:\s*,\s*${ID})*\s*[\])]`, "g");

/** Removes ledger id citations ("[F3, F21]", "(S.reachRate)") from customer-facing copy (input capped at 600 chars). */
export const stripIds = (t: string) => Array.from(t).slice(0, 600).join("").replace(ID_LIST, "").replace(/\s{2,}/g, " ").trim();
