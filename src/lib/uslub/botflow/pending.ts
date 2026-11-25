import "server-only";
import { getSql, isDbConfigured } from "@/lib/db";
import { livePending, type Pending, pendingKey } from "./pending-core";

/**
 * Where the bot keeps what it is waiting for from each user (pending-core.ts): one JSON value per Telegram user in
 * brain_facts_cache under "botpending:<telegramId>" (the same keyed-JSON use as "planview:"; no new table). Every
 * read goes to the database, never to a per-instance cache: the answer may reach another instance than the question.
 * Without a database (dev, tests) it lives in memory. Reads never throw: a broken read means "nothing pending".
 */

const mem = new Map<number, Pending>();

export async function getPending(telegramId: number, now = Date.now()): Promise<Pending | null> {
  if (!isDbConfigured()) return livePending(mem.get(telegramId), now);
  try {
    const rows = (await getSql()`SELECT facts FROM brain_facts_cache WHERE kb_hash = ${pendingKey(telegramId)}`) as { facts: unknown }[];
    return livePending(rows[0]?.facts, now);
  } catch (err) {
    console.warn("[botflow/pending] read failed", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Never throws: without the state, buttons still work (they carry the brand) and a typed answer reads as usual. */
export async function setPending(telegramId: number, pending: Pending): Promise<void> {
  if (!isDbConfigured()) {
    mem.set(telegramId, pending);
    return;
  }
  await getSql()`
    INSERT INTO brain_facts_cache (kb_hash, facts) VALUES (${pendingKey(telegramId)}, ${JSON.stringify(pending)}::jsonb)
    ON CONFLICT (kb_hash) DO UPDATE SET facts = EXCLUDED.facts, created_at = now()
  `.catch((err) => console.warn("[botflow/pending] write failed", err instanceof Error ? err.message : err));
}

export async function clearPending(telegramId: number): Promise<void> {
  if (!isDbConfigured()) {
    mem.delete(telegramId);
    return;
  }
  await getSql()`DELETE FROM brain_facts_cache WHERE kb_hash = ${pendingKey(telegramId)}`.catch((err) =>
    console.warn("[botflow/pending] clear failed", err instanceof Error ? err.message : err),
  );
}

/**
 * Adds one photo to a photos wait for `brandId`, atomically: an album arrives as several updates at once, and each
 * one must land. Returns the photos now waiting, or null when the photo was not added (no photos wait for this brand,
 * it is already there, or `max` photos are in).
 */
export async function addPendingPhoto(telegramId: number, brandId: string, fileId: string, max: number, now = Date.now()): Promise<string[] | null> {
  if (!isDbConfigured()) {
    const p = livePending(mem.get(telegramId), now);
    if (!p || p.kind !== "photos" || p.brandId !== brandId || p.fileIds.includes(fileId) || p.fileIds.length >= max) return null;
    const next = { ...p, fileIds: [...p.fileIds, fileId] };
    mem.set(telegramId, next);
    return next.fileIds;
  }
  // The row lock serialises an album's updates; the WHERE is checked again on the row each one finally sees.
  const rows = (await getSql()`
    UPDATE brain_facts_cache
    SET facts = jsonb_set(facts, '{fileIds}', coalesce(facts->'fileIds', '[]'::jsonb) || jsonb_build_array(${fileId}::text))
    WHERE kb_hash = ${pendingKey(telegramId)}
      AND facts->>'kind' = 'photos'
      AND facts->>'brandId' = ${brandId}
      AND NOT (coalesce(facts->'fileIds', '[]'::jsonb) @> jsonb_build_array(${fileId}::text))
      AND jsonb_array_length(coalesce(facts->'fileIds', '[]'::jsonb)) < ${max}
    RETURNING facts
  `.catch((err) => {
    console.warn("[botflow/pending] photo not added", err instanceof Error ? err.message : err);
    return [];
  })) as { facts: unknown }[];
  const p = livePending(rows[0]?.facts, now);
  return p?.kind === "photos" ? p.fileIds : null;
}

/** Test hook: forget every in-memory wait. */
export function resetPendingMemory(): void {
  mem.clear();
}
