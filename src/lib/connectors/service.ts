import "server-only";
import { randomUUID } from "node:crypto";
import { anyEnabled, canConnect, type ConnectorConfig, readConnectorConfig, redirectUri, visibleConnectors } from "./config";
import { openToken, sealToken, TokenSealError, tokenAad } from "./crypto";
import { addDays, tashkentDay } from "./days";
import { ProviderError } from "./net";
import { connectEvent, notifyConnected, notifyExpired } from "./notify";
import { newPkce, randomToken, stateExpiry, stateProblem } from "./pkce";
import { connectorFor } from "./registry";
import * as repo from "./repo";
import { type SyncDeps, type SyncOutcome, syncConnection } from "./sync";
import { browserBound } from "./browser-bind";
import { type ConnectError, type ConnectionsResponse, type ConnectorId, FAMILY_IDS, isConnectorId } from "./types";
import { isStale, toView } from "./view";

/**
 * The connector flows behind /api/connect: start (state + PKCE + provider URL), finish (the callback: state, code
 * exchange, profile, sealed storage), list (the card), disconnect, select an account, and sync. Routes check who
 * the caller is; everything here takes a verified Telegram owner id.
 */

/** Read per call: env does not change at runtime, and parsing is cheap. */
export const connectorConfig = (): ConnectorConfig => readConnectorConfig(process.env);

export type ReturnTo = "studio" | "miniapp";

export class ConnectFlowError extends Error {
  constructor(readonly code: "not_found" | "invalid") {
    super(code);
  }
}

/* ------------------------------------------------------------------ start */

/** The provider's sign-in URL, and its state (the Studio path binds it to the browser: browser-bind.ts). */
export async function startConnect(
  cfg: ConnectorConfig,
  p: { provider: ConnectorId; ownerId: number; brandId: string; from: ReturnTo; now?: Date },
): Promise<{ url: string; state: string }> {
  const connector = canConnect(cfg, p.provider, p.ownerId) ? connectorFor(p.provider, cfg) : null;
  if (!connector || !cfg.keys[0]) throw new ConnectFlowError("not_found");
  const state = randomToken();
  const pkce = connector.usesPkce ? newPkce() : null;
  await repo.insertState({
    state,
    provider: p.provider,
    ownerTelegramId: p.ownerId,
    brandId: p.brandId,
    returnTo: p.from,
    // The verifier is sealed to its own state row, like a token to its connection.
    pkceVerifierEnc: pkce ? sealToken(pkce.verifier, tokenAad(state, "pkce"), cfg.keys[0]) : null,
    expiresAt: stateExpiry(p.now ?? new Date()),
  });
  await connectEvent(p.ownerId, "connect_started", { provider: p.provider, brand_id: p.brandId });
  return { url: connector.authorizeUrl({ state, redirectUri: redirectUri(cfg, p.provider), codeChallenge: pkce?.challenge }), state };
}

/* ----------------------------------------------------------------- finish */

/** Provider errors the owner sees as they are at connect (each has its own line in the card's copy). */
const PASS_THROUGH = new Set<ConnectError>(["rate_limited", "oauth_state", "access_pending", "scope_missing"]);

export interface FinishResult {
  /** Relative path to send the browser to (never carries a token or the provider's code). */
  location: string;
  /** Set on success: the caller schedules the first sync (28-day backfill) after the response. */
  connectionId?: string;
}

/**
 * Where the browser goes after the callback: the Studio, or the return page for the Mini App path. The return page
 * also gets the stored connection's id, so it can show which Mercat account received it (`c`).
 */
export function returnLocation(p: { provider: ConnectorId; brandId: string | null; returnTo: string }, error?: ConnectError, connectionId?: string): string {
  const q = new URLSearchParams();
  if (p.returnTo === "studio" && p.brandId) {
    q.set("brand", p.brandId);
    if (error) {
      q.set("connect_error", error);
      q.set("p", p.provider);
    } else q.set("connected", p.provider);
    return `/studio?${q}`;
  }
  q.set("p", p.provider);
  if (p.brandId) q.set("brand", p.brandId);
  if (error) q.set("error", error);
  if (connectionId) q.set("c", connectionId);
  return `/connect/done?${q}`;
}

export interface FinishOptions {
  now?: Date;
  /** The browser's binding cookie for this provider (browser-bind.ts), when the request carried one. */
  cookie?: string | null;
}

