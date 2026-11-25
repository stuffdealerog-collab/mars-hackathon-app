/**
 * "Next week's posts are ready" waits for the posts' pictures (pure, I/O injected; wired in tasks.ts).
 *
 * The Monday run (tasks.ts generateWeek) writes the week's posts and starts their pictures on the server, then
 * leaves a waiting week message (repo.ts queueWeekMessage) instead of sending [Approve all] at once. This step, on
 * every tick, sends it as soon as no picture of the week is still being made, or after 15 minutes whatever the
 * pictures do. So the owner approves each post together with its picture: a picture drawn after the approval would
 * change what was approved, and the queue would stop the post at its slot (publish-due.ts).
 */

/** Longest wait for the pictures: a picture job times out after 5 minutes, the stuck-job sweep ends it after that. */
export const WEEK_MSG_WAIT_MS = 15 * 60_000;

export type WeekMessageSend = "sent" | "blocked" | "failed" | "gone";

export interface WeekReadyDeps {
  now(): number;
  waiting(): Promise<{ key: string; brandId: string; since: number }[]>;
  /** How many pictures of the brand's latest batch are still being made, after polling them (until `deadline`). */
  pendingPictures(brandId: string, deadline: number): Promise<number>;
  /** Takes the waiting message (false: another tick took it). */
  take(key: string): Promise<boolean>;
  /** Sends the week view; "gone" = nobody to send it to any more (brand or owner gone, autopilot paused). */
  send(brandId: string): Promise<WeekMessageSend>;
  settle(key: string, status: "done" | "waiting" | "skipped"): Promise<void>;
}

export interface RunControl {
  signal?: AbortSignal;
  timeLeft(): number;
}

export async function runWeekMessages(deps: WeekReadyDeps, ctl: RunControl): Promise<{ sent: number; waiting: number; failed: number; skipped: number }> {
  const counts = { sent: 0, waiting: 0, failed: 0, skipped: 0 };
  for (const m of await deps.waiting()) {
    if (ctl.signal?.aborted || ctl.timeLeft() < 3_000) break;
    if (deps.now() - m.since < WEEK_MSG_WAIT_MS) {
      const deadline = deps.now() + Math.min(8_000, ctl.timeLeft() - 2_000);
      // A check that fails counts as "still drawing": the 15-minute limit sends the message anyway.
      const pending = await deps.pendingPictures(m.brandId, deadline).catch(() => 1);
      if (pending > 0) {
        counts.waiting++;
        continue;
      }
    }
    if (!(await deps.take(m.key))) continue;
    const r = await deps.send(m.brandId).catch((): WeekMessageSend => "failed");
    // Telegram failed: back to waiting, tried again on the next tick (for up to 2 days, repo.ts waitingWeekMessages).
    await deps.settle(m.key, r === "failed" ? "waiting" : r === "gone" ? "skipped" : "done");
    if (r === "sent") counts.sent++;
    else if (r === "failed") counts.failed++;
    else counts.skipped++;
  }
  return counts;
}
