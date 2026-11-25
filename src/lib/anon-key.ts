import "server-only";
import { createHmac, randomBytes } from "node:crypto";

/**
 * Pseudonymous key for an anonymous web caller, for per-caller limits: "ip:" + 16 hex chars of
 * HMAC-SHA256(server key, "<purpose>:<ip>"). Raw IPs are never stored. A plain hash of an IPv4 address is
 * reversed by hashing all 2^32 addresses; a keyed hash cannot be without the server key.
 *
 * server key = HMAC-SHA256(key = "mercat-anon-ip", message = TELEGRAM_BOT_TOKEN), the recipe of the handoff key
 * (uslub/handoff.ts), so no new env variable; TELEGRAM_WEBHOOK_SECRET when there is no bot token. With neither
 * (local dev, tests) the key is random per process: limits then count per instance.
 * `purpose` keeps the Claude budget and the media/visual caps from sharing one key per person.
 */

let cached: { secret: string; key: Buffer } | null = null;
let warned = false;

function serverKey(): Buffer {
  const secret = process.env.TELEGRAM_BOT_TOKEN?.trim() || process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || "";
  if (cached && cached.secret === secret) return cached.key;
  let key: Buffer;
  if (secret) {
    key = createHmac("sha256", "mercat-anon-ip").update(secret).digest();
  } else {
    key = randomBytes(32);
    if (!warned) {
      console.warn("[anon-key] no TELEGRAM_BOT_TOKEN or TELEGRAM_WEBHOOK_SECRET: anonymous ids are random per process.");
      warned = true;
    }
  }
  cached = { secret, key };
  return key;
}

export function anonIpKey(ip: string, purpose: "claude" | "media"): string {
  return `ip:${createHmac("sha256", serverKey()).update(`${purpose}:${ip}`).digest("hex").slice(0, 16)}`;
}

/** Tashkent is UTC+5 all year (no daylight saving time). */
const TASHKENT_OFFSET_MS = 5 * 3600_000;

/** The calendar day in Tashkent, as YYYY-MM-DD. */
export function tashkentDay(now: Date = new Date()): string {
  return new Date(now.getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Cookie-less visitor key for analytics, valid for one Tashkent day: "v:" + 16 hex chars of
 * HMAC-SHA256(server key, "visit:<day>:<ip>:<user agent>"). The same browser on the same network keeps one key all
 * day (so a landing visit, a Studio open and a brand made that day join up) and gets a new key the next day that
 * cannot be linked to the old one. Neither the IP nor the User-Agent is stored, and without the server key the key
 * cannot be reversed. Separate from anonIpKey (different message), so a visitor key never matches a budget key.
 */
export function dailyVisitorKey(ip: string, userAgent: string, now: Date = new Date()): string {
  const message = `visit:${tashkentDay(now)}:${ip}:${userAgent}`;
  return `v:${createHmac("sha256", serverKey()).update(message).digest("hex").slice(0, 16)}`;
}
