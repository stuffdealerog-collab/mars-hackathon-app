import "server-only";
import { cacheLife } from "next/cache";
import { z } from "zod";
import { getSql, isDbConfigured } from "./db";

const CountsSchema = z.object({
  total_users: z.number(),
  users_today: z.number(),
  active_today: z.number(),
  total_events: z.number(),
  events_today: z.number(),
});
const BySourceSchema = z.array(z.object({ source: z.string(), count: z.number() }));
const ByTypeSchema = z.array(z.object({ type: z.string(), count: z.number() }));
const RecentSchema = z.array(
  z.object({
    first_name: z.string().nullable(),
    // The driver returns timestamptz as a Date; keep an ISO string so it caches cleanly.
    created_at: z.coerce.date().transform((d) => d.toISOString()),
  }),
);

export type Stats = z.infer<typeof CountsSchema> & {
  by_source: z.infer<typeof BySourceSchema>;
  by_type: z.infer<typeof ByTypeSchema>;
  recent_signups: z.infer<typeof RecentSchema>;
};
export type StatsResult =
  | { ok: true; stats: Stats; generatedAt: string }
  | { ok: false; error: "not_configured" | "query_failed"; generatedAt: string };

export const STATS_TIMEZONE = "Asia/Tashkent";

/**
 * Public aggregates for /stats (no usernames or ids leave the database), cached
 * and refreshed every ~10 s. All queries run in one read-only snapshot over a
 * single HTTP round trip.
 */
export async function getStats(): Promise<StatsResult> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 10, expire: 300 });

  const generatedAt = new Date().toISOString();
  if (!isDbConfigured()) return { ok: false, error: "not_configured", generatedAt };

  try {
    const sql = getSql();
    const [counts, bySource, byType, recent] = await sql.transaction(
      [
        sql`
          WITH day_start AS (
            SELECT date_trunc('day', now(), ${STATS_TIMEZONE}::text) AS ts
          )
          SELECT
            (SELECT count(*)::int FROM app_users) AS total_users,
            (SELECT count(*)::int FROM app_users, day_start WHERE created_at >= day_start.ts) AS users_today,
            (SELECT count(*)::int FROM app_users, day_start WHERE last_seen_at >= day_start.ts) AS active_today,
            (SELECT count(*)::int FROM events) AS total_events,
            (SELECT count(*)::int FROM events, day_start WHERE created_at >= day_start.ts) AS events_today
        `,
        sql`
          SELECT COALESCE(NULLIF(source, ''), 'direct') AS source, count(*)::int AS count
          FROM app_users
          GROUP BY 1
          ORDER BY 2 DESC, 1
        `,
        sql`
          SELECT type, count(*)::int AS count
          FROM events
          GROUP BY 1
          ORDER BY 2 DESC, 1
        `,
        sql`
          SELECT first_name, created_at
          FROM app_users
          ORDER BY created_at DESC
          LIMIT 10
        `,
      ],
      { readOnly: true, isolationLevel: "RepeatableRead" },
    );

    const stats: Stats = {
      ...CountsSchema.parse(counts[0]),
      by_source: BySourceSchema.parse(bySource),
      by_type: ByTypeSchema.parse(byType),
      recent_signups: RecentSchema.parse(recent),
    };
    return { ok: true, stats, generatedAt };
  } catch (err) {
    console.error("[stats]", err instanceof Error ? err.message : err);
    return { ok: false, error: "query_failed", generatedAt };
  }
}
