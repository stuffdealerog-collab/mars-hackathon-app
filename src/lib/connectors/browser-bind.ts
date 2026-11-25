import { createHash, timingSafeEqual } from "node:crypto";
import type { ConnectorId } from "./types";

/**
 * Ties a Studio connect to the browser that started it (pure). POST /api/connect/start sets an HttpOnly cookie
 * holding sha256(state), scoped to that provider's callback path and alive as long as the state (10 minutes); the
 * callback accepts a Studio state only when the same browser brings that cookie back. A sign-in link copied out of
 * the start answer and sent to someone else therefore cannot put their Instagram or ad numbers into the sender's
 * Mercat. The Mini App path signs in in the phone's external browser, which shares no cookie with Telegram, so it
 * cannot be bound this way: its return page shows which Mercat account received the connection instead.
 */

export const BIND_TTL_SECONDS = 600;

export const bindCookieName = (provider: ConnectorId) => `cn_${provider}`;
const bindPath = (provider: ConnectorId) => `/api/connect/callback/${provider}`;

export const bindValue = (state: string) => createHash("sha256").update(state, "utf8").digest("base64url");

/** `Secure` is left out only for a plain-http local server (some browsers drop Secure cookies on http://localhost). */
export function bindCookie(provider: ConnectorId, state: string, secure: boolean): string {
  return `${bindCookieName(provider)}=${bindValue(state)}; Path=${bindPath(provider)}; Max-Age=${BIND_TTL_SECONDS}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function clearBindCookie(provider: ConnectorId, secure: boolean): string {
  return `${bindCookieName(provider)}=; Path=${bindPath(provider)}; Max-Age=0; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** One cookie's value from a Cookie header, or null. */
export function readCookie(header: string | null, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim() || null;
  }
  return null;
}

/** The cookie the browser brought matches the state it is finishing. */
export function browserBound(cookie: string | null, state: string): boolean {
  if (!cookie) return false;
  const a = Buffer.from(cookie);
  const b = Buffer.from(bindValue(state));
  return a.length === b.length && timingSafeEqual(a, b);
}
