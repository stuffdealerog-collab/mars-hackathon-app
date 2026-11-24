# MARS Hackathon App (skeleton)

Idea-agnostic, production-deployed starter for a **Telegram-first** product built at the
MARS AI Hackathon (Techstars Startup Week, Tashkent): a Telegram bot + Mini App, Postgres
(Neon), optional Claude, and a public live stats page to prove real users to the jury.

## Stack

- Next.js 16 (App Router, TypeScript, Tailwind CSS 4, Cache Components), pnpm, deployed on Vercel (`fra1`)
- [grammY](https://grammy.dev) bot over a secured webhook
- Neon Postgres via the Vercel Marketplace (`@neondatabase/serverless` HTTP driver, server-only, parameterized tagged-template queries)
- Claude via `@anthropic-ai/sdk` (default model `claude-sonnet-5-5`, optional)
- zod for env and input validation, `qrcode` for venue QR codes
- UI strings in Uzbek (Latin), Russian and English (`src/lib/i18n.ts`, default `uz`)

## Routes

| Route | What it does |
| --- | --- |
| `/` | Placeholder landing with links to the bot and `/stats` |
| `/tg` | Telegram Mini App: validates `initData` on the server, says hello, follows the Telegram theme |
| `/stats` | Public live stats: total / new today / active today, users by source, events by type, last 10 signups (first name + time only). Cached ~10 s, auto-refreshes |
| `/qr?src=booth1` | Printable QR for `https://t.me/<BOT_USERNAME>?start=src_booth1` |
| `POST /api/telegram` | grammY webhook. Rejects requests without the correct `X-Telegram-Bot-Api-Secret-Token` |
| `POST /api/auth/telegram` | Mini App login: verifies `initData` (HMAC-SHA256, timing-safe, max age 24 h), upserts the user, logs `miniapp_open` |
| `GET /api/health` | `ok` + database round trip (count of `app_users`), no secrets |

Source tracking: every QR code / deep link carries `start=src_<name>`. `/start` stores
`<name>` as the user's first-touch `source` (never overwritten) and logs a `start` event.
Mini App direct links (`startapp=src_<name>`) are attributed the same way.

## Environment variables

See [`.env.example`](.env.example) for every name with comments. Summary:

| Name | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon pooled connection string. Server only. Managed on Vercel by the Neon integration |
| `DATABASE_URL_UNPOOLED` | local only | Neon direct connection string, used by `pnpm db:migrate` (falls back to `DATABASE_URL`) |
| `TELEGRAM_BOT_TOKEN` | for the bot | From @BotFather |
| `BOT_USERNAME` | for links/QR | Without `@` |
| `TELEGRAM_WEBHOOK_SECRET` | for the bot | 16-256 chars `A-Z a-z 0-9 _ -` |
| `PUBLIC_URL` | for the bot | Production origin, e.g. `https://mercat-ai.vercel.app` |
| `ANTHROPIC_API_KEY` | no | Without it the bot replies with a friendly fallback |
| `ANTHROPIC_MODEL` | no | Default `claude-sonnet-5-5` |

Missing optional values never break `pnpm build`; features that need them degrade gracefully.
`pnpm env:push` pushes the other names from `.env.local` to Vercel and always skips the
integration-managed ones (`DATABASE_URL*`, `PG*`, `POSTGRES_*`, `NEON_*`).
On Vercel, changing an env var requires a redeploy (`vercel deploy --prod`).

## Run locally

```bash
pnpm install
cp .env.example .env.local   # then fill it in
pnpm dev                     # http://localhost:3000
```

The Mini App only authenticates inside Telegram. To test the bot locally, expose your dev
server over HTTPS (e.g. a tunnel), set `PUBLIC_URL` to it and run `pnpm set-webhook`.

## Database (Neon Postgres)

Neon was added through the Vercel Marketplace, which creates `DATABASE_URL` (pooled) and
`DATABASE_URL_UNPOOLED` on the Vercel project. The schema lives in [`db/schema.sql`](db/schema.sql)
(`app_users`, `events` + indexes) and is idempotent (`CREATE ... IF NOT EXISTS`), so it is safe to re-run.

```bash
# pull only the DB vars, without overwriting your other local secrets
vercel env pull .env.neon --environment=production --yes
grep -E '^DATABASE_URL(_UNPOOLED)?=' .env.neon >> .env.local   # remove older DATABASE_URL lines first
rm .env.neon

pnpm db:migrate   # applies db/schema.sql; prints only table names and row counts
```

All queries go through `getSql()` from `src/lib/db.ts` using tagged templates
(`` sql`... WHERE telegram_id = ${id}` ``), which always sends values as bound parameters.
`GET /api/health` reports `db.error = "schema_missing"` until the migration has been run.

## Telegram webhook

After deploying (and after any change of `PUBLIC_URL` or the token):

```bash
pnpm set-webhook
```

It reads `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` and `PUBLIC_URL` from `.env.local`,
then calls `setWebhook` (with `secret_token` and `allowed_updates` incl. `message`,
`callback_query`, `business_connection`, `business_message`), `setChatMenuButton`
(opens `${PUBLIC_URL}/tg`) and `setMyCommands`.

## Deploy (Vercel)

```bash
vercel deploy --prod
```

Env vars are managed with `vercel env add <NAME> production` (and `preview`).

## Security notes

- Webhook: constant-time check of `X-Telegram-Bot-Api-Secret-Token`; fails closed when the secret is unset.
- Mini App auth: `initData` HMAC validated exactly per Telegram docs, timing-safe compare, 24 h max age.
  For your own endpoints send `Authorization: tma <initData>` and call `authenticateRequest(req)`
  from `src/lib/telegram-auth.ts`.
- `DATABASE_URL` is only read by `server-only` modules and never sent to the browser or logged.
- `/stats` exposes aggregates plus first names and signup times only (no usernames or ids).
- Security headers: `nosniff`, strict referrer policy, `frame-ancestors` limited to Telegram.

## Project layout

```
src/app/            routes (pages + API)
src/lib/env.ts      zod-validated env (tolerant of missing optional secrets)
src/lib/db.ts      server-only Neon client (lazy, tagged-template queries)
src/lib/telegram-auth.ts  Mini App initData validation
src/lib/bot.ts      grammY bot (lazy, built on first webhook call)
src/lib/track.ts    user upsert + event logging
src/lib/i18n.ts     uz / ru / en strings
src/lib/ai.ts       Claude helper with fallback text
scripts/set-webhook.mjs
scripts/db-migrate.mjs   applies db/schema.sql
db/schema.sql
```
