import { createHmac } from "node:crypto";
import { arr, type CallOpts, type FetchFn, isRecord, num, ProviderError, query, requestJson, str } from "../net";
import type { ConnectError } from "../types";
import type { TokenSet } from "./types";

/**
 * Shared Meta pieces for Instagram and Meta ads: Facebook Login for Business (a configuration id instead of
 * `scope`), the code → long-lived user token exchange, debug_token for expiry and granted permissions, and Graph
 * GETs with appsecret_proof (turn on "Require App Secret" in the app). The access token goes in the Authorization
 * header, never in a URL; paging follows cursors, not the `next` URL.
 */

export interface MetaCreds {
  appId: string;
  appSecret: string;
  configId: string;
  graphVersion: string;
}

export const graphBase = (version: string) => `https://graph.facebook.com/${version}`;

export function metaAuthorizeUrl(creds: MetaCreds, p: { state: string; redirectUri: string }): string {
  return `https://www.facebook.com/${creds.graphVersion}/dialog/oauth?${query({
    client_id: creds.appId,
    redirect_uri: p.redirectUri,
    state: p.state,
    response_type: "code",
    config_id: creds.configId,
  })}`;
}

export const appSecretProof = (token: string, appSecret: string) => createHmac("sha256", appSecret).update(token).digest("hex");

/** Graph error → stable code. 190 (and its 46x subcodes) = the token is dead; 4/17/32/613/80000-80014 = slow down. */
export function metaError(status: number, body: unknown): { code: ConnectError; detail?: string } {
  const e = isRecord(body) && isRecord(body.error) ? body.error : null;
  const code = num(e?.code);
  const sub = num(e?.error_subcode);
  const detail = code != null ? `${code}${sub != null ? `/${sub}` : ""}` : String(status);
  if (code === 190 || code === 102 || sub === 463 || sub === 467 || sub === 460) return { code: "expired", detail };
  if (code === 4 || code === 17 || code === 32 || code === 613 || (code != null && code >= 80000 && code <= 80014) || status === 429) {
    return { code: "rate_limited", detail };
  }
  if (code === 10 || (code != null && code >= 200 && code <= 299)) return { code: "scope_missing", detail };
  if (status === 401) return { code: "expired", detail };
  return { code: "sync_failed", detail };
}

/** The code → short-lived → long-lived user token, then its expiry and granted permissions (debug_token). */
export async function metaExchange(fetchFn: FetchFn, creds: MetaCreds, p: { code: string; redirectUri: string }, opts: CallOpts): Promise<TokenSet> {
  const base = graphBase(creds.graphVersion);
  const short = await requestJson(
    fetchFn,
    `${base}/oauth/access_token?${query({ client_id: creds.appId, client_secret: creds.appSecret, redirect_uri: p.redirectUri, code: p.code })}`,
    {},
    opts,
    oauthError,
  );
  const shortToken = isRecord(short) ? str(short.access_token) : null;
  if (!shortToken) throw new ProviderError("oauth_failed", undefined, "no_token");
  const long = await requestJson(
    fetchFn,
    `${base}/oauth/access_token?${query({ grant_type: "fb_exchange_token", client_id: creds.appId, client_secret: creds.appSecret, fb_exchange_token: shortToken })}`,
    {},
    opts,
    oauthError,
  );
  const token = isRecord(long) ? str(long.access_token) : null;
  if (!token) throw new ProviderError("oauth_failed", undefined, "no_long_token");
  const expiresIn = isRecord(long) ? num(long.expires_in) : null;
  const debug = await requestJson(
    fetchFn,
    `${base}/debug_token?${query({ input_token: token, access_token: `${creds.appId}|${creds.appSecret}` })}`,
    {},
    opts,
    oauthError,
  );
  return { accessToken: token, ...parseDebugToken(debug, expiresIn) };
}

const oauthError = (status: number, body: unknown) => {
  const m = metaError(status, body);
  return { code: m.code === "rate_limited" ? m.code : ("oauth_failed" as const), detail: m.detail };
};

/** debug_token → scopes, expiry (0 = never), data access expiry and the app-scoped user id. */
export function parseDebugToken(body: unknown, expiresIn: number | null, now = Date.now()): Omit<TokenSet, "accessToken" | "refreshToken"> {
  const d = isRecord(body) && isRecord(body.data) ? body.data : {};
  const at = (v: unknown) => {
    const n = num(v);
    return n && n > 0 ? new Date(n * 1000) : null;
  };
  const expiresAt = at(d.expires_at) ?? (expiresIn && expiresIn > 0 ? new Date(now + expiresIn * 1000) : null);
  return {
    expiresAt,
    dataAccessExpiresAt: at(d.data_access_expires_at),
    scopes: arr(d.scopes).filter((s): s is string => typeof s === "string"),
    subject: str(d.user_id) ?? undefined,
  };
}

/** A Graph GET with appsecret_proof. `path` starts with "/". */
export async function graphGet(
  fetchFn: FetchFn,
  creds: Pick<MetaCreds, "appSecret" | "graphVersion">,
  token: string,
  path: string,
  params: Record<string, string | number | undefined>,
  opts: CallOpts,
): Promise<Record<string, unknown>> {
  const url = `${graphBase(creds.graphVersion)}${path}?${query({ ...params, appsecret_proof: appSecretProof(token, creds.appSecret) })}`;
  const body = await requestJson(fetchFn, url, { headers: { Authorization: `Bearer ${token}` } }, opts, metaError);
  return isRecord(body) ? body : {};
}

/** All `data` rows of a paged Graph edge, following `paging.cursors.after` while `paging.next` exists. */
export async function graphPaged(
  fetchFn: FetchFn,
  creds: Pick<MetaCreds, "appSecret" | "graphVersion">,
  token: string,
  path: string,
  params: Record<string, string | number | undefined>,
  opts: CallOpts,
  maxPages = 5,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let after: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const body = await graphGet(fetchFn, creds, token, path, { ...params, after }, opts);
    rows.push(...arr(body.data).filter(isRecord));
    const paging = isRecord(body.paging) ? body.paging : null;
    const cursor = paging && isRecord(paging.cursors) ? str(paging.cursors.after) : null;
    if (!paging?.next || !cursor) break;
    after = cursor;
  }
  return rows;
}

export async function metaRevoke(fetchFn: FetchFn, creds: Pick<MetaCreds, "appSecret" | "graphVersion">, token: string, opts: CallOpts): Promise<void> {
  const url = `${graphBase(creds.graphVersion)}/me/permissions?${query({ appsecret_proof: appSecretProof(token, creds.appSecret) })}`;
  await requestJson(fetchFn, url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }, opts, metaError);
}
