import "server-only";
import { getSql, isDbConfigured } from "../db";
import type { AutopilotState, BotAdminStatus, PlanSlot, Script } from "../uslub/contract";

/**
 * The autopilot's database work: the publish queue, the brand's autopilot state, channel signals (subscribers,
 * views, reactions, joins) and the weekly runs. Tagged-template SQL only. Without DATABASE_URL (local dev, tests)
 * every read is empty and every write is a no-op: the autopilot needs the shared database and does nothing without it.
 *
 * Channel keys are the public username in lowercase without @ (as brands.channel stores it).
 */

export type QueueStatus = "queued" | "sending" | "sent" | "blocked" | "failed" | "expired" | "unknown";

export interface QueueRow {
  postId: string;
  brandId: string;
  ownerTelegramId: number;
  chat: string;
  script: Script;
  dueAt: number;
  textHash: string;
  status: QueueStatus;
  attempts: number;
  lastError: string | null;
  /** The status before this call changed it (claims and expiries). */
  prev?: QueueStatus;
}

type RawQueue = {
  post_id: string;
  brand_id: string;
  owner_telegram_id: string | number;
  chat: string;
  script: string;
  due_at: string | Date;
  text_hash: string;
  status: string;
  attempts: number;
  last_error: string | null;
  prev?: string;
};

const ms = (v: string | Date) => (v instanceof Date ? v.getTime() : Date.parse(v));

/** A query's rows, typed (the Neon client answers with untyped rows). */
const rowsOf = <T,>(q: PromiseLike<unknown>): Promise<T[]> => Promise.resolve(q).then((r) => r as T[]);

const toQueue = (r: RawQueue): QueueRow => ({
  postId: r.post_id,
  brandId: r.brand_id,
  ownerTelegramId: Number(r.owner_telegram_id),
  chat: r.chat,
  script: r.script as Script,
  dueAt: ms(r.due_at),
  textHash: r.text_hash,
  status: r.status as QueueStatus,
  attempts: Number(r.attempts),
  lastError: r.last_error,
  ...(r.prev ? { prev: r.prev as QueueStatus } : {}),
});

export const channelKey = (chat: string) => chat.trim().replace(/^@/, "").toLowerCase();

/* ------------------------------------------------------------------ queue */

/**
 * Queues an approved post for its slot (or re-queues one that failed, expired or was blocked). The same post approved
 * again with the same text and picture keeps its time; a post already sending, sent or in doubt is left alone.
 */
export async function enqueuePost(r: {
  postId: string;
  brandId: string;
  ownerTelegramId: number;
  chat: string;
  script: Script;
  dueAt: number;
  textHash: string;
}): Promise<{ dueAt: number; status: QueueStatus }> {
  if (!isDbConfigured()) return { dueAt: r.dueAt, status: "queued" };
  const sql = getSql();
  const due = new Date(r.dueAt).toISOString();
  const rows = (await sql`
    INSERT INTO publish_queue AS q (post_id, brand_id, owner_telegram_id, chat, script, due_at, text_hash, status, attempts, updated_at)
    VALUES (${r.postId}, ${r.brandId}, ${r.ownerTelegramId}, ${channelKey(r.chat)}, ${r.script}, ${due}, ${r.textHash}, 'queued', 0, now())
    ON CONFLICT (post_id) DO UPDATE SET
      brand_id = EXCLUDED.brand_id,
      owner_telegram_id = EXCLUDED.owner_telegram_id,
      chat = EXCLUDED.chat,
      due_at = CASE WHEN q.status IN ('queued', 'blocked') AND q.text_hash = EXCLUDED.text_hash AND q.script = EXCLUDED.script
                    THEN q.due_at ELSE EXCLUDED.due_at END,
      script = EXCLUDED.script,
      text_hash = EXCLUDED.text_hash,
      status = 'queued',
      attempts = 0,
      last_error = NULL,
      locked_at = NULL,
      notified_at = NULL,
      updated_at = now()
    WHERE q.status IN ('queued', 'blocked', 'failed', 'expired')
    RETURNING due_at, status
  `) as { due_at: string | Date; status: string }[];
  if (rows[0]) return { dueAt: ms(rows[0].due_at), status: rows[0].status as QueueStatus };
  const kept = (await sql`SELECT due_at, status FROM publish_queue WHERE post_id = ${r.postId}`) as { due_at: string | Date; status: string }[];
  return kept[0] ? { dueAt: ms(kept[0].due_at), status: kept[0].status as QueueStatus } : { dueAt: r.dueAt, status: "queued" };
}

