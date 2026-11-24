import "server-only";
import { z } from "zod";

/**
 * Server-side environment, validated with zod.
 *
 * Every variable is optional at parse time so `next build` never fails because
 * a secret is missing (the team adds TELEGRAM_BOT_TOKEN / ANTHROPIC_API_KEY
 * later). Features check for the values they need at call time instead.
 * Invalid values are ignored with a warning that names the variable but never
 * prints its value.
 */
const schemas = {
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),
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
  ANTHROPIC_API_KEY: z.string(),
  ANTHROPIC_MODEL: z.string(),
  // Set automatically by Vercel (used as a PUBLIC_URL fallback)
  VERCEL_PROJECT_PRODUCTION_URL: z.string(),
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
