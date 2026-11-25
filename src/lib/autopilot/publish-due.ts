/**
 * The tick's first job: send approved posts that are due (their slot, ±15 minutes), each at most once.
 *
 * For every claimed queue row (repo.ts claimDue: one row, one statement, so two ticks never share it):
 * - the brand changed hands or channel, or the post is gone: dropped, nobody is told (it is no longer theirs);
 * - already published (a manual tap got there first): "sent", nothing is sent again;
 * - the text or picture changed since the approval (hash): nothing is sent, the owner is asked to approve again;
 * - a blank is still in the text: nothing is sent, the owner is told which one;
 * - otherwise publishOnce (publish-once.ts: owner and channel checks, the bot's and the owner's rights, at most once)
 *   with the owner as the publisher, and the owner gets "post is out" with the link;
 * - the bot or the owner lacks the rights: "blocked", told once, retried every 30 minutes until a day late;
 * - Telegram failed: retried on the next ticks, 5 tries, then "failed" (owner and team told).
 * Before the loop: a send cut off mid-way (sending > 5 min) becomes "unknown" and is never resent on its own; a post
 * more than a day late becomes "expired". Each state change reaches the owner once.
 *
 * Pure of I/O: everything goes through `deps`, so the rules are unit-tested (tests/autopilot-publish-due.test.ts).
 */
import type { PostDraft, Script } from "../uslub/contract";
import { shownHash, shownPhoto, shownText } from "../uslub/botpublish-core";
import { findPlaceholders } from "../uslub/placeholders";
import { publishErrorCode } from "../uslub/publish-errors";
import type { QueueRow, QueueStatus } from "./repo";
import { DUE_EARLY_MS, LATE_LIMIT_MS } from "./time";

/** Owner messages the queue sends (copy.ts keys of the same names). */
export type OwnerEvent =
  | { kind: "post_out"; url: string }
  | { kind: "bot_not_admin" }
  | { kind: "owner_not_admin" }
  | { kind: "changed" }
  | { kind: "blank"; tokens: string[] }
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
};

export interface PublishDueDeps {
  now(): number;
  markStaleSending(olderThan: number): Promise<QueueRow[]>;
  expireOverdue(before: number): Promise<QueueRow[]>;
  claimDue(until: number, since: number): Promise<QueueRow | null>;
  finish(row: QueueRow, status: QueueStatus, error?: string | null): Promise<void>;
  loadPost(id: string): Promise<PostDraft | null>;
  loadBrand(id: string): Promise<{ ownerTelegramId: number | null; channel?: string | null } | null>;
  publish(args: { postId: string; script: Script; chat: string; userId: number; expectedText: string; expectedImageUrl: string | null }): Promise<PublishAttempt>;
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
    counts.unknown++;
    await deps.notifyOwner(row, { kind: "unknown" });
    await deps.alertTeam(row, "unknown");
  }
  for (const row of await deps.expireOverdue(now - LATE_LIMIT_MS)) {
    counts.expired++;
    // A blocked post was already explained to the owner; a queued one was late because of us.
    if (row.prev !== "blocked") await deps.notifyOwner(row, { kind: "expired" });
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

type Outcome = Exclude<keyof PublishDueCounts, "expired" | "unknown">;

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
  const text = shownText(post, row.script);
  if (shownHash(post, row.script) !== row.textHash) {
    await deps.finish(row, "failed", "changed");
    await deps.notifyOwner(row, { kind: "changed" });
    return "failed";
  }
  const blanks = findPlaceholders(text);
  if (blanks.length) {
    await deps.finish(row, "failed", "blank");
    await deps.notifyOwner(row, { kind: "blank", tokens: blanks });
    return "failed";
  }

  let res: PublishAttempt;
  try {
    res = await deps.publish({
      postId: post.id,
      script: row.script,
      chat: `@${norm(row.chat)}`,
      userId: row.ownerTelegramId,
      expectedText: text,
      expectedImageUrl: shownPhoto(post),
    });
  } catch {
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
  if (res.status === 409) {
    await deps.finish(row, "failed", "changed");
    await deps.notifyOwner(row, { kind: "changed" });
    return "failed";
  }
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
  if (row.attempts < MAX_ATTEMPTS) {
    await deps.finish(row, "queued", "retry");
    return "retried";
  }
  await deps.finish(row, "failed", "failed");
  await deps.notifyOwner(row, { kind: "failed" });
  await deps.alertTeam(row, `${res.status} ${res.error ?? ""}`.trim());
  return "failed";
}
