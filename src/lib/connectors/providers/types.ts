import type { SyncWindow } from "../days";
import type { CallOpts, FetchFn } from "../net";
import type { AccountRef, ConnectError, ConnectorId } from "../types";

/** What a provider returns from the code exchange. Lives in memory only; tokens are sealed before storage. */
export interface TokenSet {
  accessToken?: string;
  refreshToken?: string;
  /** When the access token (Meta: the long-lived user token) stops working. */
  expiresAt?: Date | null;
  /** Meta: when data access lapses (about 90 days after the owner last used the login). */
  dataAccessExpiresAt?: Date | null;
  scopes: string[];
  /** Meta: the app-scoped user id. Google: the account's stable `sub`. */
  subject?: string;
}

/** An account with how to reach it. `via` = Google Ads manager id sent as login-customer-id. */
export type ProviderAccount = AccountRef & { via?: string };

export interface ProviderProfile {
  /** The connection's identity at the provider (unique per owner and provider). */
  externalId: string;
  accounts: ProviderAccount[];
  /** Default account to read; null when there is none (status empty). */
  selected: string | null;
  status: "active" | "empty" | "error";
  error?: ConnectError;
}

export type MetricValue = number | string | null;

export interface DailyRow {
  accountId: string;
  day: string;
  metrics: Record<string, MetricValue>;
}

export interface ItemRow {
  kind: "post" | "reel" | "carousel" | "story" | "video" | "campaign";
  externalId: string;
  publishedAt: string | null;
  /** At most 200 characters (a caption's start, a video or campaign name). */
  title: string | null;
  permalink: string | null;
  metrics: Record<string, MetricValue>;
}

export interface SyncData {
  daily: DailyRow[];
  items: ItemRow[];
}

export interface SyncInput {
  token: string;
  account: ProviderAccount;
  window: SyncWindow;
  /** Today in Tashkent: the day follower/subscriber snapshots are stored under. */
  today: string;
}

export interface Connector {
  id: ConnectorId;
  /** Connections of one family share one grant at the provider (one Meta app, one Google client). */
  family: "meta" | "google";
  usesPkce: boolean;
  /** Days a daily sync re-reads because the provider still changes them. */
  settleDays: number;
  authorizeUrl(p: { state: string; redirectUri: string; codeChallenge?: string }): string;
  exchange(p: { code: string; redirectUri: string; verifier?: string }, opts: CallOpts): Promise<TokenSet>;
  /** Permissions the read needs; a grant without them is stored with status error / scope_missing. */
  missingScopes(t: TokenSet): string[];
  profile(t: TokenSet, opts: CallOpts): Promise<ProviderProfile>;
  /** A usable access token from what is stored (Google: a fresh one from the refresh token; Meta: the stored one). */
  accessToken(stored: { access: string | null; refresh: string | null }, opts: CallOpts): Promise<string>;
  sync(input: SyncInput, opts: CallOpts): Promise<SyncData>;
  /** Best effort: withdraws Mercat's access at the provider. */
  revoke(stored: { access: string | null; refresh: string | null }, opts: CallOpts): Promise<void>;
}

export interface ConnectorDeps {
  fetch: FetchFn;
}

export const title200 = (s: unknown) => (typeof s === "string" && s.trim() ? s.trim().replace(/\s+/g, " ").slice(0, 200) : null);
