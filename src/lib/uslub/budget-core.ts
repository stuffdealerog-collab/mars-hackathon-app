import "server-only";
import { anonIpKey } from "../anon-key";
import { getSql, isDbConfigured, pgErrorCode } from "@/lib/db";

/**
 * Daily ceiling on Claude spend, shared by every server instance and by the API and the bot (the per-IP rate
 * limiter in http.ts and the bot's onboarding gate are per instance and per hour at most). Every Claude run takes
 * units before its first call:
 *
 *   CLAUDE_DAILY_LIMIT       units per rolling 24 h for the whole app, default 1500
 *   CLAUDE_ANON_DAILY_LIMIT  units per rolling 24 h per anonymous web caller (hashed IP), default 60
 *
 * A unit is one route run (a brand, an audit, a plan, a batch of posts…); an anonymous "write them again" and a
 * bot onboarding (brand + posts) cost 2. Verified Telegram users (Mini App, bot, desktop handoff) only count
 * toward the app-wide limit. Units are rows in `events` (type "claude_run", no raw IP), checked and inserted in one
 * transaction behind an advisory lock, so concurrent requests cannot overshoot. If the database cannot answer, the
 * run goes through (the Anthropic workspace spend limit is the backstop): a broken counter must not take the app down.
 * Pure of the HTTP layer so the bot can use it too (budget.ts wraps it for API routes).
 */

const LOCK = 7_310_524_002;
const DAY_MS = 24 * 3600_000;

export type BudgetLimits = { daily: number; anonDaily: number };

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v != null && v.trim() !== "" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};

export function budgetLimits(env: Record<string, string | undefined> = process.env): BudgetLimits {
  return { daily: num(env.CLAUDE_DAILY_LIMIT, 1500), anonDaily: num(env.CLAUDE_ANON_DAILY_LIMIT, 60) };
}

/** Who spends: the Telegram user, else a keyed hash of the IP (anon-key.ts; raw IPs are never stored). */
export function spenderKey(telegramId: number | null, ip: string): string {
  if (telegramId != null) return `tg:${telegramId}`;
  return anonIpKey(ip, "claude");
}

export type SpendResult = "ok" | "app" | "anonymous";

/** In-memory ledger for dev and tests (no database). */
const mem: { at: number; actor: string; w: number }[] = [];

export function resetBudgetMemory(): void {
  mem.length = 0;
}

/** Takes `weight` units for `actor` if both limits allow it. */
export async function takeUnits(args: { actor: string; anonymous: boolean; weight: number; route: string; now?: number; limits?: BudgetLimits }): Promise<SpendResult> {
  const limits = args.limits ?? budgetLimits();
  const now = args.now ?? Date.now();
  const w = Math.max(1, Math.round(args.weight));
  const anonCap = args.anonymous ? limits.anonDaily : Number.MAX_SAFE_INTEGER;
  if (!isDbConfigured()) {
    const live = mem.filter((x) => now - x.at < DAY_MS);
    mem.splice(0, mem.length, ...live);
    const total = live.reduce((a, x) => a + x.w, 0);
    const mine = live.filter((x) => x.actor === args.actor).reduce((a, x) => a + x.w, 0);
    if (total + w > limits.daily) return "app";
    if (mine + w > anonCap) return "anonymous";
    mem.push({ at: now, actor: args.actor, w });
    return "ok";
  }
  const sql = getSql();
  const since = new Date(now - DAY_MS).toISOString();
  const props = JSON.stringify({ actor: args.actor, w, route: args.route });
  const sums = sql`SELECT coalesce(sum((props->>'w')::int), 0)::int AS total,
                          coalesce(sum((props->>'w')::int) FILTER (WHERE props->>'actor' = ${args.actor}), 0)::int AS mine
                   FROM events WHERE type = 'claude_run' AND created_at >= ${since}`;
  try {
    const res = await sql.transaction([
      sql`SELECT pg_advisory_xact_lock(${LOCK})`,
      sums,
      sql`INSERT INTO events (telegram_id, type, props)
          SELECT ${args.actor.startsWith("tg:") ? Number(args.actor.slice(3)) : null}, 'claude_run', ${props}::jsonb
          FROM (SELECT coalesce(sum((props->>'w')::int), 0) AS total,
                       coalesce(sum((props->>'w')::int) FILTER (WHERE props->>'actor' = ${args.actor}), 0) AS mine
                FROM events WHERE type = 'claude_run' AND created_at >= ${since}) c
          WHERE c.total + ${w} <= ${limits.daily} AND c.mine + ${w} <= ${anonCap}
          RETURNING id`,
    ]);
    if ((res[2] as unknown[]).length) return "ok";
    const c = (res[1] as { total: number; mine: number }[])[0] ?? { total: 0, mine: 0 };
    return c.total + w > limits.daily ? "app" : "anonymous";
  } catch (err) {
    console.warn("[budget] counter unavailable, letting the request through:", pgErrorCode(err) ?? (err instanceof Error ? err.message : err));
    return "ok";
  }
}
