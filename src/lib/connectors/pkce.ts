import { createHash, randomBytes } from "node:crypto";
import type { ConnectorId } from "./types";

/**
 * OAuth state and PKCE (RFC 7636, S256). The state is 32 random bytes; its row in connect_oauth_states is used once
 * (an atomic UPDATE … WHERE used_at IS NULL AND expires_at > now(), repo.ts) and lives 10 minutes. The callback runs
 * in an external browser with no Telegram session, so the single-use state row is what proves who started it.
 */

export const STATE_TTL_MS = 10 * 60 * 1000;

/** 32 random bytes, base64url (43 characters): states and PKCE verifiers. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier, "ascii").digest("base64url");

export function newPkce(): { verifier: string; challenge: string } {
  const verifier = randomToken();
  return { verifier, challenge: pkceChallenge(verifier) };
}

export const stateExpiry = (now: Date) => new Date(now.getTime() + STATE_TTL_MS);

export type StateProblem = "unknown" | "used" | "expired" | "provider";

/** Why a state row cannot be accepted, or null when it can (the same checks the consuming UPDATE makes). */
export function stateProblem(
  row: { provider: string; expiresAt: Date; usedAt: Date | null } | null,
  provider: ConnectorId,
  now: Date,
): StateProblem | null {
  if (!row) return "unknown";
  if (row.usedAt) return "used";
  if (row.expiresAt.getTime() <= now.getTime()) return "expired";
  if (row.provider !== provider) return "provider";
  return null;
}
