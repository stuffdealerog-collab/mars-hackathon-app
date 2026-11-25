import "server-only";
import { cacheLife } from "next/cache";
import { getSql, isDbConfigured, type Sql } from "./db";
import { statsTeamIds } from "./stats";
import { peopleCountable, readTractionRow, type Traction } from "./traction-model";

export type { Traction } from "./traction-model";

/**
 * The public traction counter (on the landing and /about, and GET /api/public/traction): how many people have tried
 * Mercat and how many channels it has analysed. Aggregate counts only: no query here returns an id, a name, a channel,
 * a visitor key or an IP, and readTractionRow keeps nothing but two numbers.
 *
 * People is a floor, never a ceiling, so the page can say "more than":
 *   - every app_users row (someone who opened the bot or the Mini App), minus the team (STATS_TEAM_TG_IDS) and minus
 *     the owners' customers (a user who only came through a tracked link in a plan post and owns no brand, as /stats
 *     leaves them out);
 *   - without STATS_TEAM_TG_IDS a production build does not count people at all (peopleCountable): the team would be
 *     in the number;
 *   - anonymous web visitors are not added: their key changes every day, so one person coming back would count again,
 *     and someone who used the web and then the bot would count twice. The page's note says they are left out.
 * Channels = distinct non-empty brands.channel, whoever ran them.
 */

/** app_users.source of a customer who came through a plan post's link (new rows: "plan"; old rows: "<tag>_<n>"). */
const CUSTOMER_SOURCE_RE = "^plan$|^[a-z0-9]{6}_[0-9]{1,2}$";
/** A slow database never holds a page or the route open for long: 3 s per statement (in readTraction), 5 s per request. */
const FETCH_TIMEOUT_MS = 5000;

export function tractionQuery(sql: Sql, teamIds: number[]) {
  const team = teamIds.map(String);
  return sql`
    SELECT
      (SELECT count(*)::int FROM app_users u
        WHERE u.telegram_id <> ALL(${team}::bigint[])
          AND (coalesce(u.source, '') !~ ${CUSTOMER_SOURCE_RE}
               OR EXISTS (SELECT 1 FROM brands b WHERE b.owner_telegram_id = u.telegram_id))) AS telegram_people,
      (SELECT count(DISTINCT lower(b.channel))::int FROM brands b
        WHERE coalesce(b.channel, '') <> '') AS channels
  `;
}

/**
 * One read-only round trip with a statement timeout; null when the row is missing. Throws on a database error (the
 * caller decides what to show), so an error is never cached as an answer.
 */
export async function readTraction(sql: Sql, teamIds: number[], { people = true }: { people?: boolean } = {}): Promise<Traction | null> {
  const [, rows] = await sql.transaction(
    // SET takes no bind parameters, so the timeout is a literal.
    [sql`SET LOCAL statement_timeout = '3s'`, tractionQuery(sql, teamIds)],
    { readOnly: true, fetchOptions: { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) } },
  );
  return readTractionRow(rows?.[0], { people });
}

/**
 * Cached for ten minutes: the counter is a public page's line, never a reason to hit the database per visit. A database
 * error is thrown, not returned: "use cache" keeps only answers, so the next visit asks again (readPublicTraction
 * holds a failure for a minute).
 */
export async function getTraction(): Promise<Traction | null> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 600, expire: 3600 });

  if (!isDbConfigured()) return null;
  const team = statsTeamIds();
  return readTraction(getSql(), team, { people: peopleCountable(team, process.env.NODE_ENV) });
}

/** How long a failed read keeps the counter hidden before the database is asked again. */
export const FAILURE_HOLD_MS = 60_000;
const failure = { at: Number.NEGATIVE_INFINITY };

/** Forgets the last failure (tests). */
export const forgetTractionFailure = () => {
  failure.at = Number.NEGATIVE_INFINITY;
};

/**
 * The counts for a page or the route, never an error: null when there is nothing to show (no database, a failure in
 * the last minute, or, with `waitMs`, an answer slower than that: the read goes on and fills the cache for the next
 * visit). Call it after `connection()`: it reads the clock.
 */
export async function readPublicTraction({
  waitMs,
  now = Date.now,
  load = getTraction,
}: { waitMs?: number; now?: () => number; load?: () => Promise<Traction | null> } = {}): Promise<Traction | null> {
  if (now() - failure.at < FAILURE_HOLD_MS) return null;
  const pending = load().catch((err: unknown) => {
    failure.at = now();
    console.error("[traction]", err instanceof Error ? err.message : err);
    return null;
  });
  if (!waitMs) return pending;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), waitMs);
  });
  try {
    return await Promise.race([pending, late]);
  } finally {
    clearTimeout(timer);
  }
}
