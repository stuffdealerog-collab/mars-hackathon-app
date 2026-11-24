-- Initial schema: Telegram users + product events.
--
-- Security model: RLS is enabled on every table with NO policies, and table
-- privileges are revoked from the public API roles (anon, authenticated).
-- Only the server, using the Supabase service role key, can read or write.
-- If you ever need client-side access, add explicit grants + RLS policies.

-- ---------------------------------------------------------------- tables

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint unique not null,
  username text,
  first_name text,
  last_name text,
  language_code text,
  source text,                                  -- first-touch attribution (QR / deep link)
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists app_users_created_at_idx on public.app_users (created_at desc);
create index if not exists app_users_source_idx on public.app_users (source);

create table if not exists public.events (
  id bigserial primary key,
  telegram_id bigint,
  type text not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists events_type_created_at_idx on public.events (type, created_at);
create index if not exists events_telegram_id_idx on public.events (telegram_id);

alter table public.app_users enable row level security;
alter table public.events enable row level security;

revoke all on table public.app_users from anon, authenticated;
revoke all on table public.events from anon, authenticated;
revoke all on sequence public.events_id_seq from anon, authenticated;

-- ------------------------------------------------------------- functions

-- Upsert a Telegram user. `source` is first-touch: set once, never overwritten.
-- Returns true when the row was newly inserted.
create or replace function public.upsert_app_user(
  p_telegram_id bigint,
  p_username text default null,
  p_first_name text default null,
  p_last_name text default null,
  p_language_code text default null,
  p_source text default null
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  insert into public.app_users as u
    (telegram_id, username, first_name, last_name, language_code, source)
  values
    (p_telegram_id, p_username, p_first_name, p_last_name, p_language_code, p_source)
  on conflict (telegram_id) do update set
    username      = coalesce(excluded.username, u.username),
    first_name    = coalesce(excluded.first_name, u.first_name),
    last_name     = coalesce(excluded.last_name, u.last_name),
    language_code = coalesce(excluded.language_code, u.language_code),
    source        = coalesce(u.source, excluded.source),
    last_seen_at  = now()
  returning (u.xmax = 0);
$$;

-- Aggregates for the public /stats page (no usernames or ids leave the database).
create or replace function public.app_stats(p_tz text default 'Asia/Tashkent')
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with day_start as (
    select (date_trunc('day', now() at time zone p_tz) at time zone p_tz) as ts
  )
  select jsonb_build_object(
    'total_users',  (select count(*) from public.app_users),
    'users_today',  (select count(*) from public.app_users, day_start where created_at >= day_start.ts),
    'active_today', (select count(*) from public.app_users, day_start where last_seen_at >= day_start.ts),
    'total_events', (select count(*) from public.events),
    'events_today', (select count(*) from public.events, day_start where created_at >= day_start.ts),
    'by_source', coalesce((
      select jsonb_agg(jsonb_build_object('source', s.source, 'count', s.n) order by s.n desc, s.source)
      from (
        select coalesce(nullif(source, ''), 'direct') as source, count(*) as n
        from public.app_users
        group by 1
      ) s
    ), '[]'::jsonb),
    'by_type', coalesce((
      select jsonb_agg(jsonb_build_object('type', t.type, 'count', t.n) order by t.n desc, t.type)
      from (
        select type, count(*) as n
        from public.events
        group by 1
      ) t
    ), '[]'::jsonb),
    'recent_signups', coalesce((
      select jsonb_agg(jsonb_build_object('first_name', r.first_name, 'created_at', r.created_at)
                       order by r.created_at desc)
      from (
        select first_name, created_at
        from public.app_users
        order by created_at desc
        limit 10
      ) r
    ), '[]'::jsonb)
  );
$$;

-- Functions are executable by PUBLIC by default: lock them to the server.
revoke all on function public.upsert_app_user(bigint, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.app_stats(text) from public, anon, authenticated;

notify pgrst, 'reload schema';
