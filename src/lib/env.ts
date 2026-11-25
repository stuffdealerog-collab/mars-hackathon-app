import "server-only";
import { z } from "zod";

/**
 * Server-side environment, validated with zod.
 *
 * Every variable is optional at parse time so `next build` never fails because
 * a secret is missing (the team adds DATABASE_URL / TELEGRAM_BOT_TOKEN /
 * ANTHROPIC_API_KEY later). Features check for the values they need at call time instead.
 * Invalid values are ignored with a warning that names the variable but never
 * prints its value.
 */
const schemas = {
  // Neon Postgres (pooled connection string, set on Vercel by the Neon integration)
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\/\S+$/, "expected a postgres:// connection string"),
  // Telegram
  TELEGRAM_BOT_TOKEN: z
    .string()
    .regex(/^\d+:[A-Za-z0-9_-]{30,}$/, "expected <digits>:<token> from @BotFather"),
  TELEGRAM_WEBHOOK_SECRET: z
    .string()
    .regex(/^[A-Za-z0-9_-]{16,256}$/, "use 16-256 chars of A-Z a-z 0-9 _ -"),
  BOT_USERNAME: z
    .string()
    .regex(/^@?[A-Za-z0-9_]{4,32}$/, "expected a Telegram username")
    .transform((s) => s.replace(/^@/, "")),
  // App
  PUBLIC_URL: z
    .url()
    .refine((s) => s.startsWith("https://") || s.startsWith("http://localhost"), "must be https")
    .transform((s) => s.replace(/\/+$/, "")),
  // Claude (optional)
  // A placeholder must read as "not configured", not as a key that fails every call.
  ANTHROPIC_API_KEY: z.string().regex(/^sk-ant-[A-Za-z0-9_-]{30,}$/, "expected an sk-ant-… key from console.anthropic.com"),
  ANTHROPIC_MODEL: z.string(),
  // Set automatically by Vercel (used as a PUBLIC_URL fallback)
  VERCEL_PROJECT_PRODUCTION_URL: z.string(),

  // ---- Value loop 2026-11-25 (all optional; a feature that needs one checks for it at call time)

  /**
   * Bearer token for /api/cron/tick (src/lib/cron). Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` on its
   * own once it is set; GitHub Actions sends it from the repo secret of the same name. Unset or invalid = the tick
   * runs nothing (health answer only). Set it in Vercel Production only, never in .env.local: the tick ignores it
   * outside VERCEL_ENV=production (src/lib/cron/auth.ts tickSecret).
   */
  CRON_SECRET: z
    .string()
    .regex(/^[A-Za-z0-9_\-+/=.~]{32,256}$/, "use 32-256 chars of A-Z a-z 0-9 _ - + / = . ~ (e.g. openssl rand -hex 32)"),
  /** Telegram chat for team alerts (fal balance, failed publishes, cron errors): a group id (-100…) or a user id. */
  OPS_CHAT_ID: z
    .string()
    .regex(/^-?\d{5,20}$/, "expected a numeric Telegram chat id")
    .transform(Number)
    .refine(Number.isSafeInteger, "chat id is out of range"),
  /**
   * Routes with no UI caller (radar, video, department, …) stay off unless named here: a comma-separated list of
   * route names (e.g. "radar,video"), or "all". Unset = every labs route is off. Parsed by the labs gate.
   */
  LABS_ROUTES: z.string().regex(/^[A-Za-z0-9_/,*\s-]{1,512}$/, "expected a comma-separated list of route names, all or *"),
  /** AES-256-GCM key for connector tokens at rest: base64 of 32 random bytes (openssl rand -base64 32). */
  CONNECTOR_TOKEN_KEY: z
    .string()
    .regex(/^[A-Za-z0-9+/_-]{43}={0,1}$/, "expected base64 of 32 random bytes")
    .refine((s) => Buffer.from(s, "base64").length === 32, "expected base64 of 32 random bytes"),
  /** Telegram ids of the team, comma-separated: /stats leaves their traffic out of the numbers. */
  STATS_TEAM_TG_IDS: z
    .string()
    .regex(/^\s*\d{1,20}(\s*,\s*\d{1,20})*\s*$/, "expected comma-separated Telegram user ids")
    .transform((s) => s.split(",").map((id) => Number(id.trim())))
    .refine((ids) => ids.every(Number.isSafeInteger), "an id is out of range"),
  // Connectors (read-only insights). Set only in Vercel Production: the OAuth redirect URIs are registered there.
  /** Meta app (Facebook Login for Business: Instagram insights, Meta ads). */
  META_APP_ID: z.string().regex(/^\d{5,20}$/, "expected the numeric Meta App ID"),
  META_APP_SECRET: z.string().regex(/^[A-Za-z0-9]{16,64}$/, "expected the Meta App Secret"),
  /** One Google "Web application" OAuth client serves YouTube and Google Ads. */
  GOOGLE_OAUTH_CLIENT_ID: z
    .string()
    .regex(/^[A-Za-z0-9-]+\.apps\.googleusercontent\.com$/, "expected <id>.apps.googleusercontent.com"),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/, "expected the OAuth client secret"),
  /** Google Ads API developer token (Google Ads API Center of a manager account). */
  GOOGLE_ADS_DEVELOPER_TOKEN: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/, "expected the Google Ads developer token"),
} satisfies Record<string, z.ZodType>;

type Schemas = typeof schemas;
export type Env = { [K in keyof Schemas]?: z.output<Schemas[K]> };

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const out: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(schemas)) {
    const raw = process.env[key];
    if (raw === undefined || raw.trim() === "") continue;
    const parsed = schema.safeParse(raw.trim());
    if (parsed.success) {
      out[key] = parsed.data;
    } else {
      console.warn(`[env] ${key} is invalid and will be ignored: ${parsed.error.issues[0]?.message}`);
    }
  }
  cached = out as Env;
  return cached;
}

/** Public https origin of the app, without a trailing slash. */
export function getPublicUrl(): string | undefined {
  const env = getEnv();
  if (env.PUBLIC_URL) return env.PUBLIC_URL;
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return undefined;
}
