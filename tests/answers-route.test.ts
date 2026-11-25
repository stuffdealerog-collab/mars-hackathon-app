import { describe, expect, it, vi } from "vitest";

// POST/GET /api/uslub/answers against the in-memory store and the in-memory answers store (no DB, no Claude).
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
vi.mock("@/lib/uslub/context", async () => await import("../src/lib/uslub/context"));
vi.mock("@/lib/uslub/store", async () => await import("../src/lib/uslub/store"));
vi.mock("@/lib/uslub/brain/answers", async () => await import("../src/lib/uslub/brain/answers"));
vi.mock("@/lib/uslub/brain/answers-store", async () => await import("../src/lib/uslub/brain/answers-store"));
vi.mock("@/lib/uslub/brain/brand-questions", async () => await import("../src/lib/uslub/brain/brand-questions"));
vi.mock("@/lib/uslub/brain/channel-type", async () => await import("../src/lib/uslub/brain/channel-type"));
vi.mock("@/lib/uslub/samples", async () => await import("../src/lib/uslub/samples"));
const spendClaude = vi.fn(async () => {});
vi.mock("@/lib/uslub/budget", () => ({ spendClaude }));

const store = await import("../src/lib/uslub/store");
const route = await import("../src/app/api/uslub/answers/route");
const { planTypeFor } = await import("../src/lib/uslub/brain/channel-type");
import type { BrandDNA } from "../src/lib/uslub/contract";