export async function finishConnect(cfg: ConnectorConfig, provider: string, params: URLSearchParams, opts: FinishOptions = {}): Promise<FinishResult> {
  const now = opts.now ?? new Date();
  if (!isConnectorId(provider)) return { location: "/connect/done?error=oauth_state" };
  const state = params.get("state") ?? "";
  const row = /^[A-Za-z0-9_-]{20,128}$/.test(state) ? await repo.consumeState(state) : null;
  // consumeState already refused used and expired rows; this also refuses a state started for another provider.
  if (!row || stateProblem({ ...row, usedAt: null }, provider, now)) return { location: `/connect/done?p=${provider}&error=oauth_state` };
  // A Studio connect must finish in the browser that started it: a sign-in link passed to someone else (so their
  // numbers would land in the sender's Mercat) is refused before the code is used. The neutral page names no brand.
  if (row.returnTo === "studio" && !browserBound(opts.cookie ?? null, state)) {
    await connectEvent(row.ownerTelegramId, "connect_failed", { provider, code: "oauth_state", why: "browser" });
    return { location: `/connect/done?p=${provider}&error=oauth_state` };
  }

  const target = { provider, brandId: row.brandId, returnTo: row.returnTo };
  const owner = row.ownerTelegramId;
  const fail = async (code: ConnectError): Promise<FinishResult> => {
    await connectEvent(owner, "connect_failed", { provider, code });
    return { location: returnLocation(target, code) };
  };

  // The owner pressed "Cancel" / "Not now" at the provider (error=access_denied, or Meta's error_reason=user_denied).
  if (params.get("error") || params.get("error_reason")) return fail("oauth_denied");
  const code = params.get("code");
  if (!code || code.length > 2048) return fail("oauth_failed");
  const connector = canConnect(cfg, provider, owner) ? connectorFor(provider, cfg) : null;
  if (!connector || !cfg.keys[0]) return fail("connector_off");

  try {
    const verifier = row.pkceVerifierEnc ? openToken(row.pkceVerifierEnc, tokenAad(state, "pkce"), cfg.keys) : undefined;
    const opts = { timeoutMs: 10_000 };
    const tokens = await connector.exchange({ code, redirectUri: redirectUri(cfg, provider), verifier }, opts);
    const profile = await connector.profile(tokens, opts);
    const missing = connector.missingScopes(tokens);

    const existing = await repo.findConnection(owner, provider, profile.externalId);
    const keep = existing?.selectedAccount && profile.accounts.some((a) => a.id === existing.selectedAccount) ? existing.selectedAccount : null;
    const selected = keep ?? profile.selected;
    const shown = profile.accounts.find((a) => a.id === selected) ?? profile.accounts[0];
    const status = profile.status !== "active" ? profile.status : missing.length ? "error" : "active";
    const lastError: ConnectError | null = profile.error ?? (missing.length ? "scope_missing" : null);

    const seal = (id: string) => ({
      access: tokens.accessToken ? sealToken(tokens.accessToken, tokenAad(id, "access"), cfg.keys[0]) : null,
      refresh: tokens.refreshToken ? sealToken(tokens.refreshToken, tokenAad(id, "refresh"), cfg.keys[0]) : null,
    });
    const id = existing?.id ?? randomUUID();
    // Nothing to read (no professional Instagram, no ad account, no channel): no credential is kept. The grant is
    // withdrawn at the provider too, unless the owner's other connection of the same family shares it.
    const keepTokens = status !== "empty";
    if (!keepTokens && (await repo.siblingCount(owner, FAMILY_IDS[connector.family], id).catch(() => 1)) === 0) {
      await connector.revoke({ access: tokens.accessToken ?? null, refresh: tokens.refreshToken ?? null }, { timeoutMs: 5_000 }).catch(() => undefined);
    }
    const sealed = keepTokens ? seal(id) : { access: null, refresh: null };
    const storedId = await repo.upsertConnection({
      id,
      ownerTelegramId: owner,
      brandId: row.brandId,
      provider,
      mode: cfg.providers[provider].mode,
      externalId: profile.externalId,
      account: shown ? { name: shown.name, ...(shown.handle ? { handle: shown.handle } : {}) } : { name: "" },
      accounts: profile.accounts,
      selectedAccount: selected,
      scopes: tokens.scopes.slice(0, 40),
      accessTokenEnc: sealed.access,
      refreshTokenEnc: sealed.refresh,
      // Google's access token is never stored, so only Meta's end dates matter here.
      tokenExpiresAt: connector.family === "meta" ? (tokens.expiresAt ?? null) : null,
      dataAccessExpiresAt: tokens.dataAccessExpiresAt ?? null,
      status,
      lastError,
    });
    if (storedId !== id && keepTokens) {
      // A parallel reconnect created the row first: re-seal to the row that won, so its associated data matches.
      const again = seal(storedId);
      await repo.saveSealedTokens(storedId, again.access, again.refresh);
    }

    await connectEvent(owner, "connect_done", { provider, mode: cfg.providers[provider].mode, status, brand_id: row.brandId });
    // A missing permission is explained on the page the owner lands on; the bot only confirms a real connection.
    if (status !== "error") await notifyConnected(owner, provider, shown ?? { name: provider }, row.brandId, status === "empty" ? profile.error : undefined);
    // An earlier attempt that found nothing to read (e.g. YouTube before the channel existed) is replaced by this one.
    if (status === "active") await repo.deleteEmptyRows(owner, provider, storedId);
    if (status === "empty") return { location: returnLocation(target, profile.error ?? "oauth_failed", storedId) };
    // A grant without the insights permission is kept (the card asks to connect again with it), but not synced. Google
    // Ads waiting for production access is kept too: the tick retries it.
    if (status === "error") return { location: returnLocation(target, lastError ?? "scope_missing", storedId) };
    return { location: returnLocation(target, undefined, storedId), connectionId: storedId };
  } catch (err) {
    const code: ConnectError =
      err instanceof ProviderError ? (PASS_THROUGH.has(err.code) ? err.code : "oauth_failed") : err instanceof TokenSealError ? "oauth_state" : "oauth_failed";
    console.warn(`[connectors] ${provider} connect failed: ${err instanceof ProviderError || err instanceof TokenSealError ? err.message : err instanceof Error ? err.name : "error"}`);
    return fail(code);
  }
}

