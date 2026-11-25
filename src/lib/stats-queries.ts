import type { Sql } from "./db";
import { STATS_TIMEZONE, type StatsOptions } from "./stats-model";
import { EVENT_TYPE_SURFACE, STATS_EVENT } from "./stats-meta";

/**
 * SQL for /stats, as composable neon templates (values are always bound parameters; the only raw text is from the
 * fixed lists below). Built per request from the options, run by stats.ts in one read-only snapshot.
 *
 * Rules every query keeps:
 *   - props are read key by key (`props->>'…'`), never selected whole, and ids are only join keys: no query returns
 *     a Telegram id, a brand or post id, a visitor key or a plan tag (stats-model.ts drops them again anyway);
 *   - dev traffic (props.env = 'dev') is left out unless `includeDev`; rows written before env existed count as prod;
 *   - team members (STATS_TEAM_TG_IDS) are left out unless `includeTeam`; the north star always leaves them out.
 *
 * Surface of an event: props.surface when written (track.ts), else inferred from its type for older rows (bot-only and
 * Mini App-only types, page_view, and brand_created without a Telegram id = an anonymous web brand), else 'unknown'.
 */

const typesOf = (surface: string) => Object.entries(EVENT_TYPE_SURFACE).filter(([, s]) => s === surface).map(([t]) => t);
const BOT_TYPES = typesOf("bot");
const MINIAPP_TYPES = typesOf("miniapp");

/** Events that are bookkeeping, not something a person did: never counted as activity. */
const NOISE_TYPES = ["llm_usage", "claude_run", "visual_analysis"];
/** Also left out of the activity feed: page views (counted in the overview) and internal steps. */
const FEED_HIDDEN_TYPES = [...NOISE_TYPES, "visual_learned", "page_view", "publish_pending", "publish_pending_done"];

/** A tracked link in a plan post, as kept in start events: src_<6-char plan tag>_<slot>. */
const PLAN_LINK_SQL_RE = "^src_[a-z0-9]{6}_[0-9]{1,2}$";
const PLAN_TAG_SQL_RE = "^src_([a-z0-9]{6})_[0-9]{1,2}$";
/** app_users.source of a customer who came from a plan link (old rows hold the payload minus "src_"). */
const OLD_PLAN_SOURCE_SQL_RE = "^[a-z0-9]{6}_[0-9]{1,2}$";

type TeamColumn = "e.telegram_id" | "b.owner_telegram_id" | "u.telegram_id";

export function statsFragments(sql: Sql, o: StatsOptions) {
  const teamIds = o.teamIds.map(String);
  const notTeam = (column: TeamColumn, always = false) =>
    (o.includeTeam && !always) || teamIds.length === 0
      ? sql`true`
      : sql`(${sql.unsafe(column)} IS NULL OR ${sql.unsafe(column)} <> ALL(${teamIds}::bigint[]))`;
  const envOk = o.includeDev ? sql`true` : sql`(e.props->>'env' IS DISTINCT FROM 'dev')`;
  const surface = sql`coalesce(e.props->>'surface', CASE
      WHEN e.type = ANY(${BOT_TYPES}::text[]) THEN 'bot'
      WHEN e.type = ANY(${MINIAPP_TYPES}::text[]) THEN 'miniapp'
      WHEN e.type = 'page_view' THEN 'web'
      WHEN e.type = 'brand_created' AND e.telegram_id IS NULL THEN 'web'
      ELSE 'unknown' END)`;
  const customer = sql`(e.type = 'lead' OR (e.type = 'start' AND coalesce(e.props->>'payload', '') ~ ${PLAN_LINK_SQL_RE}))`;
  const today = sql`date_trunc('day', now(), ${STATS_TIMEZONE}::text)`;
  const since =
    o.range === "all"
      ? sql`'-infinity'::timestamptz`
      : o.range === "today"
        ? today
        : sql`(${today} - make_interval(days => ${o.range === "7d" ? 6 : 29}::int))`;
  return { notTeam, envOk, surface, customer, today, since };
}

