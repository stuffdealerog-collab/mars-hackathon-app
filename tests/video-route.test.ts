import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/uslub/video: open to owners (no labs gate), drafts' access rules before any spend, two budget units, the
// script in the brand's language with growth or sales rules, stored on the post with a short caption, never written
// twice (a second request gets it back, two at once find the claim), and a new idea saved as a video post outside the
// week's batch. In-memory store, llmJson mock: nothing reaches Claude or a database.
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => { throw new Error("outside a request"); } }));
vi.mock("@/lib/db", () => ({ isDbConfigured: () => false, getSql: () => { throw new Error("no db in tests"); }, pgErrorCode: () => undefined }));
const events = vi.hoisted(() => [] as { type: string; props: Record<string, unknown> }[]);
vi.mock("@/lib/track", () => ({ safeLogEvent: async (_id: unknown, type: string, props: Record<string, unknown> = {}) => void events.push({ type, props }) }));
const envMock = vi.hoisted(() => ({ getEnv: () => ({ TELEGRAM_BOT_TOKEN: "test-token", BOT_USERNAME: "mercatai" }), getPublicUrl: () => undefined }));
vi.mock("@/lib/env", () => envMock);
vi.mock("../src/lib/env", () => envMock);
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
vi.mock("@/lib/uslub/placeholders", async () => await import("../src/lib/uslub/placeholders"));
vi.mock("@/lib/uslub/video", async () => await import("../src/lib/uslub/video"));
vi.mock("@/lib/uslub/video-core", async () => await import("../src/lib/uslub/video-core"));
vi.mock("@/lib/uslub/translit", async () => await import("../src/lib/uslub/translit"));
vi.mock("@/lib/uslub/brain/answers-store", () => ({ loadAnswers: async () => null }));
vi.mock("@/lib/uslub/brain/kbstore", () => ({ loadKnowledge: async () => ({ text: "Katta patir 12 000 so‘m.", sources: [] }) }));
const spendClaude = vi.fn<(req: Request, user: number | null, route: string, opts?: { weight?: number }) => Promise<void>>(async () => {});
vi.mock("@/lib/uslub/budget", () => ({ spendClaude }));
const llmJson = vi.fn();
vi.mock("../src/lib/uslub/llm", () => ({ llmJson, MODEL_QUALITY: "claude-sonnet-5-5", MODEL_FAST: "claude-haiku-5-5", LlmError: class extends Error {} }));

const store = await import("../src/lib/uslub/store");
const route = await import("../src/app/api/uslub/video/route");
const { latestWeekBatch } = await import("../src/lib/autopilot/week");
import type { BrandDNA, ChannelType, PostDraft, Script } from "../src/lib/uslub/contract";

