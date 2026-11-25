import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ProviderError } from "../src/lib/connectors/net";
import { instagramConnector, parseIgAccountInsights, parseIgMediaInsights } from "../src/lib/connectors/providers/instagram";
import { metaError, parseDebugToken } from "../src/lib/connectors/providers/meta";
import { metaAdsConnector, normalizeActions } from "../src/lib/connectors/providers/meta-ads";
import fx from "./fixtures/connectors/meta.json";
import { fakeFetch } from "./fixtures/connectors/fake-fetch";

const SECRET = "abcdef0123456789abcdef0123456789";
const IG = { appId: "1234567890", appSecret: SECRET, configId: "111222333", graphVersion: "v27.0" };
const ADS = { ...IG, configId: "444555666" };
const CB = "https://mercat.example/api/connect/callback/instagram";
const TOKEN = "LONG-LIVED-USER-TOKEN-xyz";
const proof = (t: string) => createHmac("sha256", SECRET).update(t).digest("hex");
const opts = {};

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-25T06:00:00Z"));
});
afterAll(() => vi.useRealTimers());

describe("Facebook Login for Business", () => {
  it("builds the Instagram authorize URL with the configuration id and no scope", () => {
    const ig = instagramConnector(IG, { fetch: fakeFetch([]).fetch });
    expect(ig.authorizeUrl({ state: "st4te", redirectUri: CB })).toBe(
      "https://www.facebook.com/v27.0/dialog/oauth?client_id=1234567890&redirect_uri=https%3A%2F%2Fmercat.example%2Fapi%2Fconnect%2Fcallback%2Finstagram&state=st4te&response_type=code&config_id=111222333",
    );
    const ads = metaAdsConnector(ADS, { fetch: fakeFetch([]).fetch });
    const url = new URL(ads.authorizeUrl({ state: "s", redirectUri: CB.replace("instagram", "meta_ads") }));
    expect(url.searchParams.get("config_id")).toBe("444555666");
    expect(url.searchParams.has("scope")).toBe(false);
  });

  it("exchanges the code for a long-lived token and reads its expiry and permissions", async () => {
    const { fetch, calls } = fakeFetch([
      { match: /oauth\/access_token\?.*grant_type=fb_exchange_token/, body: fx.oauthLong },
      { match: /oauth\/access_token\?/, body: fx.oauthShort },
      { match: /debug_token\?/, body: fx.debugToken },
    ]);
    const t = await instagramConnector(IG, { fetch }).exchange({ code: "the-code", redirectUri: CB }, opts);
    expect(t.accessToken).toBe(TOKEN);
    expect(t.expiresAt?.toISOString()).toBe(new Date(1769385600 * 1000).toISOString());
    expect(t.dataAccessExpiresAt?.toISOString()).toBe(new Date(1772236800 * 1000).toISOString());
    expect(t.subject).toBe("10229384756");
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(["/v27.0/oauth/access_token", "/v27.0/oauth/access_token", "/v27.0/debug_token"]);
    expect(new URL(calls[1].url).searchParams.get("fb_exchange_token")).toBe("SHORT-LIVED-USER-TOKEN-abc");
    expect(instagramConnector(IG, { fetch }).missingScopes(t)).toEqual([]);
    expect(instagramConnector(IG, { fetch }).missingScopes({ ...t, ...parseDebugToken(fx.debugTokenNoInsights, null) })).toEqual(["instagram_manage_insights"]);
  });

  it("debug_token: 0 means no expiry, else falls back to expires_in", () => {
    const now = Date.parse("2026-11-25T00:00:00Z");
    expect(parseDebugToken({ data: { expires_at: 0, scopes: [] } }, 3600, now).expiresAt?.toISOString()).toBe("2026-11-25T01:00:00.000Z");
    expect(parseDebugToken({ data: { expires_at: 0 } }, null, now).expiresAt).toBeNull();
  });

  it("maps Graph errors to stable codes", () => {
    expect(metaError(400, fx.error190).code).toBe("expired");
    expect(metaError(400, fx.error17).code).toBe("rate_limited");
    expect(metaError(400, fx.error10).code).toBe("scope_missing");
    expect(metaError(500, null).code).toBe("sync_failed");
    expect(metaError(400, { error: { code: 80004 } }).code).toBe("rate_limited");
  });
});

