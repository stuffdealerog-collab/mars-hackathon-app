import { describe, expect, it, vi } from "vitest";
import { autoCues, cleanCaption, normalizeCues, toAss, toSrt, toWebVtt, wrapCaption } from "./captions";
import { configSecrets, readMediaConfig } from "./config";
import { MediaError, MediaJobs, validateImageUrl } from "./jobs";
import { buildPrompt, NEGATIVE_PROMPT, PRESET_IDS } from "./presets";
import { ProviderError, redactSecrets, type FetchLike, type MediaProvider, type PollResult, type SubmitRequest } from "./provider";
import { demoProvider } from "./providers/demo";
import { falBase, falInput, falProvider } from "./providers/fal";
import { higgsfieldInput, higgsfieldProvider } from "./providers/higgsfield";
import { MemoryMediaJobRepo } from "./repo";
import { publicJob, type MediaJobInput } from "./types";

/* ---------------------------------------------------------------- helpers */

const PHOTO = "https://cdn.example.com/products/piala.jpg";

const input = (over: Partial<MediaJobInput> = {}): MediaJobInput => ({
  kind: "video",
  imageUrl: PHOTO,
  productName: "handmade ceramic piala with a blue star pattern",
  presetId: "warm-bazaar",
  aspect: "9:16",
  seconds: 6,
  ...over,
});

/** A scripted provider: poll() answers from a queue, every call is recorded. */
function mockProvider(over: Partial<MediaProvider> & { polls?: (PollResult | Error)[] } = {}) {
  const submits: SubmitRequest[] = [];
  const polls = [...(over.polls ?? [])];
  const cancel = vi.fn(async () => {});
  const provider: MediaProvider = {
    id: "fal",
    label: "mock",
    acceptsDataUrls: false,
    retentionMs: 7 * 24 * 3600_000,
    isConfigured: () => true,
    supports: () => true,
    model: (k) => `mock-${k}`,
    submit: async (req) => {
      submits.push(req);
      return { requestId: "req-1", model: "mock-video", statusUrl: "https://queue.example/req-1/status" };
    },
    poll: vi.fn(async () => {
      const next = polls.shift() ?? { status: "running" as const };
      if (next instanceof Error) throw next;
      return next;
    }),
    cancel,
    ...over,
  };
  return { provider, submits, cancel };
}

function clock(start = Date.parse("2026-11-25T10:00:00Z")) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

function setup(providers: MediaProvider[], over: Partial<ConstructorParameters<typeof MediaJobs>[0]> = {}) {
  const c = clock();
  const repo = new MemoryMediaJobRepo();
  let n = 0;
  const jobs = new MediaJobs({
    repo,
    providers,
    now: c.now,
    newId: () => `00000000-0000-4000-8000-00000000000${++n}`,
    pollIntervalMs: 4_000,
    ...over,
  });
  return { jobs, repo, clock: c };
}

type Call = { url: string; init?: RequestInit };
function mockFetch(responses: Array<{ match: RegExp; method?: string; status?: number; body: unknown }>) {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const method = init?.method ?? "GET";
    const r = responses.find((x) => x.match.test(url) && (!x.method || x.method === method));
    if (!r) return new Response(JSON.stringify({ detail: "not mocked" }), { status: 404 });
    const text = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
    return new Response(text, { status: r.status ?? 200 });
  };
  return { fetchImpl, calls };
}

const headersOf = (c: Call) => (c.init?.headers ?? {}) as Record<string, string>;
const bodyOf = (c: Call) => JSON.parse(String(c.init?.body)) as Record<string, unknown>;

/* ------------------------------------------------------------ job lifecycle */

