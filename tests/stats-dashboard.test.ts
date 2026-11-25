import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: () => undefined }));
vi.mock("../src/lib/db", () => ({ isDbConfigured: () => false, getSql: () => { throw new Error("no db in tests"); } }));

import { neon } from "@neondatabase/serverless";
import type { Sql } from "../src/lib/db";
import { forgetPublishedAt, readStats, statsTeamIds } from "../src/lib/stats";
import {
  cleanName,
  cleanUsername,
  parseStatsQuery,
  parseTeamIds,
  shapeErrors,
  shapeFeed,
  shapeFunnel,
  shapeNorthStar,
  shapeOverview,
  shapeQuality,
  shapeSources,
  shapeUsers,
  statsHref,
  type StatsOptions,
  sumFunnel,
} from "../src/lib/stats-model";
import {
  errorsQuery,
  feedQuery,
  funnelQuery,
  hasPublishedAtQuery,
  landingSourcesQuery,
  northStarQuery,
  overviewQuery,
  qualityQuery,
  telegramSourcesQuery,
  usersQuery,
} from "../src/lib/stats-queries";

const UUID = "3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b";
const TG_ID = 8123456789;

// A real neon client: queries are built and compiled, never sent (nothing awaits them).
const sql = neon("postgresql://user:pass@db.invalid/neondb") as unknown as Sql;
const compile = (q: unknown) =>
  (q as { queryData: { toParameterizedQuery: () => { query: string; params: unknown[] } } }).queryData.toParameterizedQuery();

const base: StatsOptions = { range: "7d", includeDev: false, includeTeam: false, teamIds: [111, 222] };
const builders = {
  overview: overviewQuery,
  funnel: funnelQuery,
  landing: landingSourcesQuery,
  telegram: telegramSourcesQuery,
  users: (s: Sql, o: StatsOptions) => usersQuery(s, o),
  feed: (s: Sql, o: StatsOptions) => feedQuery(s, o),
  northStar: northStarQuery,
  quality: qualityQuery,
  errors: (s: Sql, o: StatsOptions) => errorsQuery(s, o),
};

describe("options", () => {
  it("parses ?range, ?dev and ?team with safe defaults", () => {
    expect(parseStatsQuery({})).toEqual({ range: "7d", includeDev: false, includeTeam: false });
    expect(parseStatsQuery({ range: "30d", dev: "1", team: "true" })).toEqual({ range: "30d", includeDev: true, includeTeam: true });
    expect(parseStatsQuery({ range: "ALL" }).range).toBe("all");
    expect(parseStatsQuery({ range: "today" }).range).toBe("today");
    expect(parseStatsQuery({ range: "1y'; DROP TABLE events" }).range).toBe("7d");
    expect(parseStatsQuery({ range: ["30d", "today"], dev: ["0"] })).toEqual({ range: "30d", includeDev: false, includeTeam: false });
  });

  it("builds links that change one option and keep the rest", () => {
    const q = parseStatsQuery({});
    expect(statsHref(q)).toBe("/stats");
    expect(statsHref(q, { range: "30d" })).toBe("/stats?range=30d");
    expect(statsHref({ range: "all", includeDev: true, includeTeam: false }, { includeTeam: true })).toBe("/stats?range=all&dev=1&team=1");
  });

  it("reads STATS_TEAM_TG_IDS as positive integer ids, ignoring anything else", () => {
    expect(parseTeamIds("123, 456;789\n 456 abc -5 1e3 12.5 0 9999999999999999999")).toEqual([123, 456, 789]);
    expect(parseTeamIds(undefined)).toEqual([]);
    expect(parseTeamIds("")).toEqual([]);
    expect(statsTeamIds({ STATS_TEAM_TG_IDS: `${TG_ID},42` })).toEqual([TG_ID, 42]);
  });
});

