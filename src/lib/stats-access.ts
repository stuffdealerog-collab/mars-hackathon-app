import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Who may open /stats (checked in src/proxy.ts, and again by the page before it reads the database):
 *
 * - STATS_PASSWORD set: HTTP Basic auth with that password; the user name is ignored ("mercat" by convention).
 * - STATS_PASSWORD unset in production: the page does not exist (404), so a forgotten variable never leaves it open.
 * - STATS_PASSWORD unset outside production (next dev): open.
 *
 * The password is compared as SHA-256 digests with timingSafeEqual: equal lengths, constant time, whatever is sent.
 */
export type StatsGate = "allow" | "challenge" | "hidden";

export const STATS_REALM = 'Basic realm="Mercat stats", charset="UTF-8"';

const BASIC_RE = /^Basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i;

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

/** The password part of a Basic Authorization header, or null when the header is missing or malformed. */
function basicPassword(authorization: string | null | undefined): string | null {
  const m = BASIC_RE.exec(authorization ?? "");
  if (!m) return null;
  const decoded = Buffer.from(m[1], "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  return colon < 0 ? null : decoded.slice(colon + 1);
}

export function statsGate(
  authorization: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): StatsGate {
  const password = env.STATS_PASSWORD?.trim();
  if (!password) return env.NODE_ENV === "production" ? "hidden" : "allow";
  const given = basicPassword(authorization);
  if (given === null) return "challenge";
  return timingSafeEqual(digest(given), digest(password)) ? "allow" : "challenge";
}
