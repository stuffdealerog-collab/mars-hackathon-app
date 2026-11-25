import { describe, expect, it, vi } from "vitest";

// POST /api/uslub/strategy hands the week planner the brand's post ending (owner correction 1). A brand made before
// endings were learned (no dna.postEnding) gets one computed from its stored posts, as the copywriter does, so the
// plan's sale CTAs carry the channel's own contact. The planner is a mock that records what it gets.
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => { throw new Error("outside a request"); } }));
vi.mock("@/lib/db", () => ({ isDbConfigured: () => false, getSql: () => { throw new Error("no db in tests"); }, pgErrorCode: () => undefined }));
vi.mock("@/lib/track", () => ({ safeLogEvent: async () => {} }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ TELEGRAM_BOT_TOKEN: "test-token", BOT_USERNAME: "mercatai" }), getPublicUrl: () => undefined }));
vi.mock("@/lib/telegram-auth", () => ({ authenticateRequest: () => null, validateInitData: () => ({ ok: false }) }));
vi.mock("@/lib/uslub/http", async () => await import("../src/lib/uslub/http"));
vi.mock("@/lib/uslub/budget", async () => await import("../src/lib/uslub/budget"));
vi.mock("@/lib/uslub/context", async () => await import("../src/lib/uslub/context"));
vi.mock("@/lib/uslub/brain/route-utils", async () => await import("../src/lib/uslub/brain/route-utils"));
vi.mock("@/lib/uslub/brain/memory", async () => await import("../src/lib/uslub/brain/memory"));
vi.mock("@/lib/uslub/brain/kbstore", () => ({ loadKnowledge: async () => ({ text: "" }) }));
vi.mock("@/lib/uslub/brain/answers-store", () => ({ loadAnswers: async () => null }));
vi.mock("@/lib/uslub/brain/channel-type", async () => await import("../src/lib/uslub/brain/channel-type"));
vi.mock("@/lib/uslub/store", async () => await import("../src/lib/uslub/store"));
vi.mock("@/lib/uslub/ending", async () => await import("../src/lib/uslub/ending"));
vi.mock("@/lib/uslub/llm", () => ({ getAnthropic: () => { throw new Error("no model"); }, LlmError: class extends Error {} }));

const plan = { weekOf: "2026-11-23", items: [], rationale: "" };
const buildStrategy = vi.fn<(inp: { postEnding?: unknown }) => Promise<unknown>>(async () => ({ strategy: {}, plan, planTag: "ab12cd", ownerQuestions: [], ledger: [] }));
vi.mock("@/lib/uslub/brain/strategy", () => ({ buildStrategy }));
vi.mock("@/lib/uslub/brain/launch", () => ({ buildLaunchStrategy: async () => ({ mode: "fresh", strategy: {}, plan, planTag: null, ownerQuestions: [] }) }));

const store = await import("../src/lib/uslub/store");
const route = await import("../src/app/api/uslub/strategy/route");
import type { BrandDNA } from "../src/lib/uslub/contract";

let ip = 0;
const post = (body: unknown) =>
  route.POST(new Request("http://localhost/api/uslub/strategy", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.3.0.${++ip}` }, body: JSON.stringify(body) }));

const POSTS = [
  "Medovik torti tayyor. Narxi 180 000 so'm.\n\n📞 +998 90 123 45 67\n📍 Chilonzor, 9-kvartal",
  "Napoleon — 1 kg 150 000 so'm.\n\n📞 +998 90 123 45 67\n📍 Chilonzor, 9-kvartal",
  "Qizil baxmal tortimiz ertalabdan tayyor.\n\n📞 +998 90 123 45 67\n📍 Chilonzor, 9-kvartal",
];

describe("POST /api/uslub/strategy: the post ending", () => {
  it("a brand made before endings were learned gets one from its stored posts", async () => {
    const b = await store.saveBrand({ channel: "safiabakery", knowledge: "", samplePosts: POSTS, dna: { name: "Safia" } as unknown as BrandDNA, mode: "channel" }, null, "channel_only");
    expect((await post({ brandId: b.id, lang: "uz" })).status).toBe(200);
    expect(buildStrategy.mock.calls.at(-1)?.[0].postEnding).toMatchObject({ pattern: "contact", contact: "📞 +998 90 123 45 67" });
  });

  it("a learned ending is passed as it is stored", async () => {
    const postEnding = { pattern: "admin", examples: ["Lichkaga yozing"] };
    const b = await store.saveBrand({ channel: "safia_admin", knowledge: "", samplePosts: POSTS, dna: { name: "Safia", postEnding } as unknown as BrandDNA, mode: "channel" }, null, "channel_only");
    expect((await post({ brandId: b.id, lang: "uz" })).status).toBe(200);
    expect(buildStrategy.mock.calls.at(-1)?.[0].postEnding).toEqual(postEnding);
  });
});
