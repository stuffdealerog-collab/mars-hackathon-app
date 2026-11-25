import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The repo's SQL, captured instead of sent: checks the statements that make writes idempotent and single-use.
const sent: string[] = [];
vi.mock("../src/lib/db", () => ({
  getSql: () => {
    const fn = async (strings: TemplateStringsArray) => {
      sent.push(strings.join("?"));
      return [];
    };
    return fn;
  },
  isDbConfigured: () => true,
}));

const { sealToken, tokenAad } = await import("../src/lib/connectors/crypto");
const { CONNECTORS_SYNC_BUDGET_MS, runDueSync, syncConnection, windowFor } = await import("../src/lib/connectors/sync");
const { AUTOPILOT_BUDGETS } = await import("../src/lib/autopilot/budgets");
const { TICK_BUDGET_MS } = await import("../src/lib/cron/registry");
const repo = await import("../src/lib/connectors/repo");
type ConnectionRow = import("../src/lib/connectors/repo").ConnectionRow;
type Connector = import("../src/lib/connectors/providers/types").Connector;
type SyncDeps = import("../src/lib/connectors/sync").SyncDeps;

const KEY = randomBytes(32);
const NOW = new Date("2026-11-25T06:00:00Z");

function row(over: Partial<ConnectionRow> = {}): ConnectionRow {
  const id = over.id ?? "0b6f2c4e-1111-2222-3333-444455556666";
  return {
    id,
    ownerTelegramId: 4242,
    brandId: "11111111-2222-3333-4444-555555555555",
    provider: "youtube",
    mode: "test",
    externalId: "UC1",
    account: { name: "Safia" },
    accounts: [{ id: "UC1", name: "Safia" }],
    selectedAccount: "UC1",
    scopes: [],
    accessTokenEnc: null,
    refreshTokenEnc: sealToken("1//refresh", tokenAad(id, "refresh"), KEY),
    tokenExpiresAt: null,
    dataAccessExpiresAt: null,
    status: "active",
    lastError: null,
    lastSyncAt: new Date("2026-11-24T06:00:00Z"),
    createdAt: new Date("2026-11-01T00:00:00Z"),
    ...over,
  };
}

function fakeConnector(over: Partial<Connector> = {}) {
  const seen = { tokens: 0, windows: [] as { since: string; until: string }[], stored: [] as unknown[] };
  const c: Connector = {
    id: "youtube",
    family: "google",
    usesPkce: true,
    settleDays: 4,
    authorizeUrl: () => "",
    exchange: async () => ({ scopes: [] }),
    missingScopes: () => [],
    profile: async () => ({ externalId: "x", accounts: [], selected: null, status: "active" }),
    accessToken: async (stored) => {
      seen.tokens++;
      seen.stored.push(stored);
      return "fresh-access";
    },
    sync: async ({ window }) => {
      seen.windows.push(window);
      return { daily: [{ accountId: "UC1", day: "2026-11-24", metrics: { views: 5 } }], items: [] };
    },
    revoke: async () => {},
    ...over,
  };
  return { c, seen };
}

function deps(r: ConnectionRow | null, connector: Connector, moved = [true]) {
  const calls = { synced: 0, retry: [] as string[], moves: [] as string[], notified: 0, events: [] as string[], daily: 0 };
  let move = 0;
  const d: SyncDeps = {
    load: async () => r,
    connector: () => connector,
    keys: [KEY],
    saveDaily: async () => {
      calls.daily++;
    },
    saveItems: async () => {},
    markSynced: async () => {
      calls.synced++;
    },
    markRetry: async (_id, code) => {
      calls.retry.push(code);
    },
    moveStatus: async (_id, status, code) => {
      calls.moves.push(`${status}:${code}`);
      return moved[move++] ?? false;
    },
    notifyExpired: async () => {
      calls.notified++;
    },
    logEvent: async (_r, type) => {
      calls.events.push(type);
    },
    log: () => {},
  };
  return { d, calls };
}

