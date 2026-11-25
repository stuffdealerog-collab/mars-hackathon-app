import "server-only";
import { createHmac, randomBytes } from "node:crypto";

/**
 * A channel member as a keyed hash ("m:" + 16 hex), never a Telegram id: joins and leaves are counted per channel
 * without keeping who joined. Key = HMAC-SHA256(key = "mercat-member", message = TELEGRAM_BOT_TOKEN), the recipe of
 * anon-key.ts and handoff.ts (no new env variable); random per process when there is no token (local dev, tests).
 */
let cached: { secret: string; key: Buffer } | null = null;

function serverKey(): Buffer {
  const secret = process.env.TELEGRAM_BOT_TOKEN?.trim() || process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || "";
  if (cached && cached.secret === secret) return cached.key;
  const key = secret ? createHmac("sha256", "mercat-member").update(secret).digest() : randomBytes(32);
  cached = { secret, key };
  return key;
}

export function memberKey(userId: number): string {
  return `m:${createHmac("sha256", serverKey()).update(String(userId)).digest("hex").slice(0, 16)}`;
}
