import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv, getPublicUrl } from "@/lib/env";

/**
 * Desktop handoff (product spec §5.1): a brand made in the bot or the Mini App belongs to a Telegram user, but the
 * desktop Studio has no Telegram identity. The bot (and the Mini App, via POST /api/uslub/handoff) gives the owner a
 * signed, expiring key in the Studio link's fragment (`/studio?brand=<id>#k=<key>`: a fragment never reaches the
 * server, so the key stays out of request logs and Referer headers); the Studio sends it back as
 * `Authorization: handoff <k>` and is treated as that Telegram user.
 *
 * Format: "<userId>.<exp>.<sig>" — exp in unix seconds, sig = base64url(HMAC-SHA256(key, "<userId>.<exp>")),
 * key = HMAC-SHA256(key = "mercat-handoff", message = TELEGRAM_BOT_TOKEN) (like Telegram's own WebAppData key; no new
 * env variable). The key is a bearer secret: never log it, never put it in usage events or error messages.
 */

const DAY_S = 86_400;
const TOKEN_RE = /^(\d{1,16})\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/;

function keyFrom(botToken: string): Buffer {
  return createHmac("sha256", "mercat-handoff").update(botToken).digest();
}

const signature = (botToken: string, payload: string) => createHmac("sha256", keyFrom(botToken)).update(payload).digest("base64url");

/** Pure form (explicit bot token and clock) for tests and callers that already hold the token. */
export function signHandoffWith(botToken: string, userId: number, days = 7, now = Date.now()): string {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("handoff: bad user id");
  const exp = Math.floor(now / 1000) + Math.round(days * DAY_S);
  const payload = `${userId}.${exp}`;
  return `${payload}.${signature(botToken, payload)}`;
}

/** The Telegram user id the key was signed for, or null (malformed, foreign signature, or expired). */
export function verifyHandoffWith(botToken: string, k: string | null | undefined, now = Date.now()): number | null {
  if (!k) return null;
  const m = TOKEN_RE.exec(k.trim());
  if (!m) return null;
  const userId = Number(m[1]);
  const exp = Number(m[2]);
  if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(exp)) return null;
  const expected = Buffer.from(signature(botToken, `${m[1]}.${m[2]}`));
  const given = Buffer.from(m[3]);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (exp * 1000 <= now) return null;
  return userId;
}

/** Signs a key for this Telegram user, or returns null when the bot token is not configured. */
export function signHandoff(userId: number, days = 7): string | null {
  const token = getEnv().TELEGRAM_BOT_TOKEN;
  return token ? signHandoffWith(token, userId, days) : null;
}

/** Verifies a key with the configured bot token; null when there is none. */
export function verifyHandoff(k: string | null | undefined): number | null {
  const token = getEnv().TELEGRAM_BOT_TOKEN;
  return token ? verifyHandoffWith(token, k) : null;
}

/** The desktop Studio (PUBLIC_URL first; the production domain otherwise). */
export const studioUrl = () => `${getPublicUrl() ?? "https://mercat-ai.vercel.app"}/studio`;

/**
 * Studio link for a brand: `/studio?brand=<id>#k=<key>`. The owner's handoff key rides in the fragment (the Studio
 * reads it from `location.hash`), so it is never sent to the server. No key when the bot cannot sign one.
 */
export function studioLink(brandId: string, userId: number | null): string {
  const k = userId != null ? signHandoff(userId) : null;
  return `${studioUrl()}?brand=${encodeURIComponent(brandId)}${k ? `#k=${encodeURIComponent(k)}` : ""}`;
}
