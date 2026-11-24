import "server-only";
import { getSupabaseAdmin, isDbConfigured } from "./supabase";

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
    console.warn("[track] Supabase is not configured; analytics are disabled.");
    warned = true;
  }
  return true;
}

/** Creates or refreshes a user. `source` is first-touch: it is never overwritten. */
export async function upsertUser(
  user: TrackedUser,
  source?: string | null,
): Promise<{ isNew: boolean } | null> {
  if (dbMissing()) return null;
  const { data, error } = await getSupabaseAdmin().rpc("upsert_app_user", {
    p_telegram_id: user.id,
    p_username: clip(user.username, 64),
    p_first_name: clip(user.first_name, 128),
    p_last_name: clip(user.last_name, 128),
    p_language_code: clip(user.language_code, 16),
    p_source: clip(source, 64),
  });
  if (error) throw new Error(`upsert_app_user failed: ${error.message}`);
  return { isNew: data === true };
}

export async function logEvent(
  telegramId: number | null,
  type: string,
  props: Record<string, unknown> = {},
): Promise<void> {
  if (dbMissing()) return;
  const { error } = await getSupabaseAdmin()
    .from("events")
    .insert({ telegram_id: telegramId, type: type.slice(0, 64), props });
  if (error) throw new Error(`events insert failed: ${error.message}`);
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
