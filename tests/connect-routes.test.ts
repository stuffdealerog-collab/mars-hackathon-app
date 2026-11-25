import { createHmac, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The /api/connect routes with an in-memory repo, no database, no network (provider calls answer from fixtures),
// no bot. Covers: owner-only access, the tester gate, single-use state, the callback's redirects, and that no JSON
// answer ever carries a token, a secret or a PKCE verifier.
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("@/lib/db", () => ({ isDbConfigured: () => false, getSql: () => { throw new Error("no db in tests"); }, pgErrorCode: () => undefined }));
vi.mock("@/lib/track", () => ({ safeLogEvent: async () => {} }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ TELEGRAM_BOT_TOKEN: "test-token", BOT_USERNAME: "mercatai" }), getPublicUrl: () => "https://mercat.example" }));
vi.mock("@/lib/telegram-auth", () => ({
  authenticateRequest: (req: Request) => {
    const m = /^tma (\d+)$/.exec(req.headers.get("authorization") ?? "");
    return m ? { id: Number(m[1]) } : null;
  },
  validateInitData: () => ({ ok: false }),
}));
vi.mock("@/lib/uslub/http", async () => await import("../src/lib/uslub/http"));
vi.mock("@/lib/uslub/store", async () => await import("../src/lib/uslub/store"));
vi.mock("@/lib/uslub/context", async () => await import("../src/lib/uslub/context"));
vi.mock("@/lib/uslub/errors", async () => await import("../src/lib/uslub/errors"));
vi.mock("@/lib/connectors/config", async () => await import("../src/lib/connectors/config"));
vi.mock("@/lib/connectors/types", async () => await import("../src/lib/connectors/types"));
vi.mock("@/lib/connectors/service", async () => await import("../src/lib/connectors/service"));
vi.mock("@/lib/connectors/owner", async () => await import("../src/lib/connectors/owner"));
vi.mock("@/lib/connectors/meta-callbacks", async () => await import("../src/lib/connectors/meta-callbacks"));

const notify = { connected: vi.fn(), expired: vi.fn(), events: [] as [number | null, string, Record<string, unknown>][] };
vi.mock("../src/lib/connectors/notify", () => ({
  notifyConnected: async (...a: unknown[]) => notify.connected(...a),
  notifyExpired: async (...a: unknown[]) => notify.expired(...a),
  connectEvent: async (owner: number | null, type: string, props: Record<string, unknown>) => {
    notify.events.push([owner, type, props]);
  },
}));

// In-memory connector storage with the repo's contract (single-use states, upsert by owner+provider+external id).
type ConnectionRow = import("../src/lib/connectors/repo").ConnectionRow;
const db = {
  states: new Map<string, { provider: string; ownerTelegramId: number; brandId: string | null; returnTo: string; pkceVerifierEnc: string | null; expiresAt: Date; usedAt: Date | null }>(),
  conns: new Map<string, ConnectionRow>(),
  revoked: 0,
};
vi.mock("../src/lib/connectors/repo", () => ({
  insertState: async (s: { state: string; provider: string; ownerTelegramId: number; brandId: string | null; returnTo: string; pkceVerifierEnc: string | null; expiresAt: Date }) => {
    db.states.set(s.state, { ...s, usedAt: null });
  },
  consumeState: async (state: string) => {
    const s = db.states.get(state);
    if (!s || s.usedAt || s.expiresAt.getTime() <= Date.now()) return null;
    s.usedAt = new Date();
    return { provider: s.provider, ownerTelegramId: s.ownerTelegramId, brandId: s.brandId, returnTo: s.returnTo, pkceVerifierEnc: s.pkceVerifierEnc, expiresAt: s.expiresAt };
  },
  findConnection: async (owner: number, provider: string, ext: string) =>
    [...db.conns.values()].find((c) => c.ownerTelegramId === owner && c.provider === provider && c.externalId === ext) ?? null,
  upsertConnection: async (c: ConnectionRow) => {
    const prev = [...db.conns.values()].find((x) => x.ownerTelegramId === c.ownerTelegramId && x.provider === c.provider && x.externalId === c.externalId);
    const id = prev?.id ?? c.id;
    db.conns.set(id, { ...c, id, lastSyncAt: null, createdAt: prev?.createdAt ?? new Date() } as ConnectionRow);
    return id;
  },
  saveSealedTokens: async () => {},
  listConnections: async (owner: number, brandId: string | null) => [...db.conns.values()].filter((c) => c.ownerTelegramId === owner && (c.brandId == null || c.brandId === brandId)),
  dailySince: async () => [],
  getConnection: async (id: string) => db.conns.get(id) ?? null,
  siblingCount: async (owner: number, providers: string[], except: string) => [...db.conns.values()].filter((c) => c.ownerTelegramId === owner && providers.includes(c.provider) && c.id !== except).length,
  deleteConnection: async (id: string) => {
    db.conns.delete(id);
  },
  setSelectedAccount: async (id: string, acc: string) => {
    const c = db.conns.get(id);
    if (c) c.selectedAccount = acc;
  },
  deleteMetaUserConnections: async (ext: string) => {
    const gone = [...db.conns.values()].filter((c) => (c.provider === "instagram" || c.provider === "meta_ads") && c.externalId === ext);
    for (const c of gone) db.conns.delete(c.id);
    return gone.map((c) => ({ ownerTelegramId: c.ownerTelegramId, provider: c.provider }));
  },
  deleteEmptyRows: async (owner: number, provider: string, keep: string) => {
    for (const c of [...db.conns.values()]) if (c.ownerTelegramId === owner && c.provider === provider && c.status === "empty" && c.id !== keep) db.conns.delete(c.id);
  },
  markSynced: async () => {},
  markSoftError: async () => {},
  moveStatus: async () => false,
  upsertDaily: async () => {},
  upsertItems: async () => {},
  dueConnections: async () => [],
}));

