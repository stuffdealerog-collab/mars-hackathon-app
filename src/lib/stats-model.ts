import { z } from "zod";
import { bucketSources, type SourceCount } from "./source-category";

/**
 * The /stats dashboard's options and output shapes (pure: no I/O, no server-only imports, so the page and the tests
 * share them). Every shape is parsed with zod, which drops any key it does not name: ids (Telegram ids, brand and post
 * ids), visitor keys and raw props never reach the page even if a query returned them.
 */

export const STATS_TIMEZONE = "Asia/Tashkent";

export const STATS_RANGES = ["today", "7d", "30d", "all"] as const;
export type StatsRange = (typeof STATS_RANGES)[number];

export const OVERVIEW_SPANS = ["today", "7d", "30d"] as const;
export type OverviewSpan = (typeof OVERVIEW_SPANS)[number];

export const STATS_SURFACES = ["web", "miniapp", "bot", "unknown"] as const;
export type StatsSurface = (typeof STATS_SURFACES)[number];

/** What the page asked for: `?range=today|7d|30d|all&dev=1&team=1`. */
export type StatsQuery = { range: StatsRange; includeDev: boolean; includeTeam: boolean };

/** The query plus the team ids to leave out (from STATS_TEAM_TG_IDS). */
export type StatsOptions = StatsQuery & { teamIds: number[] };

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const flag = (value: string | string[] | undefined) => ["1", "true", "yes", "on"].includes(first(value)?.trim().toLowerCase() ?? "");

export function parseStatsQuery(params: SearchParams = {}): StatsQuery {
  const range = first(params.range)?.trim().toLowerCase();
  return {
    range: (STATS_RANGES as readonly string[]).includes(range ?? "") ? (range as StatsRange) : "7d",
    includeDev: flag(params.dev),
    includeTeam: flag(params.team),
  };
}

/** The `?…` for a link that changes one option and keeps the others (defaults are left out). */
export function statsHref(query: StatsQuery, patch: Partial<StatsQuery> = {}): string {
  const next = { ...query, ...patch };
  const params = new URLSearchParams();
  if (next.range !== "7d") params.set("range", next.range);
  if (next.includeDev) params.set("dev", "1");
  if (next.includeTeam) params.set("team", "1");
  const qs = params.toString();
  return qs ? `/stats?${qs}` : "/stats";
}

/** STATS_TEAM_TG_IDS: Telegram user ids separated by commas, spaces or semicolons. Anything else is ignored. */
export function parseTeamIds(raw: string | null | undefined): number[] {
  const ids = new Set<number>();
  for (const part of (raw ?? "").split(/[\s,;]+/)) {
    if (!/^\d{1,15}$/.test(part)) continue;
    const id = Number(part);
    if (Number.isSafeInteger(id) && id > 0) ids.add(id);
  }
  return [...ids];
}

// ------------------------------------------------------------------------------------------------- row schemas

const int = z.coerce.number().int().nonnegative().catch(0);
const isoDate = z.coerce.date().transform((d) => d.toISOString());
const surface = z.enum(STATS_SURFACES).catch("unknown");

const OverviewRowSchema = z.object({
  span: z.enum(OVERVIEW_SPANS),
  landing_visitors: int,
  studio_visitors: int,
  studio_users: int,
  miniapp_users: int,
  bot_users: int,
  customers: int,
  tg_active: int,
  tg_new: int,
  tg_returning: int,
});
export type OverviewRow = z.infer<typeof OverviewRowSchema>;

const FunnelRowSchema = z.object({
  surface,
  brands: int,
  with_posts: int,
  with_approved: int,
  with_published: int,
  with_taps: int,
  posts: int,
  approved: int,
  published: int,
  taps: int,
});
export type FunnelRow = z.infer<typeof FunnelRowSchema>;

const SourceRowSchema = z.object({ source: z.string().nullable(), count: int });

const UserRowSchema = z.object({
  first_name: z.string().nullable().catch(null),
  username: z.string().nullable().catch(null),
  first_seen: isoDate,
  last_seen: isoDate.nullable().catch(null),
  bot: z.boolean().catch(false),
  miniapp: z.boolean().catch(false),
  web: z.boolean().catch(false),
  brands: int,
  posts: int,
  approved: int,
  published: int,
});

export type UserRow = {
  name: string;
  username: string | null;
  firstSeen: string;
  lastSeen: string | null;
  surfaces: Exclude<StatsSurface, "unknown">[];
  brands: number;
  posts: number;
  approved: number;
  published: number;
};

const FeedRowSchema = z.object({ type: z.string(), surface, created_at: isoDate });
export type FeedRow = { type: string; surface: StatsSurface; at: string };

