import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrandProfile, PostDraft, PostImage, Script } from "@/lib/uslub/contract";

// The Studio store against a fake server (PR #55 review): «Haftani tasdiqlash» after an edit the server cleans, a
// picture the run would still draw for a post the week just queued, approving a changed post, a rewrite that would
// race an approval. The fake server cleans edits with the real cleanEdit (edits.ts) and checks the week hash with the
// real server weekHash, so a client that hashes another text than the server gets the same 409 as in production.
vi.mock("@/lib/autopilot/week-hash", async () => await import("../../lib/autopilot/week-hash"));
vi.mock("@/lib/uslub/translit", async () => await import("../../lib/uslub/translit"));

const api = vi.hoisted(() => ({
  approvePost: vi.fn(),
  approveWeek: vi.fn(),
  listPosts: vi.fn(),
  getAutopilot: vi.fn(),
  getBrand: vi.fn(),
  savedPlan: vi.fn(),
  getAnswers: vi.fn(),
  learnVisual: vi.fn(),
  startPostImage: vi.fn(),
  getPostImage: vi.fn(),
  rewritePost: vi.fn(),
  analyzeChannel: vi.fn(),
}));
vi.mock("./api", () => ({
  ...api,
  sampleMode: () => false,
  handoffState: () => "valid",
  handoffUser: () => "42",
  handoffKey: () => "k",
  authHeader: () => "handoff k",
  saveHandoff: () => undefined,
  tgInitData: () => undefined,
  botPublishUrl: () => "https://t.me/mercatai",
  slotOf: (x: unknown) => x,
}));

const mem = new Map<string, string>();
const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
vi.stubGlobal("localStorage", storage);
vi.stubGlobal("sessionStorage", storage);

const { useStudio } = await import("./store");
const { selectWeekBatch } = await import("../../lib/autopilot/week");
const { weekHashForClient } = await import("../../lib/autopilot/week-hash");
const { weekHash } = await import("../../lib/autopilot/week-message");
const { mergeVariants } = await import("../../lib/uslub/edits");

// Thursday 2026-11-26 10:00 in Tashkent (UTC+5); the posts go out on Friday and Saturday.
const NOW = Date.parse("2026-11-26T05:00:00Z");
const BRAND = "22222222-2222-4222-8222-222222222222";
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const brand = { id: BRAND, channel: "@nonvoy", mode: "fresh", dna: { name: "Non Voy", languages: ["uz_latn"] } } as unknown as BrandProfile;
const picture: PostImage = { status: "ready", url: "https://v3.fal.media/files/x/a.png", refsUsed: 1 };

function post(id: string, over: Partial<PostDraft> = {}): PostDraft {
  return {
    id,
    brandId: BRAND,
    brief: "",
    variants: { uz_latn: `Yangi patir har kuni ertalab. ${id.slice(-1)}`, uz_cyrl: "", ru: "", en: "" },
    neuroHits: {},
    humanScore: 90,
    status: "draft",
    slot: { day: id === A ? "2026-11-27" : "2026-11-28", time: "19:00", goal: "sale", hook: "h", cta: "" },
    image: picture,
    createdAt: "2026-11-26T04:50:00.000Z",
    ...over,
  };
}

/** The server's copy of each post, as the approve and approve-week routes keep it, and its publish queue. */
let server: Map<string, PostDraft>;
let queue: Record<string, { dueAt: string; status: "queued" }> = {};
const ok = <T,>(data: T) => ({ ok: true as const, data });
const fail = (status: number, code: string) => ({ ok: false as const, status, code });
const flush = async (n = 6) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

