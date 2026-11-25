import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

// The connectors-sync tick task with its storage and sync mocked: what it asks the queue for, how it runs a sync,
// and that the cleanup runs first (and that nothing touches the database while connectors were never set up).
vi.mock("server-only", () => ({}));

const calls = { prune: 0, due: [] as unknown[][], runs: [] as unknown[][] };
vi.mock("../src/lib/connectors/repo", () => ({
  pruneConnectorData: async () => {
    calls.prune++;
    return { expired: 1, items: 2, days: 3 };
  },
  dueConnections: async (...a: unknown[]) => {
    calls.due.push(a);
    return ["c1"];
  },
}));
vi.mock("../src/lib/connectors/service", async () => {
  const { readConnectorConfig } = await import("../src/lib/connectors/config");
  return {
    connectorConfig: () => readConnectorConfig(process.env),
    runSync: async (...a: unknown[]) => {
      calls.runs.push(a);
      return "synced";
    },
  };
});

const { connectorsSync } = await import("../src/lib/connectors/task");

const ENV = {
  CONNECTOR_TOKEN_KEY: randomBytes(32).toString("base64"),
  PUBLIC_URL: "https://mercat.example",
  GOOGLE_OAUTH_CLIENT_ID: "123-abc.apps.googleusercontent.com",
  GOOGLE_OAUTH_CLIENT_SECRET: "GOCSPX-secret_value-123",
};

const ctx = () => {
  const now = new Date("2026-11-25T06:00:00Z");
  return { now, tashkent: {} as never, signal: new AbortController().signal, timeLeft: () => 5_000 };
};

afterEach(() => {
  for (const k of [...Object.keys(ENV), "CONNECTOR_ENABLED"]) delete process.env[k];
  calls.prune = 0;
  calls.due.length = 0;
  calls.runs.length = 0;
});

describe("connectors-sync tick task", () => {
  it("never set up (no token key): no database call at all", async () => {
    expect(await connectorsSync.run(ctx())).toEqual({ configured: 0 });
    expect(calls.prune).toBe(0);
    expect(calls.due).toEqual([]);
  });

  it("asks the queue only for providers that are on, and runs light, capped syncs after the cleanup", async () => {
    Object.assign(process.env, ENV);
    const out = await connectorsSync.run(ctx());
    expect(calls.prune).toBe(1);
    expect(calls.due).toEqual([[2, 20, ["youtube", "google_ads"]]]);
    expect(calls.runs).toHaveLength(1);
    expect(calls.runs[0][1]).toBe("c1");
    expect(calls.runs[0][3]).toEqual({ maxDays: 7, light: true });
    expect(out).toMatchObject({ synced: 1, pruned_connections: 1, pruned_items: 2, pruned_days: 3 });
    process.env.CONNECTOR_ENABLED = "youtube";
    await connectorsSync.run(ctx());
    expect(calls.due.at(-1)).toEqual([2, 20, ["youtube"]]);
  });

  it("every provider switched off: the cleanup still runs, nothing is synced", async () => {
    Object.assign(process.env, ENV, { CONNECTOR_ENABLED: "none" });
    expect(await connectorsSync.run(ctx())).toEqual({ configured: 0, pruned_connections: 1, pruned_items: 2, pruned_days: 3 });
    expect(calls.prune).toBe(1);
    expect(calls.due).toEqual([]);
  });
});
