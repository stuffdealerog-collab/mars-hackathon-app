import { describe, expect, it, vi } from "vitest";

/**
 * POST /api/uslub/media/post-image through the real route, store and access check (memory store,
 * no DB); only the picture provider is faked. The "@/" alias is not configured for vitest, so the
 * route's aliased imports are pointed at the real files.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/db", () => ({
  isDbConfigured: () => false,
  getSql: () => {
    throw new Error("no db in tests");
  },
}));
vi.mock("@/lib/track", () => ({ safeLogEvent: async () => {} }));
vi.mock("@/lib/i18n", async () => await import("../../i18n"));
vi.mock("@/lib/env", () => ({ getEnv: () => ({}), getPublicUrl: () => undefined }));
vi.mock("@/lib/telegram-auth", () => ({ authenticateRequest: () => null, validateInitData: () => ({ ok: false }) }));
vi.mock("@/lib/uslub/http", async () => await import("../http"));
vi.mock("@/lib/uslub/media/config", async () => await import("./config"));
vi.mock("@/lib/uslub/media/post-image", async () => await import("./post-image"));
vi.mock("@/lib/uslub/media/post-repo", async () => await import("./post-repo"));
vi.mock("@/lib/uslub/media/route-errors", async () => await import("./route-errors"));
vi.mock("@/lib/uslub/visual/images", async () => await import("../visual/images"));
vi.mock("@/lib/uslub/visual/service", async () => await import("../visual/service"));
vi.mock("@/lib/uslub/visual/storage", async () => await import("../visual/storage"));

// The provider: a scripted fal stand-in behind the real job system (memory repo).
const { MediaJobs } = await import("./jobs");
const { MemoryMediaJobRepo } = await import("./repo");
const submits: unknown[] = [];
const jobs = new MediaJobs({
  repo: new MemoryMediaJobRepo(),
  providers: [
    {
      id: "fal",
      label: "fake fal",
      acceptsDataUrls: true,
      isConfigured: () => true,
      supports: () => true,
      model: () => "fal-ai/nano-banana-2/edit",
      submit: async (req) => {
        submits.push(req);
        return { requestId: `r${submits.length}`, model: "fal-ai/nano-banana-2/edit" };
      },
      poll: async () => ({ status: "running" as const }),
    },
  ],
});
const { savePostImage } = await import("./post-repo");
vi.mock("@/lib/uslub/media/post-image-service", () => ({
  postImageDeps: () => ({ jobs, save: savePostImage, provider: "fal" }),
  ensureVisual: async () => undefined,
}));

const store = await import("../store");
const { POST } = await import("../../../app/api/uslub/media/post-image/route");
import type { BrandDNA, PostDraft } from "../contract";

const dna = { name: "Test", oneLiner: "Uyda tort", products: [], languages: ["uz_latn"] } as unknown as BrandDNA;

async function makePost(owner: number | null) {
  const brand = await store.saveBrand({ channel: "tortchi_test", knowledge: "Uyda tort pishiraman.", samplePosts: [], dna, mode: "channel" }, owner, "custom");
  const post: PostDraft = {
    id: crypto.randomUUID(),
    brandId: brand.id,
    brief: "Bento-tort",
    variants: { uz_latn: "Bento-tort 150 000 so‘mdan.", uz_cyrl: "", ru: "", en: "" },
    neuroHits: {},
    humanScore: 90,
    status: "draft",
    createdAt: new Date().toISOString(),
  };
  await store.savePosts([post]);
  return { brand, post };
}

const anonymousPost = (postId: string, extra: Record<string, unknown> = {}) =>
  POST(
    new Request("https://mercat.test/api/uslub/media/post-image", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.7" },
      body: JSON.stringify({ postId, lang: "en", ...extra }),
    }),
  );

describe("POST /api/uslub/media/post-image and claimed web brands", () => {
  it("a web brand claimed in the bot keeps making pictures for the anonymous id holder", async () => {
    const { brand, post } = await makePost(null);
    expect(await store.claimBrand(brand.id, 4242)).not.toBeNull();
    expect((await store.getBrand(brand.id))?.ownerTelegramId).toBe(4242);

    const res = await anonymousPost(post.id);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.image).toMatchObject({ status: "queued", refsUsed: 0 });
    expect(submits.length).toBeGreaterThan(0);
  });

  it("a brand owned from the start (created in the bot, never claimed from the web) refuses anonymous callers", async () => {
    const before = submits.length;
    const { post } = await makePost(777);
    const res = await anonymousPost(post.id);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "This brand belongs to another Telegram user.", code: "forbidden" });
    expect(submits.length).toBe(before); // nothing was started or billed
  });

  it("an unknown post is a localized 404", async () => {
    const res = await anonymousPost(crypto.randomUUID());
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "not_found" });
  });
});
