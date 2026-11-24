import "server-only";
import { randomUUID } from "node:crypto";
import { getSql, isDbConfigured, pgErrorCode } from "@/lib/db";
import { type ChannelSummary, type Niche, summarize } from "./bench";
import seed from "./bench-seed.json";
import type { Snapshot, StoredPlan, StoredPlanItem } from "./learn";
import { features } from "./stats";
import type { ChannelData, ChannelStats } from "./types";

/**
 * The Brain's memory (Neon Postgres, best-effort). Every scrape adds view
 * snapshots and a channel summary; plans keep their tracked links; the owner's
 * order reports close the loop. A missing table or database never breaks an
 * answer: reads return empty, writes are skipped (in-memory fallback in dev).
 */

const mem = {
  snapshots: [] as { channel: string; postId: number; ageHours: number; views: number; capturedAt: number }[],
  summaries: [] as ChannelSummary[],
  plans: [] as (StoredPlan & { brandId?: string; ownerTelegramId?: number | null })[],
  outcomes: [] as { planId: string; slot: number | null; kind: string; value: number; telegramId: number | null; at: number }[],
};

const lastRecorded = new Map<string, number>();
const RECORD_EVERY_MS = 20 * 60_000;

function soft<T>(what: string, fallback: T) {
  return (err: unknown): T => {
    const code = pgErrorCode(err);
    if (code !== "42P01") console.warn(`[brain/memory] ${what} failed`, code ?? (err instanceof Error ? err.message : err));
    return fallback;
  };
}

const srcOf = (p: { links: string[]; text: string }) => {
  for (const s of [...p.links, p.text]) {
    const m = /[?&]start=(src_[\w-]{1,60})/.exec(s);
    if (m) return m[1];
  }
  return null;
};

/** Saves view snapshots of every scraped post and one channel summary (throttled to once per 20 min per channel). */
export async function recordAnalysis(data: ChannelData, stats: ChannelStats, niche: Niche, now = Date.now()): Promise<void> {
  const ch = data.channel.toLowerCase();
  if (now - (lastRecorded.get(ch) ?? 0) < RECORD_EVERY_MS) return;
  lastRecorded.set(ch, now);
  const posts = data.posts.filter((p) => p.views != null);
  const summary = summarize(stats, niche, new Date(now).toISOString());
  if (!isDbConfigured()) {
    for (const p of posts) mem.snapshots.push({ channel: ch, postId: p.id, ageHours: (now - Date.parse(p.postedAt)) / 3_600_000, views: p.views as number, capturedAt: now });
    mem.summaries.push(summary);
    return;
  }
  const sql = getSql();
  const at = new Date(now).toISOString();
  await Promise.all([
    posts.length
      ? sql`
          INSERT INTO brain_post_snapshots (channel, post_id, posted_at, captured_at, age_hours, views, media, is_ad, src)
          SELECT ${ch}, x.post_id, x.posted_at, ${at}::timestamptz, x.age_hours, x.views, x.media, x.is_ad, x.src
          FROM unnest(${posts.map((p) => p.id)}::int[], ${posts.map((p) => p.postedAt)}::timestamptz[],
                      ${posts.map((p) => Math.round(((now - Date.parse(p.postedAt)) / 3_600_000) * 10) / 10)}::real[],
                      ${posts.map((p) => p.views as number)}::int[], ${posts.map((p) => p.media)}::text[],
                      ${posts.map((p) => features(p).isAd)}::boolean[], ${posts.map((p) => srcOf(p))}::text[])
            AS x(post_id, posted_at, age_hours, views, media, is_ad, src)
          ON CONFLICT DO NOTHING
        `.catch(soft("snapshots", undefined))
      : Promise.resolve(),
    sql`
      INSERT INTO brain_channel_stats (channel, niche, subscribers, median_views, reach_rate, posts_per_week, mature_posts, suspect, stats, captured_at)
      VALUES (${ch}, ${niche}, ${summary.subscribers ?? null}, ${summary.medianViews ?? null}, ${summary.reachRate ?? null},
              ${summary.postsPerWeek}, ${summary.maturePosts}, ${summary.suspect}, ${JSON.stringify(summary)}::jsonb, ${at}::timestamptz)
    `.catch(soft("channel stats", undefined)),
  ]);
}

let summaryCache: { at: number; rows: ChannelSummary[] } | null = null;

