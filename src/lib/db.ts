import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { getEnv } from "./env";

/**
 * Server-only Neon Postgres client (HTTP driver, one round trip per query).
 *
 * Always use the tagged template form, which sends values as bound parameters:
 *   await getSql()`SELECT * FROM app_users WHERE telegram_id = ${id}`
 * Never build SQL by string concatenation.
 *
 * The client is created lazily on first use, so a missing DATABASE_URL never
 * breaks `next build`; callers check `isDbConfigured()` first.
 */
export type Sql = NeonQueryFunction<false, false>;

let client: Sql | null = null;

export function isDbConfigured(): boolean {
  return Boolean(getEnv().DATABASE_URL);
}

export function getSql(): Sql {
  if (client) return client;
  const url = getEnv().DATABASE_URL;
  if (!url) throw new Error("Database is not configured (DATABASE_URL)");
  client = neon(url);
  return client;
}

/** Postgres SQLSTATE of a failed query, e.g. "42P01" (table does not exist). */
export function pgErrorCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}
