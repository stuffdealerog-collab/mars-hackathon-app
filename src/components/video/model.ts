/**
 * The Video tab, pure (the Studio and the Mini App share it; unit-tested): which video posts the tab lists, where each
 * one stands, and the Videographer's lamp. Relative imports for values: vitest does not resolve the "@/" alias.
 */
import type { PostDraft, PostSchedule, VideoPlan } from "@/lib/uslub/contract";
import type { LampState } from "../lamp/lamps";
import { isVideoIdea, isVideoPost } from "../../lib/uslub/video-core";

export { fmtDuration, isVideoIdea, isVideoPost, planSeconds } from "../../lib/uslub/video-core";

/**
 * Where a video post stands, in the owner's order of things:
 * - needs_script: a video slot without a script yet ("Write the script");
 * - waiting: the script is there, the owner's video is not (the bot's link);
 * - received: the video is on the post, not approved yet;
 * - approved: approved, not in the queue (an idea, or a slot approved before its queue entry);
 * - queued: waits in the queue for its slot, or is going out now;
 * - stopped: the queue could not send it (blocked, failed, expired, cut off);
 * - out: in the channel.
 */
export type VideoState = "needs_script" | "waiting" | "received" | "approved" | "queued" | "stopped" | "out";

const QUEUED: ReadonlySet<PostSchedule["status"]> = new Set(["queued", "sending"]);
const STOPPED: ReadonlySet<PostSchedule["status"]> = new Set(["blocked", "failed", "expired", "unknown"]);

export function videoState(post: Pick<PostDraft, "status" | "video">, schedule?: PostSchedule | null): VideoState {
  if (post.status === "published") return "out";
  // A queued post the owner changed since (a draft again) is not in the queue any more.
  if (schedule && post.status !== "draft") {
    if (schedule.status === "sent") return "out";
    if (QUEUED.has(schedule.status)) return "queued";
    if (STOPPED.has(schedule.status)) return "stopped";
  }
  if (!post.video?.fileId) return post.video?.plan ? "waiting" : "needs_script";
  return post.status === "approved" ? "approved" : "received";
}

const DAY_MS = 86_400_000;
const at = (iso?: string) => {
  const t = Date.parse(iso ?? "");
  return Number.isFinite(t) ? t : 0;
};
/** A slot's time (Tashkent, UTC+5), or its day's start when the time is unreadable. */
const slotMs = (p: Pick<PostDraft, "slot">) => (p.slot ? at(`${p.slot.day.slice(0, 10)}T${/^\d{2}:\d{2}$/.test(p.slot.time) ? p.slot.time : "00:00"}:00+05:00`) : 0);

/**
 * The tab's list: the video posts of this week and what is coming (slots from a day ago on), the owner's ideas that
 * are not out yet, and what went out in the last 7 days. Slots by time, then ideas newest first; `max` at most.
 */
export function videoList<P extends Pick<PostDraft, "status" | "slot" | "video" | "createdAt">>(posts: readonly P[], now: number, max = 12): P[] {
  const keep = posts.filter((p) => {
    if (!isVideoPost(p)) return false;
    const when = p.slot ? slotMs(p) : at(p.createdAt);
    if (p.status === "published") return now - when <= 7 * DAY_MS;
    return isVideoIdea(p) || when >= now - DAY_MS;
  });
  const slots = keep.filter((p) => !isVideoIdea(p)).sort((a, b) => slotMs(a) - slotMs(b));
  const ideas = keep.filter((p) => isVideoIdea(p)).sort((a, b) => at(b.createdAt) - at(a.createdAt));
  return [...slots, ...ideas].slice(0, max);
}

/** Each scene's place in the video ("0–3", "3–7" seconds). */
export function sceneRanges(plan: Pick<VideoPlan, "scenes">): { from: number; to: number }[] {
  let t = 0;
  return plan.scenes.map((s) => {
    const from = t;
    t += Math.max(0, Math.round(Number(s.seconds) || 0));
    return { from, to: t };
  });
}

/**
 * The Videographer's lamp: lit while it writes a script, holding its result (the number of scripts) once there are
 * any, dark before. Light means work: nothing lights for show.
 */
export function videoLamp(posts: readonly Pick<PostDraft, "video">[], writing: boolean): { state: LampState; scripts: number } {
  const scripts = posts.filter((p) => p.video?.plan).length;
  return { state: writing ? "warming" : scripts ? "on" : "off", scripts };
}

/** The bot's link that waits for this post's video. */
export const videoLink = (bot: string, postId: string) => `https://t.me/${bot.replace(/^@/, "")}?start=${encodeURIComponent(`video_${postId}`)}`;
