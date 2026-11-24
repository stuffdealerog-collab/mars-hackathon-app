import { describe, expect, it, vi } from "vitest";

/**
 * The picture routes (/media/post-image, /visual, /media/jobs) through the real routes, store, quotas
 * and access check (memory store, no DB); only the picture provider is faked. The "@/" alias is not
 * configured for vitest, so the routes' aliased imports are pointed at the real files.
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
vi.mock("@/lib/uslub/visual/learn", async () => await import("../visual/learn"));
vi.mock("@/lib/uslub/visual/repo", async () => await import("../visual/repo"));
vi.mock("@/lib/uslub/media/jobs", async () => await import("./jobs"));
vi.mock("@/lib/uslub/media/presets", async () => await import("./presets"));
vi.mock("@/lib/uslub/media/types", async () => await import("./types"));
vi.mock("@/lib/uslub/media/service", () => ({ media: () => ({ jobs }) }));

// The provider: a scripted fal stand-in behind the real job system (memory repo).
const { MediaJobs } = await import("./jobs");
const { MemoryMediaJobRepo } = await import("./repo");
const submits: unknown[] = [];
const repo = new MemoryMediaJobRepo();
const jobs = new MediaJobs({
  repo,
  image: { anonActorDailyLimit: 3 }, // each guest IP: 3 pictures a day (production default 30)
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
const { POST, GET } = await import("../../../app/api/uslub/media/post-image/route");
const visualRoute = await import("../../../app/api/uslub/visual/route");
const jobsRoute = await import("../../../app/api/uslub/media/jobs/route");
const { learnAndSaveVisual } = await import("../visual/service");
const { saveBrandVisual } = await import("../visual/repo");
const { styleWords } = await import("../visual/words");
import type { BrandDNA, PostDraft } from "../contract";

const dna = { name: "Test", oneLiner: "Uyda tort", products: [], languages: ["uz_latn"] } as unknown as BrandDNA;

async function makePost(owner: number | null, source: "custom" | "channel_only" = "custom") {
  const brand = await store.saveBrand({ channel: "tortchi_test", knowledge: "Uyda tort pishiraman.", samplePosts: [], dna, mode: "channel" }, owner, source);
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

const anonymousGet = (path: string) =>
  new Request(`https://mercat.test${path}`, { headers: { "x-forwarded-for": "203.0.113.8" } });

describe("GET routes follow the same draft rule as the POSTs", () => {
  // channel_only rows are readable by anyone with the id (public channel data); a post's picture and
  // the brand's style (with the owner's photos) are drafts: owner, unowned brand, or claimed web brand only.
  it("an owned channel_only brand: anonymous poll and style read are refused, nothing is polled", async () => {
    const { brand, post } = await makePost(777, "channel_only");
    await savePostImage(post.id, { status: "running", jobId: "00000000-0000-4000-8000-00000000abcd", refsUsed: 2, url: "https://v3b.fal.media/files/x.jpg" });
    const poll = await GET(anonymousGet(`/api/uslub/media/post-image?postId=${post.id}&lang=en`));
    expect(poll.status).toBe(403);
    expect(await poll.json()).toEqual({ error: "This brand belongs to another Telegram user.", code: "forbidden" });
    const style = await visualRoute.GET(anonymousGet(`/api/uslub/visual?brandId=${brand.id}&lang=ru`));
    expect(style.status).toBe(403);
    expect(await style.json()).toMatchObject({ code: "forbidden" });
  });

  it("a web brand claimed in the bot: the anonymous id holder still polls its picture and reads its style", async () => {
    const { brand, post } = await makePost(null, "channel_only");
    await anonymousPost(post.id); // starts a picture while the brand is unowned
    expect(await store.claimBrand(brand.id, 4243)).not.toBeNull();
    const poll = await GET(anonymousGet(`/api/uslub/media/post-image?postId=${post.id}`));
    expect(poll.status).toBe(200);
    expect((await poll.json()).image).toMatchObject({ status: expect.stringMatching(/queued|running/) });
    const style = await visualRoute.GET(anonymousGet(`/api/uslub/visual?brandId=${brand.id}`));
    expect(style.status).toBe(200);
    expect(await style.json()).toEqual({ visual: null });
  });
});

describe("one guest IP cannot use up the guests' picture pool", () => {
  const fromIp = (ip: string, postId: string) =>
    POST(
      new Request("https://mercat.test/api/uslub/media/post-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ postId, lang: "ru" }),
      }),
    );

  it("an IP stops at its share with a localized guest_limit; another IP still gets pictures", async () => {
    for (let i = 0; i < 3; i++) {
      const { post } = await makePost(null);
      expect((await fromIp("198.51.100.23", post.id)).status).toBe(200);
    }
    const before = submits.length;
    const { post } = await makePost(null);
    const res = await fromIp("198.51.100.23", post.id);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: "Гостевой лимит картинок на сегодня закончился. Чтобы продолжить, войдите через Telegram-бота.",
      code: "guest_limit",
    });
    expect(submits.length).toBe(before); // refused before anything was paid for
    expect((await fromIp("198.51.100.24", post.id)).status).toBe(200);
  });
});

describe("POST /api/uslub/media/jobs with a brandId", () => {
  const createJob = (body: Record<string, unknown>, ip: string) =>
    jobsRoute.POST(
      new Request("https://mercat.test/api/uslub/media/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify(body),
      }),
    );

  it("a brand that belongs to another Telegram user is refused before anything is billed", async () => {
    const before = submits.length;
    // channel_only: readable by anyone with the id, so only the draft rule stands between a stranger and its cap
    const { brand } = await makePost(778, "channel_only");
    const res = await createJob({ kind: "image", brief: "Bento-tort", aspect: "4:5", brandId: brand.id }, "198.51.100.40");
    expect(res.status).toBe(403);
    expect(submits.length).toBe(before);
  });

  it("an unowned brand's id holder starts a job; the job keeps the caller's hashed IP, never the raw one", async () => {
    const { brand } = await makePost(null);
    const res = await createJob({ kind: "image", brief: "Bento-tort", aspect: "4:5", brandId: brand.id }, "198.51.100.41");
    expect(res.status).toBe(201);
    const { job } = await res.json();
    expect(job).not.toHaveProperty("actorKey");
    const stored = await repo.get(job.id);
    expect(stored?.actorKey).toMatch(/^ip:[0-9a-f]{16}$/);
    expect(JSON.stringify(stored)).not.toContain("198.51.100.41");
  });
});

describe("a style learned before the owner's words existed", () => {
  it("is learned again once, then reused", async () => {
    const { brand } = await makePost(null);
    await saveBrandVisual(brand.id, {
      refs: [],
      palette: ["#f4efe6"],
      light: "soft window daylight",
      composition: "close-up",
      props: [],
      mood: "warm",
      avoid: ["text, letters or logos in the picture"],
      prompt: "Warm natural photo.",
      learnedAt: new Date().toISOString(), // well inside the 12 h reuse window
    });
    const words = { summary: "s", light: "l", composition: "c", mood: "m", avoid: [] as string[] };
    const analyze = vi.fn(async () => ({
      images: [],
      palette: ["#f4efe6"],
      light: "soft window daylight",
      composition: "close-up",
      props: [],
      mood: "warm",
      avoid: [],
      prompt: "Warm natural photo.",
      ownerText: { uz: { ...words, light: "kunduzgi yorugʻ" }, ru: words, en: words },
    }));
    const deps = {
      channelPhotos: async () => [],
      download: async () => Promise.reject(new Error("not used")),
      rehost: async () => Promise.reject(new Error("not used")),
      analyze,
    };
    const first = await learnAndSaveVisual(brand, { actor: "ip:0000000000000001", deps });
    expect(first.cached).toBe(false);
    expect(styleWords(first.visual, "uz")?.light).toBe("kunduzgi yorugʻ");
    const again = await learnAndSaveVisual(brand, { actor: "ip:0000000000000001", deps });
    expect(again.cached).toBe(true);
    expect(analyze).toHaveBeenCalledTimes(1);
  });
});
