import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The repo's SQL, captured instead of sent: checks the statements that make writes idempotent and single-use.
const sent: string[] = [];
const values: unknown[][] = [];
vi.mock("../src/lib/db", () => ({
  getSql: () => {
    const fn = async (strings: TemplateStringsArray, ...vals: unknown[]) => {
      sent.push(strings.join("?"));
      values.push(vals);
      return [];
    };
    return fn;
  },
  isDbConfigured: () => true,
}));

const { sealToken, tokenAad } = await import("../src/lib/connectors/crypto");
const { CONNECTORS_SYNC_BUDGET_MS, runDueSync, syncConnection, windowFor } = await import("../src/lib/connectors/sync");
const { needsSync } = await import("../src/lib/connectors/view");
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
    updatedAt: new Date("2026-11-24T06:00:00Z"),
    createdAt: new Date("2026-11-01T00:00:00Z"),
    ...over,
  };
}

function fakeConnector(over: Partial<Connector> = {}) {
  const seen = { tokens: 0, windows: [] as { since: string; until: string }[], stored: [] as unknown[], light: [] as (boolean | undefined)[], accounts: [] as string[] };
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
    sync: async ({ window, light, account }) => {
      seen.windows.push(window);
      seen.light.push(light);
      seen.accounts.push(account.id);
      return { daily: [{ accountId: "UC1", day: "2026-11-24", metrics: { views: 5 } }], items: [] };
    },
    revoke: async () => {},
    ...over,
  };
  return { c, seen };
}

function deps(r: ConnectionRow | null, connector: Connector, moved = [true]) {
  const calls = { synced: 0, retry: [] as string[], moves: [] as string[], notified: 0, events: [] as string[], daily: 0, saved: [] as { accounts: string[]; selected: string | null }[] };
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
    saveAccounts: async (_id, _account, accounts, selected) => {
      calls.saved.push({ accounts: accounts.map((a) => a.id), selected });
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

const run = (r: ConnectionRow | null, d: SyncDeps, maxDays?: number, light?: boolean) =>
  syncConnection(r?.id ?? "x", { deadline: Date.now() + 20_000, now: NOW, maxDays, light }, d);

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
    // A switched-off provider's row notes it, so it waits its backoff instead of heading the queue every run.
    expect(off.calls.retry).toEqual(["sync_failed"]);
    expect(await run(null, deps(null, c).d)).toBe("skipped");
  });

  it("passes the tick's light flag to the provider", async () => {
    const { c, seen } = fakeConnector();
    const { d } = deps(row(), c);
    await run(row(), d, 7, true);
    await run(row(), d);
    expect(seen.light).toEqual([true, undefined]);
  });

  it("a Google Ads row waiting for access lists its real accounts once access arrives, then reads the real one", async () => {
    const pendingRow = row({
      provider: "google_ads",
      status: "error",
      lastError: "access_pending",
      lastSyncAt: null,
      accounts: [
        { id: "1112223333", name: "1112223333" },
        { id: "4445556666", name: "4445556666" },
      ],
      selectedAccount: "1112223333",
    });
    // Still pending: nothing saved, the row stays in 'error' and waits.
    const stillPending = fakeConnector({ profile: async () => ({ externalId: "sub", accounts: [], selected: null, status: "error", error: "access_pending" }) });
    const a = deps(pendingRow, stillPending.c);
    expect(await run(pendingRow, a.d)).toBe("error");
    expect(a.calls.moves).toEqual(["error:access_pending"]);
    expect(a.calls.saved).toEqual([]);
    expect(stillPending.seen.windows).toEqual([]);
    // Access granted: the manager is gone from the list, its client is read.
    const granted = fakeConnector({
      profile: async () => ({
        externalId: "sub",
        accounts: [
          { id: "7778889999", name: "Safia Bakery", currency: "USD", via: "1112223333" },
          { id: "4445556666", name: "Test shop", test: true },
        ],
        selected: "7778889999",
        status: "active",
      }),
    });
    const b = deps(pendingRow, granted.c);
    expect(await run(pendingRow, b.d)).toBe("synced");
    expect(b.calls.saved).toEqual([{ accounts: ["7778889999", "4445556666"], selected: "7778889999" }]);
    expect(granted.seen.accounts).toEqual(["7778889999"]);
    expect(b.calls.synced).toBe(1);
    // Nothing to read after all: the reason is kept for the card.
    const none = fakeConnector({ profile: async () => ({ externalId: "sub", accounts: [], selected: null, status: "empty", error: "no_ad_accounts" }) });
    const e = deps(pendingRow, none.c);
    expect(await run(pendingRow, e.d)).toBe("error");
    expect(e.calls.moves).toEqual(["error:no_ad_accounts"]);
  });

  it("an active row never lists its accounts again", async () => {
    let profiles = 0;
    const { c } = fakeConnector({
      profile: async () => {
        profiles++;
        return { externalId: "x", accounts: [], selected: null, status: "active" };
      },
    });
    const { d } = deps(row(), c);
    expect(await run(row(), d)).toBe("synced");
    expect(profiles).toBe(0);
  });
});

