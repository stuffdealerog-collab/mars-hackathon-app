/**
 * Connector types shared by the server and the Connections card (client-safe: no I/O, no server-only imports).
 * The connector layer is read-only: Mercat reads numbers from the owner's other platforms and never posts,
 * edits or spends anything there.
 */

export const CONNECTOR_IDS = ["instagram", "meta_ads", "youtube", "google_ads"] as const;
export type ConnectorId = (typeof CONNECTOR_IDS)[number];

export const isConnectorId = (v: unknown): v is ConnectorId => typeof v === "string" && (CONNECTOR_IDS as readonly string[]).includes(v);

/** Connections of one family share one grant at the provider: one Meta app, one Google client. */
export type ConnectorFamily = "meta" | "google";
export const FAMILY_IDS: Record<ConnectorFamily, ConnectorId[]> = { meta: ["instagram", "meta_ads"], google: ["youtube", "google_ads"] };
export const familyOf = (id: ConnectorId): ConnectorFamily => (FAMILY_IDS.meta.includes(id) ? "meta" : "google");

/**
 * How long Mercat keeps data it can no longer refresh (the privacy page states these):
 * - a connection that ended at the provider (revoked, expired) and was not connected again: Google rows go after
 *   5 days, so with the day it takes the next sync to notice, Google's data is gone within the 7 days the YouTube API
 *   Services policy allows; Meta rows after 30 days (a Meta token simply runs out every ~60 days, and an owner who
 *   reconnects within the month keeps the history);
 * - posts, videos and campaigns not refreshed for 30 days, and YouTube's daily numbers older than 30 days.
 */
export const EXPIRED_KEEP_DAYS: Record<ConnectorFamily, number> = { google: 5, meta: 30 };
export const STALE_DATA_DAYS = 30;

/** A sync that failed (rate limit, network, access pending) waits this long before the tick or a card open retries. */
export const ERROR_BACKOFF_HOURS = 2;

/** test = the provider app is not reviewed yet: only testers (CONNECTOR_TESTERS) see it. live = everyone. */
export type ConnectorMode = "test" | "live";

/**
 * active: numbers flow. expired: the owner must connect again (token died or was revoked at the provider).
 * error: the provider refused for a reason the owner or the team must fix (access pending, a missing permission).
 * empty: connected, but there is nothing to read (no Instagram professional account, no ad account, no channel).
 */
export type ConnectionStatus = "active" | "expired" | "error" | "empty";

/** Stable reason codes, shown to the owner through the card's copy (never provider error text). */
export const CONNECT_ERRORS = [
  "oauth_denied",
  "oauth_state",
  "oauth_failed",
  "connector_off",
  "not_professional",
  "no_ad_accounts",
  "no_channel",
  "access_pending",
  "scope_missing",
  "expired",
  "rate_limited",
  "sync_failed",
] as const;
export type ConnectError = (typeof CONNECT_ERRORS)[number];

export const isConnectError = (v: unknown): v is ConnectError => typeof v === "string" && (CONNECT_ERRORS as readonly string[]).includes(v);

/** A connector the caller may connect now (GET /api/connect). */
export interface ConnectorInfo {
  id: ConnectorId;
  mode: ConnectorMode;
}

/** An account inside a connection: an Instagram account, an ad account, a YouTube channel, a Google Ads customer. */
export interface AccountRef {
  id: string;
  name: string;
  /** Instagram @username or YouTube @handle, without the @. */
  handle?: string;
  currency?: string;
  /** A Google Ads test account: it never serves ads, so its numbers stay empty. */
  test?: boolean;
}

export type WeekMetric = "views" | "followers" | "subscribers" | "spend" | "cost" | "messages" | "clicks";

/** One owner-facing number for the last 7 full days. null = not known (shown as "—", never as 0). */
export interface WeekNumber {
  metric: WeekMetric;
  value: number | null;
  /** Money only, in the account's own currency (never converted). */
  currency?: string;
  /** followers / subscribers: a change over the week (+38), not a total. */
  delta?: boolean;
}

/** What the card sees of a connection: never a token, a code or a provider error message. */
export interface ConnectionView {
  id: string;
  provider: ConnectorId;
  mode: ConnectorMode;
  status: ConnectionStatus;
  account: { name: string; handle?: string };
  /** Ad accounts / customers / Instagram accounts the owner can switch between (2+ only). */
  accounts: AccountRef[];
  selectedAccountId: string | null;
  connectedAt: string;
  lastSyncAt: string | null;
  /** When the owner will have to connect again (Meta: about 60 days), ISO. */
  expiresAt: string | null;
  week: WeekNumber[];
  error: ConnectError | null;
}

/** GET /api/connect?brandId= */
export interface ConnectionsResponse {
  connectors: ConnectorInfo[];
  connections: ConnectionView[];
}
