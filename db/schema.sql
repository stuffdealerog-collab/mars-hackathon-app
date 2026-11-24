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