/** Today / 7 days / 30 days (Tashkent calendar days): who visited and who used each surface. */
export function overviewQuery(sql: Sql, o: StatsOptions) {
  const f = statsFragments(sql, o);
  return sql`
    WITH win AS (
      SELECT ${f.today} AS today
    ), spans AS (
      SELECT s.span, CASE s.span WHEN 'today' THEN win.today WHEN '7d' THEN win.today - interval '6 days'
                                 ELSE win.today - interval '29 days' END AS since
      FROM win, (VALUES ('today'), ('7d'), ('30d')) AS s(span)
    ), ev AS (
      SELECT e.type, e.telegram_id, e.created_at, e.props->>'visitor' AS visitor, e.props->>'path' AS path,
             ${f.surface} AS surface, ${f.customer} AS customer
      FROM events e, win
      WHERE e.created_at >= win.today - interval '29 days'
        AND e.type <> ALL(${NOISE_TYPES}::text[])
        AND ${f.envOk} AND ${f.notTeam("e.telegram_id")}
    ), people AS (
      SELECT ev.telegram_id, max(ev.created_at) AS last_at, min(u.created_at) AS first_seen
      FROM ev LEFT JOIN app_users u ON u.telegram_id = ev.telegram_id
      WHERE ev.telegram_id IS NOT NULL AND NOT ev.customer
      GROUP BY ev.telegram_id
    ), by_event AS (
      SELECT spans.span,
        count(DISTINCT ev.visitor) FILTER (WHERE ev.type = 'page_view' AND ev.path = 'landing')::int AS landing_visitors,
        count(DISTINCT ev.visitor) FILTER (WHERE ev.type = 'page_view' AND ev.path = 'studio')::int AS studio_visitors,
        count(DISTINCT coalesce('tg:' || ev.telegram_id::text, ev.visitor))
          FILTER (WHERE ev.surface = 'web' AND ev.type <> 'page_view')::int AS studio_users,
        count(DISTINCT ev.telegram_id) FILTER (WHERE ev.surface = 'miniapp')::int AS miniapp_users,
        count(DISTINCT ev.telegram_id) FILTER (WHERE ev.surface = 'bot' AND NOT ev.customer)::int AS bot_users,
        count(DISTINCT ev.telegram_id) FILTER (WHERE ev.customer)::int AS customers
      FROM spans LEFT JOIN ev ON ev.created_at >= spans.since
      GROUP BY spans.span
    ), by_person AS (
      SELECT spans.span,
        count(people.telegram_id)::int AS tg_active,
        count(people.telegram_id) FILTER (WHERE people.first_seen >= spans.since)::int AS tg_new,
        count(people.telegram_id) FILTER (WHERE people.first_seen IS NULL OR people.first_seen < spans.since)::int AS tg_returning
      FROM spans LEFT JOIN people ON people.last_at >= spans.since
      GROUP BY spans.span
    )
    SELECT by_event.*, by_person.tg_active, by_person.tg_new, by_person.tg_returning
    FROM by_event JOIN by_person USING (span)
  `;
}

/**
 * Brands created in the range and how far each got: posts, an approval, a published post, a customer tapping a
 * tracked link from its plan. `unapproved` counts their drafts left without approval for 48 hours or more (a quiet
 * rejection: there is no reject button yet). Per surface: the one written on brand_created, else inferred for older brands (no owner
 * = anonymous web, a bot_onboarded event = bot, otherwise unknown: Mini App or handoff-linked web).
 */