const { fakeFetch } = await import("./fixtures/connectors/fake-fetch");
const gfx = (await import("./fixtures/connectors/google.json")).default;
const mfx = (await import("./fixtures/connectors/meta.json")).default;
const store = await import("../src/lib/uslub/store");
const listRoute = await import("../src/app/api/connect/route");
const startRoute = await import("../src/app/api/connect/start/route");
const callbackRoute = await import("../src/app/api/connect/callback/[provider]/route");
const disconnectRoute = await import("../src/app/api/connect/disconnect/route");
const selectRoute = await import("../src/app/api/connect/select/route");
const deletionRoute = await import("../src/app/api/connect/meta/data-deletion/route");
import type { BrandDNA } from "../src/lib/uslub/contract";

const OWNER = 4242;
const STRANGER = 777;
const META_SECRET = "abcdef0123456789abcdef0123456789";
const ENV = {
  CONNECTOR_TOKEN_KEY: randomBytes(32).toString("base64"),
  PUBLIC_URL: "https://mercat.example",
  META_APP_ID: "1234567890",
  META_APP_SECRET: META_SECRET,
  META_IG_CONFIG_ID: "111222333",
  META_ADS_CONFIG_ID: "444555666",
  GOOGLE_OAUTH_CLIENT_ID: "123-abc.apps.googleusercontent.com",
  GOOGLE_OAUTH_CLIENT_SECRET: "GOCSPX-secret_value-123",
  CONNECTOR_TESTERS: String(OWNER),
};
const DNA = { name: "Safia", languages: ["uz_latn"] } as unknown as BrandDNA;

let ip = 0;
const headers = (user?: number) => ({ "content-type": "application/json", "x-forwarded-for": `10.1.0.${++ip}`, ...(user ? { authorization: `tma ${user}` } : {}) });
const post = (route: { POST: (r: Request) => Promise<Response> }, path: string, body: unknown, user?: number) =>
  route.POST(new Request(`https://mercat.example${path}`, { method: "POST", headers: headers(user), body: JSON.stringify(body) }));
const list = (brandId: string, user?: number) => listRoute.GET(new Request(`https://mercat.example/api/connect?brandId=${brandId}`, { headers: headers(user) }));
const callback = (provider: string, query: string) =>
  callbackRoute.GET(new Request(`https://mercat.example/api/connect/callback/${provider}?${query}`), { params: Promise.resolve({ provider }) });

/** Every key of a JSON value, at any depth. */
const keysOf = (v: unknown): string[] =>
  Array.isArray(v) ? v.flatMap(keysOf) : v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => [k, ...keysOf(x)]) : [];
const noSecrets = (body: unknown) => {
  expect(keysOf(body).filter((k) => /token|secret|code_verifier|verifier/i.test(k))).toEqual([]);
  const text = JSON.stringify(body);
  expect(text).not.toContain(META_SECRET);
  expect(text).not.toContain("ya29.");
  expect(text).not.toContain("1//REFRESH");
};

let owned: string;
let foreign: string;
let unowned: string;

