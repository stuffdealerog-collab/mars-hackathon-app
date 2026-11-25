import { describe, expect, it, vi } from "vitest";
import { readMediaConfig } from "./config";
import { MEDIA_DEFAULTS, MediaJobs, NEVER_SUBMITTED, sweepAllowed, TIMED_OUT } from "./jobs";
import { isBalanceError, ProviderError, type MediaProvider, type PollResult } from "./provider";
import { falProvider } from "./providers/fal";
import { MemoryMediaJobRepo } from "./repo";
import type { MediaJob, MediaJobInput } from "./types";

/**
 * Stuck media jobs (prod, 2026-11-25: 3 jobs "queued" for hours with polls=0) and the provider's
 * balance running out (11 pictures failed with fal's "User is locked. Reason: Exhausted balance").
 */

const T0 = Date.parse("2026-11-25T10:00:00Z");

function clock() {
  let t = T0;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

function provider(polls: (PollResult | Error)[] = [], over: Partial<MediaProvider> = {}) {
  const queue = [...polls];
  const cancel = vi.fn(async () => {});
  const poll = vi.fn(async () => {
    const next = queue.shift() ?? { status: "running" as const };
    if (next instanceof Error) throw next;
    return next;
  });
  const p: MediaProvider = {
    id: "fal",
    label: "mock",
    acceptsDataUrls: true,
    isConfigured: () => true,
    supports: () => true,
    model: (k) => `mock-${k}`,
    submit: async () => ({ requestId: `req-${Math.random().toString(16).slice(2, 8)}`, model: "mock-image" }),
    poll,
    cancel,
    ...over,
  };
  return { provider: p, poll, cancel };
}

function setup(p: MediaProvider, over: Partial<ConstructorParameters<typeof MediaJobs>[0]> = {}) {
  const c = clock();
  const repo = new MemoryMediaJobRepo();
  let n = 0;
  const jobs = new MediaJobs({
    repo,
    providers: [p],
    now: c.now,
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    dailyLimit: 50,
    anonDailyLimit: 50,
    ...over,
  });
  return { jobs, repo, clock: c };
}

const image = (over: Partial<MediaJobInput> = {}): MediaJobInput => ({
  kind: "image",
  customPrompt: { prompt: "A slice of Napoleon cake." },
  presetId: "paper-studio",
  aspect: "4:5",
  seconds: 0,
  ...over,
});
const video = (): MediaJobInput => ({ kind: "video", imageUrl: "https://cdn.example.com/p.jpg", presetId: "warm-bazaar", aspect: "9:16", seconds: 5 });

/** A job whose submit never came back (the function was cut off): queued, no provider request id. */
async function cutOffJob(repo: MemoryMediaJobRepo, createdAt: number, id = "00000000-0000-4000-8000-0000000000ff"): Promise<MediaJob> {
  const at = new Date(createdAt).toISOString();
  const job: MediaJob = {
    id,
    kind: "image",
    status: "queued",
    provider: "fal",
    model: "mock-image",
    presetId: "paper-studio",
    aspect: "4:5",
    seconds: 0,
    prompt: "p",
    negativePrompt: "n",
    imageRef: "none",
    captions: [],
    ownerKey: "anon",
    polls: 0,
    createdAt: at,
    updatedAt: at,
  };
  await repo.update(job);
  return job;
}

describe("refresh: a job can no longer stay queued forever", () => {
  it("a job that never reached the provider fails after the submit grace, with a reason (it stays while a submit may be in flight)", async () => {
    const { provider: p, poll } = provider();
    const { jobs, repo, clock: c } = setup(p);
    const job = await cutOffJob(repo, T0);
    c.advance(60_000);
    expect((await jobs.refresh(job.id)).status).toBe("queued"); // the route may still be submitting (maxDuration 150 s)
    c.advance(MEDIA_DEFAULTS.submitGraceMs);
    const out = await jobs.refresh(job.id);
    expect(out).toMatchObject({ status: "failed", error: NEVER_SUBMITTED });
    expect(await repo.get(job.id)).toMatchObject({ status: "failed" });
    expect(poll).not.toHaveBeenCalled(); // nothing to poll
  });

  it("pictures time out after 5 minutes, videos keep their 20", async () => {
    const { provider: p, cancel } = provider();
    const { jobs, clock: c } = setup(p);
    const pic = await jobs.create(image());
    const clip = await jobs.create(video());
    c.advance(6 * 60_000);
    expect(await jobs.refresh(pic.id)).toMatchObject({ status: "failed", error: TIMED_OUT });
    expect(cancel).toHaveBeenCalledOnce();
    expect((await jobs.refresh(clip.id)).status).toBe("running");
    c.advance(15 * 60_000);
    expect((await jobs.refresh(clip.id)).status).toBe("failed");
  });

  it("a picture that finished while nobody polled is still delivered after its timeout", async () => {
    const { provider: p } = provider([{ status: "succeeded", outputUrl: "https://v3b.fal.media/files/late.jpg" }]);
    const { jobs, clock: c } = setup(p);
    const pic = await jobs.create(image());
    c.advance(60 * 60_000);
    expect(await jobs.refresh(pic.id)).toMatchObject({ status: "succeeded", result: { url: "https://v3b.fal.media/files/late.jpg" } });
  });

  it("MEDIA_IMAGE_TIMEOUT_MS sets the picture timeout (1 min to 1 h), malformed values are named and ignored", () => {
    expect(readMediaConfig({}).imageTimeoutMs).toBe(5 * 60_000);
    expect(readMediaConfig({ MEDIA_IMAGE_TIMEOUT_MS: "600000" }).imageTimeoutMs).toBe(600_000);
    const bad = readMediaConfig({ MEDIA_IMAGE_TIMEOUT_MS: "5" });
    expect(bad.imageTimeoutMs).toBe(5 * 60_000);
    expect(bad.warnings).toEqual(["MEDIA_IMAGE_TIMEOUT_MS"]);
  });
});

describe("sweep: open jobs nobody polls", () => {
  it("polls each open job older than a minute once: finished ones are delivered, stuck ones fail, fresh ones are left alone", async () => {
    const done = { status: "succeeded" as const, outputUrl: "https://v3b.fal.media/files/a.jpg" };
    const { provider: p, poll } = provider([done, { status: "running" }]);
    const { jobs, repo, clock: c } = setup(p);
    const finished = await jobs.create(image());
    const stuck = await jobs.create(image());
    const cutOff = await cutOffJob(repo, T0);
    c.advance(6 * 60_000);
    const fresh = await jobs.create(image()); // its own Studio tab polls it
    const report = await jobs.sweep();
    expect(report).toMatchObject({ checked: 3, delivered: 1, stoppedEarly: false });
    expect(report.ended.map((e) => [e.id, e.error])).toEqual([
      [stuck.id, TIMED_OUT],
      [cutOff.id, NEVER_SUBMITTED],
    ]);
    expect(report.ended[0]).toMatchObject({ kind: "image", ageS: 360 });
    expect(poll).toHaveBeenCalledTimes(2); // the cut-off job has nothing to poll
    expect((await repo.get(finished.id))?.status).toBe("succeeded");
    expect((await repo.get(fresh.id))?.status).toBe("queued");
    expect((await jobs.sweep()).checked).toBe(0); // nothing open and old is left
  });

  it("stops at its deadline without starting another provider call", async () => {
    const { provider: p, poll } = provider();
    const { jobs, clock: c } = setup(p);
    await jobs.create(image());
    await jobs.create(image());
    c.advance(2 * 60_000);
    const report = await jobs.sweep({ deadline: T0 + 2 * 60_000 });
    expect(report).toMatchObject({ checked: 0, stoppedEarly: true });
    expect(poll).not.toHaveBeenCalled();
  });

  it("a provider call that hangs past the deadline ends the sweep instead of holding it", async () => {
    const { provider: p } = provider([], { poll: () => new Promise<PollResult>(() => {}) });
    const { jobs, clock: c } = setup(p);
    await jobs.create(image());
    c.advance(2 * 60_000);
    const started = Date.now();
    const report = await jobs.sweep({ deadline: T0 + 2 * 60_000 + 50 });
    expect(report.stoppedEarly).toBe(true);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("an instance without the provider's key (local dev, preview) never polls or ends that provider's live jobs", async () => {
    // Production Neon is shared: polling fal with no key answers 401, which would fail an owner's real picture.
    const fetch = vi.fn(async () => new Response(JSON.stringify({ detail: "Unauthorized" }), { status: 401 }));
    const keyless = falProvider({ key: undefined, fetch });
    const { jobs, repo, clock: c } = setup(keyless);
    const live = { ...(await cutOffJob(repo, T0, "00000000-0000-4000-8000-0000000000a1")), providerRequestId: "req-live", model: "fal-ai/nano-banana-2/edit" };
    await repo.update(live);
    const cutOff = await cutOffJob(repo, T0, "00000000-0000-4000-8000-0000000000a2"); // never reached fal: needs no key
    c.advance(60 * 60_000); // far past the picture timeout
    const report = await jobs.sweep();
    expect(fetch).not.toHaveBeenCalled();
    expect((await repo.get(live.id))?.status).toBe("queued");
    expect(report.ended.map((e) => e.id)).toEqual([cutOff.id]);
    // A direct refresh (a lab route opened on a preview) leaves it alone too.
    expect((await jobs.refresh(live.id, undefined, { authorized: true })).status).toBe("queued");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sweeps only in production, or with MEDIA_SWEEP=1", () => {
    expect(sweepAllowed({ VERCEL_ENV: "production" })).toBe(true);
    expect(sweepAllowed({ VERCEL_ENV: "preview", MEDIA_SWEEP: "1" })).toBe(true);
    expect(sweepAllowed({ VERCEL_ENV: "preview" })).toBe(false);
    expect(sweepAllowed({ VERCEL_ENV: "development" })).toBe(false);
    expect(sweepAllowed({})).toBe(false);
    expect(sweepAllowed({ MEDIA_SWEEP: "0" })).toBe(false);
  });

  it("lists open jobs oldest first and only before the cut-off", async () => {
    const repo = new MemoryMediaJobRepo();
    await cutOffJob(repo, T0 + 2_000, "00000000-0000-4000-8000-000000000002");
    await cutOffJob(repo, T0, "00000000-0000-4000-8000-000000000001");
    await cutOffJob(repo, T0 + 9_000, "00000000-0000-4000-8000-000000000003");
    expect(await repo.listOpen(new Date(T0 + 5_000).toISOString(), 10)).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ]);
  });
});

describe("the provider's balance ran out", () => {
  const LOCKED = "fal.ai 403: User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing.";

  it("isBalanceError: fal's exact refusal, a 402 and Higgsfield's hint count; a plain 403 or a 500 do not", () => {
    expect(isBalanceError(new ProviderError(LOCKED, 403))).toBe(true);
    expect(isBalanceError(new ProviderError("fal.ai 402: Payment Required", 402))).toBe(true);
    expect(isBalanceError(new ProviderError("Higgsfield 403 (insufficient API balance?)", 403))).toBe(true);
    expect(isBalanceError(new ProviderError("fal.ai 403: not allowed for this model", 403))).toBe(false);
    expect(isBalanceError(new ProviderError("fal.ai 500: balance service down", 500))).toBe(false);
    expect(isBalanceError(new Error(LOCKED))).toBe(false);
  });

  it("a refused submit tells onSubmitError (for the team alert) and the job fails without counting toward quotas", async () => {
    const onSubmitError = vi.fn(async () => {});
    const { provider: p } = provider([], {
      submit: async () => {
        throw new ProviderError(LOCKED, 403);
      },
    });
    const { jobs } = setup(p, { onSubmitError });
    const job = await jobs.create(image());
    expect(job.status).toBe("failed");
    expect(onSubmitError).toHaveBeenCalledWith("fal", expect.any(ProviderError));
    expect(isBalanceError((onSubmitError.mock.calls[0] as unknown[])[1])).toBe(true);
  });

  it("a failing onSubmitError never breaks the request", async () => {
    const { provider: p } = provider([], {
      submit: async () => {
        throw new ProviderError(LOCKED, 403);
      },
    });
    const { jobs } = setup(p, {
      onSubmitError: () => {
        throw new Error("alert down");
      },
    });
    await expect(jobs.create(image())).resolves.toMatchObject({ status: "failed" });
  });
});

describe("fal calls have a time limit", () => {
  /** A fetch that never answers until its signal aborts it, like a hung connection. */
  const hangingFetch = (input: string, init?: RequestInit) =>
    new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason ?? new Error("aborted")));
    });

  it("a hung poll becomes a retryable error: the job stays alive until its timeout", async () => {
    const fal = falProvider({ key: "fal_key_abcdefghijklmnop", fetch: hangingFetch, timeouts: { submitMs: 30, pollMs: 30 } });
    await expect(fal.poll({ requestId: "r1", model: "fal-ai/nano-banana-2/edit" })).rejects.toMatchObject({ retryable: true });
    const { jobs, repo, clock: c } = setup(fal);
    await repo.update({ ...(await cutOffJob(repo, T0)), providerRequestId: "r1", model: "fal-ai/nano-banana-2/edit" });
    c.advance(30_000);
    expect((await jobs.refresh("00000000-0000-4000-8000-0000000000ff")).status).toBe("queued");
  });

  it("a hung submit fails the job at once instead of running into the route's 150 s limit", async () => {
    const fal = falProvider({ key: "fal_key_abcdefghijklmnop", fetch: hangingFetch, timeouts: { submitMs: 30, pollMs: 30 } });
    const { jobs } = setup(fal);
    const job = await jobs.create(image());
    expect(job.status).toBe("failed");
    expect(job.error).toMatch(/did not answer in time/);
  });
});
