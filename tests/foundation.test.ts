import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/* ---------------------------------------------------------------- schema */

// Split exactly as scripts/db-migrate.mjs does: strip `--` comments per line, then split on ";" at a line end.
function statements(sql: string): string[] {
  return sql
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

describe("db/schema.sql", () => {
  const all = statements(read("db/schema.sql"));

  it("stays additive and idempotent: safe to re-run on the shared production database", () => {
    const additive = [
      /^CREATE TABLE IF NOT EXISTS \w+ \(/,
      /^CREATE (UNIQUE )?INDEX IF NOT EXISTS \w+ ON \w+ /,
      /^ALTER TABLE \w+ ADD COLUMN IF NOT EXISTS \w+ /,
    ];
    for (const s of all) {
      expect(additive.some((re) => re.test(s)), s.slice(0, 120)).toBe(true);
      // One statement per chunk: a missing ";" would glue two statements together.
      expect((s.match(/\b(CREATE|ALTER) /g) ?? []).length, s.slice(0, 120)).toBe(1);
      const body = s.replace(/\bON DELETE (CASCADE|SET NULL)\b/g, "");
      expect(body).not.toMatch(/\b(DROP|TRUNCATE|DELETE|UPDATE|RENAME|ALTER COLUMN|INSERT)\b/i);
    }
  });

  it("gives every new NOT NULL column a default (existing rows must stay valid)", () => {
    for (const s of all.filter((x) => x.startsWith("ALTER TABLE"))) {
      if (/\bNOT NULL\b/.test(s)) expect(s, s).toMatch(/\bDEFAULT\b/);
    }
  });

  it("has the value-loop tables and columns", () => {
    const text = all.join("\n");
    for (const table of [
      "publish_queue",
      "autopilot_runs",
      "cron_locks",
      "channel_snapshots",
      "post_metrics",
      "invite_links",
      "channel_member_events",
      "connections",
      "connect_oauth_states",
      "connection_metrics_daily",
      "connection_items",
      "media_jobs",
    ]) {
      expect(text, table).toContain(`CREATE TABLE IF NOT EXISTS ${table} (`);
    }
    for (const [table, column] of [
      ["brands", "channel_type"],
      ["brands", "goal"],
      ["brands", "autopilot"],
      ["posts", "plan_tag"],
      ["posts", "plan_slot"],
      ["posts", "schedule"],
      ["posts", "message_id"],
      ["posts", "published_chat"],
      ["posts", "published_at"],
    ]) {
      expect(text, `${table}.${column}`).toContain(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} `);
    }
    // Analytics keeps surface/visitor/env in events.props: no new events columns.
    expect(text).not.toMatch(/ALTER TABLE events ADD COLUMN/);
  });

  it("keeps the media_jobs DDL identical to the runtime fallback in media/pg-repo.ts", () => {
    const repo = read("src/lib/uslub/media/pg-repo.ts");
    const runtime = /CREATE TABLE IF NOT EXISTS media_jobs \(([\s\S]*?)\)`/.exec(repo)?.[1];
    const schema = all.find((s) => s.startsWith("CREATE TABLE IF NOT EXISTS media_jobs"));
    expect(runtime).toBeTruthy();
    const norm = (s: string) => s.replace(/\s+/g, " ").trim();
    expect(norm(schema!)).toBe(norm(`CREATE TABLE IF NOT EXISTS media_jobs (${runtime})`));
  });
});

/* ------------------------------------------------------------- webhooks */

describe("webhook allowed_updates", () => {
  const updates = (path: string) => {
    const block = /allowed_updates:\s*\[([\s\S]*?)\]/.exec(read(path))?.[1] ?? "";
    return [...block.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  };

  it("both scripts ask for the same updates, including the channel signals", () => {
    const deploy = updates("scripts/register-webhook-on-deploy.mjs");
    const manual = updates("scripts/set-webhook.mjs");
    expect(deploy).toEqual(manual);
    for (const u of ["message", "callback_query", "my_chat_member", "chat_member", "message_reaction_count", "channel_post", "pre_checkout_query", "business_message"]) {
      expect(deploy).toContain(u);
    }
    expect(new Set(deploy).size).toBe(deploy.length);
  });
});

/* ------------------------------------------------------------ schedules */

describe("tick schedules", () => {
  it("vercel.json has one daily cron to /api/cron/tick (Hobby accepts daily only)", () => {
    const crons = (JSON.parse(read("vercel.json")) as { crons?: { path: string; schedule: string }[] }).crons ?? [];
    expect(crons).toHaveLength(1);
    expect(crons[0].path).toBe("/api/cron/tick");
    const [minute, hour, ...rest] = crons[0].schedule.split(" ");
    expect(minute).toMatch(/^\d+$/);
    expect(hour).toMatch(/^\d+$/);
    expect(rest).toEqual(["*", "*", "*"]);
  });

  it("the GitHub workflow ticks every 10 minutes, sends the bearer from secrets and skips without them", () => {
    const yml = read(".github/workflows/tick.yml");
    expect(yml).toMatch(/cron: "[0-9-]*\/10 \* \* \* \*"/);
    expect(yml).toContain("workflow_dispatch:");
    expect(yml).toContain("CRON_SECRET: ${{ secrets.CRON_SECRET }}");
    expect(yml).toContain("TICK_URL: ${{ vars.TICK_URL }}");
    expect(yml).toContain('-H "Authorization: Bearer $CRON_SECRET"');
    expect(yml).toMatch(/if \[ -z "\$CRON_SECRET" \] \|\| \[ -z "\$TICK_URL" \]; then[\s\S]*?exit 0/);
    expect(yml).toMatch(/permissions: \{\}/);
  });

  it("the GitHub workflow fails when the deployment answers health (no valid CRON_SECRET there)", () => {
    const yml = read(".github/workflows/tick.yml");
    expect(yml).toMatch(
      /if \[ "\$\(echo "\$body" \| jq -r '\.mode \/\/ empty'\)" = "health" \]; then\s*\n\s*echo "::error::[^\n]*CRON_SECRET[^\n]*"\s*\n\s*exit 1/,
    );
    // A failed call fails the run too (curl exit status, not swallowed).
    expect(yml).toMatch(/if ! body=\$\(curl [^\n]*--fail-with-body[^\n]*\); then[\s\S]*?exit 1/);
  });

  it("the GitHub workflow prints only the summary: the repo is public, task counts stay in the database", () => {
    const yml = read(".github/workflows/tick.yml");
    const printed = [...yml.matchAll(/echo "\$body"([^\n]*)/g)].map((m) => m[1].trim());
    expect(printed.length).toBeGreaterThan(0);
    for (const rest of printed) {
      // Every print of the answer goes through jq with a fixed list of top-level fields.
      expect(rest, rest).toMatch(/^\| jq -(c|r) '(\{ok, mode, skipped, ran, failed, timedOut\}|\{ok, error\}|\.mode \/\/ empty|\.ok)'/);
    }
    expect(yml).not.toMatch(/\.tasks\b/);
    expect(yml).not.toMatch(/^\s*curl [^\n]*"\$TICK_URL"\s*$/m); // a bare curl would print the whole answer
  });
});

/* ------------------------------------------------------------- env push */

describe("scripts/vercel-env-push.mjs", () => {
  const script = read("scripts/vercel-env-push.mjs");
  const allowed = /const ALLOWED = \[([\s\S]*?)\];/.exec(script)?.[1] ?? "";
  const pushed = [...allowed.matchAll(/^\s*"([A-Z0-9_]+)",?/gm)].map((m) => m[1]);

  it("never pushes CRON_SECRET, LABS_ROUTES or STATS_PASSWORD from .env.local", () => {
    expect(pushed.length).toBeGreaterThan(10);
    for (const name of ["CRON_SECRET", "LABS_ROUTES", "STATS_PASSWORD"]) expect(pushed, name).not.toContain(name);
  });

  it("pushes the connector keys and the alert chat to production only", () => {
    const only = /const PRODUCTION_ONLY = new Set\(\[([\s\S]*?)\]\);/.exec(script)?.[1] ?? "";
    for (const name of ["OPS_CHAT_ID", "CONNECTOR_TOKEN_KEY", "META_APP_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET"]) {
      expect(pushed, name).toContain(name);
      expect(only, name).toContain(`"${name}"`);
    }
  });
});

/* ------------------------------------------------------------------ env */

describe("env: value-loop variables", () => {
  const NAMES = [
    "CRON_SECRET",
    "OPS_CHAT_ID",
    "LABS_ROUTES",
    "CONNECTOR_TOKEN_KEY",
    "STATS_TEAM_TG_IDS",
    "META_APP_ID",
    "META_APP_SECRET",
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "GOOGLE_ADS_DEVELOPER_TOKEN",
  ];
  const saved = Object.fromEntries(NAMES.map((n) => [n, process.env[n]]));

  afterEach(() => {
    for (const n of NAMES) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
  });

  async function freshEnv(values: Record<string, string>) {
    for (const n of NAMES) delete process.env[n];
    Object.assign(process.env, values);
    vi.resetModules();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getEnv } = await import("../src/lib/env");
    const env = getEnv();
    const warned = warn.mock.calls.map((c) => String(c[0]));
    warn.mockRestore();
    return { env, warned };
  }

  it("parses valid values", async () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    // Built at runtime: secret-shaped literals in the source trip GitHub push protection.
    const googleClientId = ["test", "apps", "googleusercontent", "com"].join(".");
    const fill = (n: number) => "x".repeat(n);
    const { env, warned } = await freshEnv({
      CRON_SECRET: "a".repeat(64),
      OPS_CHAT_ID: "-1001234567890",
      LABS_ROUTES: "radar, video",
      CONNECTOR_TOKEN_KEY: key,
      STATS_TEAM_TG_IDS: "12345678, 23456789",
      META_APP_ID: "123456789012345",
      META_APP_SECRET: fill(32),
      GOOGLE_OAUTH_CLIENT_ID: googleClientId,
      GOOGLE_OAUTH_CLIENT_SECRET: fill(35),
      GOOGLE_ADS_DEVELOPER_TOKEN: fill(22),
    });
    expect(warned).toEqual([]);
    expect(env.CRON_SECRET).toBe("a".repeat(64));
    expect(env.OPS_CHAT_ID).toBe(-1001234567890);
    expect(env.LABS_ROUTES).toBe("radar, video");
    expect(env.CONNECTOR_TOKEN_KEY).toBe(key);
    expect(env.STATS_TEAM_TG_IDS).toEqual([12345678, 23456789]);
    expect(env.GOOGLE_OAUTH_CLIENT_ID).toBe(googleClientId);
  });

  it("accepts LABS_ROUTES=* and all (the labs gate's spellings for every route)", async () => {
    for (const value of ["*", "all", "radar,media/jobs"]) {
      const { env, warned } = await freshEnv({ LABS_ROUTES: value });
      expect(warned, value).toEqual([]);
      expect(env.LABS_ROUTES).toBe(value);
    }
  });

  it("ignores invalid values with a warning that never prints them", async () => {
    const { env, warned } = await freshEnv({
      CRON_SECRET: "short-secret",
      OPS_CHAT_ID: "@ops",
      CONNECTOR_TOKEN_KEY: Buffer.alloc(16, 1).toString("base64"),
      STATS_TEAM_TG_IDS: "12,abc",
    });
    expect(env.CRON_SECRET).toBeUndefined();
    expect(env.OPS_CHAT_ID).toBeUndefined();
    expect(env.CONNECTOR_TOKEN_KEY).toBeUndefined();
    expect(env.STATS_TEAM_TG_IDS).toBeUndefined();
    expect(warned.join("\n")).toMatch(/CRON_SECRET is invalid/);
    expect(warned.join("\n")).not.toContain("short-secret");
  });
});