/** Seed (golden set, committed) + the latest DB summary per channel from the last 90 days. Cached 10 min. */
export async function loadSummaries(now = Date.now()): Promise<ChannelSummary[]> {
  if (summaryCache && now - summaryCache.at < 10 * 60_000) return summaryCache.rows;
  let rows: ChannelSummary[] = [...(seed as unknown as ChannelSummary[])];
  if (!isDbConfigured()) rows = [...rows, ...mem.summaries];
  else {
    const db = (await getSql()`
      SELECT DISTINCT ON (channel) stats FROM brain_channel_stats
      WHERE captured_at > now() - interval '90 days'
      ORDER BY channel, captured_at DESC
    `.catch(soft("load summaries", []))) as { stats: ChannelSummary }[];
    rows = [...rows, ...db.map((r) => r.stats).filter((s) => s && s.channel)];
  }
  summaryCache = { at: now, rows };
  return rows;
}

/* ------------------------------------------------------------------ plans */

export function newPlanTag(): string {
  return randomUUID().replace(/-/g, "").slice(0, 6);
}

export async function savePlan(p: {
  tag: string;
  brandId?: string | null;
  ownerTelegramId?: number | null;
  channel?: string;
  weekOf: string;
  items: StoredPlanItem[];
  baseline: StoredPlan["baseline"];
}): Promise<string | null> {
  const channel = p.channel?.replace(/^@/, "").toLowerCase() ?? null;
  if (!isDbConfigured()) {
    const id = randomUUID();
    mem.plans.push({ id, tag: p.tag, channel: channel ?? undefined, weekOf: p.weekOf, items: p.items, baseline: p.baseline, createdAt: new Date().toISOString(), brandId: p.brandId ?? undefined, ownerTelegramId: p.ownerTelegramId });
    return id;
  }
  const rows = (await getSql()`
    INSERT INTO brain_plans (tag, brand_id, owner_telegram_id, channel, week_of, items, baseline)
    VALUES (${p.tag}, ${p.brandId ?? null}, ${p.ownerTelegramId ?? null}, ${channel}, ${p.weekOf}::date,
            ${JSON.stringify(p.items)}::jsonb, ${JSON.stringify(p.baseline)}::jsonb)
    RETURNING id
  `.catch(soft("save plan", []))) as { id: string }[];
  return rows[0]?.id ?? null;
}

type PlanRow = { id: string; tag: string; channel: string | null; week_of: string | Date; items: StoredPlanItem[]; baseline: StoredPlan["baseline"]; created_at: string | Date };
const toPlan = (r: PlanRow): StoredPlan => ({
  id: r.id,
  tag: r.tag,
  channel: r.channel ?? undefined,
  weekOf: r.week_of instanceof Date ? r.week_of.toISOString().slice(0, 10) : String(r.week_of).slice(0, 10),
  items: r.items ?? [],
  baseline: r.baseline ?? {},
  createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
});

/** Most recent plans of a channel (or brand), newest first. */
export async function loadPlans(q: { channel?: string; brandId?: string; limit?: number }): Promise<StoredPlan[]> {
  const limit = q.limit ?? 6;
  const channel = q.channel?.replace(/^@/, "").toLowerCase();
  if (!channel && !q.brandId) return [];
  if (!isDbConfigured())
    return mem.plans
      .filter((p) => (channel && p.channel === channel) || (q.brandId && p.brandId === q.brandId))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, limit);
  const rows = (await (channel
    ? getSql()`SELECT id, tag, channel, week_of, items, baseline, created_at FROM brain_plans WHERE channel = ${channel} ORDER BY created_at DESC LIMIT ${limit}`
    : getSql()`SELECT id, tag, channel, week_of, items, baseline, created_at FROM brain_plans WHERE brand_id = ${q.brandId as string} ORDER BY created_at DESC LIMIT ${limit}`
  ).catch(soft("load plans", []))) as PlanRow[];
  return rows.map(toPlan);
}

/**
 * A brand was just claimed in the bot: its plans made on the web (no owner yet) now belong to that Telegram user,
 * so their tracked links pass leads on and /natija finds them. Plans that already have an owner are left alone.
 */
export async function adoptBrandPlans(brandId: string, telegramId: number): Promise<void> {
  if (!isDbConfigured()) {
    for (const p of mem.plans) if (p.brandId === brandId && p.ownerTelegramId == null) p.ownerTelegramId = telegramId;
    return;
  }
  await getSql()`
    UPDATE brain_plans SET owner_telegram_id = ${telegramId} WHERE brand_id = ${brandId} AND owner_telegram_id IS NULL
  `.catch(soft("adopt plans", undefined));
}

