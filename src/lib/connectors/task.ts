import "server-only";
import { defineCronTask } from "../cron/registry";
import { anyEnabled } from "./config";
import { dueConnections } from "./repo";
import { connectorConfig, runSync } from "./service";
import { CONNECTORS_SYNC_BUDGET_MS, runDueSync } from "./sync";

/**
 * Daily numbers for every connection, a little at a time: the tick runs every ~10 minutes, and each run syncs the
 * one or two connections whose numbers are older than 20 hours (an incremental window of at most 7 days, one or
 * two provider round trips). Its 5 s budget was taken from post-metrics (20 s → 15 s), so all tick budgets still
 * sum to 250 s. At ~144 ticks a day that covers a few hundred connections; the first 28-day backfill runs after
 * the connect callback instead, and the owner's "Yangilash" button syncs on demand.
 * Nothing runs (no database call) while no provider is configured.
 */
export const connectorsSync = defineCronTask({
  name: "connectors-sync",
  budgetMs: CONNECTORS_SYNC_BUDGET_MS,
  async run(ctx) {
    const cfg = connectorConfig();
    if (!anyEnabled(cfg)) return { configured: 0 };
    return runDueSync(() => dueConnections(2, 20), (id, deadline) => runSync(cfg, id, deadline, 7), ctx);
  },
});
