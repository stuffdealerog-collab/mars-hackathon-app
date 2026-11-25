import "server-only";
import { getSql } from "../db";
import type { DailyRow, ItemRow, ProviderAccount } from "./providers/types";
import { type ConnectorId, type ConnectorMode, ERROR_BACKOFF_HOURS, EXPIRED_KEEP_DAYS, FAMILY_IDS, isConnectorId, STALE_DATA_DAYS } from "./types";

/**
 * Connector storage (tagged-template SQL only; tables in db/schema.sql). Sealed tokens are read only by sync.ts and
 * service.ts and never leave the server. A connection belongs to the Telegram owner; brand_id only pins it for
 * display. Disconnecting deletes the row, and its numbers go with it (ON DELETE CASCADE).
 */

export interface ConnectionRow {
  id: string;
  ownerTelegramId: number;
  brandId: string | null;
  provider: ConnectorId;
  mode: ConnectorMode;
  externalId: string;
  account: { name: string; handle?: string };
  accounts: ProviderAccount[];
  selectedAccount: string | null;
  scopes: string[];
  accessTokenEnc: string | null;
  refreshTokenEnc: string | null;
  tokenExpiresAt: Date | null;
  dataAccessExpiresAt: Date | null;
  status: string;
  lastError: string | null;
  lastSyncAt: Date | null;
  /** Moves on every write, including a failed sync: the retry backoff counts from it. */
  updatedAt: Date | null;
  createdAt: Date;
}

export interface StateRow {
  provider: string;
  ownerTelegramId: number;
  brandId: string | null;
  returnTo: string;
  pkceVerifierEnc: string | null;
  expiresAt: Date;
}

type Raw = Record<string, unknown>;

const date = (v: unknown): Date | null => (v == null ? null : v instanceof Date ? v : new Date(String(v)));
const json = <T>(v: unknown, fallback: T): T => {
  if (v == null) return fallback;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
};

function toRow(r: Raw): ConnectionRow | null {
  const provider = r.provider;
  if (!isConnectorId(provider)) return null;
  return {
    id: String(r.id),
    ownerTelegramId: Number(r.owner_telegram_id),
    brandId: r.brand_id ? String(r.brand_id) : null,
    provider,
    mode: r.mode === "live" ? "live" : "test",
    externalId: String(r.external_id),
    account: json(r.account, { name: "" }),
    accounts: json(r.accounts, [] as ProviderAccount[]),
    selectedAccount: r.selected_account ? String(r.selected_account) : null,
    scopes: Array.isArray(r.scopes) ? (r.scopes as string[]) : [],
    accessTokenEnc: r.access_token_enc ? String(r.access_token_enc) : null,
    refreshTokenEnc: r.refresh_token_enc ? String(r.refresh_token_enc) : null,
    tokenExpiresAt: date(r.token_expires_at),
    dataAccessExpiresAt: date(r.data_access_expires_at),
    status: String(r.status ?? "active"),
    lastError: r.last_error ? String(r.last_error) : null,
    lastSyncAt: date(r.last_sync_at),
    updatedAt: date(r.updated_at),
    createdAt: date(r.created_at) ?? new Date(0),
  };
}

const rows = (list: unknown) => (list as Raw[]).map(toRow).filter((r): r is ConnectionRow => r !== null);

/* ------------------------------------------------------------- OAuth state */

export async function insertState(s: {
  state: string;
  provider: ConnectorId;
  ownerTelegramId: number;
  brandId: string | null;
  returnTo: string;
  pkceVerifierEnc: string | null;
  expiresAt: Date;
}): Promise<void> {
  const sql = getSql();
  // Old rows (used or not) are useless after a day: keep the table small.
  await sql`DELETE FROM connect_oauth_states WHERE created_at < now() - interval '1 day'`;
  await sql`
    INSERT INTO connect_oauth_states (state, provider, owner_telegram_id, brand_id, return_to, pkce_verifier_enc, expires_at)
    VALUES (${s.state}, ${s.provider}, ${s.ownerTelegramId}, ${s.brandId}, ${s.returnTo}, ${s.pkceVerifierEnc}, ${s.expiresAt.toISOString()})`;
}

/** Takes a state once: only an unused, unexpired row comes back, and it is marked used in the same statement. */
export async function consumeState(state: string): Promise<StateRow | null> {
  const list = (await getSql()`
    UPDATE connect_oauth_states SET used_at = now()
    WHERE state = ${state} AND used_at IS NULL AND expires_at > now()
    RETURNING provider, owner_telegram_id, brand_id, return_to, pkce_verifier_enc, expires_at`) as Raw[];
  const r = list[0];
  if (!r) return null;
  return {
    provider: String(r.provider),
    ownerTelegramId: Number(r.owner_telegram_id),
    brandId: r.brand_id ? String(r.brand_id) : null,
    returnTo: String(r.return_to ?? "studio"),
    pkceVerifierEnc: r.pkce_verifier_enc ? String(r.pkce_verifier_enc) : null,
    expiresAt: date(r.expires_at) ?? new Date(0),
  };
}