/** Latest plan created by this Telegram user (for the bot's /natija). */
export async function latestPlanForOwner(telegramId: number): Promise<StoredPlan | null> {
  if (!isDbConfigured()) {
    const own = mem.plans.filter((p) => p.ownerTelegramId === telegramId);
    return own.at(-1) ?? null;
  }
  const rows = (await getSql()`
    SELECT id, tag, channel, week_of, items, baseline, created_at FROM brain_plans
    WHERE owner_telegram_id = ${telegramId} ORDER BY created_at DESC LIMIT 1
  `.catch(soft("latest plan", []))) as PlanRow[];
  return rows[0] ? toPlan(rows[0]) : null;
}

/**
 * The plan behind a tracked link and who receives its leads: the Telegram user who made the plan, else the
 * brand's owner (a plan made on the web before the brand was claimed in the bot has no owner of its own).
 */
export async function planByTag(tag: string): Promise<(StoredPlan & { ownerTelegramId: number | null }) | null> {
  if (!/^[a-z0-9]{6}$/.test(tag)) return null;
  if (!isDbConfigured()) {
    const p = mem.plans.find((x) => x.tag === tag);
    return p ? { ...p, ownerTelegramId: p.ownerTelegramId ?? null } : null;
  }
  const rows = (await getSql()`
    SELECT p.id, p.tag, p.channel, p.week_of, p.items, p.baseline, p.created_at,
           COALESCE(p.owner_telegram_id, b.owner_telegram_id) AS owner_telegram_id
    FROM brain_plans p LEFT JOIN brands b ON b.id = p.brand_id
    WHERE p.tag = ${tag}
  `.catch(soft("plan by tag", []))) as (PlanRow & { owner_telegram_id: string | number | null })[];
  const r = rows[0];
  return r ? { ...toPlan(r), ownerTelegramId: r.owner_telegram_id == null ? null : Number(r.owner_telegram_id) } : null;
}

/* --------------------------------------------------------------- measures */

export async function loadSnapshots(channel: string, postIds: number[]): Promise<Map<number, Snapshot[]>> {
  const out = new Map<number, Snapshot[]>();
  const ch = channel.replace(/^@/, "").toLowerCase();
  if (!postIds.length) return out;
  const push = (s: Snapshot) => out.set(s.postId, [...(out.get(s.postId) ?? []), s]);
  if (!isDbConfigured()) {
    for (const s of mem.snapshots) if (s.channel === ch && postIds.includes(s.postId)) push({ postId: s.postId, ageHours: s.ageHours, views: s.views });
    return out;
  }
  const rows = (await getSql()`
    SELECT post_id, age_hours, views FROM brain_post_snapshots
    WHERE channel = ${ch} AND post_id = ANY(${postIds}::int[]) AND views IS NOT NULL
  `.catch(soft("load snapshots", []))) as { post_id: number; age_hours: number; views: number }[];
  for (const r of rows) push({ postId: r.post_id, ageHours: Number(r.age_hours), views: r.views });
  return out;
}

/** Unique Telegram users who opened the bot through each tracked link. */
export async function startsBySrc(srcs: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!srcs.length || !isDbConfigured()) return out;
  const rows = (await getSql()`
    SELECT props->>'payload' AS src, count(DISTINCT telegram_id)::int AS n FROM events
    WHERE type = 'start' AND props->>'payload' = ANY(${srcs}::text[])
    GROUP BY 1
  `.catch(soft("starts", []))) as { src: string; n: number }[];
  for (const r of rows) out.set(r.src, r.n);
  return out;
}

export const ORDER_BUCKETS: Record<string, { value: number; label: string }> = {
  "0": { value: 0, label: "0" },
  "1": { value: 2, label: "1–3" },
  "4": { value: 7, label: "4–10" },
  "10": { value: 12, label: "10+" },
};

export async function recordOutcome(planId: string, slot: number | null, kind: "orders_week" | "sold", value: number, telegramId: number | null): Promise<void> {
  if (!isDbConfigured()) {
    mem.outcomes.push({ planId, slot, kind, value, telegramId, at: Date.now() });
    return;
  }
  await getSql()`
    INSERT INTO brain_outcomes (plan_id, slot, kind, value, telegram_id) VALUES (${planId}, ${slot}, ${kind}, ${value}, ${telegramId})
  `.catch(soft("record outcome", undefined));
}