const run = (r: ConnectionRow | null, d: SyncDeps, maxDays?: number) => syncConnection(r?.id ?? "x", { deadline: Date.now() + 20_000, now: NOW, maxDays }, d);

describe("syncConnection", () => {
  it("mints a fresh Google access token from the sealed refresh token on every run, then stores the numbers", async () => {
    const { c, seen } = fakeConnector();
    const { d, calls } = deps(row(), c);
    expect(await run(row(), d)).toBe("synced");
    expect(await run(row(), d)).toBe("synced");
    expect(seen.tokens).toBe(2);
    expect(seen.stored[0]).toEqual({ access: null, refresh: "1//refresh" });
    expect(calls.synced).toBe(2);
    expect(calls.daily).toBe(2);
  });

  it("re-reads the provider's settle days after the last sync; a first sync backfills 28 days; the tick caps at 7", () => {
    const { c } = fakeConnector();
    expect(windowFor(row(), c, NOW)).toEqual({ since: "2026-11-20", until: "2026-11-24" });
    expect(windowFor(row({ lastSyncAt: null }), c, NOW)).toEqual({ since: "2026-10-28", until: "2026-11-24" });
    expect(windowFor(row({ lastSyncAt: null }), c, NOW, 7)).toEqual({ since: "2026-11-18", until: "2026-11-24" });
  });

  it("a Meta token past its end date expires the connection with exactly one message", async () => {
    const { c, seen } = fakeConnector();
    const meta = row({ provider: "instagram", tokenExpiresAt: new Date("2026-11-24T00:00:00Z"), dataAccessExpiresAt: new Date("2027-01-01T00:00:00Z") });
    const { d, calls } = deps(meta, c, [true, false]);
    expect(await run(meta, d)).toBe("expired");
    expect(await run(meta, d)).toBe("expired"); // a second run finds the status already moved: no second message
    expect(calls.notified).toBe(1);
    expect(calls.events).toEqual(["connect_expired"]);
    expect(seen.tokens).toBe(0);
  });

  it("a provider saying 'expired' (revoked grant) also moves the status once", async () => {
    const { ProviderError } = await import("../src/lib/connectors/net");
    const { c } = fakeConnector({
      accessToken: async () => {
        throw new ProviderError("expired", 400, "invalid_grant");
      },
    });
    const { d, calls } = deps(row(), c, [true, false]);
    expect(await run(row(), d)).toBe("expired");
    expect(await run(row(), d)).toBe("expired");
    expect(calls.moves).toEqual(["expired:expired", "expired:expired"]);
    expect(calls.notified).toBe(1);
  });

  it("access pending / missing permission → status error (no message); a rate limit keeps the status for a retry", async () => {
    const { ProviderError } = await import("../src/lib/connectors/net");
    const pending = fakeConnector({
      sync: async () => {
        throw new ProviderError("access_pending", 403);
      },
    });
    const a = deps(row({ provider: "google_ads" }), pending.c);
    expect(await run(row(), a.d)).toBe("error");
    expect(a.calls.moves).toEqual(["error:access_pending"]);
    expect(a.calls.notified).toBe(0);
    const limited = fakeConnector({
      sync: async () => {
        throw new ProviderError("rate_limited", 400, "17");
      },
    });
    const b = deps(row(), limited.c);
    expect(await run(row(), b.d)).toBe("retry");
    expect(b.calls.retry).toEqual(["rate_limited"]);
    expect(b.calls.moves).toEqual([]);
    const broken = fakeConnector({
      sync: async () => {
        throw new Error("socket hang up");
      },
    });
    const e = deps(row(), broken.c);
    expect(await run(row(), e.d)).toBe("retry");
    expect(e.calls.retry).toEqual(["sync_failed"]);
  });

  it("a token sealed with a key that is gone cannot be read: the owner reconnects", async () => {
    const { c } = fakeConnector();
    const other = row({ refreshTokenEnc: sealToken("1//refresh", tokenAad("0b6f2c4e-1111-2222-3333-444455556666", "refresh"), randomBytes(32)) });
    const { d, calls } = deps(other, c);
    expect(await run(other, d)).toBe("expired");
    expect(calls.notified).toBe(1);
  });

  it("skips expired, empty and unselected connections and providers that were switched off", async () => {
    const { c } = fakeConnector();
    expect(await run(row({ status: "expired" }), deps(row({ status: "expired" }), c).d)).toBe("skipped");
    expect(await run(row({ status: "empty" }), deps(row({ status: "empty" }), c).d)).toBe("skipped");
    expect(await run(row({ selectedAccount: null }), deps(row({ selectedAccount: null }), c).d)).toBe("skipped");
    const off = deps(row(), c);
    off.d.connector = () => null;
    expect(await run(row(), off.d)).toBe("skipped");
    expect(await run(null, deps(null, c).d)).toBe("skipped");
  });
});