const NorthStarRowSchema = z.object({ brands: int, publishing: int });
export type NorthStar = { status: "waiting" } | { status: "live"; brands: number; publishing: number };

export type Stats = {
  query: StatsQuery;
  teamConfigured: boolean;
  northStar: NorthStar;
  overview: OverviewRow[];
  funnel: FunnelRow[];
  landingSources: SourceCount[];
  telegramSources: SourceCount[];
  users: UserRow[];
  feed: FeedRow[];
};

export type StatsResult =
  | { ok: true; stats: Stats; generatedAt: string }
  | { ok: false; error: "not_configured" | "query_failed"; generatedAt: string };

// ----------------------------------------------------------------------------------------------------- shaping

/** A Telegram username as shown: Telegram's own alphabet, at most 32 characters, else nothing. */
export function cleanUsername(value: string | null | undefined): string | null {
  const name = value?.trim().replace(/^@/, "") ?? "";
  return /^[A-Za-z0-9_]{1,32}$/.test(name) ? name : null;
}

/** A first name as shown: control characters removed, at most 64 characters. */
export function cleanName(value: string | null | undefined): string {
  return (value ?? "").replace(/[\p{Cc}\p{Cf}]/gu, "").trim().slice(0, 64);
}

/** Overview rows in today / 7d / 30d order; a missing span reads as zeros. */
export function shapeOverview(rows: unknown[]): OverviewRow[] {
  const bySpan = new Map(rows.map((r) => OverviewRowSchema.safeParse(r)).filter((r) => r.success).map((r) => [r.data.span, r.data]));
  return OVERVIEW_SPANS.map((span) => bySpan.get(span) ?? OverviewRowSchema.parse({ span }));
}

/** Funnel rows merged per surface (web, Mini App, bot, then unknown), with an "all" total computed by the page. */
export function shapeFunnel(rows: unknown[]): FunnelRow[] {
  const merged = new Map<StatsSurface, FunnelRow>();
  for (const raw of rows) {
    const parsed = FunnelRowSchema.safeParse(raw);
    if (!parsed.success) continue;
    const row = parsed.data;
    const prev = merged.get(row.surface);
    merged.set(row.surface, prev ? sumFunnel([prev, row], row.surface) : row);
  }
  return STATS_SURFACES.flatMap((s) => (merged.has(s) ? [merged.get(s)!] : []));
}

export function sumFunnel(rows: FunnelRow[], as: StatsSurface = "unknown"): FunnelRow {
  const total: FunnelRow = { surface: as, brands: 0, with_posts: 0, with_approved: 0, with_published: 0, with_taps: 0, posts: 0, approved: 0, published: 0, taps: 0 };
  for (const row of rows) {
    for (const key of Object.keys(total) as (keyof FunnelRow)[]) {
      if (key !== "surface") total[key] += row[key];
    }
  }
  return total;
}

/** Sources re-read as categories (bucketSources drops any id that slipped in) and merged; none reads "direct". */
export function shapeSources(rows: unknown[]): SourceCount[] {
  return bucketSources(rows.map((r) => SourceRowSchema.safeParse(r)).filter((r) => r.success).map((r) => r.data));
}

export function shapeUsers(rows: unknown[]): UserRow[] {
  const out: UserRow[] = [];
  for (const raw of rows) {
    const parsed = UserRowSchema.safeParse(raw);
    if (!parsed.success) continue;
    const r = parsed.data;
    const surfaces: UserRow["surfaces"] = [];
    if (r.bot) surfaces.push("bot");
    if (r.miniapp) surfaces.push("miniapp");
    if (r.web) surfaces.push("web");
    out.push({
      name: cleanName(r.first_name),
      username: cleanUsername(r.username),
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
      surfaces,
      brands: r.brands,
      posts: r.posts,
      approved: r.approved,
      published: r.published,
    });
  }
  return out;
}

/** Event names are written by our code; anything that does not look like one is shown as "other". */
export function shapeFeed(rows: unknown[]): FeedRow[] {
  return rows
    .map((r) => FeedRowSchema.safeParse(r))
    .filter((r) => r.success)
    .map(({ data }) => ({ type: /^[a-z][a-z0-9_]{0,40}$/.test(data.type) ? data.type : "other", surface: data.surface, at: data.created_at }));
}

export function shapeNorthStar(hasPublishedAt: boolean, rows: unknown[] | null): NorthStar {
  if (!hasPublishedAt || !rows) return { status: "waiting" };
  const parsed = NorthStarRowSchema.safeParse(rows[0] ?? {});
  return parsed.success ? { status: "live", brands: parsed.data.brands, publishing: parsed.data.publishing } : { status: "live", brands: 0, publishing: 0 };
}