export function funnelQuery(sql: Sql, o: StatsOptions) {
  const f = statsFragments(sql, o);
  const devOk = o.includeDev ? sql`true` : sql`(bc.env IS DISTINCT FROM 'dev')`;
  return sql`
    WITH win AS (
      SELECT ${f.since} AS since
    ), bc AS (
      SELECT DISTINCT ON (e.props->>'brand_id') e.props->>'brand_id' AS brand_id,
             e.props->>'surface' AS surface, e.props->>'env' AS env
      FROM events e, win
      WHERE e.type = 'brand_created' AND e.created_at >= win.since - interval '1 hour'
      ORDER BY e.props->>'brand_id', e.created_at
    ), bo AS (
      SELECT DISTINCT e.props->>'brand_id' AS brand_id FROM events e WHERE e.type = 'bot_onboarded'
    ), br AS (
      SELECT b.id,
             coalesce(bc.surface, CASE WHEN b.owner_telegram_id IS NULL THEN 'web'
                                       WHEN bo.brand_id IS NOT NULL THEN 'bot' ELSE 'unknown' END) AS surface
      FROM brands b CROSS JOIN win
      LEFT JOIN bc ON bc.brand_id = b.id::text
      LEFT JOIN bo ON bo.brand_id = b.id::text
      WHERE b.created_at >= win.since AND ${devOk} AND ${f.notTeam("b.owner_telegram_id")}
    ), pp AS (
      SELECT p.brand_id, count(*)::int AS posts,
             count(*) FILTER (WHERE p.approved_at IS NOT NULL OR p.status IN ('approved', 'published'))::int AS approved,
             count(*) FILTER (WHERE p.status = 'published')::int AS published,
             count(*) FILTER (WHERE p.status = 'draft' AND p.approved_at IS NULL
                                AND p.created_at < now() - interval '48 hours')::int AS unapproved
      FROM posts p
      WHERE p.brand_id IN (SELECT id FROM br)
      GROUP BY p.brand_id
    ), taps AS (
      SELECT bp.brand_id, count(DISTINCT e.telegram_id)::int AS taps
      FROM events e
      JOIN brain_plans bp ON bp.tag = substring(e.props->>'payload' FROM ${PLAN_TAG_SQL_RE})
      WHERE e.type = 'start' AND coalesce(e.props->>'payload', '') ~ ${PLAN_LINK_SQL_RE}
        AND bp.brand_id IN (SELECT id FROM br)
        AND ${f.envOk} AND ${f.notTeam("e.telegram_id")}
      GROUP BY bp.brand_id
    )
    SELECT br.surface,
           count(*)::int AS brands,
           count(*) FILTER (WHERE pp.posts > 0)::int AS with_posts,
           count(*) FILTER (WHERE pp.approved > 0)::int AS with_approved,
           count(*) FILTER (WHERE pp.published > 0)::int AS with_published,
           count(*) FILTER (WHERE taps.taps > 0)::int AS with_taps,
           coalesce(sum(pp.posts), 0)::int AS posts,
           coalesce(sum(pp.approved), 0)::int AS approved,
           coalesce(sum(pp.published), 0)::int AS published,
           coalesce(sum(pp.unapproved), 0)::int AS unapproved,
           coalesce(sum(taps.taps), 0)::int AS taps
    FROM br
    LEFT JOIN pp ON pp.brand_id = br.id
    LEFT JOIN taps ON taps.brand_id = br.id
    GROUP BY br.surface
  `;
}

/** Landing visitors in the range per source category (written by stats-pageview.ts). */
export function landingSourcesQuery(sql: Sql, o: StatsOptions) {
  const f = statsFragments(sql, o);
  return sql`
    SELECT e.props->>'source' AS source, count(DISTINCT e.props->>'visitor')::int AS count
    FROM events e
    WHERE e.type = 'page_view' AND e.props->>'path' = 'landing' AND e.created_at >= ${f.since} AND ${f.envOk}
    GROUP BY 1
  `;
}

/** Telegram users who first came in the range, per first-touch source (app_users.source, a category). */
export function telegramSourcesQuery(sql: Sql, o: StatsOptions) {
  const f = statsFragments(sql, o);
  return sql`
    SELECT u.source, count(*)::int AS count
    FROM app_users u
    WHERE u.created_at >= ${f.since} AND ${f.notTeam("u.telegram_id")}
    GROUP BY 1
  `;
}

