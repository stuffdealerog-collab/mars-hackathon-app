import { randomUUID } from "node:crypto";
import { tickAuth } from "./auth";
import { TICK_LOCK, type LockStore } from "./lock";
import { TICK_BUDGET_MS, type CronTask } from "./registry";
import { maskedMessage, runTasks, type TickReport } from "./run";

/**
 * One tick: auth, then the lock, then the registered tasks. The route (/api/cron/tick) only wires the request,
 * the env, the database and the registry into this function.
 *
 * Answers (JSON, never secrets, ids or texts):
 * - 200 { ok: true, mode: "health" }        no secret to check (CRON_SECRET unset or invalid, or not the production
 *                                           deployment, see tickSecret): nothing runs. The GitHub workflow fails on it.
 * - 401 { ok: false, error: "unauthorized" } CRON_SECRET is set and the bearer token is missing or wrong.
 * - 503 { ok: false, error }                 db_not_configured | schema_missing (run `pnpm db:migrate`) | lock_failed
 * - 200 { ok: true, skipped: "busy" }       another tick holds the lock.
 * - 200 { ok, ...TickReport }               ok is false when a task failed or timed out. Only the authorised caller sees
 *                                           it; the public GitHub log prints the summary counts, and the per-task
 *                                           results go to the database only (cron_locks.last_report).
 */

/** How long a taken lock lasts if the tick never releases it: the route's maxDuration (300 s) + 30 s. */
export const LEASE_MS = 330_000;

export type TickBody =
  | { ok: true; mode: "health" }
  | { ok: false; error: "unauthorized" | "db_not_configured" | "schema_missing" | "lock_failed" }
  | { ok: true; skipped: "busy" }
  | ({ ok: boolean } & TickReport);

export interface TickInput {
  authorization: string | null;
  secret: string | undefined;
  /** null = no database configured. */
  lock: LockStore | null;
  tasks: readonly CronTask[];
  budgetMs?: number;
  leaseMs?: number;
  now?: () => number;
  log?: (message: string) => void;
}

const isUndefinedTable = (err: unknown) => (err as { code?: unknown } | null)?.code === "42P01";

export async function tick(input: TickInput): Promise<{ status: number; body: TickBody }> {
  const log = input.log ?? ((message: string) => console.error(message));
  const auth = tickAuth(input.authorization, input.secret);
  if (auth === "health") return { status: 200, body: { ok: true, mode: "health" } };
  if (auth === "unauthorized") return { status: 401, body: { ok: false, error: "unauthorized" } };
  if (!input.lock) return { status: 503, body: { ok: false, error: "db_not_configured" } };

  const holder = randomUUID();
  let acquired: boolean;
  try {
    acquired = await input.lock.acquire(TICK_LOCK, holder, input.leaseMs ?? LEASE_MS);
  } catch (err) {
    log(`[cron] lock failed: ${maskedMessage(err)}`);
    return { status: 503, body: { ok: false, error: isUndefinedTable(err) ? "schema_missing" : "lock_failed" } };
  }
  if (!acquired) return { status: 200, body: { ok: true, skipped: "busy" } };

  const report = await runTasks(input.tasks, { budgetMs: input.budgetMs ?? TICK_BUDGET_MS, now: input.now, log });
  try {
    await input.lock.release(TICK_LOCK, holder, report, { keepLease: report.timedOut > 0 });
  } catch (err) {
    // The lease runs out on its own (LEASE_MS); the next tick after that proceeds.
    log(`[cron] lock release failed: ${maskedMessage(err)}`);
  }
  return { status: 200, body: { ok: report.failed === 0, ...report } };
}