let ip = 0;
const call = (body: unknown, auth?: string) =>
  route.POST(
    new Request("http://localhost/api/uslub/video", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.9.0.${++ip}`, ...(auth ? { authorization: auth } : {}) },
      body: JSON.stringify(body),
    }),
  );

const RAW_PLAN = {
  hook: "Soat 6:00. Tandir ochiladi.",
  scenes: [
    { seconds: 3, visual: "Tandir", voiceover: "Har kuni ertalab non chiqadi.", caption: "Soat 6:00" },
    { seconds: 4, visual: "Peshtaxta", voiceover: "Katta patir 12 000 so‘m.", caption: "12 000 so‘m" },
  ],
  musicMood: "Iliq tong",
};
const RAW_CAPTION = { uz_latn: "Ertalab issiq patir 🫓 Videoni ko‘ring.", ru: "Утром горячий патыр 🫓", en: "Hot patir in the morning 🫓" };

function answerLlm() {
  llmJson.mockImplementation(async (o: { purpose: string }) => (o.purpose === "video_caption" ? RAW_CAPTION : RAW_PLAN));
}

async function brandWith(owner: number | null, opts: { languages?: Script[]; channelType?: ChannelType } = {}) {
  const dna = { name: "Tandir", products: ["patir"], languages: opts.languages ?? ["uz_latn"], hashtags: [] } as unknown as BrandDNA;
  return store.saveBrand({ channel: "tandirnon", knowledge: "", samplePosts: [], dna, mode: "channel", ...(opts.channelType ? { channelType: opts.channelType } : {}) }, owner, "custom");
}

async function videoSlot(brandId: string, over: Partial<PostDraft> = {}) {
  const id = crypto.randomUUID();
  const post: PostDraft = {
    id,
    brandId,
    brief: "Tandirdan birinchi non",
    variants: { uz_latn: "Ertalab birinchi non. Videoda ko‘ring!", uz_cyrl: "", ru: "Первый хлеб утром.", en: "The first bread." },
    neuroHits: {},
    humanScore: 90,
    status: "draft",
    slot: { day: "2026-12-02", time: "08:00", goal: "reach", hook: "Tandirdan birinchi non", cta: "", format: "video" },
    createdAt: new Date().toISOString(),
    ...over,
  };
  await store.savePosts([post]);
  return id;
}

beforeEach(() => {
  llmJson.mockReset();
  spendClaude.mockClear();
  events.length = 0;
});

describe("POST /api/uslub/video", () => {
  it("another owner's brand: 403, no budget unit, no Claude", async () => {
    const brand = await brandWith(501);
    const id = await videoSlot(brand.id);
    const res = await call({ brandId: brand.id, postId: id }, "tma 502");
    expect(res.status).toBe(403);
    expect(spendClaude).not.toHaveBeenCalled();
    expect(llmJson).not.toHaveBeenCalled();
  });

  it("a post that is not a video post: 400 not_video_post, nothing spent", async () => {
    const brand = await brandWith(511);
    const id = await videoSlot(brand.id, { slot: { day: "2026-12-02", time: "08:00", goal: "reach", hook: "x", cta: "", format: "photo" } });
    const res = await call({ brandId: brand.id, postId: id }, "tma 511");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("not_video_post");
    expect(spendClaude).not.toHaveBeenCalled();
  });

  it("writes the script once: stored on the post with the caption as its text, an approved post is a draft again; a second request pays nothing", async () => {
    answerLlm();
    const brand = await brandWith(521);
    const id = await videoSlot(brand.id);
    await store.approvePost(id);
    const res = await call({ brandId: brand.id, postId: id, lang: "uz" }, "tma 521");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plan: { lang: string; scenes: unknown[] }; post: PostDraft };
    expect(body.plan.lang).toBe("uz_latn");
    expect(body.plan.scenes).toHaveLength(2);
    expect(spendClaude).toHaveBeenCalledWith(expect.anything(), 521, "video", { weight: 2 });
    expect(llmJson).toHaveBeenCalledTimes(2);
    const saved = await store.getPost(id);
    // "Soat 6:00" is an hour the brand never gave: cut by code; the price the brand gave stays.
    expect(saved?.video?.plan?.hook).toBe("Tandir ochiladi.");
    expect(saved?.video?.plan?.scenes[1].voiceover).toContain("12 000");
    expect(saved?.variants.uz_latn).toContain("Ertalab issiq patir");
    expect(saved?.status).toBe("draft");
    expect(events.map((e) => e.type)).toContain("video_planned");

    llmJson.mockClear();
    spendClaude.mockClear();
    const again = (await (await call({ brandId: brand.id, postId: id }, "tma 521")).json()) as { reused?: boolean };
    expect(again.reused).toBe(true);
    expect(llmJson).not.toHaveBeenCalled();
    expect(spendClaude).not.toHaveBeenCalled();
  });

  it("two requests at once: the second finds the claim (409 video_busy) and pays nothing", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    llmJson.mockImplementation(async (o: { purpose: string }) => {
      if (o.purpose === "video") await gate;
      return o.purpose === "video_caption" ? RAW_CAPTION : RAW_PLAN;
    });
    const brand = await brandWith(531);
    const id = await videoSlot(brand.id);
    const first = call({ brandId: brand.id, postId: id }, "tma 531");
    await new Promise((r) => setTimeout(r, 20));
    const second = await call({ brandId: brand.id, postId: id }, "tma 531");
    expect(second.status).toBe(409);
    expect(((await second.json()) as { code: string }).code).toBe("video_busy");
    expect(spendClaude).toHaveBeenCalledTimes(1);
    release();
    expect((await first).status).toBe(200);
  });

  it("a failed script releases the claim: the owner can try again at once", async () => {
    llmJson.mockRejectedValueOnce(new Error("model down"));
    const brand = await brandWith(541);
    const id = await videoSlot(brand.id);
    expect((await call({ brandId: brand.id, postId: id }, "tma 541")).status).toBe(500);
    answerLlm();
    expect((await call({ brandId: brand.id, postId: id }, "tma 541")).status).toBe(200);
  });

  it("the script follows the brand's language and type: a Russian blog gets Russian and growth rules", async () => {
    answerLlm();
    const brand = await brandWith(551, { languages: ["ru"], channelType: "blog" });
    const id = await videoSlot(brand.id);
    const body = (await (await call({ brandId: brand.id, postId: id, lang: "en" }, "tma 551")).json()) as { plan: { lang: string } };
    expect(body.plan.lang).toBe("ru");
    const system = (llmJson.mock.calls.find((c) => (c[0] as { purpose: string }).purpose === "video")?.[0] as { system: string }).system;
    expect(system).toMatch(/Russian/);
    expect(system).toMatch(/No sales pitch/);
  });

  it("a new idea: a draft video post without a slot, outside the week's batch", async () => {
    answerLlm();
    const brand = await brandWith(561);
    const week = await videoSlot(brand.id);
    const res = await call({ brandId: brand.id, brief: "Tong", lang: "uz" }, "tma 561");
    expect(res.status).toBe(200);
    const { post } = (await res.json()) as { post: PostDraft };
    expect(post.slot).toBeUndefined();
    expect(post.video?.plan?.scenes.length).toBe(2);
    expect(post.status).toBe("draft");
    const all = await store.listPosts(brand.id);
    expect(all.map((p) => p.id)).toContain(post.id);
    expect(latestWeekBatch(all).map((p) => p.id)).toEqual([week]);
  });

  it("the script is stored before the caption: a caption that fails keeps the paid script and the post's text", async () => {
    llmJson.mockImplementation(async (o: { purpose: string }) => {
      if (o.purpose === "video_caption") throw new Error("caption timeout");
      return RAW_PLAN;
    });
    const brand = await brandWith(571);
    const id = await videoSlot(brand.id);
    const res = await call({ brandId: brand.id, postId: id }, "tma 571");
    expect(res.status).toBe(200);
    const saved = await store.getPost(id);
    expect(saved?.video?.plan?.scenes).toHaveLength(2);
    // The claim went with the script: another tap is never told "busy" for a script that is already there.
    expect((saved?.video as { writingAt?: string } | undefined)?.writingAt).toBeUndefined();
    expect(saved?.variants.uz_latn).toBe("Ertalab birinchi non. Videoda ko‘ring!");
    expect(events.find((e) => e.type === "video_planned")?.props).toMatchObject({ caption: false });
    // A retry gets it back: nothing paid twice.
    spendClaude.mockClear();
    llmJson.mockClear();
    expect(((await (await call({ brandId: brand.id, postId: id }, "tma 571")).json()) as { reused?: boolean }).reused).toBe(true);
    expect(spendClaude).not.toHaveBeenCalled();
    expect(llmJson).not.toHaveBeenCalled();
  });

  it("a slow script leaves no time for the caption: the script is stored, the caption is not started, nothing is lost", async () => {
    const realNow = Date.now.bind(Date);
    let skew = 0;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => realNow() + skew);
    try {
      llmJson.mockImplementation(async (o: { purpose: string }) => {
        // The script took 50 s of the function's 60.
        if (o.purpose === "video") skew = 50_000;
        return o.purpose === "video_caption" ? RAW_CAPTION : RAW_PLAN;
      });
      const brand = await brandWith(581);
      const id = await videoSlot(brand.id);
      expect((await call({ brandId: brand.id, postId: id }, "tma 581")).status).toBe(200);
      expect(llmJson.mock.calls.map((c) => (c[0] as { purpose: string }).purpose)).toEqual(["video"]);
      expect((await store.getPost(id))?.video?.plan?.scenes).toHaveLength(2);
    } finally {
      clock.mockRestore();
    }
  });

  it("the caption gets only the time left (25 s at most) and the channel's mode", async () => {
    const realNow = Date.now.bind(Date);
    let skew = 0;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => realNow() + skew);
    try {
      llmJson.mockImplementation(async (o: { purpose: string }) => {
        if (o.purpose === "video") skew = 40_000;
        return o.purpose === "video_caption" ? RAW_CAPTION : RAW_PLAN;
      });
      const brand = await brandWith(591, { channelType: "blog" });
      const id = await videoSlot(brand.id);
      expect((await call({ brandId: brand.id, postId: id }, "tma 591")).status).toBe(200);
      const plan = llmJson.mock.calls.find((c) => (c[0] as { purpose: string }).purpose === "video")?.[0] as { timeoutMs: number };
      const cap = llmJson.mock.calls.find((c) => (c[0] as { purpose: string }).purpose === "video_caption")?.[0] as { timeoutMs: number; prompt: string };
      expect(plan.timeoutMs).toBe(35_000);
      expect(cap.timeoutMs).toBeGreaterThanOrEqual(8_000);
      expect(cap.timeoutMs).toBeLessThanOrEqual(15_000);
      expect(cap.prompt).toMatch(/GOAL: This channel grows an audience/);
    } finally {
      clock.mockRestore();
    }
  });

  it("a new idea whose caption fails is still saved (the script's hook as its text), never paid twice", async () => {
    llmJson.mockImplementation(async (o: { purpose: string }) => {
      if (o.purpose === "video_caption") throw new Error("refused");
      return RAW_PLAN;
    });
    const brand = await brandWith(601);
    const res = await call({ brandId: brand.id, brief: "Tong", lang: "uz" }, "tma 601");
    expect(res.status).toBe(200);
    const { post } = (await res.json()) as { post: PostDraft };
    const saved = await store.getPost(post.id);
    expect(saved?.video?.plan?.hook).toBe("Tandir ochiladi.");
    expect(saved?.variants.uz_latn).toBe("Tandir ochiladi.");
    expect(saved?.variants.uz_cyrl).toBe("Тандир очилади.");
    expect(saved?.variants.ru).toBe("");
    expect(saved?.humanScore).toBe(0);
    expect(events.find((e) => e.type === "video_planned")?.props).toMatchObject({ idea: true, caption: false });
  });

  it("an unowned web brand's id holder may write scripts (like drafts)", async () => {
    answerLlm();
    const brand = await brandWith(null);
    const id = await videoSlot(brand.id);
    expect((await call({ brandId: brand.id, postId: id })).status).toBe(200);
    expect(spendClaude).toHaveBeenCalledWith(expect.anything(), null, "video", { weight: 2 });
  });
});
