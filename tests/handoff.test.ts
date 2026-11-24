import { afterEach, describe, expect, it, vi } from "vitest";

const BOT_TOKEN = "123456:TEST-bot-token";
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => { throw new Error("outside a request"); } }));
vi.mock("@/lib/db", () => ({ isDbConfigured: () => false, getSql: () => { throw new Error("no db in tests"); } }));
vi.mock("@/lib/track", () => ({ safeLogEvent: async () => {} }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ TELEGRAM_BOT_TOKEN: "123456:TEST-bot-token" }), getPublicUrl: () => "https://mercat.test" }));
// A "tma <id>" header stands for a valid Mini App session of that user.
vi.mock("@/lib/telegram-auth", () => ({
  authenticateRequest: (req: Request) => {
    const m = /^tma (\d+)$/.exec(req.headers.get("authorization") ?? "");
    return m ? { id: Number(m[1]) } : null;
  },
  validateInitData: () => ({ ok: false }),
}));
vi.mock("@/lib/uslub/handoff", async () => await import("../src/lib/uslub/handoff"));
vi.mock("@/lib/uslub/http", async () => await import("../src/lib/uslub/http"));

import { signHandoffWith, studioLink, verifyHandoff, verifyHandoffWith } from "../src/lib/uslub/handoff";
const { miniAppUserId, telegramUserId } = await import("../src/lib/uslub/http");
const store = await import("../src/lib/uslub/store");
const route = await import("../src/app/api/uslub/handoff/route");
import type { BrandDNA } from "../src/lib/uslub/contract";

const NOW = Date.parse("2026-11-25T08:00:00Z");
const DAY = 86_400_000;
const withAuth = (auth?: string) => new Request("http://x/api/uslub/posts", { headers: auth ? { authorization: auth } : {} });
/** The handoff key of a Studio link: it lives in the fragment (`#k=`), never in the query sent to the server. */
const keyOf = (url: URL) => {
  expect(url.searchParams.has("k")).toBe(false);
  return new URLSearchParams(url.hash.slice(1)).get("k");
};

describe("handoff key: sign and verify", () => {
  it("round-trips the Telegram user id while it is valid", () => {
    const k = signHandoffWith(BOT_TOKEN, 777, 7, NOW);
    expect(k).toMatch(/^777\.\d+\.[A-Za-z0-9_-]{43}$/);
    expect(verifyHandoffWith(BOT_TOKEN, k, NOW)).toBe(777);
    expect(verifyHandoffWith(BOT_TOKEN, k, NOW + 6 * DAY)).toBe(777);
  });

  it("refuses an expired key", () => {
    const k = signHandoffWith(BOT_TOKEN, 777, 7, NOW);
    expect(verifyHandoffWith(BOT_TOKEN, k, NOW + 7 * DAY + 1000)).toBeNull();
  });

  it("refuses a key signed with another bot token, or with a changed user id or expiry", () => {
    const foreign = signHandoffWith("999:other-bot", 777, 7, NOW);
    expect(verifyHandoffWith(BOT_TOKEN, foreign, NOW)).toBeNull();
    const k = signHandoffWith(BOT_TOKEN, 777, 7, NOW);
    const [, exp, sig] = k.split(".");
    expect(verifyHandoffWith(BOT_TOKEN, `778.${exp}.${sig}`, NOW)).toBeNull(); // someone else's id
    expect(verifyHandoffWith(BOT_TOKEN, `777.${Number(exp) + 86_400 * 365}.${sig}`, NOW)).toBeNull(); // extended
  });

  it("refuses garbage and impossible ids", () => {
    for (const k of [null, undefined, "", "777", "777.1.abc", "0.99999999999.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "a.b.c"]) expect(verifyHandoffWith(BOT_TOKEN, k, NOW)).toBeNull();
    expect(() => signHandoffWith(BOT_TOKEN, 0)).toThrow();
  });

  it("the bot's Studio link carries a key the server accepts, in the fragment only", () => {
    const link = studioLink("1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed", 777);
    expect(link).toMatch(/^https:\/\/mercat\.test\/studio\?brand=1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed#k=777\.\d+\.[A-Za-z0-9_-]{43}$/);
    const url = new URL(link);
    expect(url.origin + url.pathname).toBe("https://mercat.test/studio");
    expect(url.searchParams.get("brand")).toBe("1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed");
    expect(verifyHandoff(keyOf(url))).toBe(777);
    const anonymous = new URL(studioLink("b", null));
    expect(keyOf(anonymous)).toBeNull();
    expect(anonymous.hash).toBe("");
  });
});

describe("telegramUserId", () => {
  afterEach(() => vi.restoreAllMocks());

  it("accepts Authorization: handoff <k> after tma", () => {
    const k = signHandoffWith(BOT_TOKEN, 777);
    expect(telegramUserId(withAuth(`handoff ${k}`))).toBe(777);
    expect(telegramUserId(withAuth("tma 555"))).toBe(555);
    expect(telegramUserId(withAuth())).toBeNull();
  });

  it("returns null for a bad key and never logs the key", () => {
    const spies = (["log", "warn", "error", "info"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const forged = signHandoffWith("999:other-bot", 777);
    expect(telegramUserId(withAuth(`handoff ${forged}`))).toBeNull();
    expect(telegramUserId(withAuth("handoff not-a-key"))).toBeNull();
    for (const s of spies) for (const call of s.mock.calls) expect(JSON.stringify(call)).not.toContain(forged);
  });

  it("a handoff key is not a Telegram session (it cannot mint another key)", () => {
    expect(miniAppUserId(withAuth(`handoff ${signHandoffWith(BOT_TOKEN, 777)}`))).toBeNull();
  });
});

describe("POST /api/uslub/handoff (Mini App: open on computer)", () => {
  const brand = (owner: number | null) =>
    store.saveBrand({ channel: "tortlar_uz", knowledge: "x", samplePosts: [], dna: { name: "Tort" } as unknown as BrandDNA, mode: "channel" }, owner, "custom");
  const post = (auth: string | undefined, brandId: string) =>
    route.POST(
      new Request("http://x/api/uslub/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(auth ? { authorization: auth } : {}) },
        body: JSON.stringify({ brandId }),
      }),
    );

  it("gives the owner a Studio link with their key", async () => {
    const b = await brand(777);
    const res = await post("tma 777", b.id);
    expect(res.status).toBe(200);
    const url = new URL(((await res.json()) as { url: string }).url);
    expect(url.searchParams.get("brand")).toBe(b.id);
    expect(verifyHandoff(keyOf(url))).toBe(777);
  });

  it("refuses a handoff key (no self-extension), anonymous callers and other owners", async () => {
    const b = await brand(777);
    const viaHandoff = await post(`handoff ${signHandoffWith(BOT_TOKEN, 777)}`, b.id);
    expect(viaHandoff.status).toBe(401);
    expect(((await viaHandoff.json()) as { code: string }).code).toBe("auth_required");
    expect((await post(undefined, b.id)).status).toBe(401);
    expect((await post("tma 888", b.id)).status).toBe(403);
  });
});
