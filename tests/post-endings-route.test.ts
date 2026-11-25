import { beforeEach, describe, expect, it, vi } from "vitest";

// Owner correction 1 through POST /api/uslub/posts: posts end the way the channel's posts end, the owner's contact is
// never deleted, Mercat's tracked link is opt-in, needs an owner and is put in by code. No DB, no network: llmJson is
// a mock, answers come from a mocked store.
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => { throw new Error("outside a request"); } }));
vi.mock("@/lib/db", () => ({ isDbConfigured: () => false, getSql: () => { throw new Error("no db in tests"); }, pgErrorCode: () => undefined }));
vi.mock("@/lib/track", () => ({ safeLogEvent: async () => {} }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ TELEGRAM_BOT_TOKEN: "test-token", BOT_USERNAME: "mercatai" }), getPublicUrl: () => undefined }));
vi.mock("../src/lib/env", () => ({ getEnv: () => ({ TELEGRAM_BOT_TOKEN: "test-token", BOT_USERNAME: "mercatai" }), getPublicUrl: () => undefined }));
vi.mock("@/lib/telegram-auth", () => ({
  authenticateRequest: (req: Request) => {
    const m = /^tma (\d+)$/.exec(req.headers.get("authorization") ?? "");
    return m ? { id: Number(m[1]) } : null;
  },
  validateInitData: () => ({ ok: false }),
}));
vi.mock("@/lib/uslub/http", async () => await import("../src/lib/uslub/http"));
vi.mock("@/lib/uslub/budget", async () => await import("../src/lib/uslub/budget"));
vi.mock("@/lib/uslub/store", async () => await import("../src/lib/uslub/store"));
vi.mock("@/lib/uslub/context", async () => await import("../src/lib/uslub/context"));
vi.mock("@/lib/uslub/errors", async () => await import("../src/lib/uslub/errors"));
vi.mock("@/lib/uslub/placeholders", async () => await import("../src/lib/uslub/placeholders"));
vi.mock("@/lib/uslub/postguard", async () => await import("../src/lib/uslub/postguard"));
vi.mock("@/lib/uslub/slots", async () => await import("../src/lib/uslub/slots"));
vi.mock("@/lib/uslub/sensitivity", async () => await import("../src/lib/uslub/sensitivity"));
vi.mock("@/lib/uslub/copywriter", async () => await import("../src/lib/uslub/copywriter"));
vi.mock("@/lib/uslub/brain/answers", async () => await import("../src/lib/uslub/brain/answers"));
const answers = { current: null as Record<string, unknown> | null };
vi.mock("@/lib/uslub/brain/answers-store", () => ({ loadAnswers: async () => answers.current }));
vi.mock("@/lib/uslub/brain/kbstore", () => ({ loadKnowledge: async () => ({ text: "", sources: [] }) }));
vi.mock("@/lib/uslub/ending", async () => await import("../src/lib/uslub/ending"));

const llmJson = vi.fn();
vi.mock("../src/lib/uslub/llm", () => ({
  llmJson,
  MODEL_QUALITY: "claude-sonnet-5-5",
  MODEL_FAST: "claude-haiku-5-5",
  LlmError: class extends Error {},
}));

const store = await import("../src/lib/uslub/store");
const budget = await import("../src/lib/uslub/budget");
const postsRoute = await import("../src/app/api/uslub/posts/route");
import type { BrandDNA } from "../src/lib/uslub/contract";