/* ------------------------------------------------------------- connections */

export async function findConnection(ownerTelegramId: number, provider: ConnectorId, externalId: string): Promise<ConnectionRow | null> {
  const list = await getSql()`
    SELECT * FROM connections WHERE owner_telegram_id = ${ownerTelegramId} AND provider = ${provider} AND external_id = ${externalId}`;
  return rows(list)[0] ?? null;
}

export async function getConnection(id: string): Promise<ConnectionRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return rows(await getSql()`SELECT * FROM connections WHERE id = ${id}`)[0] ?? null;
}

/** The owner's connections shown for a brand: pinned to it, or to no brand. */
export async function listConnections(ownerTelegramId: number, brandId: string | null): Promise<ConnectionRow[]> {
  return rows(await getSql()`
    SELECT * FROM connections
    WHERE owner_telegram_id = ${ownerTelegramId} AND revoked_at IS NULL AND (brand_id IS NULL OR brand_id = ${brandId})
    ORDER BY created_at`);
}

/** Other connections of the same owner and provider family that share one grant at the provider. */
export async function siblingCount(ownerTelegramId: number, providers: ConnectorId[], exceptId: string): Promise<number> {
  const list = (await getSql()`
    SELECT count(*)::int AS n FROM connections
    WHERE owner_telegram_id = ${ownerTelegramId} AND provider = ANY(${providers}::text[]) AND id <> ${exceptId}`) as Raw[];
  return Number(list[0]?.n ?? 0);
}

export interface ConnectionWrite {
  id: string;
  ownerTelegramId: number;
  brandId: string | null;
  provider: ConnectorId;
  mode: ConnectorMode;
  externalId: string;
  account: { name: string; handle?: string };
  accounts: ProviderAccount[];
  selectedAccount: string | null;
  scopes: string[];
  accessTokenEnc: string | null;
  refreshTokenEnc: string | null;
  tokenExpiresAt: Date | null;
  dataAccessExpiresAt: Date | null;
  status: string;
  lastError: string | null;
}

/** Insert or refresh (a reconnect) by owner + provider + external id. Returns the row id that holds the tokens. */
export async function upsertConnection(c: ConnectionWrite): Promise<string> {
  const list = (await getSql()`
    INSERT INTO connections AS c (id, owner_telegram_id, brand_id, provider, mode, external_id, account, accounts, selected_account, scopes,
      access_token_enc, refresh_token_enc, token_expires_at, data_access_expires_at, refreshed_at, status, last_error, updated_at, revoked_at)
    VALUES (${c.id}, ${c.ownerTelegramId}, ${c.brandId}, ${c.provider}, ${c.mode}, ${c.externalId}, ${JSON.stringify(c.account)}::jsonb,
      ${JSON.stringify(c.accounts)}::jsonb, ${c.selectedAccount}, ${c.scopes}::text[], ${c.accessTokenEnc}, ${c.refreshTokenEnc},
      ${c.tokenExpiresAt?.toISOString() ?? null}, ${c.dataAccessExpiresAt?.toISOString() ?? null}, now(), ${c.status}, ${c.lastError}, now(), NULL)
    ON CONFLICT (owner_telegram_id, provider, external_id) DO UPDATE SET
      brand_id = COALESCE(EXCLUDED.brand_id, c.brand_id),
      mode = EXCLUDED.mode,
      account = EXCLUDED.account,
      accounts = EXCLUDED.accounts,
      selected_account = EXCLUDED.selected_account,
      scopes = EXCLUDED.scopes,
      access_token_enc = EXCLUDED.access_token_enc,
      refresh_token_enc = EXCLUDED.refresh_token_enc,
      token_expires_at = EXCLUDED.token_expires_at,
      data_access_expires_at = EXCLUDED.data_access_expires_at,
      refreshed_at = now(),
      status = EXCLUDED.status,
      last_error = EXCLUDED.last_error,
      updated_at = now(),
      revoked_at = NULL
    RETURNING id`) as Raw[];
  return String(list[0].id);
}

export async function saveSealedTokens(id: string, accessTokenEnc: string | null, refreshTokenEnc: string | null): Promise<void> {
  await getSql()`UPDATE connections SET access_token_enc = ${accessTokenEnc}, refresh_token_enc = ${refreshTokenEnc}, updated_at = now() WHERE id = ${id}`;
}

export async function setSelectedAccount(id: string, accountId: string): Promise<void> {
  await getSql()`UPDATE connections SET selected_account = ${accountId}, updated_at = now() WHERE id = ${id}`;
}

