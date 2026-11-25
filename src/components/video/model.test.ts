import { describe, expect, it } from "vitest";
import type { PostDraft, PostSchedule } from "@/lib/uslub/contract";
import { sceneRanges, videoLamp, videoLink, videoList, videoState } from "./model";

// The Video tab's pure helpers: where a video post stands, which posts the tab lists, the lamp, the bot link.

const NOW = Date.parse("2026-11-25T10:00:00+05:00"); // Wednesday
const plan = { hook: "Tong", scenes: [{ seconds: 3, visual: "a", voiceover: "b", caption: "c" }, { seconds: 4.4, visual: "", voiceover: "", caption: "" }], musicMood: "" };

let n = 0;
function post(over: Partial<PostDraft> = {}): PostDraft {
  n++;
  return {
    id: `p${n}`,
    brandId: "b",
    brief: "",
    variants: { uz_latn: "Matn", uz_cyrl: "", ru: "", en: "" },
    neuroHits: {},
    humanScore: 90,
    status: "draft",
    slot: { day: "2026-11-27", time: "19:00", goal: "reach", hook: "Non", cta: "", format: "video" },
    createdAt: "2026-11-24T10:00:00Z",
    ...over,
  };
}

describe("videoState", () => {
  it("script, video, approval, queue and channel, in that order", () => {
    expect(videoState(post())).toBe("needs_script");
    expect(videoState(post({ video: { plan } }))).toBe("waiting");
    expect(videoState(post({ video: { plan, fileId: "f" } }))).toBe("received");
    expect(videoState(post({ video: { fileId: "f" }, status: "approved" }))).toBe("approved");
    const q: PostSchedule = { dueAt: "2026-11-27T14:00:00Z", status: "queued" };
    expect(videoState(post({ video: { fileId: "f" }, status: "approved" }), q)).toBe("queued");
    expect(videoState(post({ video: { fileId: "f" }, status: "approved" }), { ...q, status: "blocked" })).toBe("stopped");
    expect(videoState(post({ video: { fileId: "f" }, status: "approved" }), { ...q, status: "sent" })).toBe("out");
    expect(videoState(post({ status: "published" }))).toBe("out");
  });

  it("a queued post that became a draft again (a new video, a new caption) is not in the queue any more", () => {
    expect(videoState(post({ video: { plan, fileId: "f2" } }), { dueAt: "2026-11-27T14:00:00Z", status: "queued" })).toBe("received");
  });
});

describe("videoList", () => {
  it("video slots by time, then ideas newest first; photo posts, old slots and old published videos stay out", () => {
    const later = post({ slot: { day: "2026-11-29", time: "10:00", goal: "reach", hook: "", cta: "", format: "video" } });
    const sooner = post({ slot: { day: "2026-11-26", time: "08:00", goal: "reach", hook: "", cta: "", format: "video" } });
    const photo = post({ slot: { day: "2026-11-26", time: "09:00", goal: "reach", hook: "", cta: "", format: "photo" } });
    const stale = post({ slot: { day: "2026-11-20", time: "09:00", goal: "reach", hook: "", cta: "", format: "video" } });
    const outRecent = post({ status: "published", slot: { day: "2026-11-23", time: "09:00", goal: "reach", hook: "", cta: "", format: "video" } });
    const outOld = post({ status: "published", slot: { day: "2026-11-10", time: "09:00", goal: "reach", hook: "", cta: "", format: "video" } });
    const ideaOld = post({ slot: undefined, video: { plan }, createdAt: "2026-11-20T10:00:00Z" });
    const ideaNew = post({ slot: undefined, video: { plan }, createdAt: "2026-11-25T09:00:00Z" });
    const ids = videoList([later, sooner, photo, stale, outRecent, outOld, ideaOld, ideaNew], NOW).map((p) => p.id);
    expect(ids).toEqual([outRecent.id, sooner.id, later.id, ideaNew.id, ideaOld.id]);
  });

  it("at most `max`", () => {
    const many = Array.from({ length: 20 }, () => post());
    expect(videoList(many, NOW, 5)).toHaveLength(5);
  });
});

describe("the rest", () => {
  it("scene ranges add up from 0", () => {
    expect(sceneRanges(plan)).toEqual([
      { from: 0, to: 3 },
      { from: 3, to: 7 },
    ]);
  });

  it("the Videographer's lamp: working while it writes, holding its scripts, dark before", () => {
    expect(videoLamp([post(), post({ video: { plan } })], true)).toEqual({ state: "warming", scripts: 1 });
    expect(videoLamp([post({ video: { plan } }), post({ video: { plan } })], false)).toEqual({ state: "on", scripts: 2 });
    expect(videoLamp([post()], false)).toEqual({ state: "off", scripts: 0 });
  });

  it("the bot link waits for this post's video", () => {
    expect(videoLink("@mercatai", "2f0b5a4e-1c2d-4e3f-8a9b-0c1d2e3f4a5b")).toBe("https://t.me/mercatai?start=video_2f0b5a4e-1c2d-4e3f-8a9b-0c1d2e3f4a5b");
  });
});
