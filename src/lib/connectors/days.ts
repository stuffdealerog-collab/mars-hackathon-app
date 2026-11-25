import { TASHKENT_OFFSET_MS } from "../cron/clock";

/** Calendar days (YYYY-MM-DD) on the Tashkent clock, the unit of connection_metrics_daily. Pure. */

const DAY_MS = 86_400_000;

export const tashkentDay = (at: Date) => new Date(at.getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Every day from `since` to `until`, both included (empty when since > until). */
export function daysBetween(since: string, until: string): string[] {
  const out: string[] = [];
  for (let d = since; d <= until && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Unix seconds of a Tashkent day's midnight (Instagram's since/until). */
export const tashkentMidnightUnix = (day: string) => Math.floor((Date.parse(`${day}T00:00:00Z`) - TASHKENT_OFFSET_MS) / 1000);

export interface SyncWindow {
  since: string;
  until: string;
}

/**
 * The days a sync reads. A first sync (backfill) reads 28 days. A daily sync re-reads the last `settle` days,
 * because ad attribution and YouTube Analytics keep changing for a few days, and anything missed since the last
 * sync (capped at 28). Ends yesterday: today is not over.
 */
export function syncWindow(today: string, lastSyncDay: string | null, settle: number, backfillDays = 28): SyncWindow {
  const until = addDays(today, -1);
  const oldest = addDays(today, -backfillDays);
  let since = lastSyncDay ? addDays(lastSyncDay, -settle) : oldest;
  if (since < oldest) since = oldest;
  if (since > until) since = until;
  return { since, until };
}
