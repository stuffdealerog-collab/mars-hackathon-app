import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Tokens at rest: AES-256-GCM with a random 12-byte IV, key from CONNECTOR_TOKEN_KEY (config.ts).
 *
 *   envelope = "v1.<kid>.<iv>.<ciphertext>.<tag>"   (base64url fields; kid = first 8 hex of sha256(key))
 *
 * The associated data binds a ciphertext to its row and field (`<connection id>|access`, `<state>|pkce`), so a
 * sealed token cannot be copied into another row or swapped between fields. Decryption picks the key by kid, so a
 * rotation (CONNECTOR_TOKEN_KEY_PREV) keeps old rows readable. Plain tokens live only in memory during a call: they
 * are never logged, returned, put in events or in error text. Errors here say what failed, never the input.
 */

export type TokenField = "access" | "refresh" | "pkce";

export const tokenAad = (rowId: string, field: TokenField) => `${rowId}|${field}`;

export const keyId = (key: Buffer) => createHash("sha256").update(key).digest("hex").slice(0, 8);

export function sealToken(plain: string, aad: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", keyId(key), iv.toString("base64url"), ct.toString("base64url"), tag.toString("base64url")].join(".");
}

export class TokenSealError extends Error {}

export function openToken(envelope: string, aad: string, keys: readonly Buffer[]): string {
  const parts = envelope.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") throw new TokenSealError("sealed token: unknown format");
  const [, kid, ivB64, ctB64, tagB64] = parts;
  const key = keys.find((k) => keyId(k) === kid);
  if (!key) throw new TokenSealError("sealed token: key not available (rotated out?)");
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  if (iv.length !== 12 || tag.length !== 16) throw new TokenSealError("sealed token: malformed");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new TokenSealError("sealed token: authentication failed");
  }
}