/** A send cut off mid-way (the function died): "unknown", never resent on its own. */
export async function markStaleSending(olderThan: number): Promise<QueueRow[]> {
  if (!isDbConfigured()) return [];
  const rows = (await getSql()`
    UPDATE publish_queue SET status = 'unknown', last_error = 'unknown', updated_at = now()
    WHERE status = 'sending' AND locked_at < ${new Date(olderThan).toISOString()}
    RETURNING *
  `) as RawQueue[];
  return rows.map(toQueue);
}

/** Queued or blocked posts more than a day late: "expired", the owner decides. */
export async function expireOverdue(before: number, limit = 50): Promise<QueueRow[]> {
  if (!isDbConfigured()) return [];
  const rows = (await getSql()`
    WITH due AS (
      SELECT post_id, status AS prev FROM publish_queue
      WHERE status IN ('queued', 'blocked') AND due_at < ${new Date(before).toISOString()}
      ORDER BY due_at LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE publish_queue q SET status = 'expired', last_error = 'expired', updated_at = now()
    FROM due WHERE q.post_id = due.post_id
    RETURNING q.*, due.prev
  `) as RawQueue[];
  return rows.map(toQueue);
}

/**
 * Claims the next due post (one statement: two ticks never get the same row). A queued row waits 5 minutes after a
 * failed try, a blocked one (bot not admin) 30 minutes, so one tick never hammers Telegram with the same post.
 */
export async function claimDue(until: number, since: number): Promise<QueueRow | null> {
  if (!isDbConfigured()) return null;
  const rows = (await getSql()`
    WITH due AS (
      SELECT post_id, status AS prev FROM publish_queue
      WHERE due_at <= ${new Date(until).toISOString()} AND due_at >= ${new Date(since).toISOString()}
        AND ((status = 'queued' AND (locked_at IS NULL OR locked_at < now() - interval '5 minutes'))
          OR (status = 'blocked' AND locked_at < now() - interval '30 minutes'))
      ORDER BY due_at LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE publish_queue q SET status = 'sending', locked_at = now(), attempts = q.attempts + 1, updated_at = now()
    FROM due WHERE q.post_id = due.post_id
    RETURNING q.*, due.prev
  `) as RawQueue[];
  return rows[0] ? toQueue(rows[0]) : null;
}

export async function finishQueue(postId: string, status: QueueStatus, error: string | null = null): Promise<void> {
  if (!isDbConfigured()) return;
  const sent = status === "sent";
  await getSql()`
    UPDATE publish_queue SET status = ${status}, last_error = ${error},
      sent_at = CASE WHEN ${sent} THEN now() ELSE sent_at END, updated_at = now()
    WHERE post_id = ${postId}
  `;
}

export async function markNotified(postId: string): Promise<void> {
  if (!isDbConfigured()) return;
  await getSql()`UPDATE publish_queue SET notified_at = now() WHERE post_id = ${postId}`;
}

/** Keeps posts.schedule (PostDraft.schedule) in step with the queue. */
export async function setPostSchedule(postId: string, schedule: { dueAt: string; status: QueueStatus; error?: string } | null): Promise<void> {
  if (!isDbConfigured()) return;
  await getSql()`UPDATE posts SET schedule = ${schedule ? JSON.stringify(schedule) : null}::jsonb WHERE id = ${postId}`;
}