/** The accounts a connection can read, listed again once the provider gives access (Google Ads after "access pending"). */
export async function saveAccounts(id: string, account: { name: string; handle?: string }, accounts: ProviderAccount[], selected: string | null): Promise<void> {
  await getSql()`
    UPDATE connections SET account = ${JSON.stringify(account)}::jsonb, accounts = ${JSON.stringify(accounts)}::jsonb,
      selected_account = ${selected}, updated_at = now()
    WHERE id = ${id}`;
}

/**
 * The first name of the Telegram user a connection belongs to, for the Mini App's return page: whoever signed in at
 * the provider sees which Mercat account received the connection.
 */
export async function connectionOwnerName(id: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const list = (await getSql()`
    SELECT u.first_name FROM connections c JOIN app_users u ON u.telegram_id = c.owner_telegram_id WHERE c.id = ${id}`) as Raw[];
  const name = list[0]?.first_name;
  return typeof name === "string" && name.trim() ? name.trim().slice(0, 64) : null;
}

/** Deletes a connection and (cascade) every number pulled through it. */
export async function deleteConnection(id: string): Promise<void> {
  await getSql()`DELETE FROM connections WHERE id = ${id}`;
}

/** Removes the owner's other "nothing to read" rows of a provider once a real connection exists. */
export async function deleteEmptyRows(ownerTelegramId: number, provider: ConnectorId, keepId: string): Promise<void> {
  await getSql()`
    DELETE FROM connections WHERE owner_telegram_id = ${ownerTelegramId} AND provider = ${provider} AND status = 'empty' AND id <> ${keepId}`;
}

/** Meta deauthorize / data deletion: every Instagram and Meta ads connection of that app-scoped user. */
export async function deleteMetaUserConnections(appScopedUserId: string): Promise<{ ownerTelegramId: number; provider: string }[]> {
  const list = (await getSql()`
    DELETE FROM connections WHERE provider IN ('instagram', 'meta_ads') AND external_id = ${appScopedUserId}
    RETURNING owner_telegram_id, provider`) as Raw[];
  return list.map((r) => ({ ownerTelegramId: Number(r.owner_telegram_id), provider: String(r.provider) }));
}

/** A successful sync: numbers fresh, no error. */
export async function markSynced(id: string): Promise<void> {
  await getSql()`UPDATE connections SET status = 'active', last_error = NULL, last_sync_at = now(), updated_at = now() WHERE id = ${id}`;
}

/** A failed sync that may work next time (rate limit, network): keeps the status, notes the code. */
export async function markSoftError(id: string, code: string): Promise<void> {
  await getSql()`UPDATE connections SET last_error = ${code}, updated_at = now() WHERE id = ${id}`;
}

/**
 * Moves a connection to a new status. Returns true only when the status really changed, so the "connection ended"
 * message goes out exactly once. A move to 'expired' also drops the sealed tokens: the grant is dead, there is
 * nothing left to revoke, and a dead credential is not kept. An expired row is never touched again here, so its
 * updated_at keeps counting towards its deletion (pruneConnectorData).
 */
export async function moveStatus(id: string, status: string, code: string | null): Promise<boolean> {
  const sql = getSql();
  const list = (
    status === "expired"
      ? await sql`
          UPDATE connections SET status = 'expired', last_error = ${code}, access_token_enc = NULL, refresh_token_enc = NULL, updated_at = now()
          WHERE id = ${id} AND status IS DISTINCT FROM 'expired'
          RETURNING id`
      : await sql`
          UPDATE connections SET status = ${status}, last_error = ${code}, updated_at = now()
          WHERE id = ${id} AND status IS DISTINCT FROM ${status}
          RETURNING id`
  ) as Raw[];
  if (!list.length) await sql`UPDATE connections SET last_error = ${code}, updated_at = now() WHERE id = ${id} AND status <> 'expired'`;
  return list.length > 0;
}

/**
 * Connections the tick should sync next, at most `limit`: numbers older than `olderThanHours` (or never synced),
 * of a provider that is on. Rows that cannot get better without the owner (a permission left unticked) are left
 * out, and a row whose last attempt failed waits ERROR_BACKOFF_HOURS; the failure time also orders it behind the
 * rest, so a few stuck rows can never hold the head of the queue. Same rule as view.ts `needsSync` (the card's
 * lazy sync).
 */