beforeEach(async () => {
  for (const [k, v] of Object.entries(ENV)) process.env[k] = v;
  delete process.env.CONNECTOR_ENABLED;
  delete process.env.CONNECTOR_LIVE;
  delete process.env.VERCEL_ENV;
  db.states.clear();
  db.conns.clear();
  notify.connected.mockReset();
  notify.events.length = 0;
  owned = (await store.saveBrand({ channel: "safiabakery", knowledge: "", samplePosts: [], dna: DNA, mode: "channel" }, OWNER, "channel_only")).id;
  foreign = (await store.saveBrand({ channel: "otherbrand", knowledge: "", samplePosts: [], dna: DNA, mode: "channel" }, STRANGER, "channel_only")).id;
  unowned = (await store.saveBrand({ channel: "webbrand", knowledge: "", samplePosts: [], dna: DNA, mode: "channel" }, null, "custom")).id;
});

afterEach(() => {
  for (const k of Object.keys(ENV)) delete process.env[k];
  vi.unstubAllGlobals();
});

describe("GET /api/connect", () => {
  it("answers empty with 200 for a stranger, an anonymous browser and when nothing is configured", async () => {
    for (const res of [await list(owned), await list(owned, STRANGER), await list(unowned, OWNER), await list(foreign, OWNER)]) {
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ connectors: [], connections: [] });
    }
    for (const k of Object.keys(ENV)) delete process.env[k];
    expect(await (await list(owned, OWNER)).json()).toEqual({ connectors: [], connections: [] });
  });

  it("shows a tester the test-mode connectors; a non-tester owner sees none until a provider is live", async () => {
    const body = await (await list(owned, OWNER)).json();
    expect(body.connectors.map((c: { id: string }) => c.id)).toEqual(["instagram", "meta_ads", "youtube", "google_ads"]);
    expect(body.connectors.every((c: { mode: string }) => c.mode === "test")).toBe(true);
    noSecrets(body);
    process.env.CONNECTOR_TESTERS = "1";
    expect((await (await list(owned, OWNER)).json()).connectors).toEqual([]);
    process.env.CONNECTOR_LIVE = "instagram";
    expect((await (await list(owned, OWNER)).json()).connectors).toEqual([{ id: "instagram", mode: "live" }]);
  });
});

describe("POST /api/connect/start", () => {
  const start = (brandId: string, provider: string, user?: number) => post(startRoute, "/api/connect/start", { brandId, provider, from: "studio" }, user);

  it("anonymous → 401; someone else's or an unowned brand → 403", async () => {
    expect((await start(owned, "instagram")).status).toBe(401);
    expect((await (await start(owned, "instagram")).json()).code).toBe("auth_required");
    const other = await start(foreign, "instagram", OWNER);
    expect(other.status).toBe(403);
    expect((await other.json()).code).toBe("brand_forbidden");
    expect((await start(unowned, "instagram", OWNER)).status).toBe(403);
    expect((await start(owned, "instagram", STRANGER)).status).toBe(403);
  });

  it("a provider that is off, or a non-tester in test mode → 404", async () => {
    process.env.CONNECTOR_ENABLED = "youtube";
    expect((await start(owned, "instagram", OWNER)).status).toBe(404);
    delete process.env.CONNECTOR_ENABLED;
    process.env.CONNECTOR_TESTERS = "1";
    const res = await start(owned, "instagram", OWNER);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("not_found");
    expect(db.states.size).toBe(0);
  });

  it("the owner gets the provider's URL; the state is stored once, Google's verifier only sealed", async () => {
    const res = await start(owned, "youtube", OWNER);
    expect(res.status).toBe(200);
    const body = await res.json();
    noSecrets(body);
    const url = new URL(body.url);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("redirect_uri")).toBe("https://mercat.example/api/connect/callback/youtube");
    const state = url.searchParams.get("state")!;
    const row = db.states.get(state)!;
    expect(row).toMatchObject({ provider: "youtube", ownerTelegramId: OWNER, brandId: owned, returnTo: "studio" });
    expect(row.pkceVerifierEnc).toMatch(/^v1\./);
    expect(row.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(10 * 60 * 1000);
    const ig = new URL((await (await start(owned, "instagram", OWNER)).json()).url);
    expect(ig.searchParams.get("config_id")).toBe("111222333");
    expect(db.states.get(ig.searchParams.get("state")!)!.pkceVerifierEnc).toBeNull();
  });
});

