import { describe, expect, it } from "vitest";
import type { PostDraft, PostSchedule } from "@/lib/uslub/contract";
import { needsPicture, postPhase, publisherOutcome, tashkentWhen, weekContinueUrl, weekPlan } from "./week";

// Thursday 2026-11-26 10:00 in Tashkent (UTC+5).
const NOW = Date.parse("2026-11-26T05:00:00Z");

function post(id: string, over: Partial<PostDraft> = {}): PostDraft {
  return {
    id,
    brandId: "b",
    brief: "",
    variants: { uz_latn: `Post ${id}. Patir bor.`, uz_cyrl: "", ru: "", en: "" },
    neuroHits: {},
    humanScore: 90,
    status: "draft",
    slot: { day: "2026-11-27", time: "19:00", goal: "sale", hook: "h", cta: "" },
    image: { status: "ready", url: `https://v3.fal.media/files/${id}.jpg`, refsUsed: 1 },
    createdAt: "2026-11-26T04:50:00Z",
    ...over,
  };
}

const sched = (status: PostSchedule["status"], dueAt = "2026-11-27T14:00:00Z", error?: string): PostSchedule => ({ dueAt, status, ...(error ? { error } : {}) });

describe("weekPlan", () => {
  it("counts only the posts that are not queued yet, in slot order", () => {
    const posts = [post("a", { slot: { day: "2026-11-28", time: "09:00", goal: "sale", hook: "x", cta: "" } }), post("b"), post("c", { status: "approved" })];
    const w = weekPlan({ posts, schedule: { c: sched("queued") }, channel: "@nonvoy", languages: ["uz_latn"], now: NOW });
    expect(w.batch.ready.map((r) => r.postId)).toEqual(["b", "c", "a"]);
    expect(w.toQueue.map((r) => r.postId)).toEqual(["b", "a"]);
  });

  it("puts a queued post the owner changed back on the button", () => {
    const w = weekPlan({ posts: [post("a"), post("b", { status: "approved" })], schedule: { a: sched("queued"), b: sched("queued") }, channel: "@nonvoy", now: NOW });
    expect(w.toQueue.map((r) => r.postId)).toEqual(["a"]);
  });

  it("names why a post stays out (a blank, a picture still drawing) and never lists published ones", () => {
    const posts = [
      post("a", { variants: { uz_latn: "Narxi [narx] so‘m", uz_cyrl: "", ru: "", en: "" } }),
      post("b", { image: { status: "running", refsUsed: 0 } }),
      post("c", { status: "published", publishedUrl: "https://t.me/nonvoy/12" }),
      post("d"),
    ];
    const w = weekPlan({ posts, schedule: {}, channel: "@nonvoy", now: NOW });
    expect(w.toQueue.map((r) => r.postId)).toEqual(["d"]);
    expect(w.skipped).toEqual([
      { postId: "a", reason: "blank", tokens: ["[narx]"] },
      { postId: "b", reason: "picture_rendering" },
    ]);
  });

  it("has nothing to queue without a channel", () => {
    const w = weekPlan({ posts: [post("a")], schedule: {}, channel: null, now: NOW });
    expect(w.toQueue).toEqual([]);
    expect(w.skipped[0].reason).toBe("no_channel");
  });

  it("takes exactly the given posts for a single re-approval", () => {
    const w = weekPlan({ posts: [post("a"), post("b")], schedule: {}, channel: "@nonvoy", now: NOW, postIds: ["b"] });
    expect(w.batch.ready.map((r) => r.postId)).toEqual(["b"]);
  });
});

