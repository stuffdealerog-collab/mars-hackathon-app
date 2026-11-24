import { describe, expect, it, vi } from "vitest";
import type { VisualStyle } from "../contract";
import { MediaJobs } from "./jobs";
import {
  buildPostImagePrompt,
  FAILED_COPY,
  MAX_ATTEMPTS_PER_POST,
  pollPostImage,
  PostImageLimitError,
  publicPostImage,
  startPostImage,
  type PostForImage,
  type PostImageDeps,
  type StoredPostImage,
} from "./post-image";
import type { FetchLike, MediaProvider, PollResult, SubmitRequest } from "./provider";
import { falInput, falModelFor, falProvider, falTextModel } from "./providers/fal";
import { MemoryMediaJobRepo } from "./repo";
import { CAPTION_LIMIT, planPostMessages, publishableImageUrl } from "./telegram-post";

/* ---------------------------------------------------------------- helpers */

const ref = (n: number, source: "channel" | "owner" = "channel") => ({ url: `https://v3b.fal.media/files/ref-${n}.jpg`, source });

const visual = (over: Partial<VisualStyle> = {}): VisualStyle => ({
  refs: [ref(1), ref(2), ref(3, "owner")],
  palette: ["#f4efe6", "#3b2a20"],
  light: "soft window daylight",
  composition: "one cake, slightly above",
  props: ["linen cloth"],
  mood: "warm",
  avoid: ["text, letters or logos in the picture", "neon light"],
  prompt: "Warm natural photo on a peach wall.",
  learnedAt: "2026-11-24T10:00:00Z",
  ...over,
});

const brand = (v?: VisualStyle) => ({
  id: "b0000000-0000-4000-8000-000000000001",
  name: "Safia",
  oneLiner: "Safia — Toshkentdagi qandolatchilik uyi; kanalda yangiliklar",
  products: ["Napoleon"],
  visual: v,
});

const post = (over: Partial<PostForImage> = {}): PostForImage => ({
  id: "p0000000-0000-4000-8000-000000000001",
  brandId: "b0000000-0000-4000-8000-000000000001",
  brief: "Napoleon torti dam olish uchun",
  variants: { uz_latn: "Dam olish kuni choyi Napoleon bilan boshqacha", uz_cyrl: "", ru: "", en: "" },
  ...over,
});

function scriptedProvider(polls: PollResult[] = []) {
  const submits: SubmitRequest[] = [];
  const queue = [...polls];
  const provider: MediaProvider = {
    id: "fal",
    label: "mock",
    acceptsDataUrls: true,
    isConfigured: () => true,
    supports: () => true,
    model: (k) => `mock-${k}`,
    submit: async (req) => {
      submits.push(req);
      return { requestId: `req-${submits.length}`, model: "mock-image" };
    },
    poll: vi.fn(async () => queue.shift() ?? { status: "running" as const }),
  };
  return { provider, submits };
}

function setup(polls: PollResult[] = [], over: Partial<PostImageDeps> = {}) {
  const { provider, submits } = scriptedProvider(polls);
  let n = 0;
  let t = Date.parse("2026-11-25T10:00:00Z");
  const jobs = new MediaJobs({
    repo: new MemoryMediaJobRepo(),
    providers: [provider],
    now: () => t,
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    anonDailyLimit: 50,
    dailyLimit: 50,
  });
  const saved: StoredPostImage[] = [];
  const deps: PostImageDeps = {
    jobs,
    save: vi.fn(async (_id, img) => {
      saved.push(img);
    }),
    describeScene: vi.fn(async () => "A slice of layered Napoleon cake with tea."),
    provider: "fal",
    ...over,
  };
  return { deps, submits, saved, advance: (ms: number) => (t += ms) };
}

const anon = { telegramId: null };

/* ------------------------------------------------------------------ prompt */

