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

-- Facts the strategist extracted from a knowledge base, keyed by the KB's sha256: the same brand
-- re-planned (on any serverless instance) skips the extraction call. Only the exact same text hits.
CREATE TABLE IF NOT EXISTS brain_facts_cache (
  kb_hash text PRIMARY KEY,
  facts jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------- Sprint 2026-11-25 additions
-- Additive only (ADD COLUMN IF NOT EXISTS / CREATE ... IF NOT EXISTS): safe on the shared DB.

-- 'channel' = learned from a channel with history; 'fresh' = empty channel, built from the
-- owner's description of the business (see BrandMode in src/lib/uslub/contract.ts).
ALTER TABLE brands ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'channel';
-- VisualStyle (refs, palette, light, composition, props, mood, avoid, prompt, learnedAt).
ALTER TABLE brands ADD COLUMN IF NOT EXISTS visual jsonb;

-- PlanSlot the post was written from, its PostImage, and when the owner approved it.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS slot jsonb;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS image jsonb;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- Media generation jobs (was created lazily by src/lib/uslub/media/pg-repo.ts; same DDL).
CREATE TABLE IF NOT EXISTS media_jobs (
  id uuid PRIMARY KEY,
  brand_id text,
  kind text NOT NULL,
  status text NOT NULL,
  provider text NOT NULL,
  owner_key text NOT NULL DEFAULT 'anon',
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_jobs_created_idx ON media_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS media_jobs_owner_created_idx ON media_jobs (owner_key, created_at DESC);

-- ------------------------------------------ Value loop 2026-11-25 (foundation)
-- Plan: docs/superpowers/plans/2026-11-25-value-loop.md. Additive only, like the section above: every new column is
-- nullable or has a default, so code that does not know it keeps working. Channel keys (`channel`, `chat`,
-- `published_chat`) hold the public username in lowercase without @, or the numeric chat id ("-100...") of a
-- channel that has none.

-- Open media jobs, for the sweep that times out jobs stuck in queued/running.
CREATE INDEX IF NOT EXISTS media_jobs_open_idx ON media_jobs (created_at) WHERE status IN ('queued', 'running');

-- Events by time alone (the /stats dashboard reads every type over a date range).
CREATE INDEX IF NOT EXISTS events_created_at_idx ON events (created_at);

-- Brands: what kind of channel it is and the owner's main goal (owner correction 2), the autopilot state, and
-- where the brand was created.
-- channel_type: a ChannelType (business | blog | expert | media | community); null = not detected yet.
ALTER TABLE brands ADD COLUMN IF NOT EXISTS channel_type text;
-- goal: the main goal the owner confirmed, a Goal: 'sale' (more orders) or 'grow' (more subscribers); null = not asked.
ALTER TABLE brands ADD COLUMN IF NOT EXISTS goal text;
-- autopilot: {on, since, trialEndsAt} plus the autopilot's own keys (publishAtSlot, paused, botAdmin, botRights,
-- checkedAt). '{}' = never switched on. The trial starts when `on` first turns true (`since`).
ALTER TABLE brands ADD COLUMN IF NOT EXISTS autopilot jsonb NOT NULL DEFAULT '{}'::jsonb;
-- origin: web | web_linked | miniapp | bot; null = created before 2026-11-25.
ALTER TABLE brands ADD COLUMN IF NOT EXISTS origin text;

-- Posts: the plan item they came from, their schedule, and where and when they went out.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS plan_tag text;                -- brain_plans.tag
ALTER TABLE posts ADD COLUMN IF NOT EXISTS plan_slot int;                -- the item's slot number in that plan
ALTER TABLE posts ADD COLUMN IF NOT EXISTS schedule jsonb;               -- PostDraft.schedule {dueAt, status, error?}
ALTER TABLE posts ADD COLUMN IF NOT EXISTS message_id int;               -- Telegram message id (the first one if photo + text)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS published_chat text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS generated_variants jsonb;     -- variants as first written, to diff the owner's edits

CREATE INDEX IF NOT EXISTS posts_plan_idx ON posts (plan_tag, plan_slot) WHERE plan_tag IS NOT NULL;
CREATE INDEX IF NOT EXISTS posts_published_at_idx ON posts (published_at) WHERE published_at IS NOT NULL;

-- Approved posts waiting for their slot. The tick claims due rows (FOR UPDATE SKIP LOCKED) and sends each one at
-- most once. status: queued | sending | sent | blocked | failed | expired | unknown (PostSchedule in contract.ts).
CREATE TABLE IF NOT EXISTS publish_queue (
  post_id uuid PRIMARY KEY REFERENCES posts (id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES brands (id) ON DELETE CASCADE,
  owner_telegram_id bigint NOT NULL,
  chat text NOT NULL,
  script text NOT NULL,                         -- the variant that goes out (Script)
  due_at timestamptz NOT NULL,
  text_hash text NOT NULL,                      -- of the approved text + picture: an edit after approval stops the send
  status text NOT NULL DEFAULT 'queued',
  attempts int NOT NULL DEFAULT 0,
  last_error text,                              -- owner-safe reason
  locked_at timestamptz,
  sent_at timestamptz,
  notified_at timestamptz,                      -- when the owner got the "post is out" message
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS publish_queue_due_idx ON publish_queue (due_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS publish_queue_brand_idx ON publish_queue (brand_id, due_at);

-- Exactly-once claims for scheduled work: INSERT ... ON CONFLICT (key) DO NOTHING RETURNING key. Keys look like
-- week:<brandId>:<isoWeek>, digest:<brandId>:<isoWeek>, snap:<channel>:<date>.
CREATE TABLE IF NOT EXISTS autopilot_runs (
  key text PRIMARY KEY,
  brand_id uuid REFERENCES brands (id) ON DELETE CASCADE,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'started',
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,    -- counts and states only
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS autopilot_runs_brand_idx ON autopilot_runs (brand_id, created_at DESC);

-- The tick's lock (src/lib/cron/lock.ts): one row per lock, taken over only once locked_until has passed.
-- last_report is the last tick's summary (counts only) and doubles as the ticker's heartbeat.
CREATE TABLE IF NOT EXISTS cron_locks (
  name text PRIMARY KEY,
  holder text NOT NULL,
  locked_until timestamptz NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  last_report jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Subscribers per channel per Tashkent day: getChatMemberCount where the bot is in the channel, else the t.me/s
-- page. History only builds up from the day the daily task ships; it cannot be filled in afterwards.
CREATE TABLE IF NOT EXISTS channel_snapshots (
  channel text NOT NULL,
  day date NOT NULL,
  subscribers int NOT NULL,
  source text NOT NULL DEFAULT 'bot',           -- bot | scrape
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel, day)
);

-- One channel message's numbers: views 24 h and 72 h after it went out (Monday report, forecast check), the latest
-- views and forwards seen, and reactions from message_reaction_count updates.
CREATE TABLE IF NOT EXISTS post_metrics (
  channel text NOT NULL,
  message_id int NOT NULL,
  post_id uuid REFERENCES posts (id) ON DELETE SET NULL,  -- null = a post Mercat did not write
  published_at timestamptz,
  views_24h int,
  views_72h int,
  views int,
  forwards int,
  reactions int,                                -- total
  reaction_counts jsonb NOT NULL DEFAULT '{}'::jsonb,     -- emoji (or custom emoji id) -> count
  measured_at timestamptz,                      -- when views/forwards were last read
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel, message_id)
);

CREATE INDEX IF NOT EXISTS post_metrics_post_idx ON post_metrics (post_id) WHERE post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS post_metrics_published_idx ON post_metrics (channel, published_at DESC);

-- Invite links Mercat made per channel and source (QR code, Instagram bio, an ad post), to count joins per source.
CREATE TABLE IF NOT EXISTS invite_links (
  link text PRIMARY KEY,
  brand_id uuid REFERENCES brands (id) ON DELETE CASCADE,
  channel text NOT NULL,
  name text NOT NULL,                           -- the link's name in Telegram (createChatInviteLink, up to 32 chars)
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS invite_links_channel_idx ON invite_links (channel, created_at DESC);

-- Joins and leaves from chat_member updates (the bot must be a channel admin). The member is kept only as a keyed
-- hash (src/lib/anon-key.ts), never as a Telegram id.
CREATE TABLE IF NOT EXISTS channel_member_events (
  id bigserial PRIMARY KEY,
  channel text NOT NULL,
  user_key text NOT NULL,
  kind text NOT NULL,                           -- join | leave
  invite_link text,                             -- invite_links.link when the join came through one
  at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS channel_member_events_channel_idx ON channel_member_events (channel, at DESC);

-- Owner answers live in brand_knowledge (no new table): rows with kind = 'answers', the newest row wins.
-- structured = {orderHow: 'phone' | 'manager' | 'own_bot' | 'mercat_link', contact, prices: [{name, price}] (up to 5),
--               trackLinks: boolean (the tracked t.me link is opt-in), goal, at}
-- text = the same answers in plain words, so the strategist reads them as facts.

-- Connectors (read-only insights: Instagram, Meta ads, YouTube, Google Ads). A connection belongs to the Telegram
-- owner; brand_id only pins it for display. Tokens are stored encrypted (AES-256-GCM with CONNECTOR_TOKEN_KEY and
-- the row id as associated data, so the app generates the id before encrypting), never in plain text.
CREATE TABLE IF NOT EXISTS connections (
  id uuid PRIMARY KEY,
  owner_telegram_id bigint NOT NULL,
  brand_id uuid REFERENCES brands (id) ON DELETE SET NULL,
  provider text NOT NULL,                       -- instagram | meta_ads | youtube | google_ads
  mode text NOT NULL DEFAULT 'test',            -- test | live (the provider app's review state)
  external_id text NOT NULL,                    -- the account id at the provider
  account jsonb NOT NULL DEFAULT '{}'::jsonb,   -- display info: username, name, picture
  accounts jsonb NOT NULL DEFAULT '[]'::jsonb,  -- ad accounts / customers to choose from
  selected_account text,
  scopes text[] NOT NULL DEFAULT '{}',
  access_token_enc text,
  refresh_token_enc text,
  token_expires_at timestamptz,
  data_access_expires_at timestamptz,
  refreshed_at timestamptz,
  status text NOT NULL DEFAULT 'active',        -- active | expired | revoked | error
  last_error text,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS connections_owner_provider_ext_idx ON connections (owner_telegram_id, provider, external_id);
CREATE INDEX IF NOT EXISTS connections_brand_idx ON connections (brand_id);
CREATE INDEX IF NOT EXISTS connections_due_idx ON connections (status, last_sync_at);

-- Single-use OAuth state with PKCE: a callback is accepted once, before expires_at.
CREATE TABLE IF NOT EXISTS connect_oauth_states (
  state text PRIMARY KEY,
  provider text NOT NULL,
  owner_telegram_id bigint NOT NULL,
  brand_id uuid,
  return_to text NOT NULL DEFAULT 'studio',
  pkce_verifier_enc text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

-- Numbers pulled from a connection: one row per account and day, one per post, video or campaign. Numbers and
-- short titles (up to 200 characters) only, no personal data about the audience.
CREATE TABLE IF NOT EXISTS connection_metrics_daily (
  connection_id uuid NOT NULL REFERENCES connections (id) ON DELETE CASCADE,
  account_id text NOT NULL DEFAULT '',
  day date NOT NULL,
  metrics jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id, account_id, day)
);

CREATE TABLE IF NOT EXISTS connection_items (
  connection_id uuid NOT NULL REFERENCES connections (id) ON DELETE CASCADE,
  kind text NOT NULL,                           -- post | reel | carousel | story | video | short | campaign
  external_id text NOT NULL,
  published_at timestamptz,
  title text,
  permalink text,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id, kind, external_id)
);