export async function queueForBrand(brandId: string): Promise<{ postId: string; dueAt: number; status: QueueStatus; lastError: string | null; chat: string }[]> {
  if (!isDbConfigured()) return [];
  const rows = (await getSql()`
    SELECT post_id, due_at, status, last_error, chat FROM publish_queue WHERE brand_id = ${brandId} ORDER BY due_at DESC LIMIT 100
  `) as { post_id: string; due_at: string | Date; status: string; last_error: string | null; chat: string }[];
  return rows.map((r) => ({ postId: r.post_id, dueAt: ms(r.due_at), status: r.status as QueueStatus, lastError: r.last_error, chat: r.chat }));
}

/* ------------------------------------------------------------- published */

/**
 * Where and when a post went out (every publish path: the queue, the bot's buttons, the Mini App): message id, chat
 * and time on the post, the plan item it came from (by slot day and time, when the post does not know it yet), and a
 * post_metrics row so its views are read at 24 h and 72 h.
 */
export async function recordPublication(p: { postId: string; brandId: string; chat: string; messageId: number; slot?: Pick<PlanSlot, "day" | "time"> }): Promise<void> {
  if (!isDbConfigured()) return;
  const sql = getSql();
  const chat = channelKey(p.chat);
  let tag: string | null = null;
  let slotNo: number | null = null;
  if (p.slot?.day && p.slot.time) {
    const day = p.slot.day.slice(0, 10);
    const found = (await sql`
      SELECT bp.tag, (it->>'slot')::int AS slot
      FROM brain_plans bp CROSS JOIN LATERAL jsonb_array_elements(bp.items) it
      WHERE bp.brand_id = ${p.brandId} AND left(it->>'day', 10) = ${day} AND it->>'time' = ${p.slot.time}
      ORDER BY bp.created_at DESC LIMIT 1
    `) as { tag: string; slot: number | null }[];
    tag = found[0]?.tag ?? null;
    slotNo = found[0]?.slot ?? null;
  }
  const rows = (await sql`
    UPDATE posts SET message_id = ${p.messageId}, published_chat = ${chat}, published_at = COALESCE(published_at, now()),
      plan_tag = COALESCE(plan_tag, ${tag}), plan_slot = CASE WHEN plan_tag IS NULL THEN ${slotNo} ELSE plan_slot END
    WHERE id = ${p.postId}
    RETURNING published_at
  `) as { published_at: string | Date }[];
  const at = rows[0] ? new Date(ms(rows[0].published_at)).toISOString() : new Date().toISOString();
  await sql`
    INSERT INTO post_metrics (channel, message_id, post_id, published_at, updated_at)
    VALUES (${chat}, ${p.messageId}, ${p.postId}, ${at}, now())
    ON CONFLICT (channel, message_id) DO UPDATE SET post_id = EXCLUDED.post_id, published_at = EXCLUDED.published_at, updated_at = now()
  `;
}

/* ----------------------------------------------------------------- brands */

export interface AutopilotBrandRow {
  autopilot: unknown;
  channelType: string | null;
  goal: string | null;
}

export async function loadAutopilotRow(brandId: string): Promise<AutopilotBrandRow | null> {
  if (!isDbConfigured()) return null;
  const rows = (await getSql()`SELECT autopilot, channel_type, goal FROM brands WHERE id = ${brandId}`) as {
    autopilot: unknown;
    channel_type: string | null;
    goal: string | null;
  }[];
  return rows[0] ? { autopilot: rows[0].autopilot, channelType: rows[0].channel_type, goal: rows[0].goal } : null;
}

/** Writes on/since/trialEndsAt (and clears a pause); the autopilot's other keys (botAdmin…) stay. */
export async function writeAutopilot(brandId: string, state: AutopilotState): Promise<void> {
  if (!isDbConfigured()) return;
  const patch = JSON.stringify({ on: state.on, ...(state.since ? { since: state.since } : {}), ...(state.trialEndsAt ? { trialEndsAt: state.trialEndsAt } : {}) });
  await getSql()`UPDATE brands SET autopilot = (autopilot - 'paused') || ${patch}::jsonb WHERE id = ${brandId}`;
}

