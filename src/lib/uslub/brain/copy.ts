/** Customer-facing copy helpers for the planner (pure). */
import type { Goal } from "./types";

/** Removes ledger id citations ("[F3, F21]", "(S.reachRate)") from customer-facing copy. */
export const stripIds = (t: string) =>
  t
    .replace(/\s*[[(](?:\s*(?:S\.[\w.-]+|F\d+|W\d+|P\.\w+\/\d+|R\.[A-Z_]+)\s*,?)+[\])]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

/** CTA angle per slot, rotated by code so a week of posts doesn't end with the same line. */
const CTA_ANGLES: Record<Goal, string[]> = {
  sale: ["order now", "ask whether it is in stock and the exact price", "reserve or book"],
  trust: ["ask a question about this topic", "come by in person (address or landmark from F)", "ask for advice on choosing"],
  reach: ["forward to one specific person who needs it", "save it for later"],
};
export const ctaAngle = (goal: Goal, i: number) => CTA_ANGLES[goal][i % CTA_ANGLES[goal].length];

