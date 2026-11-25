/**
 * «Haftani tasdiqlash» and the queue, as the screen sees them (pure; the Studio and the Mini App share it).
 *
 * The posts that can go out at their slot come from the autopilot's own selector (selectWeekBatch), so the count on
 * the button is the count the server approves; the hash the server checks is taken of exactly that batch
 * (week-hash.ts weekHashForClient). Each post's place in the queue comes from GET /api/uslub/autopilot (`schedule`).
 *
 * Relative imports for values: vitest does not resolve the "@/" alias.
 */
import type { PostDraft, PostSchedule, Script } from "@/lib/uslub/contract";
import { selectWeekBatch, type WeekBatch, type WeekPost, type WeekReady, type WeekSkip } from "../../lib/autopilot/week";
import { latestBatch } from "./batch";

export type Schedule = Record<string, PostSchedule>;

/** The queue holds the post: its text and picture are what goes out, so nothing redraws it. */
const HELD: ReadonlySet<PostSchedule["status"]> = new Set(["queued", "sending", "blocked"]);
/** Waiting for its time or going out now: «Haftani tasdiqlash» has nothing left to do for it. */
const IN_QUEUE: ReadonlySet<PostSchedule["status"]> = new Set(["queued", "sending", "sent"]);

export const isHeld = (s?: PostSchedule | null) => !!s && HELD.has(s.status);

/** The post as the autopilot's selector reads it. */
export function weekPost(p: PostDraft): WeekPost {
  return {
    id: p.id,
    status: p.status,
    createdAt: p.createdAt,
    variants: p.variants,
    ...(p.slot ? { slot: { day: p.slot.day, time: p.slot.time, ...(p.slot.format ? { format: p.slot.format } : {}) } } : {}),
    ...(p.image ? { image: { status: p.image.status, url: p.image.url } } : {}),
    ...(p.video ? { video: { ...(p.video.fileId ? { fileId: p.video.fileId } : {}) } } : {}),
    ...(p.publishedUrl ? { publishedUrl: p.publishedUrl } : {}),
  };
}

export interface WeekPlan {
  /** What the server will compute for the same posts: the hash is taken of this. */
  batch: WeekBatch;
  /** Ready and not in the queue yet: the number on the button. */
  toQueue: WeekReady[];
  /** Left out, with the reason; already published posts are not news. */
  skipped: WeekSkip[];
}

export function weekPlan(input: {
  posts: readonly PostDraft[];
  schedule: Schedule;
  channel?: string | null;
  languages?: readonly Script[];
  now: number;
  postIds?: readonly string[];
}): WeekPlan {
  const batch = selectWeekBatch({
    posts: input.posts.map(weekPost),
    channel: input.channel,
    languages: input.languages,
    postIds: input.postIds,
    now: input.now,
  });
  const queued = (id: string) => {
    const s = input.schedule[id];
    if (!s || !IN_QUEUE.has(s.status)) return false;
    // A queued post the owner changed since (a draft again) is not in the queue any more.
    return input.posts.find((p) => p.id === id)?.status !== "draft";
  };
  return {
    batch,
    toQueue: batch.ready.filter((r) => !queued(r.postId)),
    skipped: batch.skipped.filter((s) => s.reason !== "published"),
  };
}

/**
 * Where a post stands in the queue, for the line under it:
 * - queued: goes out at dueAt by itself; sending: going out now; out: in the channel (link);
 * - stopped: the bot could not send it (blocked: not an admin; failed; expired), with the server's reason;
 * - unknown: the send was cut off; never resent by itself, the owner checks the channel;
 * - changed: approved and queued, then changed (a rewrite made it a draft again): approve it again.
 */
export type PostPhase =
  | { kind: "none" }
  | { kind: "queued"; dueAt: string }
  | { kind: "sending" }
  | { kind: "out"; url?: string }
  | { kind: "stopped"; status: "blocked" | "failed" | "expired"; why?: string }
  | { kind: "unknown"; why?: string }
  | { kind: "changed"; dueAt: string };

