-- Schema for Neon Postgres: Telegram users + product events.
--
-- Idempotent: safe to run again at any time with `pnpm db:migrate`.
-- Only the server talks to the database (DATABASE_URL is server-only and is
-- never exposed to the browser), so no row level security is needed.
-- Keep it to plain statements separated by ";" (the migrate script splits on them).

-- ---------------------------------------------------------------- app_users

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint UNIQUE NOT NULL,
  username text,
  first_name text,
  last_name text,
  language_code text,
  source text,                                  -- first-touch attribution (QR / deep link)
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_users_created_at_idx ON app_users (created_at DESC);
CREATE INDEX IF NOT EXISTS app_users_source_idx ON app_users (source);

-- ------------------------------------------------------------------- events

CREATE TABLE IF NOT EXISTS events (
  id bigserial PRIMARY KEY,
  telegram_id bigint,
  type text NOT NULL,
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_type_created_at_idx ON events (type, created_at);
CREATE INDEX IF NOT EXISTS events_telegram_id_idx ON events (telegram_id);

-- -------------------------------------------------------------- Mercat engine

CREATE TABLE IF NOT EXISTS brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_telegram_id bigint,
  channel text,                                 -- public username, lowercase, without @
  knowledge text NOT NULL DEFAULT '',
  sample_posts jsonb NOT NULL DEFAULT '[]'::jsonb,
  dna jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 'channel_only' = built from public channel posts alone (safe to reuse as a cache);
-- 'custom' = includes owner-supplied knowledge/sample posts (never reused, scoped to its owner).
ALTER TABLE brands ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'custom';

CREATE INDEX IF NOT EXISTS brands_channel_created_idx ON brands (channel, created_at DESC);
CREATE INDEX IF NOT EXISTS brands_owner_idx ON brands (owner_telegram_id);

CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands (id) ON DELETE CASCADE,
  brief text NOT NULL DEFAULT '',
  variants jsonb NOT NULL DEFAULT '{}'::jsonb,
  neuro_hits jsonb NOT NULL DEFAULT '{}'::jsonb,
  human_score int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',          -- draft | approved | published
  published_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS posts_brand_created_idx ON posts (brand_id, created_at DESC);

CREATE TABLE IF NOT EXISTS flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands (id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  graph jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS flows_brand_created_idx ON flows (brand_id, created_at DESC);

-- ------------------------------------------------------------ Mercat Brain v2
-- Everything the Brain learns lives here. All writes are best-effort: if these
-- tables are missing the Brain still answers, it just cannot learn.

-- View counts of public posts over time, from every t.me/s scrape (own channels,
-- competitors, the golden set). One channel scraped at 24h, 72h and 7d gives the
-- view curve; the src column joins a post to the plan item whose tracked link it carries.
CREATE TABLE IF NOT EXISTS brain_post_snapshots (
  channel text NOT NULL,                        -- lowercase username, no @
  post_id int NOT NULL,
  posted_at timestamptz NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  age_hours real NOT NULL,
  views int,
  media text,
  is_ad boolean NOT NULL DEFAULT false,
  src text,                                     -- deep-link payload found in the post, e.g. src_u3k9x2_4
  PRIMARY KEY (channel, post_id, captured_at)
);

CREATE INDEX IF NOT EXISTS brain_post_snapshots_post_idx ON brain_post_snapshots (channel, post_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS brain_post_snapshots_src_idx ON brain_post_snapshots (src) WHERE src IS NOT NULL;

-- One row per channel analysis. Aggregated by niche and size band into the
-- Uzbek Telegram benchmarks (median reach, cadence, hour/format lifts).
CREATE TABLE IF NOT EXISTS brain_channel_stats (
  id bigserial PRIMARY KEY,
  channel text NOT NULL,
  niche text,
  subscribers int,
  median_views real,
  reach_rate real,
  posts_per_week real,
  mature_posts int NOT NULL DEFAULT 0,
  suspect boolean NOT NULL DEFAULT false,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,     -- bucket lifts, format mix, shares (no post texts)
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brain_channel_stats_niche_idx ON brain_channel_stats (niche, captured_at DESC);
CREATE INDEX IF NOT EXISTS brain_channel_stats_channel_idx ON brain_channel_stats (channel, captured_at DESC);

-- Weekly plans. `tag` is the short id inside every tracked link (src_<tag>_<slot>),
-- so bot starts (events.type = 'start') and scraped posts join back to the plan item.
CREATE TABLE IF NOT EXISTS brain_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag text UNIQUE NOT NULL,
  brand_id uuid REFERENCES brands (id) ON DELETE CASCADE,
  owner_telegram_id bigint,
  channel text,
  week_of date NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,     -- slot, day, time, goal, format, hookType, exp, link, forecast
  baseline jsonb NOT NULL DEFAULT '{}'::jsonb,  -- medianViews, reachRate, subscribers at plan time
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brain_plans_channel_idx ON brain_plans (channel, created_at DESC);
CREATE INDEX IF NOT EXISTS brain_plans_brand_idx ON brain_plans (brand_id, created_at DESC);

-- What the owner tells us happened: orders per week (one tap in the bot) or per post.
CREATE TABLE IF NOT EXISTS brain_outcomes (
  id bigserial PRIMARY KEY,
  plan_id uuid NOT NULL REFERENCES brain_plans (id) ON DELETE CASCADE,
  slot int,                                     -- null = the whole week
  kind text NOT NULL,                           -- orders_week (0 / 1-3 / 4-10 / 10+ as 0, 2, 7, 12) | sold
  value int NOT NULL,
  telegram_id bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brain_outcomes_plan_idx ON brain_outcomes (plan_id, created_at DESC);

-- Brand memory: what the owner gave us (Google Doc, website, PDF, price list, address).
CREATE TABLE IF NOT EXISTS brand_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands (id) ON DELETE CASCADE,
  kind text NOT NULL,                           -- gdoc | gsheet | website | pdf | manual
  url text,
  title text,
  text text NOT NULL DEFAULT '',
  structured jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_knowledge_brand_idx ON brand_knowledge (brand_id, created_at DESC);
