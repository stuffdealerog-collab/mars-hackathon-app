import "server-only";
import { cacheLife } from "next/cache";
import { getSql, isDbConfigured, type Sql } from "./db";
import { statsTeamIds } from "./stats";
import { readTractionRow, type Traction } from "./traction-model";

export type { Traction } from "./traction-model";

/**
 * The public traction counter (GET /api/public/traction, shown on /about and the landing): how many people have tried
 * Mercat and how many channels it has analysed. Aggregate counts only: no query here returns an id, a name, a channel,
 * a visitor key or an IP, and readTractionRow keeps nothing but two numbers.
 *
 * People = Telegram users (bot or Mini App) + anonymous web visitors who used the Studio:
 *   - Telegram: every app_users row, minus the team (STATS_TEAM_TG_IDS, when set) and minus the owners' customers (a
 *     user who only came through a tracked link in a plan post and owns no brand, as /stats leaves them out);
 *   - web: distinct daily visitor keys on product events (not page views, not error answers, not bookkeeping) from
 *     production. Visitor keys exist only since 2026-11-25 evening and change every day, so a returning web visitor
 *     counts once per day, and someone who used the web and then the bot counts twice. The page shows the total
 *     rounded down with "more than" (about/traction.ts), which absorbs that.
 * Channels = distinct non-empty brands.channel, whoever ran them.
 */

/** Events that are bookkeeping or an error answer, not something a person did with the product. */
const NOT_USE = ["page_view", "api_error", "llm_usage", "claude_run", "visual_analysis"];
/** app_users.source of a customer who came through a plan post's link (new rows: "plan"; old rows: "<tag>_<n>"). */
const CUSTOMER_SOURCE_RE = "^plan$|^[a-z0-9]{6}_[0-9]{1,2}$";

export function tractionQuery(sql: Sql, teamIds: number[]) {
  const team = teamIds.map(String);
  return sql`
    SELECT
      (SELECT count(*)::int FROM app_users u
        WHERE u.telegram_id <> ALL(${team}::bigint[])
          AND (coalesce(u.source, '') !~ ${CUSTOMER_SOURCE_RE}
               OR EXISTS (SELECT 1 FROM brands b WHERE b.owner_telegram_id = u.telegram_id))) AS telegram_people,
      (SELECT count(DISTINCT e.props->>'visitor')::int FROM events e
        WHERE e.telegram_id IS NULL
          AND e.props->>'visitor' IS NOT NULL
          AND e.type <> ALL(${NOT_USE}::text[])
          AND coalesce(e.props->>'surface', 'web') = 'web'
          AND (e.props->>'env' IS DISTINCT FROM 'dev')) AS web_people,
      (SELECT count(DISTINCT lower(b.channel))::int FROM brands b
        WHERE coalesce(b.channel, '') <> '') AS channels
  `;
}

/** One read-only round trip; null when the database is off or the query fails (the page then hides the counter). */
export async function readTraction(sql: Sql, teamIds: number[]): Promise<Traction | null> {
  const [rows] = await sql.transaction([tractionQuery(sql, teamIds)], { readOnly: true });
  return readTractionRow(rows?.[0]);
}

/** Cached for ten minutes: the counter is a public page's line, never a reason to hit the database per visit. */
export async function getTraction(): Promise<Traction | null> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 600, expire: 3600 });

  if (!isDbConfigured()) return null;
  try {
    return await readTraction(getSql(), statsTeamIds());
  } catch (err) {
    console.error("[traction]", err instanceof Error ? err.message : err);
    return null;
  }
}
