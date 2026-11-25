import type { Sql } from "@/lib/db";
import type { TickReport } from "./run";

/**
 * The tick's lock: two ticks (GitHub every 10 minutes, Vercel once a day, a manual run) never overlap.
 *
 * Why a lease row and not a session advisory lock alone: the Neon HTTP driver sends every query on its own, possibly
 * on a different pooled backend (PgBouncer in transaction mode), so a `pg_try_advisory_lock` taken by one query could
 * not be held across the tick, and the unlock could land on another backend and leak it. So the lock is a row in
 * `cron_locks` with an expiry (`locked_until`), taken with one atomic statement inside a transaction that holds
 * `pg_advisory_xact_lock` (the advisory lock form that works over HTTP; it serialises the takeovers).
 *
 * - acquire: insert the row, or take it over only when its lease ran out. True = this tick holds the lock.
 * - release: only the holder can release; it also stores the tick's summary (counts only) as `last_report`, which
 *   doubles as the ticker's heartbeat (`SELECT acquired_at, released_at, last_report FROM cron_locks`).
 * - keepLease: when a task timed out it may still be running, so the lease is left to run out instead
 *   (LEASE_MS outlives the route's maxDuration, after which the function is gone).
 */

export const TICK_LOCK = "tick";

/** pg_advisory_xact_lock key for lock takeovers (budget-core uses 7_310_524_002, media quotas 7_310_524_001). */
export const CRON_ADVISORY_KEY = 7_310_524_003;

export interface LockStore {
  acquire(name: string, holder: string, leaseMs: number): Promise<boolean>;
  release(name: string, holder: string, report: TickReport, opts: { keepLease: boolean }): Promise<void>;
}

export function pgLock(sql: Sql): LockStore {
  return {
    async acquire(name, holder, leaseMs) {
      const seconds = Math.max(1, Math.ceil(leaseMs / 1000));
      const [, rows] = await sql.transaction([
        sql`SELECT pg_advisory_xact_lock(${CRON_ADVISORY_KEY})`,
        sql`INSERT INTO cron_locks AS l (name, holder, locked_until, acquired_at, released_at)
            VALUES (${name}, ${holder}, now() + ${seconds}::int * interval '1 second', now(), NULL)
            ON CONFLICT (name) DO UPDATE
              SET holder = EXCLUDED.holder,
                  locked_until = EXCLUDED.locked_until,
                  acquired_at = EXCLUDED.acquired_at,
                  released_at = NULL
              WHERE l.locked_until <= now()
            RETURNING holder`,
      ]);
      return Array.isArray(rows) && rows.length > 0;
    },

    async release(name, holder, report, { keepLease }) {
      const json = JSON.stringify(report);
      if (keepLease) {
        await sql`UPDATE cron_locks SET last_report = ${json}::jsonb WHERE name = ${name} AND holder = ${holder}`;
      } else {
        await sql`UPDATE cron_locks SET locked_until = now(), released_at = now(), last_report = ${json}::jsonb
                  WHERE name = ${name} AND holder = ${holder}`;
      }
    },
  };
}