describe("buildPostImagePrompt", () => {
  it("numbers the product first, then the references, and always forbids text", () => {
    const p = buildPostImagePrompt({
      scene: "A slice of Napoleon cake.",
      brandName: "Safia",
      oneLiner: "Safia — qandolatchilik uyi; kanalda yangiliklar",
      visual: visual(),
      product: true,
      channelRefs: 2,
      ownerRefs: 1,
    });
    expect(p).toMatch(/Image 1 is the owner's photo of the product: keep this product exactly/);
    expect(p).toMatch(/Images 2-4 are photos from this business's own channel and photos the owner added/);
    expect(p).toMatch(/do not invent other products/);
    expect(p).toMatch(/The photo shows: A slice of Napoleon cake\.\n/); // no double period
    expect(p).toMatch(/No text, letters, numbers, prices, captions, watermarks, logos or brand names/);
    expect(p).toMatch(/Avoid: text, letters or logos in the picture; neon light\./);
    expect(p).toMatch(/Colours: #f4efe6, #3b2a20\./);
    expect(p).toMatch(/Vertical 4:5 frame/);
    expect(p).toContain("(Safia — qandolatchilik uyi)"); // one-liner cut at the first clause
    expect(p).not.toContain("kanalda");
  });

  it("without a style or refs it still asks for an honest real photo", () => {
    const p = buildPostImagePrompt({ scene: "Hot patir bread", brandName: "", oneLiner: "", product: false, channelRefs: 0, ownerRefs: 0 });
    expect(p).not.toMatch(/Image 1/);
    expect(p).toMatch(/a small local business/);
    expect(p).toMatch(/real photograph/);
  });
});

/* ------------------------------------------------------------------- start */

describe("startPostImage", () => {
  it("starts one job with the owner refs, then the channel refs, and saves a queued PostImage", async () => {
    const { deps, submits, saved } = setup();
    const img = await startPostImage({ post: post(), brand: brand(visual()), actor: anon }, deps);
    expect(img).toMatchObject({ status: "queued", refsUsed: 3, attempts: 1, scene: "A slice of layered Napoleon cake with tea." });
    expect(submits).toHaveLength(1);
    expect(submits[0].imageUrl).toBeUndefined();
    expect(submits[0].referenceUrls).toEqual([ref(3).url, ref(1).url, ref(2).url]);
    expect(submits[0].aspect).toBe("4:5");
    expect(submits[0].prompt).toBe(img.prompt);
    expect(submits[0].prompt).toMatch(/Images 1-3 are/);
    expect(saved.at(-1)).toEqual(img);
    expect(vi.mocked(deps.describeScene!).mock.calls[0][0]).toMatchObject({ text: "Dam olish kuni choyi Napoleon bilan boshqacha", brandName: "Safia" });
  });

  it("returns the picture in progress or ready instead of paying twice", async () => {
    const { deps, submits } = setup();
    const ready: StoredPostImage = { status: "ready", url: "https://v3b.fal.media/files/out.jpg", refsUsed: 3, attempts: 1 };
    expect(await startPostImage({ post: post({ image: ready }), brand: brand(visual()), actor: anon }, deps)).toBe(ready);
    expect(submits).toHaveLength(0);
  });

  it("another variant starts a new job, reuses the scene, and stops at the per-post cap", async () => {
    const { deps, submits } = setup();
    const prev: StoredPostImage = { status: "ready", url: "https://v3b.fal.media/files/out.jpg", refsUsed: 3, attempts: 2, scene: "Earlier scene" };
    const img = await startPostImage({ post: post({ image: prev }), brand: brand(visual()), actor: anon, regenerate: true }, deps);
    expect(img).toMatchObject({ status: "queued", attempts: 3, scene: "Earlier scene" });
    expect(img.url).toBe("https://v3b.fal.media/files/out.jpg"); // the owner keeps seeing (and would publish) the finished one
    expect(deps.describeScene).not.toHaveBeenCalled();
    expect(submits).toHaveLength(1);
    const capped: StoredPostImage = { ...prev, attempts: MAX_ATTEMPTS_PER_POST };
    await expect(startPostImage({ post: post({ image: capped }), brand: brand(visual()), actor: anon, regenerate: true }, deps)).rejects.toBeInstanceOf(
      PostImageLimitError,
    );
  });

  it("an owner product photo goes first, is kept for later variants, and is not repeated as a ref", async () => {
    const { deps, submits } = setup();
    const product = ref(3).url; // the same file is also an owner ref
    const img = await startPostImage({ post: post(), brand: brand(visual()), actor: anon, productUrl: product }, deps);
    expect(submits[0].imageUrl).toBe(product);
    expect(submits[0].referenceUrls).toEqual([ref(1).url, ref(2).url]);
    expect(submits[0].prompt).toMatch(/Image 1 is the owner's photo of the product/);
    expect(submits[0].prompt).toMatch(/Images 2-3 are photos from this business's own channel\./);
    expect(img).toMatchObject({ productUrl: product, refsUsed: 3 });
  });

  it("falls back to the brief when the scene call fails, and works with no style at all", async () => {
    const { deps, submits } = setup([], { describeScene: vi.fn(async () => Promise.reject(new Error("AI down"))) });
    const img = await startPostImage({ post: post(), brand: brand(undefined), actor: anon }, deps);
    expect(img.scene).toBe("Napoleon torti dam olish uchun");
    expect(submits[0].referenceUrls).toEqual([]);
    expect(img.refsUsed).toBe(0);
  });
});

/* -------------------------------------------------------------------- poll */

describe("pollPostImage", () => {
  it("maps a finished job to a ready picture and a failed one to owner-safe copy", async () => {
    const { deps, advance } = setup([{ status: "succeeded", outputUrl: "https://v3b.fal.media/files/out.jpg", contentType: "image/jpeg" }]);
    const started = await startPostImage({ post: post(), brand: brand(visual()), actor: anon }, deps);
    advance(5_000);
    const done = await pollPostImage({ post: post({ image: started }), actor: anon }, deps);
    expect(done).toMatchObject({ status: "ready", url: "https://v3b.fal.media/files/out.jpg" });
    expect(publicPostImage(done!)).toEqual({
      status: "ready",
      url: "https://v3b.fal.media/files/out.jpg",
      refsUsed: 3,
      prompt: started.prompt,
      model: "mock-image",
    });

    const bad = setup([{ status: "failed", error: "fal.ai: User is locked. Reason: Exhausted balance" }]);
    const s2 = await startPostImage({ post: post(), brand: brand(visual()), actor: anon }, bad.deps);
    bad.advance(5_000);
    const failed = await pollPostImage({ post: post({ image: s2 }), actor: anon }, bad.deps);
    expect(failed).toMatchObject({ status: "failed", error: FAILED_COPY });
    expect(JSON.stringify(publicPostImage(failed!))).not.toMatch(/balance|fal\.ai/);
  });

  it("does nothing for a post without a picture in progress", async () => {
    const { deps } = setup();
    expect(await pollPostImage({ post: post(), actor: anon }, deps)).toBeUndefined();
    const ready: StoredPostImage = { status: "ready", url: "https://v3b.fal.media/x.jpg", refsUsed: 1 };
    expect(await pollPostImage({ post: post({ image: ready }), actor: anon }, deps)).toBe(ready);
  });
});

/* ------------------------------------------------------------- jobs + refs */

describe("image jobs with references", () => {
  it("accepts text-to-image and references, rejects bad combinations", async () => {
    const { deps } = setup();
    const jobs = deps.jobs as MediaJobs;
    const base = { kind: "image" as const, presetId: "paper-studio" as const, aspect: "4:5" as const, seconds: 0 };
    const t2i = await jobs.create({ ...base, customPrompt: { prompt: "bread" } });
    expect(t2i).toMatchObject({ imageRef: "none", refCount: 0, prompt: "bread" });
    const withRefs = await jobs.create({ ...base, referenceUrls: [ref(1).url, ref(2).url] });
    expect(withRefs).toMatchObject({ imageRef: ref(1).url, refCount: 2 });
    await expect(jobs.create({ ...base, kind: "video", seconds: 5 })).rejects.toMatchObject({ status: 400 });
    await expect(jobs.create({ ...base, referenceUrls: Array.from({ length: 9 }, (_, i) => ref(i).url) })).rejects.toMatchObject({ status: 400 });
    await expect(jobs.create({ ...base, referenceUrls: ["http://10.0.0.1/x.jpg"] })).rejects.toMatchObject({ status: 400 });
  });
});

describe("fal input for post pictures", () => {
  const req = (over: Partial<SubmitRequest> = {}): SubmitRequest => ({
    kind: "image",
    prompt: "p",
    negativePrompt: "",
    aspect: "4:5",
    seconds: 0,
    idempotencyKey: "k",
    ...over,
  });

  it("Nano Banana gets the product first, then refs, at 1K JPEG 4:5", () => {
    expect(falInput("fal-ai/nano-banana-2/edit", req({ imageUrl: "https://a/p.jpg", referenceUrls: ["https://a/r1.jpg", "https://a/p.jpg"] }))).toEqual({
      prompt: "p",
      image_urls: ["https://a/p.jpg", "https://a/r1.jpg"],
      num_images: 1,
      aspect_ratio: "4:5",
      resolution: "1K",
      output_format: "jpeg",
    });
  });

  it("Seedream gets explicit pixels and at most 10 refs; no image -> text-to-image twins", () => {
    const refs = Array.from({ length: 12 }, (_, i) => `https://a/r${i}.jpg`);
    const s = falInput("bytedance/seedream/v5.5/edit", req({ referenceUrls: refs }));
    expect(s.image_size).toEqual({ width: 1024, height: 1280 });
    expect((s.image_urls as string[]).length).toBe(10);
    expect(falInput("fal-ai/nano-banana-2", req())).not.toHaveProperty("image_urls");
    expect(falTextModel("fal-ai/nano-banana-2/edit")).toBe("fal-ai/nano-banana-2");
    expect(falTextModel("bytedance/seedream/v5.5/edit")).toBe("bytedance/seedream/v5.5/text-to-image");
    const models = { video: "fal-ai/kling-video/v2.6/pro/image-to-video", image: "fal-ai/nano-banana-2/edit" };
    expect(falModelFor(models, { kind: "image" })).toBe("fal-ai/nano-banana-2");
    expect(falModelFor(models, { kind: "image", referenceUrls: ["https://a/r.jpg"] })).toBe("fal-ai/nano-banana-2/edit");
  });

  it("submits a reference-free picture to the text-to-image endpoint", async () => {
    const urls: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      urls.push(url);
      return Response.json({ request_id: "r1", status_url: "https://queue.fal.run/fal-ai/nano-banana-2/requests/r1/status" });
    };
    const fal = falProvider({ key: "k".repeat(20), fetch: fetchImpl });
    const ref1 = await fal.submit(req());
    expect(urls[0]).toBe("https://queue.fal.run/fal-ai/nano-banana-2");
    expect(ref1.model).toBe("fal-ai/nano-banana-2");
  });
});

/* ---------------------------------------------------------------- publish */

describe("planPostMessages", () => {
  const url = "https://v3b.fal.media/files/out.jpg";

  it("text only without a picture", () => {
    expect(planPostMessages("  Salom  ")).toEqual([{ kind: "text", text: "Salom" }]);
  });

  it("one photo with caption when the text fits", () => {
    const text = "a".repeat(CAPTION_LIMIT);
    expect(planPostMessages(text, url)).toEqual([{ kind: "photo", photo: url, caption: text }]);
  });

  it("photo, then the whole text, when the text is longer than a caption; never cut", () => {
    const text = "b".repeat(CAPTION_LIMIT + 1);
    expect(planPostMessages(text, url)).toEqual([
      { kind: "photo", photo: url },
      { kind: "text", text },
    ]);
  });

  it("only ready pictures on fal's CDN are published", () => {
    expect(publishableImageUrl({ status: "ready", url })).toBe(url);
    expect(publishableImageUrl({ status: "running", url })).toBeUndefined();
    expect(publishableImageUrl({ status: "ready", url: "https://evil.example/x.jpg" })).toBeUndefined();
    expect(publishableImageUrl(undefined)).toBeUndefined();
  });
});

/* ------------------------------------------------------ review follow-ups */

describe("deciding before paying, and publishing the right picture", () => {
  it("planPostImageStart: a rendering picture is never replaced; the cap is checked before any work", async () => {
    const { planPostImageStart } = await import("./post-image");
    expect(planPostImageStart(undefined, false)).toBe("start");
    expect(planPostImageStart({ status: "running", refsUsed: 1, jobId: "j" }, true)).toBe("existing");
    expect(planPostImageStart({ status: "ready", url: "https://v3b.fal.media/a.jpg", refsUsed: 1 }, false)).toBe("existing");
    expect(planPostImageStart({ status: "ready", url: "https://v3b.fal.media/a.jpg", refsUsed: 1, attempts: 2 }, true)).toBe("start");
    expect(planPostImageStart({ status: "failed", refsUsed: 1, attempts: MAX_ATTEMPTS_PER_POST }, true)).toBe("limit");
  });

  it("url stays the finished picture while another version renders and after it fails: Studio and publish agree", async () => {
    const { publishedImageUrl } = await import("./post-image");
    const first = "https://v3b.fal.media/files/first.jpg";
    const { deps, advance } = setup([{ status: "failed", error: "boom" }]);
    const prev: StoredPostImage = { status: "ready", url: first, refsUsed: 3, attempts: 1 };
    const next = await startPostImage({ post: post({ image: prev }), brand: brand(visual()), actor: anon, regenerate: true }, deps);
    expect(next).toMatchObject({ status: "queued", url: first });
    expect(publicPostImage(next).url).toBe(first); // what the Studio and the bot preview show
    expect(publishedImageUrl(next)).toBe(first); // what publishing sends
    advance(5_000);
    const failed = await pollPostImage({ post: post({ image: next }), actor: anon }, deps);
    expect(failed).toMatchObject({ status: "failed", url: first });
    expect(publishedImageUrl(failed)).toBe(first);
  });

  it("publishing sends the stored picture only; a newer version is sent once it has been shown (refreshed)", async () => {
    const { publishedImageUrl } = await import("./post-image");
    const { deps, advance } = setup([{ status: "succeeded", outputUrl: "https://v3b.fal.media/files/done.jpg" }]);
    const started = await startPostImage({ post: post(), brand: brand(visual()), actor: anon }, deps);
    expect(publishedImageUrl(started)).toBeUndefined(); // still rendering, nothing shown: text only
    advance(5_000);
    const shown = await pollPostImage({ post: post({ image: started }), actor: anon }, deps); // the preview's refresh
    expect(publishedImageUrl(shown)).toBe("https://v3b.fal.media/files/done.jpg");
  });

  it("a picture started by a Telegram user is still polled from the web once the post is authorised", async () => {
    const { deps, advance } = setup([{ status: "succeeded", outputUrl: "https://v3b.fal.media/files/tg.jpg" }]);
    const started = await startPostImage({ post: post(), brand: brand(visual()), actor: { telegramId: 77 } }, deps);
    advance(5_000);
    const done = await pollPostImage({ post: post({ image: started }), actor: anon }, deps);
    expect(done).toMatchObject({ status: "ready", url: "https://v3b.fal.media/files/tg.jpg" });
    // without authorisation the job itself stays private
    await expect((deps.jobs as MediaJobs).get(started.jobId!, anon)).rejects.toMatchObject({ status: 404 });
  });

  it("assertRoom refuses before any preparation when the daily cap is used up", async () => {
    const { provider } = scriptedProvider();
    const jobs = new MediaJobs({ repo: new MemoryMediaJobRepo(), providers: [provider], image: { anonDailyLimit: 1, dailyLimit: 10 } });
    await jobs.assertRoom(anon, "image");
    await jobs.create({ kind: "image", presetId: "paper-studio", aspect: "4:5", seconds: 0, customPrompt: { prompt: "x" } });
    await expect(jobs.assertRoom(anon, "image")).rejects.toMatchObject({ status: 429, code: "limit" });
    await expect(jobs.assertRoom({ telegramId: 5 }, "image")).resolves.toBeUndefined();
  });
});

/* ------------------------------------------------- adversarial review fixes */

const imageInput = (over: Partial<Parameters<MediaJobs["create"]>[0]> = {}) => ({
  kind: "image" as const,
  presetId: "paper-studio" as const,
  aspect: "4:5" as const,
  seconds: 0,
  customPrompt: { prompt: "x" },
  ...over,
});

describe("picture quotas", () => {
  it("pictures have their own pools: they never eat the video quota", async () => {
    const { provider } = scriptedProvider();
    const jobs = new MediaJobs({ repo: new MemoryMediaJobRepo(), providers: [provider], anonDailyLimit: 1, dailyLimit: 1, image: { anonDailyLimit: 5 } });
    for (let i = 0; i < 3; i++) await jobs.create(imageInput());
    // the video pool (1) is untouched by three pictures
    await expect(jobs.assertRoom(anon, "video")).resolves.toBeUndefined();
    await jobs.create({ kind: "video", imageUrl: "https://cdn.example.com/p.jpg", presetId: "paper-studio", aspect: "9:16", seconds: 5 });
    await expect(jobs.create({ kind: "video", imageUrl: "https://cdn.example.com/p.jpg", presetId: "paper-studio", aspect: "9:16", seconds: 5 })).rejects.toMatchObject({
      status: 429,
    });
    await expect(jobs.create(imageInput())).resolves.toMatchObject({ kind: "image" });
  });

  it("a per-brand cap stops one brand (or a stranger's brand) from draining the shared pool", async () => {
    const { provider } = scriptedProvider();
    const jobs = new MediaJobs({ repo: new MemoryMediaJobRepo(), providers: [provider], image: { anonDailyLimit: 10, brandDailyLimit: 2 } });
    await jobs.create(imageInput({ brandId: "brand-a" }));
    await jobs.create(imageInput({ brandId: "brand-a" }));
    await expect(jobs.create(imageInput({ brandId: "brand-a" }))).rejects.toMatchObject({ status: 429, code: "limit" });
    await expect(jobs.assertRoom(anon, "image", "brand-a")).rejects.toMatchObject({ status: 429 });
    await expect(jobs.create(imageInput({ brandId: "brand-b" }))).resolves.toMatchObject({ brandId: "brand-b" });
  });

  it("a job the provider refused at submit does not count", async () => {
    const refusing: MediaProvider = { ...scriptedProvider().provider, submit: async () => Promise.reject(new Error("bad request")) };
    const jobs = new MediaJobs({ repo: new MemoryMediaJobRepo(), providers: [refusing], image: { anonDailyLimit: 1 } });
    await expect(jobs.create(imageInput())).resolves.toMatchObject({ status: "failed" });
    await expect(jobs.create(imageInput())).resolves.toMatchObject({ status: "failed" }); // still room: nothing billed
  });

  it("an anonymous cap of 0 means a Telegram login is required (401), for create and the pre-check", async () => {
    const { provider } = scriptedProvider();
    const jobs = new MediaJobs({ repo: new MemoryMediaJobRepo(), providers: [provider], image: { anonDailyLimit: 0 } });
    await expect(jobs.assertRoom(anon, "image")).rejects.toMatchObject({ status: 401, code: "login_required" });
    await expect(jobs.create(imageInput())).rejects.toMatchObject({ status: 401, code: "login_required" });
    await expect(jobs.create(imageInput(), { telegramId: 9 })).resolves.toMatchObject({ kind: "image" });
  });
});

describe("timeout after asking the provider", () => {
  it("a picture that finished while nobody polled is delivered, not failed for being late", async () => {
    const { deps, advance } = setup([{ status: "succeeded", outputUrl: "https://v3b.fal.media/files/late.jpg" }]);
    const started = await startPostImage({ post: post(), brand: brand(visual()), actor: anon }, deps);
    advance(25 * 60_000); // past the 20 min timeout
    const done = await pollPostImage({ post: post({ image: started }), actor: anon }, deps);
    expect(done).toMatchObject({ status: "ready", url: "https://v3b.fal.media/files/late.jpg" });
  });

  it("a job still running after the timeout is failed (and cancelled)", async () => {
    const { deps, advance } = setup([{ status: "running" }]);
    const started = await startPostImage({ post: post(), brand: brand(visual()), actor: anon }, deps);
    advance(25 * 60_000);
    const done = await pollPostImage({ post: post({ image: started }), actor: anon }, deps);
    expect(done).toMatchObject({ status: "failed" });
  });
});

describe("re-learning a style with no references", async () => {
  const { needsRelearn } = await import("./post-image");
  const t = Date.parse("2026-11-25T10:00:00Z");
  const v = (refs: number, learnedAt: string) => visual({ refs: Array.from({ length: refs }, (_, i) => ref(i)), learnedAt });
  it("re-learns a channel brand's empty style after 30 min, never a fresh brand's, never one with refs", () => {
    expect(needsRelearn(undefined, "channel", "shop", t)).toBe(true);
    expect(needsRelearn(v(0, "2026-11-25T09:00:00Z"), "channel", "shop", t)).toBe(true);
    expect(needsRelearn(v(0, "2026-11-25T09:50:00Z"), "channel", "shop", t)).toBe(false); // too recent
    expect(needsRelearn(v(0, "2026-11-25T09:00:00Z"), "fresh", "shop", t)).toBe(false);
    expect(needsRelearn(v(0, "2026-11-25T09:00:00Z"), "channel", undefined, t)).toBe(false);
    expect(needsRelearn(v(3, "2026-11-20T09:00:00Z"), "channel", "shop", t)).toBe(false);
  });
});

describe("publish refuses what the owner did not see", async () => {
  const { changedSincePreview } = await import("./telegram-post");
  const pic = "https://v3b.fal.media/files/a.jpg";
  it("passes when text and picture are what the preview showed, or when nothing is expected", () => {
    expect(changedSincePreview({ text: "Salom ", imageUrl: pic }, { expectedText: "Salom", expectedImageUrl: pic })).toBeNull();
    expect(changedSincePreview({ text: "Salom", imageUrl: pic }, {})).toBeNull();
    expect(changedSincePreview({ text: "Salom" }, { expectedImageUrl: null })).toBeNull();
    expect(changedSincePreview({ text: "Salom" }, { expectedImageUrl: "" })).toBeNull();
  });
  it("refuses an edited text or a different (or new, or removed) picture", () => {
    expect(changedSincePreview({ text: "Salom!", imageUrl: pic }, { expectedText: "Salom" })).toBe("text");
    expect(changedSincePreview({ text: "Salom", imageUrl: "https://v3b.fal.media/files/b.jpg" }, { expectedImageUrl: pic })).toBe("image");
    expect(changedSincePreview({ text: "Salom", imageUrl: pic }, { expectedImageUrl: null })).toBe("image");
    expect(changedSincePreview({ text: "Salom" }, { expectedImageUrl: pic })).toBe("image");
  });
});
