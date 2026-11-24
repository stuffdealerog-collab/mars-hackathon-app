import "server-only";
import { getSql, isDbConfigured } from "@/lib/db";
import type { BrandMode, VisualStyle } from "../contract";

/**
 * brands.mode / brands.visual (columns added by the 2026-11-25 migration). Own SQL so the
 * images stream does not depend on the engine's store.ts changes; same columns either way.
 * Memory fallback when DATABASE_URL is missing (local dev without a DB).
 */
const mem = new Map<string, { mode: BrandMode; visual?: VisualStyle }>();

export async function getBrandVisualInfo(brandId: string): Promise<{ mode: BrandMode; visual?: VisualStyle }> {
  if (!isDbConfigured()) return mem.get(brandId) ?? { mode: "channel" };
  const rows = (await getSql()`SELECT mode, visual FROM brands WHERE id = ${brandId}`) as { mode: string | null; visual: VisualStyle | null }[];
  const r = rows[0];
  return { mode: r?.mode === "fresh" ? "fresh" : "channel", visual: r?.visual ?? undefined };
}

/**
 * A reserved slot for one style analysis (a paid Claude vision call). The row is written FIRST,
 * then our position among the last 24 h of rows is read: the first N rows win, so parallel
 * requests cannot all pass a count check, and a failed write fails closed (no analysis).
 */
export interface AnalysisSlot {
  id: string;
  totalPos: number; // our row's position app-wide in the last 24 h
  brandPos: number; // ... for this brand
  actorPos: number; // ... for this caller
  earlierInFlight: boolean; // another analysis of this brand started in the last 90 s
}

const memAnalyses: { id: number; brandId: string; actor: string; at: number }[] = [];
let memSeq = 0;

export async function reserveVisualAnalysis(brandId: string, actor: string, ownerImages: number): Promise<AnalysisSlot> {
  if (!isDbConfigured()) {
    const id = ++memSeq;
    const now = Date.now();
    memAnalyses.push({ id, brandId, actor, at: now });
    const day = memAnalyses.filter((a) => a.at >= now - 24 * 3600_000 && a.id <= id);
    return {
      id: String(id),
      totalPos: day.length,
      brandPos: day.filter((a) => a.brandId === brandId).length,
      actorPos: day.filter((a) => a.actor === actor).length,
      earlierInFlight: day.some((a) => a.id < id && a.brandId === brandId && a.at >= now - 90_000),
    };
  }
  const sql = getSql();
  const ins = (await sql`
    INSERT INTO events (telegram_id, type, props)
    VALUES (NULL, 'visual_analysis', ${JSON.stringify({ brand_id: brandId, actor, owner_images: ownerImages })}::jsonb)
    RETURNING id
  `) as { id: string | number }[];
  const id = String(ins[0].id);
  const rows = (await sql`
    SELECT count(*)::int AS total_pos,
           count(*) FILTER (WHERE props->>'brand_id' = ${brandId})::int AS brand_pos,
           count(*) FILTER (WHERE props->>'actor' = ${actor})::int AS actor_pos,
           count(*) FILTER (WHERE props->>'brand_id' = ${brandId} AND id < ${id}::bigint
                              AND created_at >= now() - interval '90 seconds')::int AS earlier_recent
    FROM events
    WHERE type = 'visual_analysis' AND created_at >= now() - interval '24 hours' AND id <= ${id}::bigint
  `) as { total_pos: number; brand_pos: number; actor_pos: number; earlier_recent: number }[];
  const r = rows[0];
  return { id, totalPos: r.total_pos, brandPos: r.brand_pos, actorPos: r.actor_pos, earlierInFlight: r.earlier_recent > 0 };
}

/** Gives a slot back when no analysis ran (over a cap, or another one is already running). Only our own row. */
export async function releaseVisualAnalysis(slot: AnalysisSlot): Promise<void> {
  if (!isDbConfigured()) {
    const i = memAnalyses.findIndex((a) => String(a.id) === slot.id);
    if (i >= 0) memAnalyses.splice(i, 1);
    return;
  }
  await getSql()`DELETE FROM events WHERE id = ${slot.id}::bigint AND type = 'visual_analysis'`;
}

/**
 * Saves the style. A style with the owner's own photos makes the brand 'custom': a channel_only
 * row is a cache shared by everyone who analyses the same public channel (store.findChannelOnlyBrand),
 * and one person's photos must never become another person's references.
 */
export async function saveBrandVisual(brandId: string, visual: VisualStyle): Promise<void> {
  const ownerInput = visual.refs.some((r) => r.source === "owner");
  if (!isDbConfigured()) {
    mem.set(brandId, { mode: mem.get(brandId)?.mode ?? "channel", visual });
    return;
  }
  await getSql()`
    UPDATE brands
    SET visual = ${JSON.stringify(visual)}::jsonb,
        source = CASE WHEN ${ownerInput} THEN 'custom' ELSE source END
    WHERE id = ${brandId}`;
}
