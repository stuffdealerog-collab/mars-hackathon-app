/**
 * Time budgets of the autopilot's tick tasks, in ms (pure, so the cron test can check that every registered task
 * fits in the tick's 250 s next to the heartbeat and the media sweep). publish-due goes first in the tick.
 */
export const AUTOPILOT_BUDGETS = {
  "publish-due": 40_000,
  /** Sends the "posts are ready" week message once the week's pictures are done (weekly.ts starts them). */
  "week-messages": 15_000,
  "channel-snapshots": 15_000,
  /** 15 s (was 20 s): 5 s went to the connectors sync (src/lib/connectors/task.ts); one channel read needs 8 s. */
  "post-metrics": 15_000,
  /** Report on last week + one brand's plan (≤45 s) and posts (≤60 s). */
  weekly: 130_000,
} as const;

/**
 * The autopilot's spend cap per brand per rolling 30 days, in USD (§12a): AUTOPILOT_BRAND_MONTHLY_USD, default 4.
 * Read from process.env like CLAUDE_DAILY_LIMIT, so the owner changes it without code. The autopilot prepares a
 * brand's week only while the last 30 days' spend plus one more week stays within it (src/lib/autopilot/weekly.ts).
 */
export function brandMonthlyCapUsd(env: Record<string, string | undefined> = process.env): number {
  const raw = env.AUTOPILOT_BRAND_MONTHLY_USD;
  const n = Number(raw);
  return raw != null && raw.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : 4;
}
