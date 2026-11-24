import "server-only";
import { cacheLife } from "next/cache";
import { z } from "zod";
import { getSupabaseAdmin, isDbConfigured } from "./supabase";

const StatsSchema = z.object({
  total_users: z.number(),
  users_today: z.number(),
  active_today: z.number(),
  total_events: z.number(),
  events_today: z.number(),
  by_source: z.array(z.object({ source: z.string(), count: z.number() })),
  by_type: z.array(z.object({ type: z.string(), count: z.number() })),
  recent_signups: z.array(
    z.object({ first_name: z.string().nullable(), created_at: z.string() }),
  ),
});

export type Stats = z.infer<typeof StatsSchema>;
export type StatsResult =
  | { ok: true; stats: Stats; generatedAt: string }
  | { ok: false; error: "not_configured" | "query_failed"; generatedAt: string };

export const STATS_TIMEZONE = "Asia/Tashkent";

/** Aggregates from the `app_stats()` SQL function, cached and refreshed every ~10 s. */
export async function getStats(): Promise<StatsResult> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 10, expire: 300 });

  const generatedAt = new Date().toISOString();
  if (!isDbConfigured()) return { ok: false, error: "not_configured", generatedAt };

  try {
    const { data, error } = await getSupabaseAdmin().rpc("app_stats", { p_tz: STATS_TIMEZONE });
    if (error) throw new Error(error.message);
    return { ok: true, stats: StatsSchema.parse(data), generatedAt };
  } catch (err) {
    console.error("[stats]", err instanceof Error ? err.message : err);
    return { ok: false, error: "query_failed", generatedAt };
  }
}