let ip = 0;
const post = (body: unknown, headers: Record<string, string> = {}) =>
  postsRoute.POST(
    new Request("http://localhost/api/uslub/posts", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.3.0.${++ip}`, ...headers },
      body: JSON.stringify(body),
    }),
  );

const LINK = "https://t.me/mercatai?start=src_ab12cd_2";
const SLOT = { day: "2026-11-27", time: "20:40", goal: "sale", hook: "Medovik — 180 000 so'm", cta: `Buyurtma bering: ${LINK}`, brief: "Medovik haqida" };
const written = (uz: string, ru = "Медовик — 180 000 сум.", en = "Medovik — 180,000 UZS.") => ({ posts: [{ angle: "sale", uz_latn: uz, ru, en }] });
const contactDna = { name: "Safia", products: ["Medovik"], languages: ["uz_latn"], postEnding: { pattern: "contact", contact: "📞 Buyurtma: +998 90 123 45 67", examples: ["📞 Buyurtma: +998 90 123 45 67"] } } as unknown as BrandDNA;
const noneDna = { name: "Dilnoza", products: [], languages: ["uz_latn"], postEnding: { pattern: "none", examples: ["Ertaga yana yozaman."] } } as unknown as BrandDNA;

let day = 0;
const slot = (over: Record<string, unknown> = {}) => ({ ...SLOT, day: `2026-12-${String(++day).padStart(2, "0")}`, ...over });

beforeEach(() => {
  llmJson.mockReset();
  budget.resetBudgetMemory();
  answers.current = null;
});

describe("post endings follow the channel (owner correction 1)", () => {
  it("a channel that ends with its phone: the post ends with that exact line; no Mercat link without the opt-in", async () => {
    const b = await store.saveBrand({ channel: "safiabakery", knowledge: "", samplePosts: [], dna: contactDna, mode: "channel" }, null, "channel_only");
    llmJson.mockResolvedValue(written(`Medovik — 180 000 so'm. Buyurtma bering: ${LINK}`));
    const p = (await (await post({ brandId: b.id, slots: [slot()] })).json()).posts[0];
    expect(p.variants.uz_latn.endsWith("📞 Buyurtma: +998 90 123 45 67")).toBe(true);
    expect(p.variants.ru.endsWith("📞 +998 90 123 45 67")).toBe(true);
    // The prompt never even saw the link: the plan's CTA lost it before writing.
    expect(JSON.stringify(llmJson.mock.calls[0][0].prompt)).not.toContain("src_ab12cd_2");
  });

  it("a channel whose posts just end: nothing is added, a contact blank is dropped", async () => {
    const b = await store.saveBrand({ channel: "dilnoza", knowledge: "", samplePosts: [], dna: noneDna, mode: "channel" }, null, "channel_only");
    llmJson.mockResolvedValue(written("Bugun yangi kitob o'qidim. Buyurtma uchun: [kontakt].", "Сегодня прочитала новую книгу.", "Read a new book today."));
    const p = (await (await post({ brandId: b.id, slots: [slot({ goal: "reach", cta: "" })] })).json()).posts[0];
    expect(p.variants.uz_latn).toBe("Bugun yangi kitob oʻqidim.");
    expect(p.needsApproval).toBeFalsy();
  });

  it("opted in and owned: the tracked link is put in by code and the owner's phone stays", async () => {
    answers.current = { trackLinks: true, orderHow: "phone", contact: "+998 90 123 45 67" };
    const b = await store.saveBrand({ channel: "safiabakery", knowledge: "", samplePosts: [], dna: contactDna, mode: "channel" }, 7007, "custom");
    llmJson.mockResolvedValue(written("Medovik — 180 000 so'm. Qo'ng'iroq qiling: +998 90 123 45 67."));
    const p = (await (await post({ brandId: b.id, slots: [slot()] }, { authorization: "tma 7007" })).json()).posts[0];
    expect(p.variants.uz_latn).toContain("+998 90 123 45 67");
    expect(p.variants.uz_latn).toContain(LINK);
    expect(p.variants.en).toContain(LINK);
  });

  it("opted in but nobody owns the brand yet: no tracked link", async () => {
    answers.current = { trackLinks: true };
    const b = await store.saveBrand({ channel: "safiabakery", knowledge: "", samplePosts: [], dna: contactDna, mode: "channel" }, null, "custom");
    llmJson.mockResolvedValue(written(`Medovik — 180 000 so'm. ${LINK}`));
    const p = (await (await post({ brandId: b.id, slots: [slot()] })).json()).posts[0];
    expect(p.variants.uz_latn).not.toContain("start=src_");
  });
});
