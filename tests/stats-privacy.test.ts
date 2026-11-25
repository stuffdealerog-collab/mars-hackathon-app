import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { bucketSources, eventStartPayload, sourceCategory } from "../src/lib/source-category";
import { statsGate } from "../src/lib/stats-access";

const UUID = "3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b";
const basic = (user: string, password: string) => `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;

describe("sourceCategory", () => {
  it("keeps only the word in front of an id", () => {
    expect(sourceCategory(`publish_${UUID}`)).toBe("publish");
    expect(sourceCategory(`publish_${UUID}_uz_latn`)).toBe("publish");
    expect(sourceCategory(`brand_${UUID}`)).toBe("brand");
    expect(sourceCategory(`post_${UUID}`)).toBe("post");
    expect(sourceCategory("ch_my_bakery")).toBe("ch");
    expect(sourceCategory("ref_42")).toBe("ref");
    expect(sourceCategory("promo_a1b2c3d4e5f6")).toBe("promo");
    expect(sourceCategory("tg_ads_2026")).toBe("tg_ads");
  });

  it("buckets tracked plan links, with or without the src_ prefix", () => {
    expect(sourceCategory("src_k3x9qa_4")).toBe("plan");
    expect(sourceCategory("k3x9qa_12")).toBe("plan");
  });

  it("keeps safe words as they are", () => {
    expect(sourceCategory("start")).toBe("start");
    expect(sourceCategory("landing")).toBe("landing");
    expect(sourceCategory("src_booth1")).toBe("booth1");
    expect(sourceCategory("booth1")).toBe("booth1");
    expect(sourceCategory("utm_source_instagram")).toBe("utm_source_instagram");
    expect(sourceCategory("Landing")).toBe("landing");
  });

  it("never returns an id", () => {
    expect(sourceCategory(UUID)).toBe("other");
    expect(sourceCategory("123456789")).toBe("other");
    expect(sourceCategory("deadbeef1234")).toBe("other");
    expect(sourceCategory("has space")).toBe("other");
    expect(sourceCategory("a".repeat(65))).toBe("other");
  });

  it("is empty for no payload and idempotent", () => {
    expect(sourceCategory(null)).toBeNull();
    expect(sourceCategory(undefined)).toBeNull();
    expect(sourceCategory("  ")).toBeNull();
    for (const p of [`publish_${UUID}`, `brand_${UUID}`, "src_k3x9qa_4", "src_booth1", "utm_source_ig", UUID]) {
      const once = sourceCategory(p);
      expect(sourceCategory(once)).toBe(once);
    }
  });
});

describe("eventStartPayload", () => {
  it("keeps plan links whole (brain/memory.ts counts starts per link) and reduces the rest", () => {
    expect(eventStartPayload("src_k3x9qa_4")).toBe("src_k3x9qa_4");
    expect(eventStartPayload(`publish_${UUID}_ru`)).toBe("publish");
    expect(eventStartPayload(`brand_${UUID}`)).toBe("brand");
    expect(eventStartPayload("")).toBeNull();
  });
});

describe("bucketSources", () => {
  it("merges raw rows stored before categories into categories, empty as direct", () => {
    const rows = [
      { source: `publish_${UUID}`, count: 2 },
      { source: `publish_${UUID.replace("3f", "4e")}_ru`, count: 3 },
      { source: `brand_${UUID}`, count: 1 },
      { source: "booth1", count: 4 },
      { source: null, count: 6 },
      { source: "", count: 1 },
      { source: "k3x9qa_4", count: 2 },
    ];
    expect(bucketSources(rows)).toEqual([
      { source: "direct", count: 7 },
      { source: "publish", count: 5 },
      { source: "booth1", count: 4 },
      { source: "plan", count: 2 },
      { source: "brand", count: 1 },
    ]);
    expect(JSON.stringify(bucketSources(rows))).not.toContain(UUID);
  });
});

describe("statsGate", () => {
  const prod = { NODE_ENV: "production", STATS_PASSWORD: "correct horse" };

  it("hides the page in production when no password is set", () => {
    expect(statsGate(null, { NODE_ENV: "production" })).toBe("hidden");
    expect(statsGate(basic("mercat", "anything"), { NODE_ENV: "production", STATS_PASSWORD: "  " })).toBe("hidden");
  });

  it("is open in development without a password", () => {
    expect(statsGate(null, { NODE_ENV: "development" })).toBe("allow");
  });

  it("asks for the password when it is missing or wrong", () => {
    expect(statsGate(null, prod)).toBe("challenge");
    expect(statsGate("Bearer correct horse", prod)).toBe("challenge");
    expect(statsGate("Basic !!!", prod)).toBe("challenge");
    expect(statsGate(`Basic ${Buffer.from("no-colon").toString("base64")}`, prod)).toBe("challenge");
    expect(statsGate(basic("mercat", "wrong"), prod)).toBe("challenge");
    expect(statsGate(basic("mercat", "correct horse!"), prod)).toBe("challenge");
    expect(statsGate(basic("mercat", ""), prod)).toBe("challenge");
  });

  it("lets the right password in, whatever the user name", () => {
    expect(statsGate(basic("mercat", "correct horse"), prod)).toBe("allow");
    expect(statsGate(basic("", "correct horse"), prod)).toBe("allow");
    expect(statsGate(basic("owner", "correct horse"), prod)).toBe("allow");
    expect(statsGate(basic("mercat", "pass:with:colons"), { ...prod, STATS_PASSWORD: "pass:with:colons" })).toBe("allow");
    // A password set in development is enforced too.
    expect(statsGate(null, { NODE_ENV: "development", STATS_PASSWORD: "x" })).toBe("challenge");
  });
});

describe("proxy for /stats", () => {
  afterEach(() => vi.unstubAllEnvs());
  const request = (auth?: string) =>
    new Request("https://mercat.test/stats", auth ? { headers: { authorization: auth } } : {}) as never;

  it("answers 404 in production without STATS_PASSWORD, 401 with a Basic challenge, and passes the right password", async () => {
    const { proxy, config } = await import("../src/proxy");
    expect(config.matcher).toContain("/stats");

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STATS_PASSWORD", "");
    const hidden = proxy(request());
    expect(hidden.status).toBe(404);
    expect(hidden.headers.get("cache-control")).toContain("no-store");

    vi.stubEnv("STATS_PASSWORD", "s3cret-pass");
    const challenged = proxy(request());
    expect(challenged.status).toBe(401);
    expect(challenged.headers.get("www-authenticate")).toMatch(/^Basic realm=/);
    expect(challenged.headers.get("cache-control")).toContain("no-store");
    expect(proxy(request(basic("mercat", "nope"))).status).toBe(401);

    const allowed = proxy(request(basic("mercat", "s3cret-pass")));
    expect(allowed.headers.get("x-middleware-next")).toBe("1");
    expect(allowed.headers.get("cache-control")).toContain("no-store");
  });
});

describe("anonIpKey", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is a keyed hash: same shape, stable per secret, different from the old unsalted hash and per purpose", async () => {
    const { createHash } = await import("node:crypto");
    const { anonIpKey } = await import("../src/lib/anon-key");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123456:TEST-bot-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    const a = anonIpKey("203.0.113.7", "claude");
    expect(a).toMatch(/^ip:[0-9a-f]{16}$/);
    expect(anonIpKey("203.0.113.7", "claude")).toBe(a);
    expect(anonIpKey("203.0.113.8", "claude")).not.toBe(a);
    expect(anonIpKey("203.0.113.7", "media")).not.toBe(a);
    const unsalted = `ip:${createHash("sha256").update("claude:203.0.113.7").digest("hex").slice(0, 16)}`;
    expect(a).not.toBe(unsalted);

    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123456:TEST-bot-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    expect(anonIpKey("203.0.113.7", "claude")).not.toBe(a);
  });
});
