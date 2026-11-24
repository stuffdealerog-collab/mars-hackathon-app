import { describe, expect, it, vi } from "vitest";

// E7 (QA 2026-11-25): the week plan was lost on reload. POST /strategy now keeps the plan as the owner saw it, and
// GET /strategy?brandId= returns the latest one. The planners are mocks; store and memory run in memory.
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => { throw new Error("outside a request"); } }));
vi.mock("@/lib/db", () => ({ isDbConfigured: () => false, getSql: () => { throw new Error("no db in tests"); }, pgErrorCode: () => undefined }));
vi.mock("@/lib/track", () => ({ safeLogEvent: async () => {} }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ TELEGRAM_BOT_TOKEN: "test-token", BOT_USERNAME: "mercatai" }), getPublicUrl: () => undefined }));
vi.mock("@/lib/telegram-auth", () => ({
  authenticateRequest: (req: Request) => {
    const m = /^tma (\d+)$/.exec(req.headers.get("authorization") ?? "");
    return m ? { id: Number(m[1]) } : null;
  },
  validateInitData: () => ({ ok: false }),
}));
vi.mock("@/lib/uslub/http", async () => await import("../src/lib/uslub/http"));
vi.mock("@/lib/uslub/budget", async () => await import("../src/lib/uslub/budget"));
vi.mock("@/lib/uslub/context", async () => await import("../src/lib/uslub/context"));
vi.mock("@/lib/uslub/brain/route-utils", async () => await import("../src/lib/uslub/brain/route-utils"));
vi.mock("@/lib/uslub/brain/memory", async () => await import("../src/lib/uslub/brain/memory"));
vi.mock("@/lib/uslub/brain/kbstore", () => ({ loadKnowledge: async () => ({ text: "" }) }));
vi.mock("@/lib/uslub/llm", () => ({ getAnthropic: () => { throw new Error("no model"); }, LlmError: class extends Error {} }));

const plan = { weekOf: "2026-11-23", items: [{ day: "2026-11-26", time: "20:40", goal: "sale", pillar: "Ertalab", format: "photo", hook: "Kapuchino 25 000 so‘m", cta: "Buyurtma: https://t.me/mercatai?start=src_ab12cd_1", brief: "Burchak: ertalabki qahva", metric: "≥5 kishi botni ochadi", needsApproval: true }], rationale: "" };
const strategy = { positioning: "Metro yonidagi qahvaxona", audiences: [], offer: "", proofPoints: [], pillars: [], kpis: [], risks: [] };
vi.mock("@/lib/uslub/brain/strategy", () => ({ buildStrategy: async () => ({ strategy, plan, planTag: "ab12cd", ownerQuestions: ["Narxlar qancha?"], ledger: [{ id: "F1" }] }) }));
vi.mock("@/lib/uslub/brain/launch", () => ({ buildLaunchStrategy: async () => ({ mode: "fresh", strategy, plan, planTag: null, ownerQuestions: [], launch: { weeks: 2 } }) }));

const store = await import("../src/lib/uslub/store");
const route = await import("../src/app/api/uslub/strategy/route");
import type { BrandDNA } from "../src/lib/uslub/contract";

let ip = 0;
const call = (method: "GET" | "POST", url: string, body?: unknown, auth?: string) =>
  (method === "GET" ? route.GET : route.POST)(
    new Request(`http://localhost${url}`, {
      method,
      headers: { "content-type": "application/json", "x-forwarded-for": `10.1.0.${++ip}`, ...(auth ? { authorization: auth } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );

describe("the brand's latest plan survives a reload (E7)", () => {
  it("GET returns what POST showed: plan items with briefs and CTAs, the strategy and the owner's questions", async () => {
    const b = await store.saveBrand({ channel: "safiabakery", knowledge: "", samplePosts: ["a", "b", "c", "d", "e"], dna: { name: "Safia" } as unknown as BrandDNA, mode: "channel" }, null, "channel_only");
    expect((await (await call("GET", `/api/uslub/strategy?brandId=${b.id}`)).json()).plan).toBeNull();
    expect((await call("POST", "/api/uslub/strategy", { brandId: b.id, lang: "uz" })).status).toBe(200);
    const view = await (await call("GET", `/api/uslub/strategy?brandId=${b.id}`)).json();
    expect(view).toMatchObject({ mode: "channel", plan, strategy, planTag: "ab12cd", ownerQuestions: ["Narxlar qancha?"], lang: "uz" });
    expect(view.ledger).toBeUndefined(); // only what the owner saw
  });

  it("an owned brand's plan is private", async () => {
    const b = await store.saveBrand({ channel: "safiabakery", knowledge: "", samplePosts: ["a", "b", "c", "d", "e"], dna: { name: "Safia" } as unknown as BrandDNA, mode: "channel" }, 31337, "channel_only");
    expect((await call("POST", "/api/uslub/strategy", { brandId: b.id }, "tma 31337")).status).toBe(200);
    expect((await call("GET", `/api/uslub/strategy?brandId=${b.id}`)).status).toBe(403);
    expect((await (await call("GET", `/api/uslub/strategy?brandId=${b.id}`, undefined, "tma 31337")).json()).planTag).toBe("ab12cd");
  });

  it("nobody else can replace an owned brand's plan (403 before any Claude call)", async () => {
    const b = await store.saveBrand({ channel: "safiabakery", knowledge: "", samplePosts: ["a", "b", "c", "d", "e"], dna: { name: "Safia" } as unknown as BrandDNA, mode: "channel" }, 4040, "channel_only");
    expect((await call("POST", "/api/uslub/strategy", { brandId: b.id })).status).toBe(403);
    expect((await call("POST", "/api/uslub/strategy", { brandId: b.id }, "tma 777")).status).toBe(403);
    expect((await (await call("GET", `/api/uslub/strategy?brandId=${b.id}`, undefined, "tma 4040")).json()).plan).toBeNull();
  });
});