/* ------------------------------------------------------------------- list */

export async function listForOwner(
  cfg: ConnectorConfig,
  ownerId: number,
  brandId: string,
  now = new Date(),
): Promise<{ body: ConnectionsResponse; stale: string[] }> {
  if (!anyEnabled(cfg)) return { body: { connectors: [], connections: [] }, stale: [] };
  // A provider switched off (CONNECTOR_ENABLED) disappears from the card with its connections.
  const rows = (await repo.listConnections(ownerId, brandId)).filter((r) => cfg.providers[r.provider].enabled);
  const today = tashkentDay(now);
  const daily = await repo.dailySince(
    rows.map((r) => r.id),
    addDays(today, -8),
  );
  return {
    body: {
      connectors: visibleConnectors(cfg, ownerId),
      connections: rows.map((r) =>
        toView(
          r,
          daily.filter((d) => d.connectionId === r.id),
          today,
        ),
      ),
    },
    stale: rows.filter((r) => isStale(r, now)).map((r) => r.id),
  };
}

/* ------------------------------------------------------ disconnect, select */

async function ownedConnection(ownerId: number, connectionId: string): Promise<repo.ConnectionRow> {
  const row = await repo.getConnection(connectionId);
  // Someone else's connection reads exactly like a missing one.
  if (!row || row.ownerTelegramId !== ownerId) throw new ConnectFlowError("not_found");
  return row;
}

export async function disconnect(cfg: ConnectorConfig, ownerId: number, connectionId: string): Promise<void> {
  const row = await ownedConnection(ownerId, connectionId);
  const connector = connectorFor(row.provider, cfg);
  if (connector && cfg.keys.length) {
    // Instagram and Meta ads share one grant at Meta (and YouTube and Google Ads one at Google): withdrawing it
    // would also end the owner's other connection, so it is withdrawn only when this is the last one.
    const siblings = await repo.siblingCount(ownerId, FAMILY_IDS[connector.family], row.id).catch(() => 1);
    if (siblings === 0) {
      try {
        const access = row.accessTokenEnc ? openToken(row.accessTokenEnc, tokenAad(row.id, "access"), cfg.keys) : null;
        const refresh = row.refreshTokenEnc ? openToken(row.refreshTokenEnc, tokenAad(row.id, "refresh"), cfg.keys) : null;
        await connector.revoke({ access, refresh }, { timeoutMs: 5_000 });
      } catch {
        // Best effort: the owner can also remove Mercat in the provider's settings (the privacy page says where).
      }
    }
  }
  await repo.deleteConnection(row.id);
  await connectEvent(ownerId, "connect_revoked", { provider: row.provider });
}

export async function selectAccount(ownerId: number, connectionId: string, accountId: string): Promise<repo.ConnectionRow> {
  const row = await ownedConnection(ownerId, connectionId);
  if (!row.accounts.some((a) => a.id === accountId)) throw new ConnectFlowError("invalid");
  await repo.setSelectedAccount(row.id, accountId);
  return { ...row, selectedAccount: accountId };
}

export async function assertOwnedConnection(ownerId: number, connectionId: string): Promise<repo.ConnectionRow> {
  return ownedConnection(ownerId, connectionId);
}

/* ------------------------------------------------------------------- sync */

export function syncDeps(cfg: ConnectorConfig): SyncDeps {
  return {
    load: repo.getConnection,
    connector: (row) => connectorFor(row.provider, cfg),
    keys: cfg.keys,
    saveDaily: repo.upsertDaily,
    saveItems: repo.upsertItems,
    markSynced: repo.markSynced,
    markRetry: repo.markSoftError,
    saveAccounts: repo.saveAccounts,
    moveStatus: repo.moveStatus,
    notifyExpired: (row) => notifyExpired(row.ownerTelegramId, row.provider, row.accounts.find((a) => a.id === row.selectedAccount) ?? row.account, row.brandId),
    logEvent: (row, type, props) => connectEvent(row.ownerTelegramId, type, props),
  };
}

/** `maxDays` caps the window and `light` skips the slow extras: both for the tick's small budget (task.ts). */
export function runSync(
  cfg: ConnectorConfig,
  connectionId: string,
  deadline: number,
  opts: { maxDays?: number; light?: boolean } = {},
): Promise<SyncOutcome> {
  return syncConnection(connectionId, { deadline, maxDays: opts.maxDays, light: opts.light }, syncDeps(cfg));
}
