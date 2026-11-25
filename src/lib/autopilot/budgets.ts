/**
 * Time budgets of the autopilot's tick tasks, in ms (pure, so the cron test can check that every registered task
 * fits in the tick's 250 s next to the heartbeat and the media sweep). publish-due goes first in the tick.
 */
export const AUTOPILOT_BUDGETS = {
  "publish-due": 40_000,
  "channel-snapshots": 15_000,
  "post-metrics": 25_000,
  /** Report on last week + one brand's plan (≤45 s) and posts (≤60 s). */
  weekly: 130_000,
} as const;
