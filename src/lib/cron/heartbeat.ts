import "server-only";
import { getSql } from "@/lib/db";
import { defineCronTask } from "./registry";

/**
 * Proves the ticker is alive: one database round trip. Its time (dbMs) shows in the tick's summary and in
 * cron_locks.last_report.
 */
export const heartbeat = defineCronTask({
  name: "heartbeat",
  budgetMs: 5_000,
  async run() {
    const started = performance.now();
    await getSql()`SELECT 1`;
    return { dbMs: Math.round(performance.now() - started) };
  },
});
