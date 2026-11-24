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

export async function saveBrandVisual(brandId: string, visual: VisualStyle): Promise<void> {
  if (!isDbConfigured()) {
    mem.set(brandId, { mode: mem.get(brandId)?.mode ?? "channel", visual });
    return;
  }
  await getSql()`UPDATE brands SET visual = ${JSON.stringify(visual)}::jsonb WHERE id = ${brandId}`;
}
