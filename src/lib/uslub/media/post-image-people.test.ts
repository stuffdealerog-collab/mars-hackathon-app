import { describe, expect, it, vi } from "vitest";
import type { VisualStyle } from "../contract";
import { MediaJobs, TIMED_OUT } from "./jobs";
import {
  buildPostImagePrompt,
  FAILED_COPY,
  pollPostImage,
  sceneSystem,
  startPostImage,
  sweepPostImages,
  type PostForImage,
  type PostImageDeps,
  type StoredPostImage,
} from "./post-image";
import type { MediaProvider, PollResult, SubmitRequest } from "./provider";
import { MemoryMediaJobRepo } from "./repo";

/* ---------------------------------------------------------------- helpers */

const ref = (n: number, source: "channel" | "owner" = "channel") => ({ url: `https://v3b.fal.media/files/ref-${n}.jpg`, source });

const style = (over: Partial<VisualStyle> = {}): VisualStyle => ({
  refs: [ref(1), ref(2), ref(3, "owner")],
  palette: ["#ffffff", "#2a6fdb"],
  light: "bright even clinic light",
  composition: "doctor at a desk, eye level",
  props: ["white coat"],
  mood: "calm",
  avoid: ["text, letters or logos in the picture"],
  prompt: "Bright clean photos of doctors in white coats with patients.",
  learnedAt: "2026-11-24T10:00:00Z",
  ...over,
});

const clinic = (v?: VisualStyle) => ({ id: "b1", name: "Klinika Shifo", oneLiner: "Kardiologiya va UZI, Toshkent", products: ["EKG", "UZI"], visual: v });
const bakery = (v?: VisualStyle) => ({ id: "b2", name: "Safia", oneLiner: "Toshkentdagi qandolatchilik uyi", products: ["Napoleon"], visual: v });

const post = (over: Partial<PostForImage> = {}): PostForImage => ({
  id: "p0000000-0000-4000-8000-000000000001",
  brandId: "b1",
  brief: "Kardiolog qabuli: yurak tekshiruvi",
  variants: { uz_latn: "Doktor Aliyev har seshanba qabul qiladi. EKG va UZI bir kunda.", uz_cyrl: "", ru: "", en: "" },
  ...over,
});

function setup(polls: PollResult[] = [], over: Partial<PostImageDeps> = {}) {
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
  let t = Date.parse("2026-11-25T10:00:00Z");
  let n = 0;
  const repo = new MemoryMediaJobRepo();
  const jobs = new MediaJobs({
    repo,
    providers: [provider],
    now: () => t,
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    anonDailyLimit: 50,
    dailyLimit: 50,
  });
  const saved = new Map<string, StoredPostImage>();
  const deps: PostImageDeps = {
    jobs,
    save: vi.fn(async (id: string, img: StoredPostImage) => {
      saved.set(id, img);
    }),
    describeScene: vi.fn(async () => "An ECG machine on a clean desk."),
    provider: "fal",
    now: () => t,
    ...over,
  };
  return { deps, jobs, repo, submits, saved, advance: (ms: number) => (t += ms), now: () => t };
}

const anon = { telegramId: null };

/* -------------------------------------------------------------- 7b people */

