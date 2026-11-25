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
