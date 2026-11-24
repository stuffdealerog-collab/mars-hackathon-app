import "server-only";
import { getSql, isDbConfigured } from "./db";

export type TrackedUser = {
  id: number;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  language_code?: string | null;
};

/** Telegram deep-link payloads allow only A-Z a-z 0-9 _ - (max 64 chars). */
const PAYLOAD_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Turns a deep-link payload into a traffic source:
 *   "src_booth1" -> "booth1", "ref_42" -> "ref_42", invalid/empty -> null
 */
export function parseSource(payload?: string | null): string | null {
  const p = payload?.trim();
  if (!p || !PAYLOAD_RE.test(p)) return null;
  return p.startsWith("src_") && p.length > 4 ? p.slice(4) : p;
}

const clip = (value: string | null | undefined, max: number) =>
  value ? value.slice(0, max) : null;

let warned = false;
function dbMissing(): boolean {
  if (isDbConfigured()) return false;
  if (!warned) {
    console.warn("[track] DATABASE_URL is not configured; analytics are disabled.");
    warned = true;
  }
  return true;
}

/**
 * Creates or refreshes a user. `source` is first-touch: it is never overwritten.
 * `isNew` is true when the row was just inserted (xmax = 0 on a fresh insert).
 */
export async function upsertUser(
  user: TrackedUser,
  source?: string | null,
): Promise<{ isNew: boolean } | null> {
  if (dbMissing()) return null;
  try {
    const rows = await getSql()`
      INSERT INTO app_users AS u
        (telegram_id, username, first_name, last_name, language_code, source)
      VALUES (
        ${user.id},
        ${clip(user.username, 64)},
        ${clip(user.first_name, 128)},
        ${clip(user.last_name, 128)},
        ${clip(user.language_code, 16)},
        ${clip(source, 64)}
      )
      ON CONFLICT (telegram_id) DO UPDATE SET
        username      = COALESCE(EXCLUDED.username, u.username),
        first_name    = COALESCE(EXCLUDED.first_name, u.first_name),
        last_name     = COALESCE(EXCLUDED.last_name, u.last_name),
        language_code = COALESCE(EXCLUDED.language_code, u.language_code),
        source        = COALESCE(u.source, EXCLUDED.source),
        last_seen_at  = now()
      RETURNING (u.xmax = 0) AS is_new
    `;
    return { isNew: rows[0]?.is_new === true };
  } catch (err) {
    throw new Error(`app_users upsert failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function logEvent(
  telegramId: number | null,
  type: string,
  props: Record<string, unknown> = {},
): Promise<void> {
  if (dbMissing()) return;
  try {
    await getSql()`
      INSERT INTO events (telegram_id, type, props)
      VALUES (${telegramId}, ${type.slice(0, 64)}, ${JSON.stringify(props ?? {})}::jsonb)
    `;
  } catch (err) {
    throw new Error(`events insert failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Upsert the user, then log an event. Never throws: analytics must not break
 * the bot or the Mini App. Returns null when tracking failed or is disabled.
 */
export async function track(
  user: TrackedUser,
  type: string,
  props: Record<string, unknown> = {},
  options: { source?: string | null } = {},
): Promise<{ isNew: boolean } | null> {
  try {
    const result = await upsertUser(user, options.source);
    await logEvent(user.id, type, result?.isNew ? { ...props, new_user: true } : props);
    return result;
  } catch (err) {
    console.error("[track]", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Like logEvent, but never throws. */
export async function safeLogEvent(
  telegramId: number | null,
  type: string,
  props: Record<string, unknown> = {},
): Promise<void> {
  try {
    await logEvent(telegramId, type, props);
  } catch (err) {
    console.error("[track]", err instanceof Error ? err.message : err);
  }
}