describe("no photoreal people in medical niches and team posts", () => {
  it("a clinic picture: 'No people at all', no reference photos (they are its doctors), scene asked without people", async () => {
    const { deps, submits } = setup();
    const img = await startPostImage({ post: post(), brand: clinic(style()), actor: anon }, deps);
    expect(submits[0].prompt).toContain("No people at all: no faces, bodies, hands or silhouettes");
    expect(submits[0].prompt).toContain("Show the place, the equipment, the tools or one object close-up instead.");
    expect(submits[0].prompt).not.toMatch(/Images? \d/); // no reference numbering
    expect(submits[0].referenceUrls).toEqual([]);
    expect(img.refsUsed).toBe(0);
    expect(vi.mocked(deps.describeScene!).mock.calls[0][0]).toMatchObject({ people: "none", brandName: "Klinika Shifo" });
  });

  it("the no-people line comes after the learned style, so it wins over 'photos of doctors'", async () => {
    const { deps, submits } = setup();
    await startPostImage({ post: post(), brand: clinic(style()), actor: anon }, deps);
    const p = submits[0].prompt;
    expect(p.indexOf("No people at all")).toBeGreaterThan(p.indexOf("Style: Bright clean photos of doctors"));
  });

  it("a bakery's 'meet the team' post: no people, the channel's own photos kept as style with the people left out", async () => {
    const { deps, submits } = setup();
    await startPostImage(
      { post: post({ brandId: "b2", brief: "Jamoamiz bilan tanishing", variants: { uz_latn: "Bizning qandolatchilar har kuni ertalab 5 da ishni boshlaydi." } }), brand: bakery(style()), actor: anon },
      deps,
    );
    expect(submits[0].prompt).toContain("No people at all");
    expect(submits[0].prompt).toContain("Leave out the people in them.");
    expect(submits[0].referenceUrls).toHaveLength(3);
    expect(vi.mocked(deps.describeScene!).mock.calls[0][0]).toMatchObject({ people: "none" });
  });

  it("an owner's photo for a team post: 'Do not add any people' (their own photo stays as it is)", () => {
    const p = buildPostImagePrompt({ scene: "the bakery counter", brandName: "Safia", oneLiner: "", product: true, channelRefs: 0, ownerRefs: 0, people: "none" });
    expect(p).toContain("Image 1 is the owner's photo of the product");
    expect(p).toContain("Do not add any people");
    expect(p).not.toContain("No people at all");
  });

  it("a bakery product post keeps the default rule, the prompt and the scene call byte for byte", async () => {
    const a = { scene: "A slice of Napoleon cake", brandName: "Safia", oneLiner: "qandolatchilik", visual: style(), product: false, channelRefs: 2, ownerRefs: 1 };
    expect(buildPostImagePrompt({ ...a, people: "default" })).toBe(buildPostImagePrompt(a));
    expect(buildPostImagePrompt(a)).not.toMatch(/people/i);
    const { deps, submits } = setup();
    await startPostImage(
      { post: post({ brandId: "b2", brief: "Napoleon torti dam olish uchun", variants: { uz_latn: "Dam olish kuni choyi Napoleon bilan" } }), brand: bakery(style()), actor: anon },
      deps,
    );
    expect(submits[0].prompt).not.toMatch(/people/i);
    expect(submits[0].referenceUrls).toHaveLength(3);
    expect(vi.mocked(deps.describeScene!).mock.calls[0][0]).not.toHaveProperty("people");
  });

  it("the scene instructions forbid people for 'none' and keep today's rule otherwise", () => {
    expect(sceneSystem("none")).toContain("Never people: no faces, bodies, hands or silhouettes.");
    expect(sceneSystem("none")).not.toContain("unless the post is about people");
    expect(sceneSystem()).toContain("No people's faces unless the post is about people.");
    expect(sceneSystem("default")).toBe(sceneSystem());
  });
});

/* --------------------------------------------------------- stuck pictures */

describe("post pictures that would say 'rendering' forever", () => {
  it("a picture whose job is gone fails with the usual copy (the old picture stays)", async () => {
    const { deps, saved } = setup();
    const stuck: StoredPostImage = { status: "queued", jobId: "00000000-0000-4000-8000-0000000000aa", refsUsed: 2, url: "https://v3b.fal.media/files/old.jpg" };
    const out = await pollPostImage({ post: post({ image: stuck }), actor: anon }, deps);
    expect(out).toMatchObject({ status: "failed", error: FAILED_COPY, url: "https://v3b.fal.media/files/old.jpg" });
    expect(saved.get(post().id)).toEqual(out);
  });

  it("the sweep fails a post stuck 'queued' with polls=0 once its job times out, and delivers one that finished", async () => {
    const { deps, saved, advance, repo, now } = setup([{ status: "running" }, { status: "succeeded", outputUrl: "https://v3b.fal.media/files/done.jpg" }]);
    const a = post({ id: "a0000000-0000-4000-8000-000000000001" });
    const b = post({ id: "b0000000-0000-4000-8000-000000000002" });
    const imgA = await startPostImage({ post: a, brand: clinic(), actor: anon }, deps);
    const imgB = await startPostImage({ post: b, brand: clinic(), actor: anon }, deps);
    expect((await repo.get(imgA.jobId!))?.polls).toBe(0); // nobody ever polled (the tab was closed)
    advance(6 * 60_000);
    const posts = new Map([
      [a.id, { ...a, image: imgA }],
      [b.id, { ...b, image: imgB }],
    ]);
    const report = await sweepPostImages({ ids: [a.id, b.id, "missing"], load: async (id) => posts.get(id) ?? null, deadline: now() + 60_000 }, deps);
    expect(report).toEqual({ checked: 2, updated: 2, stoppedEarly: false });
    expect(saved.get(a.id)).toMatchObject({ status: "failed", error: FAILED_COPY });
    expect((await repo.get(imgA.jobId!))?.error).toBe(TIMED_OUT);
    expect(saved.get(b.id)).toMatchObject({ status: "ready", url: "https://v3b.fal.media/files/done.jpg" });
  });

  it("the sweep skips pictures that are not pending and stops at its deadline", async () => {
    const { deps, now } = setup();
    const ready: StoredPostImage = { status: "ready", url: "https://v3b.fal.media/x.jpg", refsUsed: 1 };
    const load = vi.fn(async () => post({ image: ready }));
    expect(await sweepPostImages({ ids: ["x"], load }, deps)).toEqual({ checked: 0, updated: 0, stoppedEarly: false });
    expect(await sweepPostImages({ ids: ["x", "y"], load, deadline: now() }, deps)).toMatchObject({ checked: 0, stoppedEarly: true });
    expect(load).toHaveBeenCalledTimes(1);
  });
});