function fakeServer() {
  api.approvePost.mockImplementation(async (id: string, _lang: string, variants?: Partial<Record<Script, string>>) => {
    const cur = server.get(id)!;
    const merged = variants ? mergeVariants(cur.variants, variants) : null;
    if (merged && !merged.ok) return fail(400, "invalid_input");
    const next: PostDraft = { ...cur, variants: merged?.ok ? merged.variants : cur.variants, status: "approved", approvedAt: new Date().toISOString() };
    server.set(id, next);
    return ok({ post: next });
  });
  api.approveWeek.mockImplementation(async (_brandId: string, hash: string, _lang: string, postIds?: string[]) => {
    const posts = [...server.values()];
    const batch = selectWeekBatch({ posts, channel: brand.channel, languages: ["uz_latn"], postIds, now: Date.now() });
    if (!batch.ready.length || weekHash(batch, posts) !== hash) return fail(409, "batch_changed");
    for (const r of batch.ready) {
      server.set(r.postId, { ...server.get(r.postId)!, status: "approved" });
      queue[r.postId] = { dueAt: r.dueAt, status: "queued" };
    }
    return ok({ queued: batch.ready.map((r) => ({ postId: r.postId, dueAt: r.dueAt })), skipped: batch.skipped, admin: { status: "admin", canPost: true, canInvite: true } });
  });
  api.listPosts.mockImplementation(async () => ok({ posts: [...server.values()] }));
  api.getAutopilot.mockImplementation(async () => ok({ autopilot: { on: false }, admin: { status: "admin", canPost: true, canInvite: true }, schedule: { ...queue } }));
}

function open(posts: PostDraft[]) {
  server = new Map(posts.map((p) => [p.id, structuredClone(p)]));
  queue = {};
  useStudio.setState({ phase: "ready", sample: false, brand, posts, edited: {}, busy: {}, pendingApprove: {}, postNote: {}, schedule: {}, approveDelayMs: 0, week: { state: "idle" } });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  for (const f of Object.values(api)) f.mockReset();
  fakeServer();
});

afterEach(() => {
  useStudio.getState().reset();
  vi.useRealTimers();
});

describe("an edit the server cleans, then «Haftani tasdiqlash»", () => {
  it("shows the server's cleaned text after the approval and hashes exactly what the server hashes", async () => {
    open([post(A)]);
    useStudio.getState().editPost(A, "uz_latn", "a \nb");
    expect((await useStudio.getState().approve(A)).ok).toBe(true);

    const st = useStudio.getState();
    expect(st.edited[A]).toBeUndefined();
    expect(st.posts[0].variants.uz_latn).toBe("a\nb");
    const mine = await weekHashForClient(st.weekNow().batch, st.posts);
    const serverPosts = [...server.values()];
    const theirs = weekHash(selectWeekBatch({ posts: serverPosts, channel: brand.channel, languages: ["uz_latn"], now: NOW }), serverPosts);
    expect(mine).toBe(theirs);
    // The raw textarea text would never have matched: the test means something.
    const raw = [{ ...st.posts[0], variants: { ...st.posts[0].variants, uz_latn: "a \nb" } }];
    expect(await weekHashForClient(st.weekNow().batch, raw)).not.toBe(theirs);
  });

  it("queues the week on the first press after an edit with a trailing space and too many empty lines", async () => {
    open([post(A), post(B)]);
    useStudio.getState().editPost(B, "uz_latn", "Patir  \n\n\n\n\nbor​");
    const w = await useStudio.getState().approveWeek();
    expect(w).toMatchObject({ state: "done", queued: 2 });
    expect(api.approveWeek).toHaveBeenCalledTimes(1);
    expect(useStudio.getState().edited[B]).toBeUndefined();
    expect(useStudio.getState().schedule[B]?.status).toBe("queued");
  });

  it("a refused edit stops the week instead of queueing the unedited text", async () => {
    open([post(A)]);
    useStudio.getState().editPost(A, "uz_latn", "Patir bor, ertalab issiq.");
    api.approvePost.mockResolvedValueOnce(fail(400, "invalid_input"));
    const w = await useStudio.getState().approveWeek();
    expect(w.state).toBe("failed");
    expect(api.approveWeek).not.toHaveBeenCalled();
  });

  it("a post approved elsewhere: the refresh takes the server's text and forgets this device's edit of it", async () => {
    vi.setSystemTime(NOW + 60_000);
    open([post(A)]);
    useStudio.getState().editPost(A, "uz_latn", "local words");
    server.set(A, { ...server.get(A)!, variants: { ...server.get(A)!.variants, uz_latn: "server words" }, status: "approved" });
    await useStudio.getState().refreshPosts();
    const st = useStudio.getState();
    expect(st.posts[0].variants.uz_latn).toBe("server words");
    expect(st.edited[A]).toBeUndefined();
  });

  it("an edit of a post that is still a draft on the server stays on screen through a refresh", async () => {
    vi.setSystemTime(NOW + 120_000);
    open([post(A)]);
    useStudio.getState().editPost(A, "uz_latn", "local words");
    await useStudio.getState().refreshPosts();
    expect(useStudio.getState().posts[0].variants.uz_latn).toBe("local words");
    expect(useStudio.getState().edited[A]?.uz_latn).toBe("local words");
  });
});

