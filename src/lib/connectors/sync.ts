import { TokenSealError, openToken, tokenAad } from "./crypto";
import { type SyncWindow, syncWindow, tashkentDay } from "./days";
import { type CallOpts, ProviderError } from "./net";
import type { Connector, DailyRow, ItemRow, ProviderAccount } from "./providers/types";
import type { ConnectionRow } from "./repo";
import type { ConnectError } from "./types";
import { endsAt } from "./view";

/**
 * Pulls a connection's numbers into connection_metrics_daily / connection_items (pure orchestration; storage, the
 * provider and the owner message come in as deps, so it is unit-tested without a database or a network).
 *
 * - Refresh: Google mints a fresh access token from the refresh token on every run; Meta's long-lived token is
 *   used as stored until its end date, after which the connection is expired (the owner reconnects).
 * - Outcomes: expired → status 'expired' and exactly one owner message (the status move is atomic, and drops the
 *   dead tokens); access_pending / scope_missing / nothing to read → status 'error' (the card says why); rate limits
 *   and network errors keep the status. Every failure moves updated_at, and the queue waits ERROR_BACKOFF_HOURS
 *   from it (repo.dueConnections, view.needsSync), so a stuck row never holds the head of the tick's queue.
 * - A row in 'error' lists its accounts again first: Google Ads stored bare customer ids while access was pending,
 *   and the real accounts (names, managers skipped) arrive with access.
 * - `light` (the tick): the provider skips its slow extras (Instagram's per-post and per-story insights), so a run
 *   fits the tick's 5 s; the card's lazy refresh and "Yangilash" read everything.
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
  /** The accounts listed again for a row in 'error' (see above). */
  saveAccounts(id: string, account: { name: string; handle?: string }, accounts: ProviderAccount[], selected: string | null): Promise<void>;
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
  /** The tick: skip the provider's slow extras (see above). */
  light?: boolean;
}

const running = new Set<string>();

/** Errors only the owner or the team can fix: the row moves to 'error' and the card says why. */
const OWNER_FIXABLE = new Set<ConnectError>(["access_pending", "scope_missing", "not_professional", "no_ad_accounts", "no_channel"]);

/** Lists a row's accounts again; keeps the owner's choice when it is still there (and is not a test account). */
async function relist(row: ConnectionRow, connector: Connector, token: string, callOpts: CallOpts, deps: SyncDeps): Promise<ProviderAccount> {
  const profile = await connector.profile({ accessToken: token, scopes: row.scopes, subject: row.externalId }, callOpts);
  if (profile.status !== "active") throw new ProviderError(profile.error ?? "access_pending", undefined, "relist");
  const kept = profile.accounts.find((a) => a.id === row.selectedAccount && !a.test);
  const selected = kept ?? profile.accounts.find((a) => a.id === profile.selected) ?? profile.accounts[0];
  if (!selected) throw new ProviderError("sync_failed", undefined, "relist_empty");
  await deps.saveAccounts(row.id, { name: selected.name, ...(selected.handle ? { handle: selected.handle } : {}) }, profile.accounts, selected.id);
  return selected;
}

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
  if (!connector) {
    // The provider was switched off (CONNECTOR_ENABLED) or lost its credentials: note it, so the row waits its
    // backoff instead of coming back first on every run.
    await deps.markRetry(row.id, "sync_failed");
    return "skipped";
  }
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
  let account: ProviderAccount = row.accounts.find((a) => a.id === row.selectedAccount) ?? { id: row.selectedAccount, name: row.account.name };

  try {
    const token = await connector.accessToken(stored, callOpts);
    if (row.status === "error") account = await relist(row, connector, token, callOpts, deps);
    const window = windowFor(row, connector, now, opts.maxDays);
    const data = await connector.sync({ token, account, window, today: tashkentDay(now), light: opts.light }, callOpts);
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
    if (OWNER_FIXABLE.has(code)) {
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