describe("which connections are due (the card's lazy sync; repo.dueConnections is the same rule in SQL)", () => {
  const H = 3_600_000;
  const never = (over: Partial<ConnectionRow>) => row({ lastSyncAt: null, updatedAt: new Date(NOW.getTime() - 5 * 60_000), ...over });

  it("two never-synced rows missing a permission do not hold the queue: the active row is synced", async () => {
    const rows = [
      never({ id: "a0000000-0000-0000-0000-00000000000a", status: "error", lastError: "scope_missing", provider: "instagram" }),
      never({ id: "b0000000-0000-0000-0000-00000000000b", status: "error", lastError: "scope_missing", provider: "instagram" }),
      row({ id: "c0000000-0000-0000-0000-00000000000c", lastSyncAt: new Date(NOW.getTime() - 21 * H) }),
    ];
    const due = rows.filter((r) => needsSync(r, NOW, 20)).map((r) => r.id);
    expect(due).toEqual(["c0000000-0000-0000-0000-00000000000c"]);
    const { c } = fakeConnector();
    const synced: string[] = [];
    const counts = await runDueSync(
      async () => due.slice(0, 2),
      async (id, deadline) => {
        const target = rows.find((r) => r.id === id)!;
        const { d } = deps(target, c);
        const out = await syncConnection(id, { deadline, now: NOW, light: true }, d);
        if (out === "synced") synced.push(id);
        return out;
      },
      { timeLeft: () => 5_000 },
    );
    expect(synced).toEqual(["c0000000-0000-0000-0000-00000000000c"]);
    expect(counts.synced).toBe(1);
  });

  it("a failed attempt waits two hours from the failure; then it is due again", () => {
    const failed = (minutesAgo: number) =>
      row({ status: "error", lastError: "access_pending", lastSyncAt: null, updatedAt: new Date(NOW.getTime() - minutesAgo * 60_000) });
    expect(needsSync(failed(10), NOW, 20)).toBe(false);
    expect(needsSync(failed(121), NOW, 20)).toBe(true);
    const retried = row({ lastError: "rate_limited", lastSyncAt: new Date(NOW.getTime() - 30 * H), updatedAt: new Date(NOW.getTime() - 30 * 60_000) });
    expect(needsSync(retried, NOW, 6)).toBe(false);
    expect(needsSync(row({ lastSyncAt: new Date(NOW.getTime() - 7 * H) }), NOW, 6)).toBe(true);
    expect(needsSync(row({ lastSyncAt: new Date(NOW.getTime() - 5 * H) }), NOW, 6)).toBe(false);
    expect(needsSync(row({ status: "empty", lastSyncAt: null }), NOW, 6)).toBe(false);
    expect(needsSync(row({ status: "expired", lastSyncAt: null }), NOW, 6)).toBe(false);
  });

  it("the tick's SQL: providers that are on, no scope_missing rows, the backoff, failures ordered last", async () => {
    sent.length = 0;
    values.length = 0;
    await repo.dueConnections(2, 20, ["instagram", "youtube"]);
    const q = sent[0];
    expect(q).toMatch(/provider = ANY\(\?::text\[\]\)/);
    expect(q).toContain("COALESCE(last_error, '') <> 'scope_missing'");
    expect(q).toMatch(/last_error IS NULL OR updated_at < now\(\) - make_interval\(hours => \?::int\)/);
    expect(q).toMatch(/ORDER BY GREATEST\(COALESCE\(last_sync_at, 'epoch'::timestamptz\), CASE WHEN last_error IS NULL THEN 'epoch'::timestamptz ELSE updated_at END\)/);
    expect(values[0]).toEqual([["instagram", "youtube"], 20, 2, 2]);
    sent.length = 0;
    expect(await repo.dueConnections(2, 20, [])).toEqual([]);
    expect(sent).toEqual([]);
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
    await repo.moveStatus("id", "error", "access_pending");
    expect(sent[0]).toMatch(/WHERE id = \? AND status IS DISTINCT FROM \?/);
    // Unchanged: only the code and the backoff clock move.
    expect(sent[1]).toMatch(/SET last_error = \?, updated_at = now\(\) WHERE id = \? AND status <> 'expired'/);
  });

  it("an expired connection drops its dead tokens, and is never touched again (its deletion clock keeps running)", async () => {
    sent.length = 0;
    await repo.moveStatus("id", "expired", "expired");
    expect(sent[0]).toMatch(/SET status = 'expired', last_error = \?, access_token_enc = NULL, refresh_token_enc = NULL, updated_at = now\(\)/);
    expect(sent[0]).toMatch(/WHERE id = \? AND status IS DISTINCT FROM 'expired'/);
    expect(sent[1]).toContain("AND status <> 'expired'");
  });

  it("deletes what may not be kept: ended connections (Google after 5 days, Meta after 30), stale items, old YouTube days", async () => {
    sent.length = 0;
    values.length = 0;
    expect(await repo.pruneConnectorData()).toEqual({ expired: 0, items: 0, days: 0 });
    expect(sent[0]).toMatch(/DELETE FROM connections\s+WHERE status = 'expired' AND \(/);
    expect(values[0]).toEqual([["youtube", "google_ads"], 5, ["instagram", "meta_ads"], 30]);
    expect(sent[1]).toMatch(/DELETE FROM connection_items WHERE fetched_at < now\(\) - make_interval\(days => \?::int\)/);
    expect(values[1]).toEqual([30]);
    expect(sent[2]).toMatch(/DELETE FROM connection_metrics_daily d USING connections c\s+WHERE d.connection_id = c.id AND c.provider = 'youtube'/);
  });
});