describe("query builders", () => {
  it("never select props whole: every props read is a ->> key", () => {
    for (const [name, build] of Object.entries(builders)) {
      const { query } = compile(build(sql, base));
      expect(query, name).not.toMatch(/\bprops\b(?!\s*->)/);
      expect(query, name).not.toMatch(/\bSELECT\s+\*/i);
    }
  });

  it("leave dev traffic out unless asked", () => {
    for (const [name, build] of Object.entries(builders)) {
      if (name === "telegram") continue; // app_users rows carry no env
      expect(compile(build(sql, base)).query, name).toMatch(/'env'(?: IS DISTINCT FROM| =) 'dev'/);
      expect(compile(build(sql, { ...base, includeDev: true })).query, name).not.toMatch(/'dev'/);
    }
  });

  it("leave the team out unless asked, as bound bigint[] parameters", () => {
    for (const name of ["overview", "funnel", "telegram", "users", "feed", "quality", "errors"] as const) {
      const { query, params } = compile(builders[name](sql, base));
      expect(query, name).toMatch(/<> ALL\(\$\d+::bigint\[\]\)/);
      expect(params, name).toContainEqual(["111", "222"]);
      expect(compile(builders[name](sql, { ...base, includeTeam: true })).query, name).not.toMatch(/::bigint\[\]/);
      expect(compile(builders[name](sql, { ...base, teamIds: [] })).query, name).not.toMatch(/::bigint\[\]/);
    }
  });

  it("the north star always leaves the team out (external brands only)", () => {
    const { query, params } = compile(northStarQuery(sql, { ...base, includeTeam: true }));
    expect(query).toMatch(/owner_telegram_id <> ALL\(\$\d+::bigint\[\]\)/);
    expect(params).toContainEqual(["111", "222"]);
    expect(query).toMatch(/published_at >= now\(\) - interval '7 days'/);
    expect(query).toMatch(/n >= 3/);
  });

  it("the north star also counts posts the bot published before anything wrote published_at", () => {
    const { query } = compile(northStarQuery(sql, base));
    expect(query).toMatch(/UNION/);
    expect(query).toMatch(/e\.type = 'post_published' AND e\.created_at >= now\(\) - interval '7 days'/);
    expect(query).toMatch(/p\.published_at IS NULL AND p\.status = 'published'/);
    expect(query).toMatch(/e\.props->>'env' IS DISTINCT FROM 'dev'/);
  });

  it("the quality card reads edits, redone pictures, rejections, errors and trials without unsafe casts", () => {
    const { query, params } = compile(qualityQuery(sql, base));
    expect(params).toContainEqual(expect.arrayContaining(["post_approved", "post_image_started", "post_regenerated", "post_rejected", "api_error", "trial_started"]));
    // Casts only behind a CASE that checked the value first.
    expect(query).toMatch(/CASE WHEN e\.props->>'attempt' ~ '\^\[0-9\]\{1,4\}\$'\s+THEN \(e\.props->>'attempt'\)::int ELSE 1 END > 1/);
    expect(query).toMatch(/CASE WHEN jsonb_typeof\(e\.props->'edited'\) = 'array'/);
    const errors = compile(errorsQuery(sql, base));
    expect(errors.query).toMatch(/e\.props->>'route' AS route, e\.props->>'code' AS code/);
  });

  it("the funnel counts drafts left without approval for 48 hours", () => {
    const { query } = compile(funnelQuery(sql, base));
    expect(query).toMatch(/p\.status = 'draft' AND p\.approved_at IS NULL\s+AND p\.created_at < now\(\) - interval '48 hours'/);
  });

  it("turns the range into a Tashkent-day boundary", () => {
    const week = compile(landingSourcesQuery(sql, base));
    expect(week.query).toMatch(/date_trunc\('day', now\(\), \$\d+::text\)/);
    expect(week.params).toContain("Asia/Tashkent");
    expect(week.query).toMatch(/make_interval\(days => \$\d+::int\)/);
    expect(week.params).toContain(6);
    expect(compile(landingSourcesQuery(sql, { ...base, range: "30d" })).params).toContain(29);
    expect(compile(landingSourcesQuery(sql, { ...base, range: "today" })).query).not.toMatch(/make_interval/);
    expect(compile(landingSourcesQuery(sql, { ...base, range: "all" })).query).toMatch(/'-infinity'::timestamptz/);
  });

  it("infers the surface of older rows from the same type list the writer uses", () => {
    const { query, params } = compile(feedQuery(sql, base));
    expect(query).toMatch(/coalesce\(e\.props->>'surface', CASE/);
    expect(params).toContainEqual(expect.arrayContaining(["start", "lead", "bot_onboarded", "publish_link_opened"]));
    expect(params).toContainEqual(["miniapp_open"]);
  });

  it("checks for posts.published_at in the catalog, not by touching the column", () => {
    const { query } = compile(hasPublishedAtQuery(sql));
    expect(query).toMatch(/information_schema\.columns/);
    expect(query).toMatch(/column_name = 'published_at'/);
  });

  it("never return an id column", () => {
    // The final select list (from the last SELECT to its FROM): no id is an output column.
    const selectList = (q: string) => {
      const start = q.lastIndexOf("SELECT");
      return q.slice(start, q.indexOf("FROM", start));
    };
    const ID_COLUMN = /(?:SELECT|,)\s*(?:[a-z_]+\.)?(?:telegram_id|owner_telegram_id|id|brand_id|post_id|visitor|props)\s*(?:,|AS\b|$)/;
    for (const [name, build] of Object.entries(builders)) {
      expect(selectList(compile(build(sql, base)).query), name).not.toMatch(ID_COLUMN);
    }
    expect(selectList(compile(usersQuery(sql, base)).query)).toMatch(/u\.first_name, u\.username/);
    expect("SELECT u.telegram_id, u.username FROM").toMatch(ID_COLUMN); // the check itself bites
  });
});

describe("shaping (what reaches the page)", () => {
  const leaky = {
    telegram_id: TG_ID,
    owner_telegram_id: TG_ID,
    id: UUID,
    brand_id: UUID,
    post_id: UUID,
    visitor: "v:0123456789abcdef",
    actor: "ip:0123456789abcdef",
    props: { brand_id: UUID },
  };

  it("drops every id, visitor key and raw prop", () => {
    const overview = shapeOverview([{ span: "today", landing_visitors: "3", ...leaky }]);
    const funnel = shapeFunnel([{ surface: "web", brands: 2, with_posts: 1, ...leaky }]);
    const users = shapeUsers([
      {
        first_name: "Dilnoza",
        username: "dilnoza_shop",
        first_seen: new Date("2026-11-24T10:00:00Z"),
        last_seen: "2026-11-25T09:00:00Z",
        bot: true,
        miniapp: true,
        web: false,
        brands: 1,
        posts: 4,
        approved: 1,
        published: 0,
        ...leaky,
      },
    ]);
    const feed = shapeFeed([{ type: "brand_created", surface: "web", created_at: new Date(), ...leaky }]);
    const sources = shapeSources([{ source: `brand_${UUID}`, count: 1, ...leaky }, { source: UUID, count: 2 }]);
    const json = JSON.stringify({ overview, funnel, users, feed, sources });
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(json).not.toMatch(/\b(v|ip):[0-9a-f]/);
    expect(json).not.toMatch(/\d{6,}/);
    expect(json).not.toMatch(/"(telegram_id|owner_telegram_id|id|brand_id|post_id|props|visitor|actor)"/);
    expect(Object.keys(users[0]).sort()).toEqual(["approved", "brands", "firstSeen", "lastSeen", "name", "posts", "published", "surfaces", "username"]);
    expect(users[0]).toMatchObject({ name: "Dilnoza", username: "dilnoza_shop", surfaces: ["bot", "miniapp"], posts: 4 });
    expect(sources).toEqual([{ source: "other", count: 2 }, { source: "brand", count: 1 }]);
  });

  it("cleans names and usernames", () => {
    expect(cleanUsername("@dilnoza_shop")).toBe("dilnoza_shop");
    expect(cleanUsername("has space")).toBeNull();
    expect(cleanUsername("<script>")).toBeNull();
    expect(cleanUsername("x".repeat(33))).toBeNull();
    expect(cleanUsername(null)).toBeNull();
    expect(cleanName("Ali\u0000‮Vali")).toBe("AliVali");
    expect(cleanName("A".repeat(100))).toHaveLength(64);
    expect(cleanName(null)).toBe("");
  });

  it("fills missing overview spans with zeros, in today / 7d / 30d order", () => {
    const rows = shapeOverview([{ span: "30d", bot_users: 4 }, { span: "bogus", bot_users: 1 }]);
    expect(rows.map((r) => r.span)).toEqual(["today", "7d", "30d"]);
    expect(rows[0].bot_users).toBe(0);
    expect(rows[2].bot_users).toBe(4);
  });

  it("orders and merges funnel rows by surface, and sums them", () => {
    const rows = shapeFunnel([
      { surface: "unknown", brands: 7, with_posts: 7 },
      { surface: "bot", brands: 3, with_posts: 3, posts: 9 },
      { surface: "web", brands: 34, with_posts: 29, posts: 146 },
      { surface: "web", brands: 1, with_posts: 0 },
      { surface: "mars", brands: 1 },
    ]);
    expect(rows.map((r) => r.surface)).toEqual(["web", "bot", "unknown"]);
    expect(rows[0].brands).toBe(35);
    expect(rows[2].brands).toBe(8); // "mars" read as unknown
    expect(sumFunnel(rows)).toMatchObject({ brands: 46, with_posts: 39, posts: 155 });
  });

  it("shows an unknown event name as 'other'", () => {
    expect(shapeFeed([{ type: "Robert'); DROP", surface: "bot", created_at: "2026-11-25T10:00:00Z" }])[0].type).toBe("other");
    expect(shapeFeed([{ type: "post_approved", surface: "mars", created_at: "2026-11-25T10:00:00Z" }])[0]).toMatchObject({
      type: "post_approved",
      surface: "unknown",
    });
  });

  it("the north star waits only without posts.published_at; with it, 0 is a live answer", () => {
    expect(shapeNorthStar(false, null)).toEqual({ status: "waiting" });
    expect(shapeNorthStar(false, [{ brands: 2, publishing: 5 }])).toEqual({ status: "waiting" });
    expect(shapeNorthStar(true, [{ brands: 2, publishing: 5 }])).toEqual({ status: "live", brands: 2, publishing: 5 });
    expect(shapeNorthStar(true, [{ brands: 0, publishing: 0 }])).toEqual({ status: "live", brands: 0, publishing: 0 });
    expect(shapeNorthStar(true, [])).toEqual({ status: "live", brands: 0, publishing: 0 });
    expect(shapeNorthStar(true, null)).toEqual({ status: "unavailable" });
  });

  it("quality and error rows keep counts and categories only", () => {
    expect(shapeQuality([{ approvals: "25", edited: 7, errors: 3, telegram_id: TG_ID, visitor: "v:0123456789abcdef" }])).toEqual({
      approvals: 25,
      edited: 7,
      rewritten: 0,
      pictures_redone: 0,
      rejected: 0,
      errors: 3,
      error_people: 0,
      trials: 0,
    });
    expect(shapeQuality([])).toMatchObject({ approvals: 0, trials: 0 });
    const errors = shapeErrors([
      { route: "uslub/posts", code: "budget_exhausted", count: 6, telegram_id: TG_ID },
      { route: `uslub/brand/${UUID}`, code: "brand_not_found", count: 2 },
      { route: "uslub/brand/8123456789", code: "brand_not_found", count: 1 },
      { route: "uslub/plan", code: "Secret text with spaces", count: 4 },
      { route: "uslub/plan", code: "ai_busy", count: 0 },
    ]);
    expect(errors).toEqual([
      { route: "uslub/posts", code: "budget_exhausted", count: 6 },
      { route: "uslub/plan", code: "other", count: 4 },
      { route: "other", code: "brand_not_found", count: 3 },
    ]);
    expect(JSON.stringify(errors)).not.toContain(UUID);
    expect(JSON.stringify(errors)).not.toContain(String(TG_ID));
  });
});

describe("readStats", () => {
  beforeEach(() => forgetPublishedAt());

  const fakeSql = (hasPublishedAt: boolean, northStar: "ok" | "zero" | "fails" = "ok") => {
    const calls: { count: number; opts: unknown }[] = [];
    const transaction = vi.fn(async (queries: unknown[], opts: unknown) => {
      calls.push({ count: queries.length, opts });
      if (queries.length === 1) {
        if (northStar === "fails") throw new Error("statement timeout");
        return [[northStar === "zero" ? { brands: 0, publishing: 0 } : { brands: 1, publishing: 3, telegram_id: TG_ID }]];
      }
      return [
        [{ span: "today", landing_visitors: 5 }],
        [{ surface: "web", brands: 2, with_posts: 2, brand_id: UUID }],
        [{ source: "instagram", count: 4 }],
        [{ source: null, count: 2 }],
        [{ first_name: "Ali", username: "ali", first_seen: "2026-11-25T10:00:00Z", last_seen: null, telegram_id: TG_ID }],
        [{ type: "start", surface: "bot", created_at: "2026-11-25T10:00:00Z", telegram_id: TG_ID }],
        [{ approvals: 4, edited: 1, errors: 2, error_people: 1 }],
        [{ route: "uslub/posts", code: "ai_busy", count: 2 }],
        [{ has_published_at: hasPublishedAt }],
      ];
    });
    return { sql: Object.assign((...args: Parameters<typeof sql>) => sql(...args), sql, { transaction }) as unknown as Sql, calls };
  };

  it("runs everything in one read-only snapshot and waits for autopilot without posts.published_at", async () => {
    const { sql: s, calls } = fakeSql(false);
    const stats = await readStats(s, base);
    expect(calls).toEqual([{ count: 9, opts: { readOnly: true, isolationLevel: "RepeatableRead" } }]);
    expect(stats.northStar).toEqual({ status: "waiting" });
    expect(stats.teamConfigured).toBe(true);
    expect(stats.landingSources).toEqual([{ source: "instagram", count: 4 }]);
    expect(stats.telegramSources).toEqual([{ source: "direct", count: 2 }]);
    expect(stats.quality).toMatchObject({ approvals: 4, edited: 1, errors: 2, error_people: 1 });
    expect(stats.errors).toEqual([{ route: "uslub/posts", code: "ai_busy", count: 2 }]);
    expect(JSON.stringify(stats)).not.toContain(String(TG_ID));
    expect(JSON.stringify(stats)).not.toContain(UUID);
  });

  it("asks for the north star once posts.published_at exists", async () => {
    const { sql: s, calls } = fakeSql(true);
    const stats = await readStats(s, { ...base, teamIds: [] });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({ count: 1, opts: { readOnly: true } });
    expect(stats.northStar).toEqual({ status: "live", brands: 1, publishing: 3 });
    expect(stats.teamConfigured).toBe(false);
  });

  it("with posts.published_at but nothing published yet, the north star is a live 0, not a wait", async () => {
    const { sql: s } = fakeSql(true, "zero");
    expect((await readStats(s, base)).northStar).toEqual({ status: "live", brands: 0, publishing: 0 });
  });

  it("a failed north star leaves the rest of the page intact", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sql: s } = fakeSql(true, "fails");
    const stats = await readStats(s, base);
    expect(stats.northStar).toEqual({ status: "unavailable" });
    expect(stats.overview[0].landing_visitors).toBe(5);
    expect(stats.users).toHaveLength(1);
    expect(stats.feed).toHaveLength(1);
    expect(error).toHaveBeenCalledWith("[stats] north star:", "statement timeout");
    error.mockRestore();
  });
});
