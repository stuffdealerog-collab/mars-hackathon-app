import "server-only";
import { defineCronTask } from "../cron/registry";
import { anyEnabled } from "./config";
import { dueConnections, pruneConnectorData } from "./repo";
import { connectorConfig, runSync } from "./service";
import { CONNECTORS_SYNC_BUDGET_MS, runDueSync } from "./sync";
import { CONNECTOR_IDS } from "./types";

/**
 * Daily numbers for every connection, a little at a time: the tick runs every ~10 minutes, and each run syncs the
 * one or two connections whose numbers are older than 20 hours, of providers that are on. A run is light (at most
 * 7 days, Instagram without its per-post and per-story insights: one or two provider round trips), and a row
 * whose last attempt failed waits 2 hours and queues behind the rest, so stuck rows never hold the queue (repo.ts).
 * Its 5 s budget was taken from post-metrics (20 s → 15 s), so all tick budgets still sum to 250 s. At ~144 ticks a
 * day that covers a few hundred connections; the first 28-day backfill runs after the connect callback instead,
 * and the owner's "Yangilash" button and the card's lazy refresh read everything.
 *
 * Each run first deletes what Mercat may no longer keep (ended connections, data not refreshed for 30 days:
 * repo.pruneConnectorData; database only, no provider call). It runs while the token key is set, even with every
 * provider switched off, so a kill switch never keeps old data. Nothing runs (no database call) while connectors
 * were never set up.
 */
export const connectorsSync = defineCronTask({
  name: "connectors-sync",
  budgetMs: CONNECTORS_SYNC_BUDGET_MS,
  async run(ctx): Promise<Record<string, number>> {
    const cfg = connectorConfig();
    if (!cfg.keys.length) return { configured: 0 };
    const pruned = await pruneConnectorData().catch((err: unknown) => {
      console.warn("[connectors] prune failed:", err instanceof Error ? err.name : "error");
      return { expired: 0, items: 0, days: 0 };
    });
    const counts = { pruned_connections: pruned.expired, pruned_items: pruned.items, pruned_days: pruned.days };
    if (!anyEnabled(cfg)) return { configured: 0, ...counts };
    const providers = CONNECTOR_IDS.filter((id) => cfg.providers[id].enabled);
    const synced = await runDueSync(
      () => dueConnections(2, 20, providers),
      (id, deadline) => runSync(cfg, id, deadline, { maxDays: 7, light: true }),
      ctx,
    );
    return { ...synced, ...counts };
  },
});