describe("GET /api/connect/callback/[provider]", () => {
  const begin = async (provider: string, from = "studio") => {
    const res = await post(startRoute, "/api/connect/start", { brandId: owned, provider, from }, OWNER);
    return new URL((await res.json()).url).searchParams.get("state")!;
  };
  const location = (res: Response) => new URL(res.headers.get("location")!);

  it("an unknown, reused or expired state, or one started for another provider → oauth_state", async () => {
    let res = await callback("youtube", "state=nope-nope-nope-nope-nope&code=x");
    expect(res.status).toBe(303);
    expect(location(res).pathname).toBe("/connect/done");
    expect(location(res).searchParams.get("error")).toBe("oauth_state");

    const state = await begin("youtube");
    res = await callback("instagram", `state=${state}&code=x`); // uses the state up
    expect(location(res).searchParams.get("error")).toBe("oauth_state");
    res = await callback("youtube", `state=${state}&code=x`);
    expect(location(res).searchParams.get("error")).toBe("oauth_state");

    const late = await begin("youtube");
    db.states.get(late)!.expiresAt = new Date(Date.now() - 1);
    res = await callback("youtube", `state=${late}&code=x`);
    expect(location(res).searchParams.get("error")).toBe("oauth_state");
    expect((await callback("tiktok", "state=x&code=y")).headers.get("location")).toContain("error=oauth_state");
  });

  it("the owner pressing Cancel goes back to the Studio with oauth_denied", async () => {
    const state = await begin("instagram");
    const res = await callback("instagram", `state=${state}&error=access_denied&error_reason=user_denied&error_description=Permissions+error`);
    const loc = location(res);
    expect(loc.pathname).toBe("/studio");
    expect(loc.searchParams.get("brand")).toBe(owned);
    expect(loc.searchParams.get("connect_error")).toBe("oauth_denied");
    expect(loc.toString()).not.toContain("Permissions");
  });

  it("connects YouTube: tokens are sealed, the browser goes back without the code, the owner is told", async () => {
    const { fetch } = fakeFetch([
      { match: /oauth2\.googleapis\.com\/token/, body: gfx.token },
      { match: /youtube\/v3\/channels/, body: gfx.channels },
    ]);
    vi.stubGlobal("fetch", fetch);
    const state = await begin("youtube");
    const res = await callback("youtube", `state=${state}&code=4%2Fsecret-code&scope=x`);
    expect(res.status).toBe(303);
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    const loc = location(res);
    expect(loc.toString()).toBe(`https://mercat.example/studio?brand=${owned}&connected=youtube`);
    const [conn] = [...db.conns.values()];
    expect(conn).toMatchObject({ provider: "youtube", externalId: "UC1234567890abcdefghijkl", selectedAccount: "UC1234567890abcdefghijkl", status: "active", mode: "test" });
    expect(conn.refreshTokenEnc).toMatch(/^v1\./);
    expect(conn.refreshTokenEnc).not.toContain("REFRESH");
    expect(conn.tokenExpiresAt).toBeNull();
    expect(notify.connected).toHaveBeenCalledOnce();
    expect(notify.events.map((e) => e[1])).toEqual(["connect_started", "connect_done"]);

    // The card's view of it: name and handle, no tokens, no external ids beyond the channel the owner picked.
    const body = await (await list(owned, OWNER)).json();
    expect(body.connections).toHaveLength(1);
    expect(body.connections[0]).toMatchObject({ provider: "youtube", status: "active", account: { name: "Safia Bakery", handle: "safiabakery" }, error: null });
    noSecrets(body);
  });

  it("a later real connection replaces an earlier 'nothing to read' row of the same platform", async () => {
    vi.stubGlobal("fetch", fakeFetch([
      { match: /oauth2\.googleapis\.com\/token/, body: gfx.token },
      { match: /youtube\/v3\/channels/, body: gfx.channelsNone, once: true },
      { match: /youtube\/v3\/channels/, body: gfx.channels },
    ]).fetch);
    let state = await begin("youtube");
    expect(location(await callback("youtube", `state=${state}&code=a`)).searchParams.get("connect_error")).toBe("no_channel");
    expect([...db.conns.values()].map((c) => c.status)).toEqual(["empty"]);
    state = await begin("youtube");
    expect(location(await callback("youtube", `state=${state}&code=b`)).searchParams.get("connected")).toBe("youtube");
    expect([...db.conns.values()].map((c) => [c.status, c.externalId])).toEqual([["active", "UC1234567890abcdefghijkl"]]);
  });

  it("the Mini App path lands on /connect/done; an Instagram account without a Page link is 'empty'", async () => {
    const { fetch } = fakeFetch([
      { match: /oauth\/access_token\?.*fb_exchange_token/, body: mfx.oauthLong },
      { match: /oauth\/access_token\?/, body: mfx.oauthShort },
      { match: /debug_token\?/, body: mfx.debugToken },
      { match: /\/me\?/, body: mfx.me },
      { match: /\/me\/accounts\?/, body: mfx.pagesNoInstagram },
    ]);
    vi.stubGlobal("fetch", fetch);
    const state = await begin("instagram", "miniapp");
    const loc = location(await callback("instagram", `state=${state}&code=AQB-meta-code`));
    expect(loc.pathname).toBe("/connect/done");
    expect(loc.searchParams.get("p")).toBe("instagram");
    expect(loc.searchParams.get("brand")).toBe(owned);
    expect(loc.searchParams.get("error")).toBe("not_professional");
    expect([...db.conns.values()][0]).toMatchObject({ status: "empty", lastError: "not_professional", selectedAccount: null });
  });

  it("a provider failure never shows its text and never leaves a 500", async () => {
    vi.stubGlobal("fetch", fakeFetch([{ match: /./, status: 400, body: { error: "invalid_grant", error_description: "Bad Request secret stuff" } }]).fetch);
    const state = await begin("youtube");
    const res = await callback("youtube", `state=${state}&code=x`);
    expect(res.status).toBe(303);
    expect(location(res).searchParams.get("connect_error")).toBe("oauth_failed");
    expect(res.headers.get("location")).not.toContain("secret");
    expect(db.conns.size).toBe(0);
  });
});