/** The owner blocked the bot: nothing is prepared or sent to them until they turn the autopilot on again. */
export async function pauseAutopilot(brandId: string): Promise<void> {
  if (!isDbConfigured()) return;
  await getSql()`UPDATE brands SET autopilot = autopilot || '{"paused":"blocked"}'::jsonb WHERE id = ${brandId}`;
}

/** The bot's rights in a channel, on every brand of that channel. */
export async function saveBotAdmin(channel: string, status: BotAdminStatus): Promise<number> {
  if (!isDbConfigured()) return 0;
  const rows = (await getSql()`
    UPDATE brands SET autopilot = autopilot || jsonb_build_object('botAdmin', ${JSON.stringify(status)}::jsonb)
    WHERE channel = ${channelKey(channel)}
    RETURNING id
  `) as { id: string }[];
  return rows.length;
}

/** Owners of brands on this channel (to tell them when the bot's rights change). */
export async function channelOwners(channel: string): Promise<number[]> {
  if (!isDbConfigured()) return [];
  const rows = (await getSql()`
    SELECT DISTINCT owner_telegram_id FROM brands WHERE channel = ${channelKey(channel)} AND owner_telegram_id IS NOT NULL
  `) as { owner_telegram_id: string | number }[];
  return rows.map((r) => Number(r.owner_telegram_id));
}

/* ------------------------------------------------------------------ users */

export async function userLanguage(telegramId: number): Promise<string | null> {
  if (!isDbConfigured()) return null;
  try {
    const rows = (await getSql()`SELECT language_code FROM app_users WHERE telegram_id = ${telegramId}`) as { language_code: string | null }[];
    return rows[0]?.language_code ?? null;
  } catch {
    return null;
  }
}

/** A button tap counts as the owner being active (only /start, messages and the Mini App did before). */
export async function touchUser(telegramId: number): Promise<void> {
  if (!isDbConfigured()) return;
  await getSql()`
    UPDATE app_users SET last_seen_at = now() WHERE telegram_id = ${telegramId} AND last_seen_at < now() - interval '1 hour'
  `.catch(() => undefined);
}

/* ---------------------------------------------------------------- signals */

/** Channels of owned brands still without today's subscriber count: autopilot on, or the owner seen lately. */
export async function channelsForSnapshot(day: string, activeSince: number, limit: number): Promise<string[]> {
  if (!isDbConfigured()) return [];
  const rows = (await getSql()`
    SELECT DISTINCT b.channel FROM brands b LEFT JOIN app_users u ON u.telegram_id = b.owner_telegram_id
    WHERE b.owner_telegram_id IS NOT NULL AND b.channel IS NOT NULL AND b.channel <> ''
      AND ((b.autopilot->>'on') = 'true' OR u.last_seen_at >= ${new Date(activeSince).toISOString()})
      AND NOT EXISTS (SELECT 1 FROM channel_snapshots s WHERE s.channel = b.channel AND s.day = ${day}::date)
    LIMIT ${limit}
  `) as { channel: string }[];
  return rows.map((r) => r.channel);
}

export async function saveSnapshot(channel: string, day: string, subscribers: number, source: "bot" | "scrape"): Promise<void> {
  if (!isDbConfigured()) return;
  await getSql()`
    INSERT INTO channel_snapshots (channel, day, subscribers, source) VALUES (${channelKey(channel)}, ${day}::date, ${subscribers}, ${source})
    ON CONFLICT (channel, day) DO NOTHING
  `;
}

export interface MetricRow {
  channel: string;
  messageId: number;
  publishedAt: number;
  views24h: number | null;
  views72h: number | null;
}

