import "server-only";
import { randomUUID } from "node:crypto";
import { getSql, isDbConfigured, pgErrorCode } from "@/lib/db";
import { answersText, mergeAnswers, type OwnerAnswers } from "./answers";
import type { Lang } from "./types";

/**
 * The owner's answers in brand_knowledge (kind = 'answers'): ONE row per brand holding the merged answers. A save
 * replaces it in one transaction (insert the new row, delete the older ones), so the weekly questions and the bot
 * never pile up rows that push the owner's documents out of loadKnowledge's window. The row's text is the same
 * answers in plain words, which loadKnowledge puts first in the brand's knowledge (strategist and copywriter facts).
 * Memory fallback without a DB.
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

/** Merges `next` into the saved answers and stores the result as the brand's only answers row. Returns what is saved. */
export async function saveAnswers(brandId: string, next: OwnerAnswers, lang: Lang = "uz"): Promise<OwnerAnswers> {
  const merged = mergeAnswers(await loadAnswers(brandId), next);
  const text = answersText(merged, lang);
  if (!isDbConfigured()) {
    mem.set(brandId, { answers: merged, at: Date.now() });
    return merged;
  }
  const id = randomUUID();
  const sql = getSql();
  try {
    await sql.transaction([
      sql`
        INSERT INTO brand_knowledge (id, brand_id, kind, url, title, text, structured)
        VALUES (${id}, ${brandId}, 'answers', ${null}, ${null}, ${text}, ${JSON.stringify(merged)}::jsonb)
      `,
      sql`DELETE FROM brand_knowledge WHERE brand_id = ${brandId} AND kind = 'answers' AND id <> ${id}`,
    ]);
  } catch (err) {
    if (pgErrorCode(err) !== "42P01") throw err;
    mem.set(brandId, { answers: merged, at: Date.now() });
  }
  return merged;
}
