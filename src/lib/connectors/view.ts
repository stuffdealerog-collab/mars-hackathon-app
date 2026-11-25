import { addDays } from "./days";
import type { ProviderAccount } from "./providers/types";
import { type DayMetrics, weekSummary } from "./summary";
import { type ConnectionStatus, type ConnectionView, type ConnectorId, type ConnectorMode, ERROR_BACKOFF_HOURS, isConnectError } from "./types";

/**
 * A stored connection → what the card sees (pure). Never a token, a scope list, the provider's user id or an error
 * message: only the display name, the accounts to choose from, dates, the week's numbers and a stable error code.
 */

export interface ViewInput {
  id: string;
  provider: ConnectorId;
  mode: ConnectorMode;
  status: string;
  account: { name: string; handle?: string };
  accounts: ProviderAccount[];
  selectedAccount: string | null;
  tokenExpiresAt: Date | null;
  dataAccessExpiresAt: Date | null;
  lastError: string | null;
  lastSyncAt: Date | null;
  createdAt: Date;
}

const STATUSES = new Set<ConnectionStatus>(["active", "expired", "error", "empty"]);

/** The earlier of two end dates (Meta: the token's and data access's). */
export function endsAt(a: Date | null, b: Date | null): Date | null {
  if (a && b) return a < b ? a : b;
  return a ?? b;
}

export function toView(row: ViewInput, daily: (DayMetrics & { accountId: string })[], today: string): ConnectionView {
  const selected = row.accounts.find((a) => a.id === row.selectedAccount);
  const shown = selected ?? row.account;
  const since = addDays(today, -8);
  const mine = daily.filter((d) => d.accountId === (row.selectedAccount ?? "") && d.day >= since);
  const status: ConnectionStatus = STATUSES.has(row.status as ConnectionStatus) ? (row.status as ConnectionStatus) : "error";
  const ends = endsAt(row.tokenExpiresAt, row.dataAccessExpiresAt);
  return {
    id: row.id,
    provider: row.provider,
    mode: row.mode,
    status,
    account: { name: shown.name, ...(shown.handle ? { handle: shown.handle } : {}) },
    accounts:
      row.accounts.length > 1
        ? row.accounts.map((a) => ({ id: a.id, name: a.name, ...(a.handle ? { handle: a.handle } : {}), ...(a.currency ? { currency: a.currency } : {}), ...(a.test ? { test: true } : {}) }))
        : [],
    selectedAccountId: row.selectedAccount,
    connectedAt: row.createdAt.toISOString(),
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    expiresAt: ends?.toISOString() ?? null,
    week: status === "active" || status === "error" ? weekSummary(row.provider, mine, today) : [],
    error: isConnectError(row.lastError) ? row.lastError : null,
  };
}

export type SyncCandidate = Pick<ViewInput, "status" | "lastSyncAt" | "selectedAccount" | "lastError"> & { updatedAt?: Date | null };

/**
 * Whether a connection's numbers should be pulled now: older than `hours` (or never pulled), and not stuck on
 * something only the owner can fix (a permission left unticked: only a reconnect helps). A failed attempt waits
 * ERROR_BACKOFF_HOURS from that failure. The tick's queue (repo.dueConnections) applies the same rule in SQL.
 */
export function needsSync(row: SyncCandidate, now: Date, hours: number): boolean {
  if (!row.selectedAccount || (row.status !== "active" && row.status !== "error")) return false;
  if (row.lastError === "scope_missing") return false;
  if (row.lastError && row.updatedAt && now.getTime() - row.updatedAt.getTime() < ERROR_BACKOFF_HOURS * 3_600_000) return false;
  return !row.lastSyncAt || now.getTime() - row.lastSyncAt.getTime() > hours * 3_600_000;
}

/** Connections whose numbers are older than `hours` and may be refreshed lazily when the owner opens the card. */
export const isStale = (row: SyncCandidate, now: Date, hours = 6): boolean => needsSync(row, now, hours);
