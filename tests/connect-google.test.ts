import { describe, expect, it } from "vitest";
import { ProviderError } from "../src/lib/connectors/net";
import { googleApiError, googleTokenError, idTokenSubject, parseGoogleToken } from "../src/lib/connectors/providers/google";
import { campaignQuery, googleAdsConnector, parseAccessibleCustomers } from "../src/lib/connectors/providers/google-ads";
import { isoDurationSeconds, youtubeConnector, youtubeDaily } from "../src/lib/connectors/providers/youtube";
import { fakeFetch } from "./fixtures/connectors/fake-fetch";
import fx from "./fixtures/connectors/google.json";

const CREDS = { clientId: "123-abc.apps.googleusercontent.com", clientSecret: "GOCSPX-secret_value-123" };
const CB = "https://mercat.example/api/connect/callback/youtube";
const opts = {};

describe("Google OAuth", () => {
  it("builds the YouTube authorize URL with PKCE S256, offline access and read-only scopes", () => {
    const yt = youtubeConnector(CREDS, { fetch: fakeFetch([]).fetch });
    const url = yt.authorizeUrl({ state: "st", redirectUri: CB, codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM" });
    expect(url).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth?client_id=123-abc.apps.googleusercontent.com&redirect_uri=https%3A%2F%2Fmercat.example%2Fapi%2Fconnect%2Fcallback%2Fyoutube&response_type=code&scope=openid+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fyoutube.readonly+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fyt-analytics.readonly&access_type=offline&prompt=consent&state=st&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256",
    );
    expect(() => yt.authorizeUrl({ state: "st", redirectUri: CB })).toThrow(/PKCE/);
    const ads = googleAdsConnector(CREDS, { apiVersion: "v26", developerToken: null }, { fetch: fakeFetch([]).fetch });
    expect(new URL(ads.authorizeUrl({ state: "s", redirectUri: CB, codeChallenge: "c" })).searchParams.get("scope")).toBe("openid https://www.googleapis.com/auth/adwords");
  });

  it("exchanges the code with the verifier and keeps the refresh token and the account's sub", async () => {
    const { fetch, calls } = fakeFetch([{ match: /oauth2\.googleapis\.com\/token/, body: fx.token }]);
    const t = await youtubeConnector(CREDS, { fetch }).exchange({ code: "4/abc", redirectUri: CB, verifier: "v".repeat(43) }, opts);
    expect(t).toMatchObject({ accessToken: "ya29.ACCESS-TOKEN-abc", refreshToken: "1//REFRESH-TOKEN-xyz", subject: "110492384756123456789" });
    expect(youtubeConnector(CREDS, { fetch }).missingScopes(t)).toEqual([]);
    expect(calls[0].method).toBe("POST");
    const form = new URLSearchParams(calls[0].body!);
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code_verifier")).toBe("v".repeat(43));
    expect(form.get("redirect_uri")).toBe(CB);
    expect(calls[0].url).toBe("https://oauth2.googleapis.com/token");
  });

  it("a sign-in without a refresh token fails; a missing verifier is a state problem", async () => {
    const { fetch } = fakeFetch([{ match: /token/, body: fx.tokenNoRefresh }]);
    const yt = youtubeConnector(CREDS, { fetch });
    await expect(yt.exchange({ code: "c", redirectUri: CB, verifier: "v" }, opts)).rejects.toMatchObject({ code: "oauth_failed" });
    await expect(yt.exchange({ code: "c", redirectUri: CB }, opts)).rejects.toMatchObject({ code: "oauth_state" });
  });

  it("refreshes on every sync; invalid_grant means the connection expired", async () => {
    const ok = fakeFetch([{ match: /token/, body: fx.refreshed }]);
    expect(await youtubeConnector(CREDS, { fetch: ok.fetch }).accessToken({ access: null, refresh: "1//r" }, opts)).toBe("ya29.FRESH-ACCESS-TOKEN");
    expect(new URLSearchParams(ok.calls[0].body!).get("grant_type")).toBe("refresh_token");
    const dead = fakeFetch([{ match: /token/, status: 400, body: fx.invalidGrant }]);
    const err = await youtubeConnector(CREDS, { fetch: dead.fetch }).accessToken({ access: null, refresh: "1//r" }, opts).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe("expired");
    expect(googleTokenError(400, { error: "invalid_request" }).code).toBe("oauth_failed");
  });

  it("parses tokens and id_token subjects defensively", () => {
    expect(idTokenSubject("not-a-jwt")).toBeUndefined();
    expect(idTokenSubject(fx.token.id_token)).toBe("110492384756123456789");
    expect(parseGoogleToken({ scope: "a b" }).scopes).toEqual(["a", "b"]);
  });

  it("maps API errors: quota → rate_limited, 401 → expired, project not approved → access_pending", () => {
    expect(googleApiError(403, fx.quotaError).code).toBe("rate_limited");
    expect(googleApiError(401, { error: { code: 401, status: "UNAUTHENTICATED" } }).code).toBe("expired");
    expect(googleApiError(403, fx.notApproved).code).toBe("access_pending");
    expect(googleApiError(403, { error: { message: "Request had insufficient authentication scopes." } }).code).toBe("scope_missing");
  });
});

describe("YouTube connector", () => {
  it("profile: the owner's channel, or empty / no_channel", async () => {
    const ok = fakeFetch([{ match: /youtube\/v3\/channels\?/, body: fx.channels }]);
    const p = await youtubeConnector(CREDS, { fetch: ok.fetch }).profile({ accessToken: "ya29.x", scopes: [] }, opts);
    expect(p).toEqual({ externalId: "UC1234567890abcdefghijkl", accounts: [{ id: "UC1234567890abcdefghijkl", name: "Safia Bakery", handle: "safiabakery" }], selected: "UC1234567890abcdefghijkl", status: "active" });
    expect(ok.calls[0].headers.authorization).toBe("Bearer ya29.x");
    const none = fakeFetch([{ match: /channels/, body: fx.channelsNone }]);
    expect(await youtubeConnector(CREDS, { fetch: none.fetch }).profile({ accessToken: "ya29.x", scopes: [], subject: "110" }, opts)).toMatchObject({
      status: "empty",
      error: "no_channel",
    });
  });

  it("turns Analytics tables into daily rows with the Shorts / long split", () => {
    const rows = youtubeDaily("UC1", fx.reportDay, fx.reportType);
    expect(rows).toEqual([
      {
        accountId: "UC1",
        day: "2026-11-20",
        metrics: { views: 1520, minutes_watched: 2310, avg_view_duration_s: 91, subs_gained: 14, subs_lost: 2, likes: 80, comments: 6, shares: 9, shorts_views: 1100, long_views: 420 },
      },
      {
        accountId: "UC1",
        day: "2026-11-21",
        metrics: { views: 1830, minutes_watched: 2602, avg_view_duration_s: 85, subs_gained: 21, subs_lost: 3, likes: 102, comments: 11, shares: 12, shorts_views: 1500, long_views: 330 },
      },
    ]);
    expect(isoDurationSeconds("PT12M4S")).toBe(724);
    expect(isoDurationSeconds("P1DT1S")).toBe(86_401);
    expect(isoDurationSeconds("garbage")).toBeNull();
  });

  it("syncs days, today's subscriber snapshot and the latest uploads", async () => {
    const { fetch, calls } = fakeFetch([
      { match: (u) => u.includes("youtubeanalytics") && u.includes("creatorContentType"), body: fx.reportType },
      { match: /youtubeanalytics/, body: fx.reportDay },
      { match: /youtube\/v3\/channels\?/, body: fx.channels },
      { match: /youtube\/v3\/playlistItems\?/, body: fx.playlist },
      { match: /youtube\/v3\/videos\?/, body: fx.videos },
    ]);
    const r = await youtubeConnector(CREDS, { fetch }).sync(
      { token: "ya29.x", account: { id: "UC1234567890abcdefghijkl", name: "Safia" }, window: { since: "2026-11-20", until: "2026-11-24" }, today: "2026-11-25" },
      opts,
    );
    expect(r.daily.map((d) => d.day)).toEqual(["2026-11-20", "2026-11-21", "2026-11-25"]);
    expect(r.daily[2].metrics).toEqual({ subscribers: 12300 });
    expect(r.items.map((i) => [i.externalId, i.metrics.views, i.metrics.duration_s])).toEqual([
      ["vid111", 8400, 58],
      ["vid222", 2100, 724],
    ]);
    expect(r.items[1].metrics.comments).toBeNull();
    const report = new URL(calls.find((c) => c.url.includes("youtubeanalytics") && !c.url.includes("creatorContentType"))!.url);
    expect(report.searchParams.get("ids")).toBe("channel==MINE");
    expect(report.searchParams.get("startDate")).toBe("2026-11-20");
    expect(report.searchParams.get("endDate")).toBe("2026-11-24");
  });
});

describe("Google Ads connector", () => {
  it("finds the accounts, walking a manager's clients with login-customer-id", async () => {
    const { fetch, calls } = fakeFetch([
      { match: /customers:listAccessibleCustomers/, body: fx.accessible },
      { match: (u, i) => u.includes("customers/1112223333/googleAds:search") && String(i.body).includes("FROM customer_client"), body: fx.clients },
      { match: /customers\/1112223333\/googleAds:search/, body: fx.customerManager },
      { match: /customers\/4445556666\/googleAds:search/, body: fx.customerPlain },
    ]);
    const ads = googleAdsConnector(CREDS, { apiVersion: "v26", developerToken: null }, { fetch });
    const p = await ads.profile({ accessToken: "ya29.x", scopes: [], subject: "110492384756123456789" }, opts);
    expect(p).toEqual({
      externalId: "110492384756123456789",
      accounts: [
        { id: "7778889999", name: "Safia Bakery", currency: "USD", via: "1112223333" },
        { id: "4445556666", name: "Test shop", currency: "UZS", test: true },
      ],
      selected: "7778889999",
      status: "active",
    });
    const clientsCall = calls.find((c) => c.body?.includes("FROM customer_client"))!;
    expect(clientsCall.headers["login-customer-id"]).toBe("1112223333");
    // No developer token unless it is configured (Google retired the requirement in 2026-09).
    expect(calls.every((c) => !("developer-token" in c.headers))).toBe(true);
  });

  it("sends the developer token only when one is set", async () => {
    const { fetch, calls } = fakeFetch([{ match: /listAccessibleCustomers/, body: { resourceNames: [] } }]);
    const ads = googleAdsConnector(CREDS, { apiVersion: "v26", developerToken: "devtoken_0123456789" }, { fetch });
    expect(await ads.profile({ accessToken: "ya29.x", scopes: [], subject: "1" }, opts)).toMatchObject({ status: "empty", error: "no_ad_accounts" });
    expect(calls[0].headers["developer-token"]).toBe("devtoken_0123456789");
    expect(parseAccessibleCustomers(fx.accessible)).toEqual(["1112223333", "4445556666"]);
  });

  it("rolls GAQL rows (string int64, camelCase) up per day and per campaign across pages", async () => {
    const { fetch, calls } = fakeFetch([
      { match: (_u, i) => String(i.body).includes("page-2"), body: fx.campaignsPage2 },
      { match: /googleAds:search/, body: fx.campaignsPage1 },
    ]);
    const ads = googleAdsConnector(CREDS, { apiVersion: "v26", developerToken: null }, { fetch });
    const r = await ads.sync(
      { token: "ya29.x", account: { id: "7778889999", name: "Safia", currency: "USD", via: "1112223333" }, window: { since: "2026-11-18", until: "2026-11-24" }, today: "2026-11-25" },
      opts,
    );
    expect(r.daily).toEqual([
      { accountId: "7778889999", day: "2026-11-20", metrics: { cost: 4.45, currency: "USD", impressions: 2000, clicks: 60, conversions: 2 } },
      { accountId: "7778889999", day: "2026-11-21", metrics: { cost: 4.1, currency: "USD", impressions: 1500, clicks: 51, conversions: null } },
    ]);
    expect(r.items.find((i) => i.externalId === "301")?.metrics).toMatchObject({ cost: 7.55, clicks: 99, status: "ENABLED" });
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://googleads.googleapis.com/v26/customers/7778889999/googleAds:search");
    expect(calls[0].headers["login-customer-id"]).toBe("1112223333");
    expect(JSON.parse(calls[0].body!).query).toContain("BETWEEN '2026-11-18' AND '2026-11-24'");
  });

  it("a project without production access reads as access pending", async () => {
    const { fetch } = fakeFetch([{ match: /googleAds:search/, status: 403, body: fx.notApproved }]);
    const ads = googleAdsConnector(CREDS, { apiVersion: "v26", developerToken: null }, { fetch });
    const err = await ads
      .sync({ token: "t", account: { id: "7778889999", name: "x" }, window: { since: "2026-11-18", until: "2026-11-24" }, today: "2026-11-25" }, opts)
      .catch((e) => e);
    expect(err.code).toBe("access_pending");
  });

  it("at connect, a project without production access keeps the bare customer ids as 'access pending'", async () => {
    const { fetch } = fakeFetch([
      { match: /customers:listAccessibleCustomers/, body: fx.accessible },
      { match: /googleAds:search/, status: 403, body: fx.notApproved },
    ]);
    const ads = googleAdsConnector(CREDS, { apiVersion: "v26", developerToken: null }, { fetch });
    expect(await ads.profile({ accessToken: "ya29.x", scopes: [], subject: "110492384756123456789" }, opts)).toEqual({
      externalId: "110492384756123456789",
      accounts: [
        { id: "1112223333", name: "1112223333" },
        { id: "4445556666", name: "4445556666" },
      ],
      selected: "1112223333",
      status: "error",
      error: "access_pending",
    });
  });

  it("one closed or unreachable customer is skipped; the others are still listed", async () => {
    const { fetch } = fakeFetch([
      { match: /customers:listAccessibleCustomers/, body: fx.accessible },
      { match: /customers\/1112223333\/googleAds:search/, status: 403, body: { error: { code: 403, status: "PERMISSION_DENIED", message: "CUSTOMER_NOT_ENABLED" } } },
      { match: /customers\/4445556666\/googleAds:search/, body: fx.customerPlain },
    ]);
    const ads = googleAdsConnector(CREDS, { apiVersion: "v26", developerToken: null }, { fetch });
    const p = await ads.profile({ accessToken: "ya29.x", scopes: [], subject: "1" }, opts);
    expect(p.accounts.map((a) => a.id)).toEqual(["4445556666"]);
    expect(p.status).toBe("active");
  });

  it("the caller's own deadline still ends the listing with an error (no half list is saved)", async () => {
    const ctl = new AbortController();
    const fetch = async (url: string, init: RequestInit = {}) => {
      if (url.includes("listAccessibleCustomers")) return new Response(JSON.stringify(fx.accessible), { status: 200 });
      ctl.abort();
      if (init.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return new Response(JSON.stringify(fx.customerPlain), { status: 200 });
    };
    const ads = googleAdsConnector(CREDS, { apiVersion: "v26", developerToken: null }, { fetch });
    const err = await ads.profile({ accessToken: "ya29.x", scopes: [], subject: "1" }, { ...opts, signal: ctl.signal }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("sync_failed");
  });

  it("GAQL dates are validated, never spliced in raw", () => {
    expect(() => campaignQuery("2026-11-18' OR 1=1 --", "2026-11-24")).toThrow();
  });
});
