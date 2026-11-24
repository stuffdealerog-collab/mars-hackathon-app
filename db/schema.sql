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

-- ------------------------------------------------------------ Uslub AI engine

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