/** Mercat posts whose 24 h or 72 h reading is due now (24–48 h and 72–120 h after they went out). */
export async function metricsDue(limit = 60): Promise<MetricRow[]> {
  if (!isDbConfigured()) return [];
  const rows = (await getSql()`
    SELECT channel, message_id, published_at, views_24h, views_72h FROM post_metrics
    WHERE post_id IS NOT NULL AND published_at IS NOT NULL
      AND ((views_24h IS NULL AND published_at <= now() - interval '24 hours' AND published_at > now() - interval '48 hours')
        OR (views_72h IS NULL AND published_at <= now() - interval '72 hours' AND published_at > now() - interval '120 hours'))
    ORDER BY published_at LIMIT ${limit}
  `) as { channel: string; message_id: number; published_at: string | Date; views_24h: number | null; views_72h: number | null }[];
  return rows.map((r) => ({ channel: r.channel, messageId: Number(r.message_id), publishedAt: ms(r.published_at), views24h: r.views_24h, views72h: r.views_72h }));
}

export async function saveViews(channel: string, messageId: number, v: { views: number; views24h?: number; views72h?: number }): Promise<void> {
  if (!isDbConfigured()) return;
  await getSql()`
    UPDATE post_metrics SET views = ${v.views},
      views_24h = COALESCE(views_24h, ${v.views24h ?? null}::int), views_72h = COALESCE(views_72h, ${v.views72h ?? null}::int),
      measured_at = now(), updated_at = now()
    WHERE channel = ${channelKey(channel)} AND message_id = ${messageId}
  `;
}

export async function saveReactions(channel: string, messageId: number, total: number, counts: Record<string, number>): Promise<void> {
  if (!isDbConfigured()) return;
  await getSql()`
    INSERT INTO post_metrics (channel, message_id, reactions, reaction_counts, updated_at)
    VALUES (${channelKey(channel)}, ${messageId}, ${total}, ${JSON.stringify(counts)}::jsonb, now())
    ON CONFLICT (channel, message_id) DO UPDATE SET reactions = EXCLUDED.reactions, reaction_counts = EXCLUDED.reaction_counts, updated_at = now()
  `;
}

export async function saveMemberEvent(channel: string, userKey: string, kind: "join" | "leave", inviteLink: string | null): Promise<void> {
  if (!isDbConfigured()) return;
  await getSql()`
    INSERT INTO channel_member_events (channel, user_key, kind, invite_link) VALUES (${channelKey(channel)}, ${userKey}, ${kind}, ${inviteLink})
  `;
}

/* ----------------------------------------------------------------- weekly */

export interface WeeklyBrandRow {
  id: string;
  ownerTelegramId: number;
  channel: string | null;
  autopilot: unknown;
  channelType: string | null;
  goal: string | null;
  lastSeenAt: number | null;
  languageCode: string | null;
}

/** Brands with the autopilot on (owner known), oldest first. */
export async function autopilotBrands(limit = 200): Promise<WeeklyBrandRow[]> {
  if (!isDbConfigured()) return [];
  const rows = (await getSql()`
    SELECT b.id, b.owner_telegram_id, b.channel, b.autopilot, b.channel_type, b.goal, u.last_seen_at, u.language_code
    FROM brands b LEFT JOIN app_users u ON u.telegram_id = b.owner_telegram_id
    WHERE (b.autopilot->>'on') = 'true' AND b.owner_telegram_id IS NOT NULL
    ORDER BY b.created_at LIMIT ${limit}
  `) as {
    id: string;
    owner_telegram_id: string | number;
    channel: string | null;
    autopilot: unknown;
    channel_type: string | null;
    goal: string | null;
    last_seen_at: string | Date | null;
    language_code: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    ownerTelegramId: Number(r.owner_telegram_id),
    channel: r.channel,
    autopilot: r.autopilot,
    channelType: r.channel_type,
    goal: r.goal,
    lastSeenAt: r.last_seen_at == null ? null : ms(r.last_seen_at),
    languageCode: r.language_code,
  }));
}