describe("Instagram connector", () => {
  it("lists the Instagram professional accounts behind the owner's Pages", async () => {
    const { fetch, calls } = fakeFetch([
      { match: /\/me\?/, body: fx.me },
      { match: /\/me\/accounts\?/, body: fx.pages },
    ]);
    const p = await instagramConnector(IG, { fetch }).profile({ accessToken: TOKEN, scopes: [] }, opts);
    expect(p).toEqual({
      externalId: "10229384756",
      accounts: [
        { id: "17841400000000001", name: "Safia Bakery", handle: "safia.bakery" },
        { id: "17841400000000002", name: "safia.kids", handle: "safia.kids" },
      ],
      selected: "17841400000000001",
      status: "active",
    });
    // The token rides in the header with appsecret_proof; it is never in a URL.
    for (const c of calls) {
      expect(c.url).not.toContain(TOKEN);
      expect(c.headers.authorization).toBe(`Bearer ${TOKEN}`);
      expect(new URL(c.url).searchParams.get("appsecret_proof")).toBe(proof(TOKEN));
    }
  });

  it("an owner with no linked Instagram professional account gets empty / not_professional", async () => {
    const { fetch } = fakeFetch([
      { match: /\/me\?/, body: fx.me },
      { match: /\/me\/accounts\?/, body: fx.pagesNoInstagram },
    ]);
    const p = await instagramConnector(IG, { fetch }).profile({ accessToken: TOKEN, scopes: [] }, opts);
    expect(p.status).toBe("empty");
    expect(p.error).toBe("not_professional");
    expect(p.selected).toBeNull();
  });

  it("parses day insights; metrics Instagram leaves out stay null, never 0", () => {
    expect(parseIgAccountInsights(fx.igInsightsDay)).toEqual({
      views: 4210,
      reach: 1870,
      accounts_engaged: 96,
      total_interactions: 233,
      likes: 180,
      comments: 21,
      shares: 12,
      saves: 20,
      profile_links_taps: 7,
    });
    const small = parseIgAccountInsights(fx.igInsightsSmallAccount);
    expect(small.views).toBe(64);
    expect(small.reach).toBe(31);
    expect(small.accounts_engaged).toBeNull();
    expect(small.saves).toBeNull();
    expect(parseIgMediaInsights(fx.igStoryInsights, "views,reach,replies,shares").shares).toBeNull();
  });

  it("syncs days, the follower snapshot, fresh media with insights and live stories", async () => {
    const { fetch, calls } = fakeFetch([
      { match: /\/17841400000000001\/insights\?/, body: fx.igInsightsDay },
      { match: /\/17841400000000001\/media\?/, body: fx.igMedia },
      { match: /\/17841400000000001\/stories\?/, body: fx.igStories },
      { match: /\/17841400000000001\?/, body: fx.igProfile },
      { match: /\/18100000000000009\/insights\?/, body: fx.igStoryInsights },
      { match: /\/1800000000000000[12]\/insights\?/, body: fx.igMediaInsights },
    ]);
    const ig = instagramConnector(IG, { fetch });
    const r = await ig.sync(
      { token: TOKEN, account: { id: "17841400000000001", name: "Safia Bakery" }, window: { since: "2026-11-23", until: "2026-11-24" }, today: "2026-11-25" },
      opts,
    );
    expect(r.daily.map((d) => d.day)).toEqual(["2026-11-23", "2026-11-24", "2026-11-25"]);
    expect(r.daily[0].metrics.views).toBe(4210);
    expect(r.daily[2]).toEqual({ accountId: "17841400000000001", day: "2026-11-25", metrics: { followers: 2318 } });
    // Day boundaries are Tashkent midnights (UTC+5).
    const day = calls.find((c) => c.url.includes("/insights?") && c.url.includes("metric_type=total_value"))!;
    expect(new URL(day.url).searchParams.get("since")).toBe(String(Date.parse("2026-11-22T19:00:00Z") / 1000));
    expect(new URL(day.url).searchParams.get("metric")).not.toContain("impressions");

    const byId = Object.fromEntries(r.items.map((i) => [i.externalId, i]));
    expect(byId["18000000000000001"].kind).toBe("reel");
    expect(byId["18000000000000001"].metrics).toMatchObject({ likes: 140, comments: 9, views: 5120, reach: 3300 });
    expect(byId["18000000000000002"].kind).toBe("carousel");
    // A post older than 30 days keeps likes and comments without an insights call.
    expect(byId["18000000000000003"].kind).toBe("post");
    expect(byId["18000000000000003"].metrics).toEqual({ likes: 40, comments: 1 });
    expect(calls.some((c) => c.url.includes("/18000000000000003/insights"))).toBe(false);
    expect(byId["18100000000000009"]).toMatchObject({ kind: "story", metrics: { views: 610, reach: 540, replies: 4, shares: null } });
    expect(byId["18000000000000001"].title).toContain("Yangi tort");
  });

  it("a dead token stops the sync as expired", async () => {
    const { fetch } = fakeFetch([{ match: /./, status: 400, body: fx.error190 }]);
    const err = await instagramConnector(IG, { fetch })
      .sync({ token: TOKEN, account: { id: "17841400000000001", name: "x" }, window: { since: "2026-11-24", until: "2026-11-24" }, today: "2026-11-25" }, opts)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe("expired");
    expect(String(err.message)).not.toContain(TOKEN);
  });
});

