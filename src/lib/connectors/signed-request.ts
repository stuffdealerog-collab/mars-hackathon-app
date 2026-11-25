import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta's signed_request (deauthorize and data-deletion callbacks): "<b64url signature>.<b64url JSON payload>",
 * signature = HMAC-SHA256(payload part, app secret). Returns the app-scoped user id, or null for anything that does
 * not verify. Pure; the secret never leaves this function.
 */
export function parseSignedRequest(signed: string, appSecret: string): { userId: string } | null {
  const parts = signed.trim().split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [sigPart, payloadPart] = parts;
  const expected = createHmac("sha256", appSecret).update(payloadPart).digest();
  const given = Buffer.from(sigPart, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let payload: { algorithm?: unknown; user_id?: unknown };
  try {
    payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (String(payload.algorithm).toUpperCase() !== "HMAC-SHA256") return null;
  const userId = typeof payload.user_id === "string" || typeof payload.user_id === "number" ? String(payload.user_id) : "";
  return /^\d{1,32}$/.test(userId) ? { userId } : null;
}

/**
 * The confirmation code Mercat gives Meta for a data-deletion request: "<random>.<check>", where the check is an
 * HMAC of the random part under the app secret. The status page (/data-deletion?code=) confirms a deletion only for
 * a code Mercat issued, so an invented code shows nothing. No database row is needed.
 */
const deletionCheck = (random: string, appSecret: string) => createHmac("sha256", appSecret).update(`data-deletion|${random}`).digest("base64url").slice(0, 10);

export function deletionCode(random: string, appSecret: string): string {
  return `${random}.${deletionCheck(random, appSecret)}`;
}

export function verifyDeletionCode(code: string, appSecret: string | null): boolean {
  if (!appSecret) return false;
  const m = /^([A-Za-z0-9_-]{8,32})\.([A-Za-z0-9_-]{10})$/.exec(code);
  if (!m) return false;
  const given = Buffer.from(m[2]);
  const expected = Buffer.from(deletionCheck(m[1], appSecret));
  return given.length === expected.length && timingSafeEqual(given, expected);
}
