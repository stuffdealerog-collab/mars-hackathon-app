import "server-only";
import { cacheLife } from "next/cache";
import { getSql, isDbConfigured, type Sql } from "./db";
import {
  parseTeamIds,
  shapeFeed,
  shapeFunnel,
  shapeNorthStar,
  shapeOverview,
  shapeSources,
  shapeUsers,
  type Stats,
  type StatsOptions,
  type StatsQuery,
  type StatsResult,
} from "./stats-model";
import {
  feedQuery,
  funnelQuery,
  hasPublishedAtQuery,
  landingSourcesQuery,
  northStarQuery,
  overviewQuery,
  telegramSourcesQuery,
  usersQuery,
} from "./stats-queries";

export { STATS_TIMEZONE } from "./stats-model";
export type { Stats, StatsResult } from "./stats-model";

/** Team members' Telegram ids, hidden from /stats unless asked (server-only env, never shown). */
export const statsTeamIds = (env: Record<string, string | undefined> = process.env) => parseTeamIds(env.STATS_TEAM_TG_IDS);

/** Once posts.published_at exists it stays: remembered per instance so the check runs once. */
let publishedAtSeen = false;

/**
 * Runs every /stats query in one read-only snapshot (one HTTP round trip), plus the north star once
 * posts.published_at exists. Pure of the cache so the live check and tests can call it with any client.
 */
export async function readStats(sql: Sql, options: StatsOptions): Promise<Stats> {
  const [overview, funnel, landing, telegram, users, feed, has] = await sql.transaction(
    [
      overviewQuery(sql, options),
      funnelQuery(sql, options),
      landingSourcesQuery(sql, options),
      telegramSourcesQuery(sql, options),
      usersQuery(sql, options),
      feedQuery(sql, options),
      hasPublishedAtQuery(sql),
    ],
    { readOnly: true, isolationLevel: "RepeatableRead" },
  );
  const hasPublishedAt = publishedAtSeen || (has[0] as { has_published_at?: unknown } | undefined)?.has_published_at === true;
  let northStar: unknown[] | null = null;
  if (hasPublishedAt) {
    publishedAtSeen = true;
    [northStar] = await sql.transaction([northStarQuery(sql, options)], { readOnly: true });
  }
  return {
    query: { range: options.range, includeDev: options.includeDev, includeTeam: options.includeTeam },
    teamConfigured: options.teamIds.length > 0,
    northStar: shapeNorthStar(hasPublishedAt, northStar),
    overview: shapeOverview(overview),
    funnel: shapeFunnel(funnel),
    landingSources: shapeSources(landing),
    telegramSources: shapeSources(telegram),
    users: shapeUsers(users),
    feed: shapeFeed(feed),
  };
}

/**
 * Aggregates for /stats (password-protected, see stats-access.ts), cached for ~10 s per option set. Nothing polls:
 * the database is read only when someone opens the page or presses Refresh.
 */
export async function getStats(query: StatsQuery): Promise<StatsResult> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 10, expire: 300 });

  const generatedAt = new Date().toISOString();
  if (!isDbConfigured()) return { ok: false, error: "not_configured", generatedAt };

  try {
    const stats = await readStats(getSql(), { ...query, teamIds: statsTeamIds() });
    return { ok: true, stats, generatedAt };
  } catch (err) {
    console.error("[stats]", err instanceof Error ? err.message : err);
    return { ok: false, error: "query_failed", generatedAt };
  }
}
