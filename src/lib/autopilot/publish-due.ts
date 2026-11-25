/**
 * The tick's first job: send approved posts that are due (their slot, ±15 minutes), each at most once.
 *
 * For every claimed queue row (repo.ts claimDue: one row, one statement, so two ticks never share it):
 * - the brand changed hands or channel, or the post is gone: dropped, nobody is told (it is no longer theirs);
 * - already published (a manual tap got there first): "sent", nothing is sent again;
 * - late: more than 3 hours after its slot, or late and at night (outside 07:00–22:00 Tashkent): "expired", the owner
 *   decides (time.ts dueState);
 * - the text or picture changed since the approval (hash): nothing is sent, the owner is asked to approve again. One
 *   exception: approved with no picture and a picture drawn since: the approved text goes out alone. A video post's
 *   hash covers its video (Telegram file id): another video sent to the bot since the approval stops the send too;
 * - a blank is still in the text: nothing is sent, the owner is told which one;
 * - going out on another day than its slot, and the text names a date that is over by then or says "today"/"tomorrow":
 *   nothing is sent ("past_date"), the owner is told;
 * - otherwise publishOnce (publish-once.ts: owner and channel checks, the bot's and the owner's rights, at most once)
 *   with the owner as the publisher, and the owner gets "post is out" with the link;
 * - the bot or the owner lacks the rights: "blocked", told once, retried every 30 minutes while it is not too late;
 * - Telegram refused it (publishPost `sent: false`: nothing reached the channel): retried on the next ticks, 5 tries,
 *   then "failed" (owner and team told);
 * - any other failure (a network error or timeout while sending, publish threw): the post may be in the channel, so it
 *   is "unknown" and never resent on its own (owner and team told).
 * Before the loop: a send cut off mid-way (sending > 5 min) becomes "unknown" unless the post did go out (then "sent",
 * with "post is out"); a post more than 3 hours late becomes "expired". Each state change reaches the owner once.
 *
 * Pure of I/O: everything goes through `deps`, so the rules are unit-tested (tests/autopilot-publish-due.test.ts).
 */
import type { PostDraft, Script } from "../uslub/contract";
import { shownHash, shownPhoto, shownText, shownVideo } from "../uslub/botpublish-core";
import { findPlaceholders } from "../uslub/placeholders";
import { pastDatesInPost } from "../uslub/postguard";
import { publishErrorCode } from "../uslub/publish-errors";
import type { QueueRow, QueueStatus } from "./repo";
import { DUE_EARLY_MS, dueState, LATE_LIMIT_MS, relativeDayWords, tashkentDate } from "./time";

/** Owner messages the queue sends (copy.ts keys of the same names). */
export type OwnerEvent =
  | { kind: "post_out"; url: string }
  | { kind: "bot_not_admin" }
  | { kind: "owner_not_admin" }
  | { kind: "changed" }
  | { kind: "blank"; tokens: string[] }
  | { kind: "past_date"; dates: string[] }
  | { kind: "failed" }
  | { kind: "expired" }
  | { kind: "unknown" };

export type PublishAttempt = {
  ok: boolean;
  status: number;
  url?: string;
  error?: string;
  addAdminUrl?: string;
  already?: boolean;
  inProgress?: boolean;
  /** false: nothing reached the channel (publish.ts PublishResult). Missing on a failure: it may have. */
  sent?: false;
};

export interface PublishDueDeps {
  now(): number;
  markStaleSending(olderThan: number): Promise<QueueRow[]>;
  expireOverdue(before: number): Promise<QueueRow[]>;
  claimDue(until: number, since: number): Promise<QueueRow | null>;
  finish(row: QueueRow, status: QueueStatus, error?: string | null): Promise<void>;
  loadPost(id: string): Promise<PostDraft | null>;
  loadBrand(id: string): Promise<{ ownerTelegramId: number | null; channel?: string | null } | null>;
  publish(args: {
    postId: string;
    script: Script;
    chat: string;
    userId: number;
    expectedText: string;
    expectedImageUrl: string | null;
    /** The owner's video approved with the post (null = none): a video post goes out only with exactly it. */
    expectedVideoFileId: string | null;
    textOnly?: boolean;
  }): Promise<PublishAttempt>;
  notifyOwner(row: QueueRow, event: OwnerEvent): Promise<void>;
  alertTeam(row: QueueRow, reason: string): Promise<void>;
}

export interface RunControl {
  signal?: AbortSignal;
  timeLeft(): number;
}

/** A send that has been "sending" this long was cut off (the bot's webhook and the tick both end within 5 minutes). */
export const STALE_SENDING_MS = 5 * 60_000;
export const MAX_ATTEMPTS = 5;
/** Time one send may take (rights checks, a photo upload fallback, the owner's message). */
const SEND_RESERVE_MS = 15_000;

const norm = (c?: string | null) => (c ?? "").trim().replace(/^@/, "").toLowerCase();

export type PublishDueCounts = {
  published: number;
  already: number;
  blocked: number;
  failed: number;
  retried: number;
  dropped: number;
  expired: number;
  unknown: number;
};

