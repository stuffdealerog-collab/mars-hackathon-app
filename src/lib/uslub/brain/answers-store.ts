import "server-only";
import { randomUUID } from "node:crypto";
import { getSql, isDbConfigured, pgErrorCode } from "@/lib/db";
import { answersText, mergeAnswers, type OwnerAnswers } from "./answers";
import type { Lang } from "./types";

/**
 * The owner's answers in brand_knowledge (kind = 'answers'): every save is a new row holding the merged answers, the
 * newest row wins, so history stays and nothing is overwritten. The row's text is the same answers in plain words,
 * which loadKnowledge hands to the strategist as facts (only the newest answers row). Memory fallback without a DB.
 */

const mem = new Map<string, { answers: OwnerAnswers; at: number }>();

export async function loadAnswers(brandId: string): Promise<OwnerAnswers | null> {
  if (!isDbConfigured()) return mem.get(brandId)?.answers ?? null;
  try {
    const rows = (await getSql()`
      SELECT structured FROM brand_knowledge
      WHERE brand_id = ${brandId} AND kind = 'answers'
      ORDER BY created_at DESC LIMIT 1
    `) as { structured: OwnerAnswers | null }[];
    return rows[0]?.structured ?? null;
  } catch (err) {
    if (pgErrorCode(err) === "42P01") return mem.get(brandId)?.answers ?? null;
    throw err;
  }
}

/** Merges `next` into the saved answers and stores the result as the newest row. Returns what is now saved. */
export async function saveAnswers(brandId: string, next: OwnerAnswers, lang: Lang = "uz"): Promise<OwnerAnswers> {
  const merged = mergeAnswers(await loadAnswers(brandId), next);
  const text = answersText(merged, lang);
  if (!isDbConfigured()) {
    mem.set(brandId, { answers: merged, at: Date.now() });
    return merged;
  }
  try {
    await getSql()`
      INSERT INTO brand_knowledge (id, brand_id, kind, url, title, text, structured)
      VALUES (${randomUUID()}, ${brandId}, 'answers', ${null}, ${null}, ${text}, ${JSON.stringify(merged)}::jsonb)
    `;
  } catch (err) {
    if (pgErrorCode(err) !== "42P01") throw err;
    mem.set(brandId, { answers: merged, at: Date.now() });
  }
  return merged;
}