let ip = 0;
const call = (method: "GET" | "POST", url: string, body?: unknown, auth?: string) =>
  (method === "GET" ? route.GET : route.POST)(
    new Request(`http://localhost${url}`, {
      method,
      headers: { "content-type": "application/json", "x-forwarded-for": `10.2.0.${++ip}`, ...(auth ? { authorization: auth } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );

const DNA = { name: "Safia", products: ["Medovik", "Napoleon"], postEnding: { pattern: "contact", contact: "📞 +998 90 123 45 67", examples: [] } } as unknown as BrandDNA;

describe("POST/GET /api/uslub/answers", () => {
  it("open questions come from the brand: goal first, then a confirm of the channel's own contact", async () => {
    const b = await store.saveBrand({ channel: "safiabakery", knowledge: "", samplePosts: ["a", "b", "c"], dna: DNA, mode: "channel", channelType: "business", goal: "sale" }, null, "channel_only");
    const r = await (await call("GET", `/api/uslub/answers?brandId=${b.id}&lang=ru`)).json();
    expect(r.channelType).toBe("business");
    expect(r.questions.map((q: { key: string }) => q.key)).toEqual(["goal", "order", "prices"]);
    expect(r.questions[1].text).toContain("+998 90 123 45 67");
    expect(r.trackLinksActive).toBe(false);
  });

  it("saving answers spends no Claude budget, makes a channel_only brand the caller's own, and the newest answers win", async () => {
    const b = await store.saveBrand({ channel: "safiabakery", knowledge: "", samplePosts: ["a"], dna: DNA, mode: "channel", channelType: "business" }, null, "channel_only");
    const first = await call("POST", "/api/uslub/answers", { brandId: b.id, goal: "sale", orderHow: "phone", contact: "+998 90 123 45 67" });
    expect(first.status).toBe(200);
    expect(spendClaude).not.toHaveBeenCalled();
    expect((await store.getBrand(b.id))?.source).toBe("custom");
    expect((await store.getBrand(b.id))?.goal).toBe("sale");
    const second = await (await call("POST", "/api/uslub/answers", { brandId: b.id, prices: [{ name: "Medovik", price: 180000 }], trackLinks: true })).json();
    expect(second.answers).toMatchObject({ goal: "sale", orderHow: "phone", contact: "+998 90 123 45 67", prices: [{ name: "Medovik", price: "180000" }], trackLinks: true });
    // Opted in, but the brand has no owner in Telegram yet: no tracked links until it is claimed.
    expect(second.trackLinksActive).toBe(false);
    expect(second.questions).toEqual([]);
  });

  it("an owned brand's answers are private, and an empty answer is refused", async () => {
    const b = await store.saveBrand({ channel: "safiabakery", knowledge: "", samplePosts: ["a"], dna: DNA, mode: "channel" }, 5150, "custom");
    expect((await call("POST", "/api/uslub/answers", { brandId: b.id, goal: "grow" })).status).toBe(403);
    expect((await call("GET", `/api/uslub/answers?brandId=${b.id}`)).status).toBe(403);
    expect((await call("POST", "/api/uslub/answers", { brandId: b.id }, "tma 5150")).status).toBe(400);
    const ok = await (await call("POST", "/api/uslub/answers", { brandId: b.id, goal: "grow", trackLinks: true }, "tma 5150")).json();
    expect(ok.trackLinksActive).toBe(true);
    expect(ok.questions.map((q: { key: string }) => q.key)).toEqual(["about"]);
  });

  // Review of PR #54.
  it("the goal is only ever the owner's: null until answered (with the type's suggestion); the plan type follows it", async () => {
    const b = await store.saveBrand({ channel: "safia_goal", knowledge: "", samplePosts: ["a"], dna: DNA, mode: "channel", channelType: "business" }, null, "channel_only");
    const before = await (await call("GET", `/api/uslub/answers?brandId=${b.id}`)).json();
    expect(before).toMatchObject({ goal: null, suggestedGoal: "sale", channelType: "business" });
    // A shop whose owner wants subscribers is planned and analysed as a growth channel: planTypeFor(type, goal).
    await call("POST", "/api/uslub/answers", { brandId: b.id, goal: "grow" });
    const shop = await store.getBrand(b.id);
    expect(shop).toMatchObject({ goal: "grow", channelType: "business" });
    expect(planTypeFor(shop?.channelType, shop?.goal)).toBe("community");
    // A blog whose owner wants orders gets a sales plan.
    const blog = await store.saveBrand({ channel: "dilnoza_goal", knowledge: "", samplePosts: ["a"], dna: DNA, mode: "channel", channelType: "blog" }, null, "channel_only");
    await call("POST", "/api/uslub/answers", { brandId: blog.id, goal: "sale" });
    const sold = await store.getBrand(blog.id);
    expect(sold).toMatchObject({ goal: "sale", channelType: "blog" });
    expect(planTypeFor(sold?.channelType, sold?.goal)).toBe("business");
  });

  // Verifier of PR #54: blog -> "sale" -> "grow" used to end as a community channel.
  it("a goal changed back and forth lands on the channel's own detected type again", async () => {
    const blog = await store.saveBrand({ channel: "dilnoza_flip", knowledge: "", samplePosts: ["a"], dna: DNA, mode: "channel", channelType: "blog" }, null, "channel_only");
    await call("POST", "/api/uslub/answers", { brandId: blog.id, goal: "sale" });
    await call("POST", "/api/uslub/answers", { brandId: blog.id, goal: "grow" });
    const after = await store.getBrand(blog.id);
    expect(after).toMatchObject({ goal: "grow", channelType: "blog" });
    expect(planTypeFor(after?.channelType, after?.goal)).toBe("blog");
    const view = await (await call("GET", `/api/uslub/answers?brandId=${blog.id}`)).json();
    expect(view).toMatchObject({ channelType: "blog", goal: "grow", suggestedGoal: "grow" });
  });

  it("a channel_only row made 'custom' by the answers keeps its samples marked as the channel's", async () => {
    const b = await store.saveBrand({ channel: "safia_mark", knowledge: "", samplePosts: ["a"], dna: DNA, mode: "channel", channelType: "business" }, null, "channel_only");
    await call("POST", "/api/uslub/answers", { brandId: b.id, orderHow: "phone" });
    const after = await store.getBrand(b.id);
    expect(after?.source).toBe("custom");
    expect((after?.dna as { samplesFrom?: string }).samplesFrom).toBe("channel");
  });
});