describe("Meta ads connector", () => {
  it("picks an active ad account first; none → empty / no_ad_accounts", async () => {
    const ok = fakeFetch([
      { match: /\/me\?/, body: fx.me },
      { match: /\/me\/adaccounts\?/, body: fx.adAccounts },
    ]);
    const p = await metaAdsConnector(ADS, { fetch: ok.fetch }).profile({ accessToken: TOKEN, scopes: ["ads_read"] }, opts);
    expect(p.selected).toBe("act_900000002");
    expect(p.accounts.map((a) => a.id)).toEqual(["act_900000002", "act_900000001"]);
    expect(p.accounts[0].currency).toBe("USD");
    const none = fakeFetch([
      { match: /\/me\?/, body: fx.me },
      { match: /\/me\/adaccounts\?/, body: fx.adAccountsNone },
    ]);
    const empty = await metaAdsConnector(ADS, { fetch: none.fetch }).profile({ accessToken: TOKEN, scopes: [] }, opts);
    expect(empty).toMatchObject({ status: "empty", error: "no_ad_accounts", selected: null });
  });

  it("normalizes actions without double counting purchase and omni_purchase", () => {
    expect(normalizeActions(fx.adsDaysPage1.data[1].actions)).toEqual({ messages_started: 9, leads: null, purchases: 1, landing_page_views: null });
    expect(normalizeActions(undefined)).toEqual({ messages_started: null, leads: null, purchases: null, landing_page_views: null });
  });

  it("syncs daily account rows across pages (cursor, not the next URL) and campaigns", async () => {
    const { fetch, calls } = fakeFetch([
      { match: (u) => u.includes("level=account") && u.includes("after=MQZDZD"), body: fx.adsDaysPage2 },
      { match: (u) => u.includes("level=account"), body: fx.adsDaysPage1 },
      { match: (u) => u.includes("level=campaign"), body: fx.adsCampaigns },
    ]);
    const r = await metaAdsConnector(ADS, { fetch }).sync(
      { token: TOKEN, account: { id: "act_900000002", name: "Safia", currency: "USD" }, window: { since: "2026-11-17", until: "2026-11-23" }, today: "2026-11-24" },
      opts,
    );
    expect(r.daily.map((d) => d.day)).toEqual(["2026-11-17", "2026-11-18", "2026-11-19"]);
    expect(r.daily[0].metrics).toMatchObject({ spend: 4.21, currency: "USD", link_clicks: 38, messages_started: 6 });
    expect(r.daily[2].metrics.messages_started).toBeNull();
    expect(r.items).toEqual([
      expect.objectContaining({ kind: "campaign", externalId: "120200000000001", title: "Tortlar — xabarlar", metrics: expect.objectContaining({ spend: 12.31, messages_started: 15 }) }),
    ]);
    const accountCall = new URL(calls.find((c) => c.url.includes("level=account"))!.url);
    expect(JSON.parse(accountCall.searchParams.get("time_range")!)).toEqual({ since: "2026-11-17", until: "2026-11-23" });
    expect(accountCall.searchParams.get("time_increment")).toBe("1");
    for (const c of calls) expect(c.url).not.toContain(TOKEN);
  });
});
