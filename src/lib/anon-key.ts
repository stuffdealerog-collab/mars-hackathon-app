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