describe("a changed post (a draft again, still in the queue)", () => {
  it("approving it puts this version back in the queue, not a plain approval that leaves the old entry", async () => {
    open([post(A)]);
    useStudio.setState({ schedule: { [A]: { dueAt: "2026-11-27T14:00:00.000Z", status: "queued" } } });
    queue[A] = { dueAt: "2026-11-27T14:00:00.000Z", status: "queued" };
    expect(useStudio.getState().requeues(A)).toBe(true);
    const r = await useStudio.getState().approve(A);
    expect(r.ok).toBe(true);
    expect(api.approveWeek).toHaveBeenCalledWith(BRAND, expect.any(String), expect.any(String), [A]);
    expect(api.approvePost).not.toHaveBeenCalled();
    expect(useStudio.getState().posts[0].status).toBe("approved");
    expect(useStudio.getState().schedule[A]?.status).toBe("queued");
  });

  it("a post whose slot has passed is approved the plain way", async () => {
    open([post(A, { slot: { day: "2026-11-25", time: "09:00", goal: "sale", hook: "h", cta: "" } })]);
    useStudio.setState({ schedule: { [A]: { dueAt: "2026-11-25T04:00:00.000Z", status: "expired" } } });
    expect(useStudio.getState().requeues(A)).toBe(false);
    expect((await useStudio.getState().approve(A)).ok).toBe(true);
    expect(api.approvePost).toHaveBeenCalledTimes(1);
    expect(api.approveWeek).not.toHaveBeenCalled();
  });
});

describe("a rewrite while something else is under way", () => {
  it("waits while the post's approval is in its undo window or the queue is sending it", async () => {
    open([post(A)]);
    useStudio.setState({ pendingApprove: { [A]: true } });
    expect(await useStudio.getState().rewrite(A, "qisqaroq")).toBe(false);
    useStudio.setState({ pendingApprove: {}, schedule: { [A]: { dueAt: "2026-11-27T14:00:00.000Z", status: "sending" } } });
    expect(await useStudio.getState().rewrite(A, "qisqaroq")).toBe(false);
    expect(api.rewritePost).not.toHaveBeenCalled();
  });
});

describe("the run's pictures and «Haftani tasdiqlash»", () => {
  it("never starts a paid picture for a post the week queued while an earlier picture was being started", async () => {
    const posts = [post(A, { image: undefined }), post(B, { image: undefined })];
    api.getBrand.mockResolvedValue(ok({ brand }));
    api.listPosts.mockResolvedValue(ok({ posts }));
    api.savedPlan.mockResolvedValue(ok({ plan: null }));
    api.getAnswers.mockResolvedValue(ok({ questions: [] }));
    let finishA!: (v: unknown) => void;
    api.startPostImage.mockImplementation((id: string) =>
      id === A ? new Promise((r) => (finishA = r)) : Promise.resolve(ok({ image: { status: "queued", refsUsed: 0 } })),
    );
    api.getPostImage.mockResolvedValue(ok({ image: null }));

    await useStudio.getState().reopen(BRAND);
    await flush();
    expect(api.startPostImage).toHaveBeenCalledTimes(1);
    expect(api.startPostImage.mock.calls[0][0]).toBe(A);

    // Meanwhile the owner approved the week: B went in the queue as it is (text only).
    useStudio.setState({
      posts: useStudio.getState().posts.map((p) => (p.id === B ? { ...p, status: "approved" } : p)),
      schedule: { [B]: { dueAt: "2026-11-28T14:00:00.000Z", status: "queued" } },
    });
    finishA(ok({ image: { status: "queued", refsUsed: 0 } }));
    await flush();
    expect(api.startPostImage).toHaveBeenCalledTimes(1);
  });
});
