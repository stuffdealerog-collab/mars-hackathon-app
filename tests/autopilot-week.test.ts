import { describe, expect, it } from "vitest";
import { selectWeekBatch, type WeekPost, weekPickScript } from "../src/lib/autopilot/week";
import { pickScript } from "../src/lib/uslub/botpublish-core";
import type { Script } from "../src/lib/uslub/contract";

const now = Date.parse("2026-11-30T05:00:00Z"); // Monday 10:00 Tashkent
const batchAt = "2026-11-30T04:50:00.000Z";

let n = 0;
function post(over: Partial<WeekPost> & { text?: string } = {}): WeekPost {
  n++;
  const text = over.text ?? `Yangi non har kuni ertalab. ${n}`;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    status: "draft",
    createdAt: batchAt,
    slot: { day: "2026-12-01", time: "12:40", format: "photo" },
    variants: { uz_latn: text, uz_cyrl: "", ru: "", en: "" },
    ...over,
  };
}

const ids = (xs: { postId: string }[]) => xs.map((x) => x.postId);

describe("selectWeekBatch: which posts «approve the week» queues", () => {
  it("clean drafts of the latest batch are ready, each with its slot time", () => {
    const a = post({ slot: { day: "2026-12-01", time: "12:40" } });
    const b = post({ slot: { day: "2026-12-03", time: "19:00" }, status: "approved" });
    const r = selectWeekBatch({ posts: [a, b], channel: "nonvoy", now });
    expect(r.skipped).toEqual([]);
    expect(r.ready).toEqual([
      { postId: a.id, script: "uz_latn", dueAt: "2026-12-01T07:40:00.000Z", late: false },
      { postId: b.id, script: "uz_latn", dueAt: "2026-12-03T14:00:00.000Z", late: false },
    ]);
  });

  it("a post with a blank is left out and names the blank", () => {
    const p = post({ text: "Tort narxi: [narx]. Buyurtma: XXX" });
    const r = selectWeekBatch({ posts: [p], channel: "nonvoy", now });
    expect(r.ready).toEqual([]);
    expect(r.skipped).toEqual([{ postId: p.id, reason: "blank", tokens: ["[narx]", "XXX"] }]);
  });

  it("a post naming a date that will have passed is left out", () => {
    const p = post({ text: "Ochilish 28-noyabr kuni bo‘ladi, keling!" });
    const r = selectWeekBatch({ posts: [p], channel: "nonvoy", now });
    expect(r.skipped).toEqual([{ postId: p.id, reason: "past_date", dates: ["28.11.2026"] }]);
  });

  it("a slot that is over, or no slot at all, is left out", () => {
    const old = post({ slot: { day: "2026-11-28", time: "12:40" } });
    const none = post({ slot: undefined });
    const r = selectWeekBatch({ posts: [old, none], channel: "nonvoy", now });
    expect(r.skipped).toEqual([
      { postId: old.id, reason: "slot_passed" },
      { postId: none.id, reason: "no_slot" },
    ]);
  });

  it("a slot earlier today goes out shortly, marked late", () => {
    const p = post({ slot: { day: "2026-11-30", time: "08:00" } });
    expect(selectWeekBatch({ posts: [p], channel: "nonvoy", now }).ready).toEqual([
      { postId: p.id, script: "uz_latn", dueAt: new Date(now + 10 * 60_000).toISOString(), late: true },
    ]);
  });

  it("a picture still rendering keeps the post out; a ready or failed picture does not", () => {
    const rendering = post({ image: { status: "running", url: "https://v3.fal.media/old.png" } });
    const ready = post({ image: { status: "ready", url: "https://v3.fal.media/x.png" } });
    const failed = post({ image: { status: "failed" } });
    const r = selectWeekBatch({ posts: [rendering, ready, failed], channel: "nonvoy", now });
    expect(r.skipped).toEqual([{ postId: rendering.id, reason: "picture_rendering" }]);
    expect(ids(r.ready)).toEqual([ready.id, failed.id]);
  });

  it("a video slot without the owner's video is left out", () => {
    const p = post({ slot: { day: "2026-12-01", time: "12:40", format: "video" } });
    const scripted = post({ slot: { day: "2026-12-02", time: "12:40", format: "video" }, video: {} });
    const withVideo = post({ slot: { day: "2026-12-02", time: "12:40", format: "video" }, video: { fileId: "BAACAgIAAxkBAAIB" } });
    const r = selectWeekBatch({ posts: [p, scripted, withVideo], channel: "nonvoy", now });
    expect(r.skipped).toEqual([
      { postId: p.id, reason: "video_missing" },
      { postId: scripted.id, reason: "video_missing" },
    ]);
    expect(ids(r.ready)).toEqual([withVideo.id]);
  });

  it("a video post whose video came is not held back by the run's picture still drawing (that picture is never sent)", () => {
    const drawing = { status: "running" as const };
    const withVideo = post({ slot: { day: "2026-12-02", time: "12:40", format: "video" }, video: { fileId: "BAACAgIAAxkBAAIB" }, image: drawing });
    const photo = post({ slot: { day: "2026-12-02", time: "13:40", format: "photo" }, image: drawing });
    const r = selectWeekBatch({ posts: [withVideo, photo], channel: "nonvoy", now });
    expect(ids(r.ready)).toEqual([withVideo.id]);
    expect(r.skipped).toEqual([{ postId: photo.id, reason: "picture_rendering" }]);
  });

  it("a video idea (a script, no slot) is never part of the latest batch, and has no time to go out", () => {
    const week = [post(), post()];
    const idea = post({ createdAt: new Date(now + 60_000).toISOString(), video: { fileId: "BAACAgIAAxkBAAIC" } });
    delete (idea as { slot?: unknown }).slot;
    const r = selectWeekBatch({ posts: [...week, idea], channel: "nonvoy", now });
    expect(ids(r.ready)).toEqual(week.map((p) => p.id));
    expect(selectWeekBatch({ posts: [idea], channel: "nonvoy", now, postIds: [idea.id] }).skipped).toEqual([{ postId: idea.id, reason: "no_slot" }]);
  });

  it("no channel: nothing can go out", () => {
    const p = post();
    expect(selectWeekBatch({ posts: [p], channel: null, now })).toEqual({ ready: [], skipped: [{ postId: p.id, reason: "no_channel" }] });
  });

  it("published posts are untouched", () => {
    const p = post({ status: "published", publishedUrl: "https://t.me/nonvoy/5" });
    expect(selectWeekBatch({ posts: [p], channel: "nonvoy", now })).toEqual({ ready: [], skipped: [{ postId: p.id, reason: "published" }] });
  });

  it("without ids it takes the latest batch only (newest post and up to 15 minutes before it, 7 at most)", () => {
    const old = post({ createdAt: "2026-11-29T10:00:00.000Z" });
    const fresh = Array.from({ length: 8 }, () => post());
    const r = selectWeekBatch({ posts: [old, ...fresh], channel: "nonvoy", now });
    expect(r.ready).toHaveLength(7);
    expect(ids(r.ready)).not.toContain(old.id);
  });

  it("with ids it takes exactly those (one post can be queued on its own)", () => {
    const a = post();
    const b = post();
    const r = selectWeekBatch({ posts: [a, b], channel: "nonvoy", now, postIds: [b.id, "unknown"] });
    expect(ids(r.ready)).toEqual([b.id]);
  });

  it("is ordered by slot time, then skipped in batch order", () => {
    const late = post({ slot: { day: "2026-12-04", time: "10:00" } });
    const early = post({ slot: { day: "2026-12-01", time: "10:00" } });
    expect(ids(selectWeekBatch({ posts: [late, early], channel: "nonvoy", now }).ready)).toEqual([early.id, late.id]);
  });

  it("checks the variant that will go out: the brand's main language", () => {
    const p = post({ variants: { uz_latn: "Yaxshi post.", uz_cyrl: "", ru: "Цена: [цена]", en: "" } });
    const r = selectWeekBatch({ posts: [p], channel: "nonvoy", now, languages: ["ru"] });
    expect(r.skipped).toEqual([{ postId: p.id, reason: "blank", tokens: ["[цена]"] }]);
  });

  it("picks the same script as the bot's publisher", () => {
    const cases: [Partial<Record<Script, string>>, Script[]][] = [
      [{ uz_latn: "a", ru: "b" }, ["ru"]],
      [{ uz_latn: "a", ru: "" }, ["ru"]],
      [{ uz_latn: "a", ru: "b", en: "c" }, ["en", "ru"]],
      [{ uz_latn: "a" }, []],
    ];
    for (const [v, langs] of cases) {
      const variants = { uz_latn: "", uz_cyrl: "", ru: "", en: "", ...v } as Record<Script, string>;
      expect(weekPickScript(variants, langs)).toBe(pickScript(variants, undefined, langs));
    }
  });
});
