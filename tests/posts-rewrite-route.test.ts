import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/uslub/posts/rewrite (review of PR #54): access before budget, a published post is never rewritten, a
// rewrite that adds a fact keeps the old text, a blank keeps the post from going out, and an approved post that was
// rewritten is a draft again (the autopilot never sends text the owner has not seen). In-memory store, llmJson mock.
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
vi.mock("@/lib/uslub/store", async () => await import("../src/lib/uslub/store"));
vi.mock("@/lib/uslub/context", async () => await import("../src/lib/uslub/context"));
vi.mock("@/lib/uslub/errors", async () => await import("../src/lib/uslub/errors"));
vi.mock("@/lib/uslub/placeholders", async () => await import("../src/lib/uslub/placeholders"));
vi.mock("@/lib/uslub/copywriter", async () => await import("../src/lib/uslub/copywriter"));
const spendClaude = vi.fn(async () => {});
vi.mock("@/lib/uslub/budget", () => ({ spendClaude }));
const llmJson = vi.fn();
vi.mock("../src/lib/uslub/llm", () => ({ llmJson, MODEL_QUALITY: "claude-sonnet-5-5", MODEL_FAST: "claude-haiku-5-5", LlmError: class extends Error {} }));

const store = await import("../src/lib/uslub/store");
const route = await import("../src/app/api/uslub/posts/rewrite/route");
import type { BrandDNA, PostDraft, Script } from "../src/lib/uslub/contract";

let ip = 0;
const rewrite = (body: unknown, auth?: string) =>
  route.POST(
    new Request("http://localhost/api/uslub/posts/rewrite", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.4.0.${++ip}`, ...(auth ? { authorization: auth } : {}) },
      body: JSON.stringify(body),
    }),
  );

const DNA = { name: "Safia", products: ["Medovik"], languages: ["uz_latn"] } as unknown as BrandDNA;
const OLD = { uz_latn: "Medovik — 180 000 so‘m. Buyurtma bering.", uz_cyrl: "Медовик — 180 000 сўм.", ru: "Медовик — 180 000 сум. Заказывайте.", en: "Medovik — 180,000 UZS. Order now." } as Record<Script, string>;

async function makePost(owner: number | null, status: PostDraft["status"] = "draft") {
  const brand = await store.saveBrand({ channel: "safiabakery", knowledge: "", samplePosts: [], dna: DNA, mode: "channel" }, owner, "custom");
  const id = crypto.randomUUID();
  await store.savePosts([{ id, brandId: brand.id, brief: "Medovik", variants: { ...OLD }, neuroHits: {}, humanScore: 90, status: "draft", createdAt: new Date().toISOString() }]);
  if (status === "approved") await store.approvePost(id);
  if (status === "published") await store.markPublished(id, "https://t.me/safiabakery/1", "@safiabakery", owner ?? 1);
  return { brand, id };
}

beforeEach(() => {
  llmJson.mockReset();
  spendClaude.mockClear();
});

describe("POST /api/uslub/posts/rewrite", () => {
  it("another owner's post: 403, and no budget unit is spent", async () => {
    const { id } = await makePost(777);
    const res = await rewrite({ postId: id, instruction: "qisqaroq" }, "tma 778");
    expect(res.status).toBe(403);
    expect(spendClaude).not.toHaveBeenCalled();
    expect(llmJson).not.toHaveBeenCalled();
  });

  it("a published post: 409, never rewritten, no budget unit", async () => {
    const { id } = await makePost(777, "published");
    const res = await rewrite({ postId: id, instruction: "qisqaroq" }, "tma 777");
    expect(res.status).toBe(409);
    expect(spendClaude).not.toHaveBeenCalled();
  });

  it("a rewrite that makes up a fact keeps the old text (kept), and the post is not touched", async () => {
    const { id } = await makePost(777, "approved");
    llmJson.mockResolvedValue({ uz_latn: "Medovik — 180 000 so‘m. 20% chegirma!", ru: "Медовик — 180 000 сум. Скидка 20%!", en: "Medovik — 180,000 UZS. 20% off!" });
    const res = await rewrite({ postId: id, instruction: "qisqaroq" }, "tma 777");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(spendClaude).toHaveBeenCalledTimes(1);
    expect(body.kept).toEqual(["uz_latn", "ru", "en"]);
    expect(body.reapprove).toBe(false);
    expect(body.post.variants.ru).toBe(OLD.ru);
    // Nothing changed, so the owner's approval stands.
    expect((await store.getPost(id))?.status).toBe("approved");
  });

  it("a hidden price becomes a blank: the post comes back needing approval", async () => {
    const { id } = await makePost(777);
    llmJson.mockResolvedValue({ uz_latn: "Medovik tayyor. Narxini lichkada aytamiz.", ru: "Медовик готов. Цену уточняйте в личке.", en: "Medovik is ready. Price in DM." });
    const body = await (await rewrite({ postId: id, instruction: "narxni olib tashla" }, "tma 777")).json();
    expect(body.post.needsApproval).toBe(true);
    expect(body.post.placeholders.length).toBeGreaterThan(0);
    expect(body.post.variants.uz_latn).toContain("[narx]");
  });

  it("an approved post that was rewritten is a draft again, approval cleared", async () => {
    const { id } = await makePost(777, "approved");
    expect((await store.getPost(id))?.approvedAt).toBeTruthy();
    llmJson.mockResolvedValue({ uz_latn: "Medovik — 210 000 so‘m. Buyurtma bering.", ru: "Медовик — 210 000 сум. Заказывайте.", en: "Medovik — 210,000 UZS. Order now." });
    const body = await (await rewrite({ postId: id, instruction: "narxi 210 000" }, "tma 777")).json();
    expect(body.kept).toEqual([]);
    expect(body.reapprove).toBe(true);
    expect(body.post.status).toBe("draft");
    const stored = await store.getPost(id);
    expect(stored?.status).toBe("draft");
    expect(stored?.approvedAt).toBeUndefined();
    expect(stored?.variants.en).toContain("210,000 UZS");
  });
});
