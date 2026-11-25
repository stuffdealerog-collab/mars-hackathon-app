import { addDays } from "./days";
import type { ConnectorId, WeekNumber } from "./types";

/**
 * At most two owner-facing numbers per connection for the last 7 full days (pure). A number nobody measured is
 * null and the card prints "—", never 0. Followers and subscribers are a change over the week (+38), from Mercat's
 * own daily snapshots (Instagram) or YouTube's gained − lost.
 */

export interface DayMetrics {
  day: string;
  metrics: Record<string, unknown>;
}

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function sum(rows: DayMetrics[], key: string): number | null {
  let total: number | null = null;
  for (const r of rows) {
    const v = n(r.metrics[key]);
    if (v != null) total = (total ?? 0) + v;
  }
  return total;
}

const money = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);

function currencyOf(rows: DayMetrics[]): string | undefined {
  for (const r of rows) if (typeof r.metrics.currency === "string") return r.metrics.currency;
  return undefined;
}

/** The change between the first and the last snapshot of `key` within the rows (needs two different days). */
function snapshotDelta(rows: DayMetrics[], key: string): number | null {
  const snaps = rows.filter((r) => n(r.metrics[key]) != null).sort((a, b) => a.day.localeCompare(b.day));
  if (snaps.length < 2) return null;
  return (n(snaps[snaps.length - 1].metrics[key]) as number) - (n(snaps[0].metrics[key]) as number);
}

export function weekSummary(provider: ConnectorId, rows: DayMetrics[], today: string): WeekNumber[] {
  const since = addDays(today, -7);
  const until = addDays(today, -1);
  const week = rows.filter((r) => r.day >= since && r.day <= until);
  switch (provider) {
    case "instagram":
      return [
        { metric: "views", value: sum(week, "views") },
        // Snapshots are stored under the day they were taken, so today's one closes the week.
        { metric: "followers", value: snapshotDelta(rows.filter((r) => r.day >= since && r.day <= today), "followers"), delta: true },
      ];
    case "youtube": {
      const gained = sum(week, "subs_gained");
      const lost = sum(week, "subs_lost");
      return [
        { metric: "views", value: sum(week, "views") },
        { metric: "subscribers", value: gained == null && lost == null ? null : (gained ?? 0) - (lost ?? 0), delta: true },
      ];
    }
    case "meta_ads": {
      const currency = currencyOf(week);
      const messages = sum(week, "messages_started");
      return [
        { metric: "spend", value: money(sum(week, "spend")), ...(currency ? { currency } : {}) },
        messages ? { metric: "messages", value: messages } : { metric: "clicks", value: sum(week, "link_clicks") },
      ];
    }
    case "google_ads": {
      const currency = currencyOf(week);
      return [
        { metric: "cost", value: money(sum(week, "cost")), ...(currency ? { currency } : {}) },
        { metric: "clicks", value: sum(week, "clicks") },
      ];
    }
  }
}