/**
 * Telegram users (bot and Mini App) active in the range, newest activity first: first name and @username, first and
 * last seen, surfaces used, and what their brands reached. Customers who only came through a post's link are left out
 * (counted in the overview). Never the Telegram id.
 */
export function usersQuery(sql: Sql, o: StatsOptions, limit = 100) {
  const f = statsFragments(sql, o);
  return sql`
    WITH act AS (
      SELECT e.telegram_id, max(e.created_at) AS last_at,
             bool_or(${f.surface} = 'bot' AND NOT ${f.customer}) AS bot,
             bool_or(${f.surface} = 'miniapp') AS miniapp,
             bool_or(${f.surface} = 'web') AS web
      FROM events e
      WHERE e.telegram_id IS NOT NULL AND e.type <> ALL(${NOISE_TYPES}::text[]) AND ${f.envOk}
      GROUP BY e.telegram_id
    ), own AS (
      SELECT b.owner_telegram_id AS telegram_id, count(DISTINCT b.id)::int AS brands, count(p.id)::int AS posts,
             count(p.id) FILTER (WHERE p.approved_at IS NOT NULL OR p.status IN ('approved', 'published'))::int AS approved,
             count(p.id) FILTER (WHERE p.status = 'published')::int AS published
      FROM brands b LEFT JOIN posts p ON p.brand_id = b.id
      WHERE b.owner_telegram_id IS NOT NULL
      GROUP BY b.owner_telegram_id
    )
    SELECT u.first_name, u.username, u.created_at AS first_seen,
           greatest(u.last_seen_at, act.last_at) AS last_seen,
           coalesce(act.bot, false) AS bot, coalesce(act.miniapp, false) AS miniapp, coalesce(act.web, false) AS web,
           coalesce(own.brands, 0) AS brands, coalesce(own.posts, 0) AS posts,
           coalesce(own.approved, 0) AS approved, coalesce(own.published, 0) AS published
    FROM app_users u
    LEFT JOIN act ON act.telegram_id = u.telegram_id
    LEFT JOIN own ON own.telegram_id = u.telegram_id
    WHERE ${f.notTeam("u.telegram_id")}
      AND greatest(u.last_seen_at, act.last_at) >= ${f.since}
      AND NOT (own.telegram_id IS NULL AND coalesce(u.source, '') ~ ${`^plan$|${OLD_PLAN_SOURCE_SQL_RE}`})
    ORDER BY greatest(u.last_seen_at, act.last_at) DESC NULLS LAST
    LIMIT ${limit}
  `;
}

/** The latest things people did: event name, surface and time only. */
export function feedQuery(sql: Sql, o: StatsOptions, limit = 40) {
  const f = statsFragments(sql, o);
  return sql`
    SELECT e.type, ${f.surface} AS surface, e.created_at
    FROM events e
    WHERE e.type <> ALL(${FEED_HIDDEN_TYPES}::text[]) AND ${f.envOk} AND ${f.notTeam("e.telegram_id")}
    ORDER BY e.created_at DESC
    LIMIT ${limit}
  `;
}