export async function runPublishDue(deps: PublishDueDeps, ctl: RunControl): Promise<PublishDueCounts> {
  const counts: PublishDueCounts = { published: 0, already: 0, blocked: 0, failed: 0, retried: 0, dropped: 0, expired: 0, unknown: 0 };
  const now = deps.now();

  for (const row of await deps.markStaleSending(now - STALE_SENDING_MS)) {
    // The function died mid-send. If the post did go out (it is marked published), "post is out" is all there is to say.
    const post = await deps.loadPost(row.postId).catch(() => null);
    if (post?.status === "published") {
      await deps.finish(row, "sent");
      counts.already++;
      if (post.publishedUrl) await deps.notifyOwner(row, { kind: "post_out", url: post.publishedUrl });
      continue;
    }
    counts.unknown++;
    await deps.notifyOwner(row, { kind: "unknown" });
    await deps.alertTeam(row, "unknown");
  }
  for (const row of await deps.expireOverdue(now - LATE_LIMIT_MS)) {
    counts.expired++;
    await deps.notifyOwner(row, { kind: "expired" });
  }

  while (!ctl.signal?.aborted && ctl.timeLeft() > SEND_RESERVE_MS) {
    const t = deps.now();
    const row = await deps.claimDue(t + DUE_EARLY_MS, t - LATE_LIMIT_MS);
    if (!row) break;
    const outcome = await sendOne(deps, row);
    counts[outcome]++;
  }
  return counts;
}

type Outcome = keyof PublishDueCounts;

/** Stopped before anything reached the channel; the owner is told why. */
async function stop(deps: PublishDueDeps, row: QueueRow, reason: "changed" | "blank" | "past_date", event: OwnerEvent): Promise<Outcome> {
  await deps.finish(row, "failed", reason);
  await deps.notifyOwner(row, event);
  return "failed";
}

async function sendOne(deps: PublishDueDeps, row: QueueRow): Promise<Outcome> {
  const [post, brand] = await Promise.all([deps.loadPost(row.postId), deps.loadBrand(row.brandId)]);
  if (!post || !brand || brand.ownerTelegramId !== row.ownerTelegramId || norm(brand.channel) !== norm(row.chat)) {
    await deps.finish(row, "failed", "owner_changed");
    return "dropped";
  }
  if (post.status === "published") {
    await deps.finish(row, "sent");
    return "already";
  }
  const now = deps.now();
  if (dueState(row.dueAt, now) === "expired") {
    await deps.finish(row, "expired", "expired");
    await deps.notifyOwner(row, { kind: "expired" });
    return "expired";
  }
  const text = shownText(post, row.script);
  // Approved before any picture existed, and one was drawn since (the Studio draws pictures for approved posts that
  // have none): the owner approved the text alone, so the text alone goes out.
  let textOnly = false;
  if (shownHash(post, row.script) !== row.textHash) {
    textOnly = shownPhoto(post) != null && shownHash({ ...post, image: undefined }, row.script) === row.textHash;
    if (!textOnly) return stop(deps, row, "changed", { kind: "changed" });
  }
  const blanks = findPlaceholders(text);
  if (blanks.length) return stop(deps, row, "blank", { kind: "blank", tokens: blanks });
  if (tashkentDate(now) !== tashkentDate(row.dueAt)) {
    // Written for its slot's day and going out on another: a date over by now, or "today"/"tomorrow", reads wrong.
    const variants = { [row.script]: text, uz_latn: post.variants.uz_latn };
    const dates = [...pastDatesInPost(variants, tashkentDate(now)), ...relativeDayWords(text, row.dueAt, now)];
    if (dates.length) return stop(deps, row, "past_date", { kind: "past_date", dates });
  }

  let res: PublishAttempt;
  try {
    res = await deps.publish({
      postId: post.id,
      script: row.script,
      chat: `@${norm(row.chat)}`,
      userId: row.ownerTelegramId,
      expectedText: text,
      expectedImageUrl: textOnly ? null : shownPhoto(post),
      expectedVideoFileId: shownVideo(post),
      ...(textOnly ? { textOnly } : {}),
    });
  } catch {
    // Thrown from somewhere we cannot place: the post may be in the channel.
    res = { ok: false, status: 502, error: "publish threw" };
  }

  if (res.ok) {
    await deps.finish(row, "sent");
    if (res.already) return "already"; // the tap that sent it told the owner
    if (res.url) await deps.notifyOwner(row, { kind: "post_out", url: res.url });
    return "published";
  }
  if (res.inProgress) {
    // A manual tap is sending it right now: look again on the next tick.
    await deps.finish(row, "queued");
    return "retried";
  }
  if (res.status === 409) return stop(deps, row, "changed", { kind: "changed" });
  const code = publishErrorCode(res.status, res.error, res.addAdminUrl);
  if (code === "bot_not_admin" || code === "channel_admin_required") {
    const reason = code === "bot_not_admin" ? "bot_not_admin" : "owner_not_admin";
    await deps.finish(row, "blocked", reason);
    if (row.prev !== "blocked") await deps.notifyOwner(row, { kind: reason });
    return "blocked";
  }
  if (code === "brand_forbidden" || code === "brand_unowned" || code === "channel_mismatch" || code === "post_not_found" || code === "auth_required") {
    await deps.finish(row, "failed", "owner_changed");
    return "dropped";
  }
  if (res.sent !== false) {
    // Cut off while sending (network error, timeout): it may be in the channel. Never sent twice on our own.
    await deps.finish(row, "unknown", "unknown");
    await deps.notifyOwner(row, { kind: "unknown" });
    await deps.alertTeam(row, `unknown: ${res.status} ${res.error ?? ""}`.trim());
    return "unknown";
  }
  if (row.attempts < MAX_ATTEMPTS) {
    await deps.finish(row, "queued", "retry");
    return "retried";
  }
  await deps.finish(row, "failed", "failed");
  await deps.notifyOwner(row, { kind: "failed" });
  await deps.alertTeam(row, `${res.status} ${res.error ?? ""}`.trim());
  return "failed";
}