export async function dueConnections(limit: number, olderThanHours: number, providers: ConnectorId[]): Promise<string[]> {
  if (!providers.length) return [];
  const list = (await getSql()`
    SELECT id FROM connections
    WHERE status IN ('active', 'error') AND revoked_at IS NULL AND selected_account IS NOT NULL
      AND provider = ANY(${providers}::text[])
      AND COALESCE(last_error, '') <> 'scope_missing'
      AND (last_sync_at IS NULL OR last_sync_at < now() - make_interval(hours => ${olderThanHours}::int))
      AND (last_error IS NULL OR updated_at < now() - make_interval(hours => ${ERROR_BACKOFF_HOURS}::int))
    ORDER BY GREATEST(COALESCE(last_sync_at, 'epoch'::timestamptz), CASE WHEN last_error IS NULL THEN 'epoch'::timestamptz ELSE updated_at END)
    LIMIT ${limit}`) as Raw[];
  return list.map((r) => String(r.id));
}

/**
 * Deletes what Mercat may no longer keep (no provider calls; counts only): connections that ended at the provider
 * and were not connected again (their numbers go with them, ON DELETE CASCADE), posts/videos/campaigns not
 * refreshed for STALE_DATA_DAYS, and YouTube's daily numbers older than that (YouTube API Services policy).
 */
export async function pruneConnectorData(): Promise<{ expired: number; items: number; days: number }> {
  const sql = getSql();
  const expired = (await sql`
    DELETE FROM connections
    WHERE status = 'expired' AND (
      (provider = ANY(${FAMILY_IDS.google}::text[]) AND updated_at < now() - make_interval(days => ${EXPIRED_KEEP_DAYS.google}::int))
      OR (provider = ANY(${FAMILY_IDS.meta}::text[]) AND updated_at < now() - make_interval(days => ${EXPIRED_KEEP_DAYS.meta}::int)))
    RETURNING id`) as Raw[];
  const items = (await sql`
    DELETE FROM connection_items WHERE fetched_at < now() - make_interval(days => ${STALE_DATA_DAYS}::int)
    RETURNING connection_id`) as Raw[];
  const days = (await sql`
    DELETE FROM connection_metrics_daily d USING connections c
    WHERE d.connection_id = c.id AND c.provider = 'youtube' AND d.fetched_at < now() - make_interval(days => ${STALE_DATA_DAYS}::int)
    RETURNING d.connection_id`) as Raw[];
  return { expired: expired.length, items: items.length, days: days.length };
}

/* ----------------------------------------------------------------- numbers */

/** Same day twice = one row; a later sync merges its keys into the day (the follower snapshot and the insights). */
export async function upsertDaily(connectionId: string, daily: DailyRow[]): Promise<void> {
  if (!daily.length) return;
  const payload = JSON.stringify(daily.map((d) => ({ account_id: d.accountId, day: d.day, metrics: d.metrics })));
  await getSql()`
    INSERT INTO connection_metrics_daily (connection_id, account_id, day, metrics)
    SELECT ${connectionId}, r.account_id, r.day::date, r.metrics
    FROM jsonb_to_recordset(${payload}::jsonb) AS r(account_id text, day text, metrics jsonb)
    ON CONFLICT (connection_id, account_id, day) DO UPDATE
      SET metrics = connection_metrics_daily.metrics || EXCLUDED.metrics, fetched_at = now()`;
}

export async function upsertItems(connectionId: string, items: ItemRow[]): Promise<void> {
  if (!items.length) return;
  const payload = JSON.stringify(
    items.map((i) => ({ kind: i.kind, external_id: i.externalId, published_at: i.publishedAt, title: i.title, permalink: i.permalink, metrics: i.metrics })),
  );
  await getSql()`
    INSERT INTO connection_items (connection_id, kind, external_id, published_at, title, permalink, metrics)
    SELECT ${connectionId}, r.kind, r.external_id, r.published_at::timestamptz, r.title, r.permalink, r.metrics
    FROM jsonb_to_recordset(${payload}::jsonb) AS r(kind text, external_id text, published_at text, title text, permalink text, metrics jsonb)
    ON CONFLICT (connection_id, kind, external_id) DO UPDATE
      SET published_at = EXCLUDED.published_at, title = EXCLUDED.title, permalink = EXCLUDED.permalink,
          metrics = connection_items.metrics || EXCLUDED.metrics, fetched_at = now()`;
}

/** Daily rows of the given connections and accounts since a day (for the card's week numbers). */
export async function dailySince(connectionIds: string[], sinceDay: string): Promise<{ connectionId: string; accountId: string; day: string; metrics: Record<string, unknown> }[]> {
  if (!connectionIds.length) return [];
  const list = (await getSql()`
    SELECT connection_id, account_id, to_char(day, 'YYYY-MM-DD') AS day, metrics FROM connection_metrics_daily
    WHERE connection_id = ANY(${connectionIds}::uuid[]) AND day >= ${sinceDay}::date`) as Raw[];
  return list.map((r) => ({ connectionId: String(r.connection_id), accountId: String(r.account_id), day: String(r.day), metrics: json(r.metrics, {}) }));
}