describe("postPhase", () => {
  it("a queued approved post waits for its time", () => {
    expect(postPhase(post("a", { status: "approved" }), sched("queued"))).toEqual({ kind: "queued", dueAt: "2026-11-27T14:00:00Z" });
  });

  it("a post the owner rewrote after approving it is 'changed' (approve again)", () => {
    expect(postPhase(post("a", { status: "draft" }), sched("queued")).kind).toBe("changed");
    expect(postPhase(post("a", { status: "draft" }), sched("blocked")).kind).toBe("changed");
  });

  it("sent and published posts are out, with the link", () => {
    expect(postPhase(post("a", { status: "published", publishedUrl: "https://t.me/x/5" }))).toEqual({ kind: "out", url: "https://t.me/x/5" });
    expect(postPhase(post("a", { status: "approved", publishedUrl: "https://t.me/x/6" }), sched("sent"))).toEqual({ kind: "out", url: "https://t.me/x/6" });
  });

  it("a stopped post carries the server's reason", () => {
    expect(postPhase(post("a", { status: "approved" }), sched("blocked", undefined, "Bot admin emas"))).toEqual({ kind: "stopped", status: "blocked", why: "Bot admin emas" });
    expect(postPhase(post("a", { status: "approved" }), sched("expired")).kind).toBe("stopped");
    expect(postPhase(post("a", { status: "approved" }), sched("unknown", undefined, "Kanalni tekshiring"))).toEqual({ kind: "unknown", why: "Kanalni tekshiring" });
    expect(postPhase(post("a", { status: "approved" }), sched("sending")).kind).toBe("sending");
  });

  it("no schedule: nothing to say", () => {
    expect(postPhase(post("a", { status: "approved" }))).toEqual({ kind: "none" });
  });
});

describe("needsPicture", () => {
  it("never draws for a post the queue holds (queued, sending, blocked)", () => {
    const bare = post("a", { status: "approved", image: undefined });
    expect(needsPicture(bare)).toBe(true);
    for (const s of ["queued", "sending", "blocked"] as const) expect(needsPicture(bare, sched(s))).toBe(false);
    expect(needsPicture(bare, sched("failed"))).toBe(true);
  });

  it("keeps the old rule otherwise: drafts without a picture, never a redraw of an approved one", () => {
    expect(needsPicture(post("a", { image: undefined }))).toBe(true);
    expect(needsPicture(post("a", { image: { status: "failed", refsUsed: 0 } }))).toBe(true);
    expect(needsPicture(post("a", { image: { status: "failed", url: "https://v3.fal.media/x.jpg", refsUsed: 0 } }))).toBe(false);
    expect(needsPicture(post("a", { status: "approved" }))).toBe(false);
    expect(needsPicture(post("a", { status: "published", image: undefined }))).toBe(false);
  });
});

describe("publisherOutcome", () => {
  it("counts the posts the queue sent and names the next one", () => {
    const schedule = { a: sched("sent"), b: sched("sent"), c: sched("queued", "2026-11-29T04:00:00Z"), d: sched("queued", "2026-11-28T04:00:00Z") };
    expect(publisherOutcome(schedule)).toEqual({ out: 2, next: "2026-11-28T04:00:00Z" });
  });

  it("is empty with no schedule", () => {
    expect(publisherOutcome({})).toEqual({ out: 0 });
  });
});

describe("weekContinueUrl", () => {
  it("opens the bot's week view for the brand", () => {
    expect(weekContinueUrl("@mercatai", "179B0025-D3EF-4674-AF8C-F545B6F80158")).toBe("https://t.me/mercatai?start=week_179b0025-d3ef-4674-af8c-f545b6f80158");
  });
});

describe("tashkentWhen", () => {
  it("reads a queue time in Tashkent (UTC+5), whatever the browser's zone", () => {
    expect(tashkentWhen("2026-11-27T14:00:00.000Z")).toEqual({ weekday: 5, time: "19:00", date: "2026-11-27" });
    expect(tashkentWhen("2026-11-29T20:30:00Z")).toEqual({ weekday: 1, time: "01:30", date: "2026-11-30" });
  });

  it("is null for something that is not a time", () => {
    expect(tashkentWhen("soon")).toBeNull();
  });
});
