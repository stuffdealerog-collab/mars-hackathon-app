/**
 * «Approve the week» (pure, client-safe): which posts of a batch can be queued for their slot, and why the others
 * cannot. The server (POST /api/uslub/posts/approve-week, the bot's week view) and the UI (to show the count on the
 * button before anyone taps) use this one selector, so they never disagree.
 *
 * A post goes in only when it can go out exactly as the owner sees it at its slot:
 * - not published yet, and the brand has a channel;
 * - no blank left in the variant that will go out ([narx], XXX…);
 * - its slot is ahead (or earlier today, then it goes out in 10 minutes), and the text names no date that will be
 *   over by then;
 * - its picture is not still being made (the picture could change after the approval), unless it goes out as the
 *   owner's video (the picture is not sent then);
 * - a video slot has the owner's video (sent to the bot: post.video.fileId); a video idea without a slot has no time
 *   to go out (no_slot) and is never part of the latest batch.
 */
import type { PostImage, Script } from "../uslub/contract";
import type { WeekSkipReason } from "./types";
import { findPlaceholders } from "../uslub/placeholders";
import { pastDatesInPost } from "../uslub/postguard";
import { planDue, tashkentDate } from "./time";

export interface WeekPost {
  id: string;
  status: "draft" | "approved" | "published";
  createdAt: string;
  variants: Record<Script, string>;
  slot?: { day: string; time: string; format?: string };
  image?: Pick<PostImage, "status" | "url">;
  /** The owner's video for a video slot (PostVideo): its Telegram file id once the owner sent it to the bot. */
  video?: { fileId?: string };
  publishedUrl?: string;
}

export interface WeekBatchInput {
  posts: readonly WeekPost[];
  /** The brand's channel; null or empty = nowhere to post. */
  channel?: string | null;
  /** The brand's languages (dna.languages): the first one the post has is the one that goes out. */
  languages?: readonly Script[];
  /** Exactly these posts; missing = the latest batch (the newest post and up to 15 minutes before it, 7 at most). */
  postIds?: readonly string[];
  now: number;
}

export interface WeekReady {
  postId: string;
  script: Script;
  dueAt: string; // ISO
  /** Its slot passed earlier today: it goes out shortly instead. */
  late: boolean;
}

export interface WeekSkip {
  postId: string;
  reason: WeekSkipReason;
  tokens?: string[];
  dates?: string[];
}

export interface WeekBatch {
  ready: WeekReady[];
  skipped: WeekSkip[];
}

export const WEEK_BATCH_MAX = 7;
const BATCH_WINDOW_MS = 15 * 60_000;
const ORDER: Script[] = ["uz_latn", "ru", "uz_cyrl", "en"];

/** The variant that goes out (the same rule as the bot's publisher, botpublish-core pickScript). */
export function weekPickScript(variants: Partial<Record<Script, string>>, languages: readonly Script[] = []): Script {
  const order = [...languages, ...ORDER].filter((s) => ORDER.includes(s));
  return order.find((s) => (variants[s] ?? "").trim().length > 0) ?? "uz_latn";
}

const createdMs = (p: { createdAt: string }) => {
  const t = Date.parse(p.createdAt);
  return Number.isFinite(t) ? t : 0;
};

/** A video idea from the Video tab (a script, no plan slot): written on its own, never part of a run's batch. */
const isIdea = (p: { slot?: unknown; video?: unknown }) => !p.slot && !!p.video;

/**
 * The posts of the latest run: the newest post and the ones written up to 15 minutes before it, 7 at most. Video ideas
 * are left out: a new idea written today must not hide the week's posts.
 */
export function latestWeekBatch<P extends { createdAt: string; slot?: unknown; video?: unknown }>(posts: readonly P[]): P[] {
  const newest = posts.filter((p) => !isIdea(p)).sort((a, b) => createdMs(b) - createdMs(a));
  if (!newest.length) return [];
  const from = createdMs(newest[0]) - BATCH_WINDOW_MS;
  return newest.filter((p) => createdMs(p) >= from).slice(0, WEEK_BATCH_MAX);
}

/** Why this post cannot be queued now, or null when it can (with its time). */
function check(p: WeekPost, input: WeekBatchInput): WeekSkip | WeekReady {
  const skip = (reason: WeekSkipReason, extra: Partial<WeekSkip> = {}): WeekSkip => ({ postId: p.id, reason, ...extra });
  if (p.status === "published") return skip("published");
  if (!input.channel?.trim()) return skip("no_channel");
  if ((p.slot?.format === "video" || (!p.slot && p.video)) && !p.video?.fileId) return skip("video_missing");
  // A post with the owner's video goes out as that video: the run's picture is never sent, so it never holds it back.
  if (!p.video?.fileId && p.image && (p.image.status === "queued" || p.image.status === "running")) return skip("picture_rendering");
  const script = weekPickScript(p.variants, input.languages);
  const text = p.variants[script]?.trim() || p.variants.uz_latn || "";
  const tokens = findPlaceholders(text);
  if (tokens.length) return skip("blank", { tokens });
  const due = planDue(p.slot, input.now);
  if (!due.ok) return skip(due.reason);
  // A date in the text must still be ahead on the day the post really goes out.
  const day = [p.slot?.day.slice(0, 10) ?? "", tashkentDate(due.dueAt)].sort().at(-1) as string;
  const dates = pastDatesInPost({ [script]: text, uz_latn: p.variants.uz_latn }, day);
  if (dates.length) return skip("past_date", { dates });
  return { postId: p.id, script, dueAt: new Date(due.dueAt).toISOString(), late: due.late };
}

export function selectWeekBatch(input: WeekBatchInput): WeekBatch {
  const byId = new Map(input.posts.map((p) => [p.id, p]));
  const picked = input.postIds
    ? [...new Set(input.postIds)].map((id) => byId.get(id)).filter((p): p is WeekPost => Boolean(p))
    : latestWeekBatch(input.posts);
  const ready: WeekReady[] = [];
  const skipped: WeekSkip[] = [];
  for (const p of picked) {
    const r = check(p, input);
    if ("reason" in r) skipped.push(r);
    else ready.push(r);
  }
  ready.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return { ready, skipped };
}