export function postPhase(post: Pick<PostDraft, "status" | "publishedUrl">, s?: PostSchedule | null): PostPhase {
  if (post.status === "published") return { kind: "out", ...(post.publishedUrl ? { url: post.publishedUrl } : {}) };
  if (!s) return { kind: "none" };
  if (s.status === "sent") return { kind: "out", ...(post.publishedUrl ? { url: post.publishedUrl } : {}) };
  if (s.status === "sending") return { kind: "sending" };
  // The queue sends only approved posts: a draft with a queue entry was changed after its approval.
  if (post.status === "draft" && (s.status === "queued" || s.status === "blocked" || s.status === "failed")) return { kind: "changed", dueAt: s.dueAt };
  if (s.status === "queued") return { kind: "queued", dueAt: s.dueAt };
  if (s.status === "unknown") return { kind: "unknown", ...(s.error ? { why: s.error } : {}) };
  return { kind: "stopped", status: s.status, ...(s.error ? { why: s.error } : {}) };
}

/**
 * Which posts the run draws a picture for: drafts without one (or whose attempt failed and left nothing), and
 * approved posts that never got one. Never a published post, never a redraw of an approved post's picture, and
 * never a post the queue holds (queued, sending, blocked): the queue sends the approved version, so a picture drawn
 * now would cost money and show the owner something that will not go out (or stop the post at its slot).
 */
export function needsPicture(p: Pick<PostDraft, "status" | "image">, s?: PostSchedule | null): boolean {
  if (isHeld(s)) return false;
  return (p.status === "draft" && (!p.image || (p.image.status === "failed" && !p.image.url))) || (p.status === "approved" && !p.image);
}

/**
 * The run is still drawing this week's pictures (`drawing`: its pictures step is waiting or running) and a post that
 * «Haftani tasdiqlash» would queue has none yet: approving now would queue it as text only, while the run goes on to
 * draw a picture the queue never sends. The button waits until the pictures are done.
 */
export function waitsForPictures(
  plan: Pick<WeekPlan, "toQueue">,
  posts: readonly Pick<PostDraft, "id" | "status" | "image" | "createdAt">[],
  schedule: Schedule,
  drawing: boolean,
): boolean {
  if (!drawing || !plan.toQueue.length) return false;
  const latest = latestBatch(posts);
  const byId = new Map(posts.map((p) => [p.id, p]));
  return plan.toQueue.some((r) => {
    const p = byId.get(r.postId);
    return !!p && latest.has(p.id) && needsPicture(p, schedule[p.id]);
  });
}

/** Queue entries an approval of a changed post must replace: the queue still acts on them, or «Qayta tasdiqlash» does. */
const REQUEUE: ReadonlySet<PostSchedule["status"]> = new Set(["queued", "blocked", "failed", "expired"]);

/**
 * A draft that still has a queue entry (approved and queued, then rewritten): approving it must put this version back
 * in the queue (approve-week with its id). A plain approval would leave the old entry, which stops at the slot on the
 * changed text while the screen says the post goes out.
 */
export function requeueOnApprove(post: Pick<PostDraft, "status">, s?: PostSchedule | null): boolean {
  return post.status === "draft" && !!s && REQUEUE.has(s.status);
}

/**
 * The queue holds this post, or its send was cut off (it may be in the channel already): it is never published by
 * hand, from a button, Enter or the command palette.
 */
export function noHandPublish(post: Pick<PostDraft, "status" | "publishedUrl">, s?: PostSchedule | null): boolean {
  const k = postPhase(post, s).kind;
  return k === "queued" || k === "sending" || k === "unknown" || k === "out";
}

/**
 * The SMM-menejer's measured result: posts the queue put out (counted, not called "on time": a blocked post is
 * retried and may go out hours late), and the next one waiting.
 */
export function publisherOutcome(schedule: Schedule): { out: number; next?: string } {
  const all = Object.values(schedule);
  const out = all.filter((s) => s.status === "sent").length;
  const next = all
    .filter((s) => s.status === "queued")
    .map((s) => s.dueAt)
    .sort()[0];
  return next ? { out, next } : { out };
}

/** The Telegram continuation for a web owner the server does not know yet: the bot shows the week. */
export function weekContinueUrl(bot: string, brandId: string): string {
  return `https://t.me/${bot.replace(/^@/, "")}?start=week_${brandId.toLowerCase()}`;
}

/** A queue time as the owner reads it: Tashkent's weekday (0 = Sunday), "HH:MM" and date, whatever the browser's zone. */
export function tashkentWhen(iso: string): { weekday: number; time: string; date: string } | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms + 5 * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { weekday: d.getUTCDay(), time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`, date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` };
}