describe("the tick step", () => {
  it("syncs due connections while its budget lasts and returns counts only", async () => {
    let left = 10_000;
    const synced: string[] = [];
    const counts = await runDueSync(
      async () => ["a", "b", "c"],
      async (id) => {
        synced.push(id);
        left -= 4_000;
        return "synced";
      },
      { timeLeft: () => left },
    );
    expect(synced).toEqual(["a", "b"]);
    expect(counts).toEqual({ synced: 2, expired: 0, error: 0, retry: 0, skipped: 0 });
    const none = await runDueSync(async () => ["a"], async () => "synced", { timeLeft: () => 1_000 });
    expect(none.synced).toBe(0);
  });

  it("fits in the tick next to every other task (5 s taken from post-metrics)", () => {
    const others = 5_000 /* heartbeat */ + 25_000; /* media-sweep */
    const autopilot = Object.values(AUTOPILOT_BUDGETS).reduce((a, b) => a + b, 0);
    expect(CONNECTORS_SYNC_BUDGET_MS).toBe(5_000);
    expect(AUTOPILOT_BUDGETS["post-metrics"]).toBe(15_000);
    expect(others + autopilot + CONNECTORS_SYNC_BUDGET_MS).toBeLessThanOrEqual(TICK_BUDGET_MS);
  });
});

describe("repo SQL", () => {
  it("takes a state once (unused and unexpired, marked used in the same statement)", async () => {
    sent.length = 0;
    await repo.consumeState("s".repeat(43));
    expect(sent[0]).toMatch(/UPDATE connect_oauth_states SET used_at = now\(\)\s+WHERE state = \? AND used_at IS NULL AND expires_at > now\(\)/);
  });

  it("the same day twice is one row, merged; the same item twice is one row", async () => {
    sent.length = 0;
    await repo.upsertDaily("id", [{ accountId: "a", day: "2026-11-24", metrics: { views: 1 } }]);
    await repo.upsertItems("id", [{ kind: "post", externalId: "1", publishedAt: null, title: null, permalink: null, metrics: {} }]);
    expect(sent[0]).toMatch(/ON CONFLICT \(connection_id, account_id, day\) DO UPDATE\s+SET metrics = connection_metrics_daily\.metrics \|\| EXCLUDED\.metrics/);
    expect(sent[1]).toMatch(/ON CONFLICT \(connection_id, kind, external_id\) DO UPDATE/);
    sent.length = 0;
    await repo.upsertDaily("id", []);
    expect(sent).toEqual([]);
  });

  it("moves a status only when it changes, so the 'ended' message goes out once", async () => {
    sent.length = 0;
    await repo.moveStatus("id", "expired", "expired");
    expect(sent[0]).toMatch(/WHERE id = \? AND status IS DISTINCT FROM \?/);
  });
});
