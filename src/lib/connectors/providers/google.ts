import { type CallOpts, type FetchFn, isRecord, num, ProviderError, query, requestJson, str } from "../net";
import type { ConnectError } from "../types";
import type { TokenSet } from "./types";

/**
 * Shared Google OAuth (one "Web application" client for YouTube and Google Ads): authorization code with PKCE
 * (S256), offline access for a refresh token, and a fresh access token minted from it on every sync. The access
 * token is never stored. invalid_grant = the owner revoked access, or the consent screen is still in "Testing"
 * (refresh tokens die after 7 days there): the connection becomes expired.
 */

export interface GoogleCreds {
  clientId: string;
  clientSecret: string;
}

export const GOOGLE_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE = "https://oauth2.googleapis.com/revoke";

export function googleAuthorizeUrl(creds: GoogleCreds, scopes: readonly string[], p: { state: string; redirectUri: string; codeChallenge?: string }): string {
  if (!p.codeChallenge) throw new Error("Google sign-in needs a PKCE challenge");
  return `${GOOGLE_AUTHORIZE}?${query({
    client_id: creds.clientId,
    redirect_uri: p.redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    // Always show consent, so Google returns a refresh token even for an owner who connected before.
    prompt: "consent",
    state: p.state,
    code_challenge: p.codeChallenge,
    code_challenge_method: "S256",
  })}`;
}

/** Token endpoint errors: invalid_grant = the grant is gone (expired); the rest = the sign-in failed. */
export function googleTokenError(status: number, body: unknown): { code: ConnectError; detail?: string } {
  const err = isRecord(body) ? str(body.error) : null;
  if (err === "invalid_grant" || err === "unauthorized_client") return { code: "expired", detail: err };
  if (status === 429) return { code: "rate_limited", detail: String(status) };
  return { code: "oauth_failed", detail: err ?? String(status) };
}

/** Google API errors (YouTube, Analytics, Ads). */
export function googleApiError(status: number, body: unknown): { code: ConnectError; detail?: string } {
  const e = isRecord(body) && isRecord(body.error) ? body.error : null;
  const reason = e ? (str(e.status) ?? str(num(e.code))) : null;
  const text = JSON.stringify(body ?? "");
  if (/CLOUD_PROJECT_NOT_APPROVED|DEVELOPER_TOKEN_NOT_APPROVED|DEVELOPER_TOKEN_PROHIBITED|NOT_ALLOWLISTED/.test(text)) {
    return { code: "access_pending", detail: "ads_access" };
  }
  if (status === 401) return { code: "expired", detail: reason ?? "401" };
  if (status === 429 || /RESOURCE_EXHAUSTED|quotaExceeded|rateLimitExceeded/.test(text)) return { code: "rate_limited", detail: reason ?? String(status) };
  if (status === 403 && /insufficient|ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficientPermissions/i.test(text)) return { code: "scope_missing", detail: reason ?? "403" };
  return { code: "sync_failed", detail: reason ?? String(status) };
}

/** The `sub` claim of an id_token received straight from Google's token endpoint over TLS (no signature check needed). */
export function idTokenSubject(idToken: unknown): string | undefined {
  if (typeof idToken !== "string") return undefined;
  const part = idToken.split(".")[1];
  if (!part) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { sub?: unknown };
    return typeof payload.sub === "string" && /^\d{1,64}$/.test(payload.sub) ? payload.sub : undefined;
  } catch {
    return undefined;
  }
}

const form = (fields: Record<string, string>): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(fields).toString(),
});

export function parseGoogleToken(body: unknown, now = Date.now()): TokenSet {
  const b = isRecord(body) ? body : {};
  const expiresIn = num(b.expires_in);
  return {
    accessToken: str(b.access_token) ?? undefined,
    refreshToken: str(b.refresh_token) ?? undefined,
    expiresAt: expiresIn ? new Date(now + expiresIn * 1000) : null,
    scopes: (str(b.scope) ?? "").split(/\s+/).filter(Boolean),
    subject: idTokenSubject(b.id_token),
  };
}

export async function googleExchange(fetchFn: FetchFn, creds: GoogleCreds, p: { code: string; redirectUri: string; verifier?: string }, opts: CallOpts): Promise<TokenSet> {
  if (!p.verifier) throw new ProviderError("oauth_state", undefined, "no_verifier");
  const body = await requestJson(
    fetchFn,
    GOOGLE_TOKEN,
    form({
      code: p.code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: p.redirectUri,
      grant_type: "authorization_code",
      code_verifier: p.verifier,
    }),
    opts,
    (s, b) => {
      const m = googleTokenError(s, b);
      return { code: m.code === "expired" ? "oauth_failed" : m.code, detail: m.detail };
    },
  );
  const t = parseGoogleToken(body);
  // Without a refresh token Mercat could read once and never again: treat it as a failed sign-in.
  if (!t.accessToken || !t.refreshToken) throw new ProviderError("oauth_failed", undefined, "no_refresh_token");
  return t;
}

export async function googleRefresh(fetchFn: FetchFn, creds: GoogleCreds, refreshToken: string, opts: CallOpts): Promise<string> {
  const body = await requestJson(
    fetchFn,
    GOOGLE_TOKEN,
    form({ client_id: creds.clientId, client_secret: creds.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
    opts,
    googleTokenError,
  );
  const token = isRecord(body) ? str(body.access_token) : null;
  if (!token) throw new ProviderError("expired", undefined, "no_access_token");
  return token;
}

export async function googleRevoke(fetchFn: FetchFn, token: string, opts: CallOpts): Promise<void> {
  await requestJson(fetchFn, GOOGLE_REVOKE, form({ token }), opts, googleTokenError);
}

export async function googleGet(fetchFn: FetchFn, url: string, token: string, opts: CallOpts, headers: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const body = await requestJson(fetchFn, url, { headers: { Authorization: `Bearer ${token}`, ...headers } }, opts, googleApiError);
  return isRecord(body) ? body : {};
}

export async function googlePost(fetchFn: FetchFn, url: string, token: string, json: unknown, opts: CallOpts, headers: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const body = await requestJson(
    fetchFn,
    url,
    { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...headers }, body: JSON.stringify(json) },
    opts,
    googleApiError,
  );
  return isRecord(body) ? body : {};
}
