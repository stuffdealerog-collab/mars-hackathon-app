import { TokenSealError, openToken, tokenAad } from "./crypto";
import { type SyncWindow, syncWindow, tashkentDay } from "./days";
import { ProviderError } from "./net";
import type { Connector, DailyRow, ItemRow } from "./providers/types";
import type { ConnectionRow } from "./repo";
import type { ConnectError } from "./types";
import { endsAt } from "./view";

/**
 * Pulls a connection's numbers into connection_metrics_daily / connection_items (pure orchestration; storage, the
 * provider and the owner message come in as deps, so it is unit-tested without a database or a network).
 *
 * - Refresh: Google mints a fresh access token from the refresh token on every run; Meta's long-lived token is
 *   used as stored until its end date, after which the connection is expired (the owner reconnects).
 * - Outcomes: expired → status 'expired' and exactly one owner message (the status move is atomic);
 *   access_pending / scope_missing → status 'error' (retried daily, the card says why); rate limits and network
 *   errors keep the status and are retried on the next run.
 * - Windows: a first sync backfills 28 days; later syncs re-read the provider's settle days (attribution and
 *   analytics still change) plus anything missed. `maxDays` caps a run (the tick's small budget).
 */

export type SyncOutcome = "synced" | "expired" | "error" | "retry" | "skipped";

export interface SyncDeps {
  load(id: string): Promise<ConnectionRow | null>;
  connector(row: ConnectionRow): Connector | null;
  keys: readonly Buffer[];
  saveDaily(id: string, rows: DailyRow[]): Promise<void>;
  saveItems(id: string, rows: ItemRow[]): Promise<void>;
  markSynced(id: string): Promise<void>;
  markRetry(id: string, code: ConnectError): Promise<void>;
  /** True only when the status really changed. */
  moveStatus(id: string, status: "expired" | "error", code: ConnectError): Promise<boolean>;
  /** The one message on the move to expired. */
  notifyExpired(row: ConnectionRow): Promise<void>;
  logEvent(row: ConnectionRow, type: string, props: Record<string, unknown>): Promise<void>;
  log?(message: string): void;
}

export interface SyncOptions {
  /** Epoch ms after which no new provider call starts. */
  deadline: number;
  now?: Date;
  signal?: AbortSignal;
  maxDays?: number;
}

const running = new Set<string>();

export function windowFor(row: Pick<ConnectionRow, "lastSyncAt">, connector: Pick<Connector, "settleDays">, now: Date, maxDays?: number): SyncWindow {
  const today = tashkentDay(now);
  const w = syncWindow(today, row.lastSyncAt ? tashkentDay(row.lastSyncAt) : null, connector.settleDays);
  if (maxDays && maxDays > 0) {
    const earliest = new Date(Date.parse(`${w.until}T00:00:00Z`) - (maxDays - 1) * 86_400_000).toISOString().slice(0, 10);
    if (w.since < earliest) return { since: earliest, until: w.until };
  }
  return w;
}

function unseal(row: ConnectionRow, keys: readonly Buffer[]): { access: string | null; refresh: string | null } {
  return {
    access: row.accessTokenEnc ? openToken(row.accessTokenEnc, tokenAad(row.id, "access"), keys) : null,
    refresh: row.refreshTokenEnc ? openToken(row.refreshTokenEnc, tokenAad(row.id, "refresh"), keys) : null,
  };
}

export async function syncConnection(id: string, opts: SyncOptions, deps: SyncDeps): Promise<SyncOutcome> {
  // One sync per connection per instance: the card's lazy refresh and the tick may meet.
  if (running.has(id)) return "skipped";
  running.add(id);
  try {
    return await runSync(id, opts, deps);
  } finally {
    running.delete(id);
  }
}

async function runSync(id: string, opts: SyncOptions, deps: SyncDeps): Promise<SyncOutcome> {
  const log = deps.log ?? ((m: string) => console.warn(m));
  const row = await deps.load(id);
  if (!row || row.status === "expired" || row.status === "empty" || !row.selectedAccount) return "skipped";
  const connector = deps.connector(row);
  if (!connector) return "skipped"; // the provider was switched off (CONNECTOR_ENABLED) or lost its credentials
  const now = opts.now ?? new Date();

  const expire = async (code: ConnectError): Promise<SyncOutcome> => {
    if (await deps.moveStatus(row.id, "expired", code)) {
      await deps.notifyExpired(row).catch(() => undefined);
      await deps.logEvent(row, "connect_expired", { provider: row.provider, code }).catch(() => undefined);
    }
    return "expired";
  };

  const ends = endsAt(row.tokenExpiresAt, row.dataAccessExpiresAt);
  if (ends && ends.getTime() <= now.getTime()) return expire("expired");

  let stored: { access: string | null; refresh: string | null };
  try {
    stored = unseal(row, deps.keys);
  } catch (err) {
    // The key changed or was rotated out: the token cannot be read again, the owner must reconnect.
    if (err instanceof TokenSealError) return expire("expired");
    throw err;
  }

  const left = opts.deadline - Date.now();
  if (left < 1_000) return "skipped";
  const budget = AbortSignal.timeout(left);
  const callOpts = { signal: opts.signal ? AbortSignal.any([opts.signal, budget]) : budget, timeoutMs: Math.min(10_000, left) };
  const account = row.accounts.find((a) => a.id === row.selectedAccount) ?? { id: row.selectedAccount, name: row.account.name };

  try {
    const token = await connector.accessToken(stored, callOpts);
    const window = windowFor(row, connector, now, opts.maxDays);
    const data = await connector.sync({ token, account, window, today: tashkentDay(now) }, callOpts);
    await deps.saveDaily(row.id, data.daily);
    await deps.saveItems(row.id, data.items);
    await deps.markSynced(row.id);
    return "synced";
  } catch (err) {
    const code: ConnectError = err instanceof ProviderError ? err.code : "sync_failed";
    // Provider errors carry codes only; anything else (the database) is logged by name and message, never a token.
    log(`[connectors] ${row.provider} sync failed: ${err instanceof Error ? err.message : String(err)}`);
    if (code === "expired") return expire(code);
    await deps.logEvent(row, "connect_sync_failed", { provider: row.provider, code }).catch(() => undefined);
    if (code === "access_pending" || code === "scope_missing") {
      await deps.moveStatus(row.id, "error", code);
      return "error";
    }
    await deps.markRetry(row.id, code === "rate_limited" ? code : "sync_failed");
    return "retry";
  }
}

export interface DueRunControl {
  signal?: AbortSignal;
  timeLeft(): number;
}

/** The tick task's budget (task.ts): 5 s taken from post-metrics, so every tick budget still sums to 250 s. */
export const CONNECTORS_SYNC_BUDGET_MS = 5_000;

/** Minimum time a connection's daily sync needs (one or two provider round trips). */
export const MIN_SYNC_MS = 3_000;

/**
 * The tick's step: syncs due connections one after another while the budget allows. Counts only.
 */
export async function runDueSync(
  due: () => Promise<string[]>,
  sync: (id: string, deadline: number) => Promise<SyncOutcome>,
  ctl: DueRunControl,
): Promise<Record<SyncOutcome, number>> {
  const counts: Record<SyncOutcome, number> = { synced: 0, expired: 0, error: 0, retry: 0, skipped: 0 };
  if (ctl.signal?.aborted || ctl.timeLeft() < MIN_SYNC_MS) return counts;
  for (const id of await due()) {
    if (ctl.signal?.aborted || ctl.timeLeft() < MIN_SYNC_MS) break;
    counts[await sync(id, Date.now() + ctl.timeLeft() - 300)]++;
  }
  return counts;
}