describe("disconnect, select and Meta's data deletion", () => {
  async function connectYoutube(): Promise<string> {
    vi.stubGlobal("fetch", fakeFetch([
      { match: /oauth2\.googleapis\.com\/token/, body: gfx.token },
      { match: /youtube\/v3\/channels/, body: gfx.channels },
      { match: /oauth2\.googleapis\.com\/revoke/, body: {} },
    ]).fetch);
    const res = await post(startRoute, "/api/connect/start", { brandId: owned, provider: "youtube", from: "studio" }, OWNER);
    const state = new URL((await res.json()).url).searchParams.get("state")!;
    await callback("youtube", `state=${state}&code=c`);
    return [...db.conns.keys()][0];
  }

  it("only the owner can disconnect; someone else's connection reads as missing", async () => {
    const id = await connectYoutube();
    const theirs = await post(disconnectRoute, "/api/connect/disconnect", { connectionId: id }, STRANGER);
    expect(theirs.status).toBe(404);
    expect(db.conns.has(id)).toBe(true);
    expect((await post(disconnectRoute, "/api/connect/disconnect", { connectionId: id })).status).toBe(401);
    const mine = await post(disconnectRoute, "/api/connect/disconnect", { connectionId: id }, OWNER);
    expect(mine.status).toBe(200);
    expect(db.conns.has(id)).toBe(false);
    expect(notify.events.at(-1)?.[1]).toBe("connect_revoked");
  });

  it("select accepts only an account the provider listed", async () => {
    const id = await connectYoutube();
    expect((await post(selectRoute, "/api/connect/select", { connectionId: id, accountId: "UC-not-mine" }, OWNER)).status).toBe(400);
    expect((await post(selectRoute, "/api/connect/select", { connectionId: id, accountId: "UC1234567890abcdefghijkl" }, STRANGER)).status).toBe(404);
    expect((await post(selectRoute, "/api/connect/select", { connectionId: id, accountId: "UC1234567890abcdefghijkl" }, OWNER)).status).toBe(200);
  });

  it("Meta's data deletion request removes that person's Meta connections and answers with a status URL and code", async () => {
    db.conns.set("c1", { id: "c1", ownerTelegramId: OWNER, provider: "instagram", externalId: "10229384756" } as ConnectionRow);
    db.conns.set("c2", { id: "c2", ownerTelegramId: OWNER, provider: "youtube", externalId: "10229384756" } as ConnectionRow);
    const payload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "10229384756", issued_at: 1 })).toString("base64url");
    const signed = `${createHmac("sha256", META_SECRET).update(payload).digest("base64url")}.${payload}`;
    const send = (sr: string) =>
      deletionRoute.POST(
        new Request("https://mercat.example/api/connect/meta/data-deletion", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": `10.2.0.${++ip}` },
          body: new URLSearchParams({ signed_request: sr }).toString(),
        }),
      );
    expect((await send(`${signed.slice(0, -2)}xx`)).status).toBe(400);
    expect(db.conns.size).toBe(2);
    const res = await send(signed);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe(`https://mercat.example/data-deletion?code=${body.confirmation_code}`);
    expect(body.confirmation_code).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect([...db.conns.keys()]).toEqual(["c2"]);
  });
});