/** Whether posts.published_at exists yet (added with the autopilot): the north star needs it. */
export function hasPublishedAtQuery(sql: Sql) {
  return sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'posts' AND column_name = 'published_at'
    ) AS has_published_at
  `;
}

/**
 * North star: external brands (an owner outside the team) with at least 3 posts published in the last 7 days, plus
 * how many published at least one. Only valid once posts.published_at exists (see hasPublishedAtQuery); 0 is then a
 * real answer. A published post counts by its published_at, or, while nothing writes that column yet (posts the bot
 * or the publish route sent before the autopilot), by its `post_published` event in the last 7 days.
 */
export function northStarQuery(sql: Sql, o: StatsOptions) {
  const f = statsFragments(sql, o);
  const devOk = o.includeDev
    ? sql`true`
    : sql`NOT EXISTS (SELECT 1 FROM events e WHERE e.type = 'brand_created' AND e.props->>'brand_id' = b.id::text
                                              AND e.props->>'env' = 'dev')`;
  return sql`
    WITH sent AS (
      SELECT p.id, p.brand_id FROM posts p
      WHERE p.published_at >= now() - interval '7 days'
      UNION
      SELECT p.id, p.brand_id
      FROM events e JOIN posts p ON p.id::text = e.props->>'post_id'
      WHERE e.type = 'post_published' AND e.created_at >= now() - interval '7 days'
        AND p.published_at IS NULL AND p.status = 'published' AND ${f.envOk}
    ), pub AS (
      SELECT sent.brand_id, count(*)::int AS n
      FROM sent JOIN brands b ON b.id = sent.brand_id
      WHERE b.owner_telegram_id IS NOT NULL AND ${f.notTeam("b.owner_telegram_id", true)} AND ${devOk}
      GROUP BY sent.brand_id
    )
    SELECT count(*) FILTER (WHERE n >= 3)::int AS brands, count(*)::int AS publishing FROM pub
  `;
}

/** Event types the quality card reads (kept narrow so the scan uses events (type, created_at)). */
const QUALITY_TYPES = [
  "post_approved",
  "post_image_started",
  STATS_EVENT.postRegenerated,
  STATS_EVENT.postRejected,
  STATS_EVENT.apiError,
  STATS_EVENT.trialStarted,
];

/**
 * What happened to posts and people in the range: approvals with the owner's edits, texts written again, pictures
 * redone (a post's picture started more than once), explicit rejections, error answers (and how many people got one),
 * autopilot trials started. Counts only.
 */
export function qualityQuery(sql: Sql, o: StatsOptions) {
  const f = statsFragments(sql, o);
  return sql`
    SELECT
      count(*) FILTER (WHERE e.type = 'post_approved')::int AS approvals,
      count(*) FILTER (WHERE e.type = 'post_approved' AND CASE WHEN jsonb_typeof(e.props->'edited') = 'array'
                                                              THEN jsonb_array_length(e.props->'edited') ELSE 0 END > 0)::int AS edited,
      count(*) FILTER (WHERE e.type = ${STATS_EVENT.postRegenerated})::int AS rewritten,
      count(*) FILTER (WHERE e.type = 'post_image_started' AND CASE WHEN e.props->>'attempt' ~ '^[0-9]{1,4}$'
                                                                   THEN (e.props->>'attempt')::int ELSE 1 END > 1)::int AS pictures_redone,
      count(*) FILTER (WHERE e.type = ${STATS_EVENT.postRejected})::int AS rejected,
      count(*) FILTER (WHERE e.type = ${STATS_EVENT.apiError})::int AS errors,
      count(DISTINCT coalesce('tg:' || e.telegram_id::text, e.props->>'visitor'))
        FILTER (WHERE e.type = ${STATS_EVENT.apiError})::int AS error_people,
      count(*) FILTER (WHERE e.type = ${STATS_EVENT.trialStarted})::int AS trials
    FROM events e
    WHERE e.type = ANY(${QUALITY_TYPES}::text[]) AND e.created_at >= ${f.since}
      AND ${f.envOk} AND ${f.notTeam("e.telegram_id")}
  `;
}

/** The error answers people got most in the range: API route and error code (both categories), most first. */
export function errorsQuery(sql: Sql, o: StatsOptions, limit = 8) {
  const f = statsFragments(sql, o);
  return sql`
    SELECT e.props->>'route' AS route, e.props->>'code' AS code, count(*)::int AS count
    FROM events e
    WHERE e.type = ${STATS_EVENT.apiError} AND e.created_at >= ${f.since} AND ${f.envOk} AND ${f.notTeam("e.telegram_id")}
    GROUP BY 1, 2
    ORDER BY 3 DESC, 1, 2
    LIMIT ${limit}
  `;
}
