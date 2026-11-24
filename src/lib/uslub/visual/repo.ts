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

const memAnalyses: { brandId: string; at: number }[] = [];

/**
 * Style analyses (paid Claude vision calls) in the last 24 h: app-wide and for this brand.
 * Counted from `events` rows of type "visual_analysis", written before each call.
 */
export async function countVisualAnalyses(brandId: string): Promise<{ total: number; brand: number }> {
  if (!isDbConfigured()) {
    const since = Date.now() - 24 * 3600_000;
    const recent = memAnalyses.filter((a) => a.at >= since);
    return { total: recent.length, brand: recent.filter((a) => a.brandId === brandId).length };
  }
  const rows = (await getSql()`
    SELECT count(*)::int AS total, count(*) FILTER (WHERE props->>'brand_id' = ${brandId})::int AS brand
    FROM events WHERE type = 'visual_analysis' AND created_at >= now() - interval '24 hours'
  `) as { total: number; brand: number }[];
  return rows[0] ?? { total: 0, brand: 0 };
}

export function rememberVisualAnalysis(brandId: string): void {
  if (!isDbConfigured()) memAnalyses.push({ brandId, at: Date.now() });
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
