import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Who may run the tick (/api/cron/tick):
 *
 * - Production deployment with CRON_SECRET set: the request must carry `Authorization: Bearer <CRON_SECRET>`. Vercel
 *   Cron sends exactly that header on its own once CRON_SECRET exists in the project's env; the GitHub workflow sends
 *   it from the repo secret.
 * - Anywhere else (CRON_SECRET unset or invalid, see env.ts; a preview deployment; a local `next dev`/`next start`):
 *   nobody runs tasks. The route gives a no-op health answer, so a forgotten variable never lets the public trigger
 *   work that costs money or messages owners, and branch code never runs the tasks against the shared database.
 *
 * The token is compared as SHA-256 digests with timingSafeEqual: equal lengths and constant time, whatever is sent.
 */
export type TickAuth = "run" | "unauthorized" | "health";

const BEARER_RE = /^Bearer\s+(\S+)\s*$/i;

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

/**
 * The secret the tick checks, or undefined outside Vercel Production (VERCEL_ENV is set by Vercel at runtime).
 * Local servers and previews point at the production database, so there the tick only ever answers health.
 */
export function tickSecret(env: Readonly<Record<string, string | undefined>>, secret: string | undefined): string | undefined {
  return env.VERCEL_ENV === "production" ? secret : undefined;
}

export function tickAuth(authorization: string | null | undefined, secret: string | undefined): TickAuth {
  const expected = secret?.trim();
  if (!expected) return "health";
  const m = BEARER_RE.exec(authorization ?? "");
  if (!m) return "unauthorized";
  return timingSafeEqual(digest(m[1]), digest(expected)) ? "run" : "unauthorized";
}