describe("MediaJobs lifecycle (mocked provider)", () => {
  it("create -> queued, submits once with the job id as idempotency key and a locked, text-free prompt", async () => {
    const { provider, submits } = mockProvider();
    const { jobs, repo } = setup([provider]);
    const job = await jobs.create(input());
    expect(job.status).toBe("queued");
    expect(job.provider).toBe("fal");
    expect(job.providerRequestId).toBe("req-1");
    expect(submits).toHaveLength(1);
    expect(submits[0].idempotencyKey).toBe(job.id);
    expect(submits[0].prompt).toContain("handmade ceramic piala");
    expect(submits[0].prompt).toContain("same shape, proportions, colours");
    expect(submits[0].prompt).toContain("No text");
    expect(submits[0].negativePrompt).toBe(NEGATIVE_PROMPT);
    expect(await repo.get(job.id)).toMatchObject({ status: "queued", providerRequestId: "req-1" });
  });

  it("refresh polls when due: queued -> running -> succeeded, stores the result and its expiry", async () => {
    const { provider } = mockProvider({
      polls: [{ status: "running" }, { status: "succeeded", outputUrl: "https://cdn.example.com/out.mp4", contentType: "video/mp4" }],
    });
    const { jobs, clock: c } = setup([provider]);
    const job = await jobs.create(input());

    c.advance(5_000);
    expect((await jobs.refresh(job.id)).status).toBe("running");
    c.advance(5_000);
    const done = await jobs.refresh(job.id);
    expect(done.status).toBe("succeeded");
    expect(done.result).toEqual({
      url: "https://cdn.example.com/out.mp4",
      contentType: "video/mp4",
      expiresAt: new Date(c.now() + 7 * 24 * 3600_000).toISOString(),
      demo: undefined,
    });
    expect(done.polls).toBe(2);

    // terminal: no more provider calls
    c.advance(60_000);
    await jobs.refresh(job.id);
    expect(provider.poll).toHaveBeenCalledTimes(2);
  });

  it("throttles polling: many browser polls inside the interval hit the provider once", async () => {
    const { provider } = mockProvider();
    const { jobs, clock: c } = setup([provider]);
    const job = await jobs.create(input());
    c.advance(4_001);
    for (let i = 0; i < 5; i++) {
      await jobs.refresh(job.id);
      c.advance(500);
    }
    expect(provider.poll).toHaveBeenCalledTimes(1);
  });

  it("a submit error fails the job and never leaks the API key", async () => {
    const secret = "sk_live_SUPERSECRET_123456";
    const { provider } = mockProvider({
      submit: async () => {
        throw new ProviderError(`fal.ai 401: invalid key ${secret}`, 401);
      },
    });
    const { jobs } = setup([provider], { secrets: () => [secret] });
    const job = await jobs.create(input());
    expect(job.status).toBe("failed");
    expect(job.error).toContain("401");
    expect(job.error).not.toContain(secret);
  });

  it("not configured -> MediaError 503 (graceful state, nothing stored)", async () => {
    const { provider } = mockProvider({ isConfigured: () => false });
    const { jobs, repo } = setup([provider]);
    await expect(jobs.create(input())).rejects.toMatchObject({ status: 503, code: "not_configured" });
    expect(jobs.isConfigured()).toBe(false);
    expect(repo.jobs.size).toBe(0);
  });

  it("routes data: uploads to a provider that accepts them, else asks for an https link", async () => {
    const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
    const noData = mockProvider().provider;
    const { jobs } = setup([noData]);
    await expect(jobs.create(input({ imageUrl: dataUrl }))).rejects.toMatchObject({ status: 400 });

    const withData = mockProvider({ id: "higgsfield", acceptsDataUrls: true }).provider;
    const both = setup([noData, withData]);
    const job = await both.jobs.create(input({ imageUrl: dataUrl }));
    expect(job.provider).toBe("higgsfield");
    expect(job.imageRef).toBe("inline-upload"); // the base64 is never stored
  });

  it("enforces the daily spend cap", async () => {
    const { provider } = mockProvider();
    const { jobs } = setup([provider], { dailyLimit: 2 });
    await jobs.create(input());
    await jobs.create(input());
    await expect(jobs.create(input())).rejects.toMatchObject({ status: 429, code: "limit" });
  });

  it("times out a stuck job and cancels it at the provider", async () => {
    const { provider, cancel } = mockProvider();
    const { jobs, clock: c } = setup([provider], { timeoutMs: 60_000 });
    const job = await jobs.create(input());
    c.advance(61_000);
    const out = await jobs.refresh(job.id);
    expect(out.status).toBe("failed");
    expect(out.error).toMatch(/vaqt tugadi/);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("keeps the job alive on a network blip, fails it on a definitive 4xx", async () => {
    const { provider } = mockProvider({
      polls: [new ProviderError("unreachable", undefined, true), new ProviderError("fal.ai 404: NOT_FOUND", 404)],
    });
    const { jobs, clock: c } = setup([provider]);
    const job = await jobs.create(input());
    c.advance(5_000);
    expect((await jobs.refresh(job.id)).status).toBe("queued");
    c.advance(5_000);
    const out = await jobs.refresh(job.id);
    expect(out.status).toBe("failed");
    expect(out.error).toContain("404");
  });

  it("cancel moves a running job to canceled; terminal jobs stay as they are", async () => {
    const { provider, cancel } = mockProvider();
    const { jobs } = setup([provider]);
    const job = await jobs.create(input());
    expect((await jobs.cancel(job.id)).status).toBe("canceled");
    expect(cancel).toHaveBeenCalledOnce();
    expect((await jobs.cancel(job.id)).status).toBe("canceled");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("archives the result to our storage when an archive hook is set", async () => {
    const { provider } = mockProvider({ polls: [{ status: "succeeded", outputUrl: "https://cdn.example.com/out.mp4" }] });
    const { jobs, clock: c } = setup([provider], {
      archive: async () => ({ url: "https://blob.example.com/media/out.mp4", contentType: "video/mp4" }),
    });
    const job = await jobs.create(input());
    c.advance(5_000);
    expect((await jobs.refresh(job.id)).result?.url).toBe("https://blob.example.com/media/out.mp4");
  });

  it("unknown id -> 404; publicJob hides provider URLs", async () => {
    const { provider } = mockProvider();
    const { jobs } = setup([provider]);
    await expect(jobs.refresh("nope")).rejects.toBeInstanceOf(MediaError);
    const job = await jobs.create(input());
    const pub = publicJob(job) as Record<string, unknown>;
    expect(pub.providerStatusUrl).toBeUndefined();
    expect(pub.providerRequestId).toBe("req-1");
  });

  it("validates the product photo URL", () => {
    expect(() => validateImageUrl("http://example.com/a.jpg")).toThrow(MediaError);
    expect(() => validateImageUrl("https://localhost/a.jpg")).toThrow(MediaError);
    expect(() => validateImageUrl("https://192.168.1.5/a.jpg")).toThrow(MediaError);
    expect(() => validateImageUrl("data:text/html;base64,PGgxPg==")).toThrow(MediaError);
    expect(() => validateImageUrl(PHOTO)).not.toThrow();
    expect(() => validateImageUrl("data:image/jpeg;base64,/9j/4AAQ")).not.toThrow();
  });

  it("demo provider: queued -> running -> succeeded with a labelled sample", async () => {
    const c = clock();
    const demo = demoProvider({ enabled: true, now: c.now, renderMs: 8_000 });
    const { jobs } = setup([demo], { now: c.now });
    const job = await jobs.create(input());
    c.advance(1_000);
    expect((await jobs.refresh(job.id)).status).toBe("queued");
    c.advance(5_000);
    expect((await jobs.refresh(job.id)).status).toBe("running");
    c.advance(5_000);
    const done = await jobs.refresh(job.id);
    expect(done.status).toBe("succeeded");
    expect(done.result).toMatchObject({ url: "/media/3d/constellation-loop.mp4", demo: true });
  });
});

/* -------------------------------------------------------------- providers */

describe("fal.ai adapter (mocked fetch)", () => {
  const req: SubmitRequest = {
    kind: "video",
    prompt: "p",
    negativePrompt: "n",
    imageUrl: PHOTO,
    aspect: "9:16",
    seconds: 6,
    idempotencyKey: "job-1",
  };

  it("submits Kling 2.6 with start_image_url, a string duration and audio off", async () => {
    const { fetchImpl, calls } = mockFetch([
      {
        match: /queue\.fal\.run\/fal-ai\/kling-video\/v2\.6\/pro\/image-to-video$/,
        method: "POST",
        body: {
          request_id: "r1",
          status_url: "https://queue.fal.run/fal-ai/kling-video/requests/r1/status",
          response_url: "https://queue.fal.run/fal-ai/kling-video/requests/r1",
          cancel_url: "https://queue.fal.run/fal-ai/kling-video/requests/r1/cancel",
        },
      },
    ]);
    const fal = falProvider({ key: "fal_test_key_0123456789", fetch: fetchImpl });
    const ref = await fal.submit(req);
    expect(ref).toMatchObject({ requestId: "r1", statusUrl: "https://queue.fal.run/fal-ai/kling-video/requests/r1/status" });
    expect(headersOf(calls[0]).Authorization).toBe("Key fal_test_key_0123456789");
    expect(bodyOf(calls[0])).toEqual({ prompt: "p", start_image_url: PHOTO, duration: "5", negative_prompt: "n", generate_audio: false });
  });

  it("polls status_url, then fetches response_url once COMPLETED", async () => {
    const { fetchImpl, calls } = mockFetch([
      { match: /requests\/r1\/status$/, body: { status: "COMPLETED" } },
      { match: /requests\/r1$/, body: { video: { url: "https://v3.fal.media/files/out.mp4", content_type: "video/mp4" } } },
    ]);
    const fal = falProvider({ key: "fal_test_key_0123456789", fetch: fetchImpl });
    const r = await fal.poll({
      requestId: "r1",
      model: "fal-ai/kling-video/v2.6/pro/image-to-video",
      statusUrl: "https://queue.fal.run/fal-ai/kling-video/requests/r1/status",
      resultUrl: "https://queue.fal.run/fal-ai/kling-video/requests/r1",
    });
    expect(r).toEqual({ status: "succeeded", outputUrl: "https://v3.fal.media/files/out.mp4", contentType: "video/mp4" });
    expect(calls.map((c) => c.url)).toEqual([
      "https://queue.fal.run/fal-ai/kling-video/requests/r1/status",
      "https://queue.fal.run/fal-ai/kling-video/requests/r1",
    ]);
  });

  it("maps IN_QUEUE / IN_PROGRESS and a COMPLETED-with-error as failed", async () => {
    const statuses = [{ status: "IN_QUEUE", queue_position: 3 }, { status: "IN_PROGRESS" }, { status: "COMPLETED", error: "bad image", error_type: "bad_request" }];
    let i = 0;
    const fetchImpl: FetchLike = async () => new Response(JSON.stringify(statuses[i++]), { status: i < 3 ? 202 : 200 });
    const fal = falProvider({ key: "fal_test_key_0123456789", fetch: fetchImpl });
    const ref = { requestId: "r1", model: "fal-ai/kling-video/v2.6/pro/image-to-video" };
    expect(await fal.poll(ref)).toEqual({ status: "queued", queuePosition: 3 });
    expect(await fal.poll(ref)).toEqual({ status: "running" });
    expect(await fal.poll(ref)).toEqual({ status: "failed", error: "bad image" });
  });

  it("builds fallback URLs from owner/app only and ignores foreign hosts", async () => {
    expect(falBase("fal-ai/kling-video/v2.6/pro/image-to-video")).toBe("fal-ai/kling-video");
    const { fetchImpl, calls } = mockFetch([{ match: /status$/, body: { status: "IN_PROGRESS" } }]);
    const fal = falProvider({ key: "fal_test_key_0123456789", fetch: fetchImpl });
    await fal.poll({ requestId: "r9", model: "fal-ai/kling-video/v2.6/pro/image-to-video", statusUrl: "https://evil.example/steal" });
    expect(calls[0].url).toBe("https://queue.fal.run/fal-ai/kling-video/requests/r9/status");
  });

  it("uses each model family's own field names", () => {
    expect(falInput("bytedance/seedance-2.5/image-to-video", { ...req, seconds: 12 })).toEqual({
      prompt: "p",
      image_url: PHOTO,
      duration: "12",
      resolution: "720p",
      generate_audio: false,
    });
    expect(falInput("kling/v4/image-to-video", req)).toMatchObject({ start_image_url: PHOTO, duration: 6 });
    expect(falInput("fal-ai/nano-banana-pro/edit", { ...req, kind: "image" })).toMatchObject({ image_urls: [PHOTO], aspect_ratio: "9:16" });
  });
});

describe("Higgsfield adapter (mocked fetch)", () => {
  const req: SubmitRequest = {
    kind: "video",
    prompt: "p",
    negativePrompt: "n",
    imageUrl: PHOTO,
    aspect: "9:16",
    seconds: 6,
    idempotencyKey: "job-1",
  };
  const opts = { keyId: "kid_123", keySecret: "ksecret_456" };

  it("submits Seedance 2.5 with Key ID:SECRET, an Idempotency-Key and only schema fields", async () => {
    const { fetchImpl, calls } = mockFetch([
      {
        match: /api\.higgsfield\.ai\/bytedance\/seedance-2\.5\/image-to-video$/,
        method: "POST",
        body: { status: "queued", request_id: "h1", status_url: "https://api.higgsfield.ai/requests/h1/status", cancel_url: "https://api.higgsfield.ai/requests/h1/cancel" },
      },
    ]);
    const hf = higgsfieldProvider({ ...opts, fetch: fetchImpl });
    const ref = await hf.submit(req);
    expect(ref.statusUrl).toBe("https://api.higgsfield.ai/requests/h1/status");
    const h = headersOf(calls[0]);
    expect(h.Authorization).toBe("Key kid_123:ksecret_456");
    expect(h["Idempotency-Key"]).toBe("job-1");
    expect(bodyOf(calls[0])).toEqual({ image_url: PHOTO, prompt: "p", duration: 6, resolution: "720p", generate_audio: false });
  });

  it("uploads a data: photo through a presigned URL (no auth to storage) and submits its public URL", async () => {
    const { fetchImpl, calls } = mockFetch([
      {
        match: /files\/generate-upload-url$/,
        method: "POST",
        body: { public_url: "https://cdn.higgsfield.ai/input/p.png", upload_url: "https://storage.example/presigned", upload_headers: { "Content-Type": "image/png" } },
      },
      { match: /storage\.example\/presigned$/, method: "PUT", body: "" },
      { match: /image-to-video$/, method: "POST", body: { request_id: "h2" } },
    ]);
    const hf = higgsfieldProvider({ ...opts, fetch: fetchImpl });
    await hf.submit({ ...req, imageUrl: "data:image/png;base64,iVBORw0KGgo=" });
    expect(calls.map((c) => `${c.init?.method} ${c.url}`)).toEqual([
      "POST https://api.higgsfield.ai/files/generate-upload-url",
      "PUT https://storage.example/presigned",
      "POST https://api.higgsfield.ai/bytedance/seedance-2.5/image-to-video",
    ]);
    expect(headersOf(calls[1]).Authorization).toBeUndefined();
    expect(bodyOf(calls[2]).image_url).toBe("https://cdn.higgsfield.ai/input/p.png");
  });

  it("maps statuses; outputs come from the status response itself", async () => {
    const answers = [
      { status: "queued" },
      { status: "in_progress" },
      { status: "completed", video: { url: "https://cdn.higgsfield.ai/out.mp4" } },
      { status: "nsfw" },
      { status: "failed", error: "Generation failed" },
    ];
    let i = 0;
    const fetchImpl: FetchLike = async () => new Response(JSON.stringify(answers[i++]));
    const hf = higgsfieldProvider({ ...opts, fetch: fetchImpl });
    const ref = { requestId: "h1", model: "bytedance/seedance-2.5/image-to-video" };
    expect((await hf.poll(ref)).status).toBe("queued");
    expect((await hf.poll(ref)).status).toBe("running");
    expect(await hf.poll(ref)).toMatchObject({ status: "succeeded", outputUrl: "https://cdn.higgsfield.ai/out.mp4" });
    expect((await hf.poll(ref)).status).toBe("failed");
    expect(await hf.poll(ref)).toEqual({ status: "failed", error: "Generation failed" });
  });

  it("explains 403 as a balance problem", async () => {
    const fetchImpl: FetchLike = async () => new Response(JSON.stringify({ detail: "Forbidden" }), { status: 403 });
    const hf = higgsfieldProvider({ ...opts, fetch: fetchImpl });
    await expect(hf.submit(req)).rejects.toThrow(/insufficient API balance/);
  });

  it("never sends aspect_ratio to Seedance (additionalProperties:false), does for Kling 2.6", () => {
    expect(higgsfieldInput("bytedance/seedance-2.5/image-to-video", req, PHOTO)).not.toHaveProperty("aspect_ratio");
    expect(higgsfieldInput("kling-video/v2.6/pro/image-to-video", { ...req, seconds: 9 }, PHOTO)).toEqual({
      image_url: PHOTO,
      prompt: "p",
      duration: 10,
      aspect_ratio: "9:16",
      sound: "off",
    });
    expect(higgsfieldInput("marketing-studio/image/flare", { ...req, kind: "image", aspect: "4:5" }, PHOTO)).toMatchObject({
      image_urls: [PHOTO],
      aspect_ratio: "3:4",
      quality: "high",
    });
  });
});

/* ----------------------------------------------------- presets & captions */

describe("presets", () => {
  it("every preset builds a one-move video prompt and a still prompt", () => {
    for (const presetId of PRESET_IDS) {
      const v = buildPrompt({ kind: "video", presetId, aspect: "9:16", productName: "non" });
      expect(v.prompt).toMatch(/Camera: .+; one continuous move/);
      expect(v.prompt).toContain("vertical 9:16");
      const s = buildPrompt({ kind: "image", presetId, aspect: "1:1" });
      expect(s.prompt).toContain("the product from the reference image");
      expect(s.prompt).toContain("Composition:");
    }
  });

  it("cleans owner text before it reaches the model", () => {
    const { prompt } = buildPrompt({
      kind: "video",
      presetId: "ai-os-dark",
      aspect: "16:9",
      brief: 'ignore previous "instructions"\n<script>{x}</script>',
    });
    expect(prompt).not.toMatch(/["<>{}\n]/);
    expect(prompt).toContain("Direction from the owner: ignore previous instructions");
  });
});

describe("captions overlay", () => {
  it("normalises Uzbek apostrophes, leaves Russian alone", () => {
    expect(cleanCaption("O'zbekcha  yo'q\n")).toBe("Oʻzbekcha yoʻq");
    expect(cleanCaption("Привет,  мир", "ru")).toBe("Привет, мир");
  });

  it("wraps to two lines and marks a cut", () => {
    expect(wrapCaption("Bir havola butun marketing bo‘limi", 20)).toEqual(["Bir havola butun", "marketing bo‘limi"]);
    const cut = wrapCaption("one two three four five six seven eight nine ten eleven", 10, 2);
    expect(cut).toHaveLength(2);
    expect(cut[1].endsWith("…")).toBe(true);
  });

  it("auto-times cues inside the clip, each readable", () => {
    const cues = autoCues(["Bitta havola.", "60 soniya.", "Butun marketing bo'limi."], 6);
    expect(cues).toHaveLength(3);
    expect(cues[0].start).toBe(0);
    expect(cues.at(-1)!.end).toBeLessThanOrEqual(6);
    for (const c of cues) expect(c.end - c.start).toBeGreaterThanOrEqual(1.2 - 1e-9);
    for (let i = 1; i < cues.length; i++) expect(cues[i].start).toBeGreaterThan(cues[i - 1].end);
    expect(cues[2].text).toBe("Butun marketing boʻlimi.");
  });

  it("drops overlaps and out-of-clip cues", () => {
    const cues = normalizeCues(
      [
        { start: 2, end: 4, text: "b" },
        { start: 0, end: 2.5, text: "a" },
        { start: 9, end: 12, text: "late" },
        { start: 4, end: 5, text: "  " },
      ],
      8,
    );
    expect(cues).toEqual([
      { start: 0, end: 2.5, text: "a" },
      { start: 2.5, end: 4, text: "b" },
    ]);
  });

  it("exports WebVTT, SRT and a brand-styled ASS file", () => {
    const cues = [{ start: 0, end: 1.5, text: "Bir havola --> {\\b1}bo‘lim" }];
    const vtt = toWebVtt(cues);
    expect(vtt.startsWith("WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.500\n")).toBe(true);
    expect(vtt).not.toContain("--> {");
    expect(toSrt(cues)).toContain("00:00:00,000 --> 00:00:01,500");
    const ass = toAss(cues, "9:16");
    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("Dialogue: 0,0:00:00.00,0:00:01.50,Uslub");
    expect(ass).not.toContain("{\\b1}");
  });
});

/* ------------------------------------------------------------------ config */

describe("media config", () => {
  it("reads HIGGSFIELD_API_KEY as ID:SECRET, FAL_KEY, order, cap and demo", () => {
    const c = readMediaConfig({
      HIGGSFIELD_API_KEY: "kid_1:sec_2",
      FAL_KEY: "fal_key_abcdefghijklmnop",
      MEDIA_PROVIDERS: "fal,higgsfield",
      MEDIA_DAILY_LIMIT: "12",
      MEDIA_DEMO: "1",
    });
    expect(c.higgsfield).toMatchObject({ keyId: "kid_1", keySecret: "sec_2" });
    expect(c.fal?.key).toBe("fal_key_abcdefghijklmnop");
    expect(c.order).toEqual(["fal", "higgsfield", "demo"]);
    expect(c.dailyLimit).toBe(12);
    expect(configSecrets(c)).toEqual(["kid_1", "sec_2", "fal_key_abcdefghijklmnop"]);
  });

  it("accepts the SDK's HF_API_KEY + HF_API_SECRET pair", () => {
    expect(readMediaConfig({ HF_API_KEY: "a", HF_API_SECRET: "b" }).higgsfield).toMatchObject({ keyId: "a", keySecret: "b" });
  });

  it("reports malformed values by NAME only and ignores them", () => {
    const c = readMediaConfig({ HIGGSFIELD_API_KEY: "no-colon-secret", HIGGSFIELD_VIDEO_MODEL: "../../etc" });
    expect(c.higgsfield).toBeUndefined();
    expect(c.warnings).toEqual(["HIGGSFIELD_API_KEY"]);
    expect(JSON.stringify(c)).not.toContain("no-colon-secret");
  });

  it("with nothing set: no providers configured, default cap", () => {
    const c = readMediaConfig({});
    expect(c.higgsfield).toBeUndefined();
    expect(c.fal).toBeUndefined();
    expect(c.order).toEqual(["higgsfield", "fal"]);
    expect(c.dailyLimit).toBe(30);
  });

  it("redactSecrets scrubs known keys and key-looking tokens", () => {
    expect(redactSecrets("bad key kid_123456:sec_7890ab", ["kid_123456", "sec_7890ab"])).toBe("bad key [redacted]:[redacted]");
    expect(redactSecrets("Authorization: Key abcdefghijklmnopqrstuvwxyz")).toBe("Authorization: Key [redacted]");
  });
});