/**
 * Exactly-once claim of a scheduled job (autopilot_runs). A run that failed, or that started over `retryAfterMin`
 * ago and never finished (the function died), may be claimed again, up to `maxAttempts` in all.
 * Returns the attempt number (1, 2, …), or 0 when the run is taken, done or out of attempts.
 */
export async function claimRun(key: string, brandId: string | null, kind: string, retryAfterMin = 30, maxAttempts = 3): Promise<number> {
  if (!isDbConfigured()) return 0;
  const rows = (await getSql()`
    INSERT INTO autopilot_runs AS r (key, brand_id, kind, status, detail) VALUES (${key}, ${brandId}, ${kind}, 'started', '{"attempts":1}'::jsonb)
    ON CONFLICT (key) DO UPDATE SET status = 'started', updated_at = now(),
      detail = r.detail || jsonb_build_object('attempts', COALESCE((r.detail->>'attempts')::int, 1) + 1)
    WHERE (r.status = 'failed' OR (r.status = 'started' AND r.updated_at < now() - make_interval(mins => ${retryAfterMin})))
      AND COALESCE((r.detail->>'attempts')::int, 1) < ${maxAttempts}
    RETURNING (detail->>'attempts')::int AS attempts
  `) as { attempts: number }[];
  return rows[0] ? Math.max(1, Number(rows[0].attempts) || 1) : 0;
}

export async function finishRun(key: string, status: "done" | "failed" | "skipped", detail: Record<string, number | string> = {}): Promise<void> {
  if (!isDbConfigured()) return;
  await getSql()`UPDATE autopilot_runs SET status = ${status}, detail = detail || ${JSON.stringify(detail)}::jsonb, updated_at = now() WHERE key = ${key}`;
}

export interface WeekNumbers {
  planned: number;
  published: { hook: string; url: string | null; views72: number | null; views: number | null; reactions: number | null }[];
  starts: number;
  hasLinks: boolean;
  snapshots: { day: string; subscribers: number }[];
}