/** Owner reports for these plans: latest weekly order bucket per plan and sales per slot. */
export async function loadOutcomes(plans: StoredPlan[]): Promise<{ weekOrders: Map<string, number>; sold: Map<string, number> }> {
  const weekOrders = new Map<string, number>();
  const sold = new Map<string, number>();
  if (!plans.length) return { weekOrders, sold };
  const byId = new Map(plans.map((p) => [p.id, p.tag]));
  let rows: { plan_id: string; slot: number | null; kind: string; value: number }[];
  if (!isDbConfigured()) rows = mem.outcomes.filter((o) => byId.has(o.planId)).map((o) => ({ plan_id: o.planId, slot: o.slot, kind: o.kind, value: o.value }));
  else
    rows = (await getSql()`
      SELECT plan_id, slot, kind, value FROM brain_outcomes WHERE plan_id = ANY(${[...byId.keys()]}::uuid[]) ORDER BY created_at
    `.catch(soft("load outcomes", []))) as typeof rows;
  for (const r of rows) {
    const tag = byId.get(r.plan_id) as string;
    if (r.kind === "orders_week") weekOrders.set(tag, r.value);
    else if (r.kind === "sold" && r.slot != null) sold.set(`${tag}:${r.slot}`, (sold.get(`${tag}:${r.slot}`) ?? 0) + r.value);
  }
  return { weekOrders, sold };
}

/* -------------------------------------------------------- small JSON cache
 * Keyed JSON values that every instance can reuse (e.g. an audit's written findings). Stored in
 * brain_facts_cache under a prefixed key ("audit:…"), which never collides with a KB sha256: no new table. */

const cacheMem = new Map<string, { at: number; value: unknown }>();

export async function loadBrainCache<T>(key: string, maxAgeMs: number, now = Date.now()): Promise<T | null> {
  const hit = cacheMem.get(key);
  if (hit && now - hit.at < maxAgeMs) return hit.value as T;
  if (!isDbConfigured()) return null;
  const since = new Date(now - maxAgeMs).toISOString();
  const rows = (await getSql()`
    SELECT facts, created_at FROM brain_facts_cache WHERE kb_hash = ${key} AND created_at > ${since}::timestamptz
  `.catch(soft("load cache", []))) as { facts: unknown; created_at: string | Date }[];
  if (!rows[0]) return null;
  cacheMem.set(key, { at: new Date(rows[0].created_at).getTime(), value: rows[0].facts });
  return rows[0].facts as T;
}

export async function saveBrainCache(key: string, value: unknown, now = Date.now()): Promise<void> {
  cacheMem.set(key, { at: now, value });
  if (cacheMem.size > 200) cacheMem.delete(cacheMem.keys().next().value as string);
  if (!isDbConfigured()) return;
  await getSql()`
    INSERT INTO brain_facts_cache (kb_hash, facts) VALUES (${key}, ${JSON.stringify(value)}::jsonb)
    ON CONFLICT (kb_hash) DO UPDATE SET facts = EXCLUDED.facts, created_at = now()
  `.catch(soft("save cache", undefined));
}

/* ------------------------------------------------------ latest plan view
 * What the owner last saw for a brand's plan (plan items with briefs and CTAs, the strategy, owner questions),
 * so the Studio can reopen the week plan after a reload. One per brand, the newest wins; kept 30 days. */

export const PLAN_VIEW_MS = 30 * 86_400_000;

export type PlanView = {
  mode: "channel" | "fresh";
  plan: unknown;
  strategy: unknown;
  ownerQuestions: string[];
  planTag: string | null;
  launch?: unknown;
  lang?: string;
  createdAt: string;
};

export async function savePlanView(brandId: string, view: PlanView): Promise<void> {
  await saveBrainCache(`planview:${brandId}`, view);
}

export async function loadPlanView(brandId: string): Promise<PlanView | null> {
  return loadBrainCache<PlanView>(`planview:${brandId}`, PLAN_VIEW_MS);
}

/* ------------------------------------------------------------ facts cache */

const factsMem = new Map<string, { at: number; facts: unknown[] }>();

/** Cached D0 facts for a knowledge-base hash (7 days). */
export async function loadFactsCache(hash: string): Promise<unknown[] | null> {
  if (!isDbConfigured()) return factsMem.get(hash)?.facts ?? null;
  const rows = (await getSql()`
    SELECT facts FROM brain_facts_cache WHERE kb_hash = ${hash} AND created_at > now() - interval '7 days'
  `.catch(soft("load facts cache", []))) as { facts: unknown[] }[];
  return rows[0]?.facts ?? null;
}

export async function saveFactsCache(hash: string, facts: unknown[]): Promise<void> {
  if (!isDbConfigured()) {
    factsMem.set(hash, { at: Date.now(), facts });
    return;
  }
  await getSql()`
    INSERT INTO brain_facts_cache (kb_hash, facts) VALUES (${hash}, ${JSON.stringify(facts)}::jsonb)
    ON CONFLICT (kb_hash) DO UPDATE SET facts = EXCLUDED.facts, created_at = now()
  `.catch(soft("save facts cache", undefined));
}