/** Last week's raw numbers for the Monday report. */
export async function weekNumbers(brandId: string, channel: string | null, w: { start: number; end: number; weekOf: string; thisWeekOf: string }): Promise<WeekNumbers> {
  const empty: WeekNumbers = { planned: 0, published: [], starts: 0, hasLinks: false, snapshots: [] };
  if (!isDbConfigured()) return empty;
  const sql = getSql();
  const start = new Date(w.start).toISOString();
  const end = new Date(w.end).toISOString();
  type Pub = { hook: string; published_url: string | null; views_72h: number | null; views: number | null; reactions: number | null };
  const [planned, published, starts, links, snaps] = await Promise.all([
    rowsOf<{ n: number }>(sql`
      SELECT count(DISTINCT (slot->>'day') || ' ' || (slot->>'time'))::int AS n FROM posts
      WHERE brand_id = ${brandId} AND slot IS NOT NULL AND slot->>'day' >= ${w.weekOf} AND slot->>'day' < ${w.thisWeekOf}
    `),
    rowsOf<Pub>(sql`
      SELECT COALESCE(p.slot->>'hook', '') AS hook, p.published_url, m.views_72h, m.views, m.reactions
      FROM posts p LEFT JOIN post_metrics m ON m.post_id = p.id
      WHERE p.brand_id = ${brandId} AND p.published_at >= ${start} AND p.published_at < ${end}
      ORDER BY p.published_at
    `),
    rowsOf<{ n: number }>(sql`
      SELECT count(DISTINCT e.telegram_id)::int AS n FROM events e
      WHERE e.type = 'start' AND e.created_at >= ${start} AND e.created_at < ${end}
        AND e.props->>'payload' LIKE ANY (ARRAY(
          SELECT 'src_' || tag || '_%' FROM brain_plans WHERE brand_id = ${brandId} AND created_at >= ${start}::timestamptz - interval '14 days'
        ))
    `),
    rowsOf<{ links: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM brain_plans bp CROSS JOIN LATERAL jsonb_array_elements(bp.items) it
        WHERE bp.brand_id = ${brandId} AND bp.week_of = ${w.weekOf}::date AND it->>'src' IS NOT NULL
      ) AS links
    `),
    channel
      ? rowsOf<{ day: string; subscribers: number }>(sql`
          SELECT day::text AS day, subscribers FROM channel_snapshots
          WHERE channel = ${channelKey(channel)} AND day >= ${w.weekOf}::date - 1 AND day <= ${w.thisWeekOf}::date
          ORDER BY day
        `)
      : Promise.resolve([] as { day: string; subscribers: number }[]),
  ]);
  return {
    planned: planned[0]?.n ?? 0,
    published: published.map((r) => ({ hook: r.hook, url: r.published_url, views72: r.views_72h, views: r.views, reactions: r.reactions })),
    starts: starts[0]?.n ?? 0,
    hasLinks: links[0]?.links === true,
    snapshots: snaps.map((s) => ({ day: s.day, subscribers: Number(s.subscribers) })),
  };
}

/** Last week's plan of the brand (its tag carries the orders answer into brain_outcomes). */
export async function weekPlan(brandId: string, weekOf: string): Promise<{ id: string; tag: string } | null> {
  if (!isDbConfigured()) return null;
  const rows = (await getSql()`
    SELECT id, tag FROM brain_plans WHERE brand_id = ${brandId} AND week_of = ${weekOf}::date ORDER BY created_at DESC LIMIT 1
  `) as { id: string; tag: string }[];
  return rows[0] ?? null;
}

/** What the brand cost in the last 30 days: Claude (autopilot runs, and any route that tags the brand) and pictures. */
export async function brandSpend30d(brandId: string): Promise<{ llmUsd: number; images: number }> {
  if (!isDbConfigured()) return { llmUsd: 0, images: 0 };
  const rows = (await getSql()`
    SELECT
      (SELECT COALESCE(sum((props->>'usd')::numeric), 0) FROM events
        WHERE type IN ('autopilot_spend', 'llm_usage') AND props->>'brand_id' = ${brandId} AND created_at >= now() - interval '30 days')::float8 AS llm,
      (SELECT count(*) FROM media_jobs WHERE brand_id = ${brandId} AND status = 'succeeded' AND created_at >= now() - interval '30 days')::int AS images
  `) as { llm: number; images: number }[];
  return { llmUsd: Number(rows[0]?.llm ?? 0), images: Number(rows[0]?.images ?? 0) };
}

/** Plan tag and slot of posts the weekly run wrote (posts.plan_tag / plan_slot). */
export async function tagPosts(items: { postId: string; tag: string; slot: number }[]): Promise<void> {
  if (!isDbConfigured() || !items.length) return;
  const sql = getSql();
  await Promise.all(items.map((i) => sql`UPDATE posts SET plan_tag = ${i.tag}, plan_slot = ${i.slot} WHERE id = ${i.postId}`));
}

/* ----------------------------------------------------------- invite links */

/** The brand's live invite link for a source (QR code, Instagram bio…), if Mercat made one. */
export async function findInviteLink(brandId: string, source: string): Promise<string | null> {
  if (!isDbConfigured()) return null;
  const rows = (await getSql()`
    SELECT link FROM invite_links WHERE brand_id = ${brandId} AND source = ${source} AND revoked_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `) as { link: string }[];
  return rows[0]?.link ?? null;
}

export async function saveInviteLink(r: { link: string; brandId: string; channel: string; name: string; source: string }): Promise<void> {
  if (!isDbConfigured()) return;
  await getSql()`
    INSERT INTO invite_links (link, brand_id, channel, name, source) VALUES (${r.link}, ${r.brandId}, ${channelKey(r.channel)}, ${r.name}, ${r.source})
    ON CONFLICT (link) DO NOTHING
  `;
}
