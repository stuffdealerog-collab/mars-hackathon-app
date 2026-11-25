import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { keyId, openToken, sealToken, tokenAad } from "../src/lib/connectors/crypto";
import { newPkce, pkceChallenge, randomToken, STATE_TTL_MS, stateExpiry, stateProblem } from "../src/lib/connectors/pkce";
import { parseSignedRequest } from "../src/lib/connectors/signed-request";

const KEY = randomBytes(32);
const PREV = randomBytes(32);
const TOKEN = "EAAG-very-secret-access-token-0123456789";

describe("token sealing (AES-256-GCM)", () => {
  it("round-trips and binds the ciphertext to the row and field", () => {
    const aad = tokenAad("0b6f2c4e-1111-2222-3333-444455556666", "access");
    const sealed = sealToken(TOKEN, aad, KEY);
    expect(sealed.startsWith(`v1.${keyId(KEY)}.`)).toBe(true);
    expect(sealed).not.toContain(TOKEN);
    expect(sealed).not.toContain(Buffer.from(TOKEN).toString("base64").slice(0, 20));
    expect(openToken(sealed, aad, [KEY])).toBe(TOKEN);
    // Two seals of the same value differ (random IV).
    expect(sealToken(TOKEN, aad, KEY)).not.toBe(sealed);
  });

  it("refuses another row, another field, a tampered tag and a truncated envelope", () => {
    const aad = tokenAad("row-a", "access");
    const sealed = sealToken(TOKEN, aad, KEY);
    expect(() => openToken(sealed, tokenAad("row-b", "access"), [KEY])).toThrow();
    expect(() => openToken(sealed, tokenAad("row-a", "refresh"), [KEY])).toThrow();
    const parts = sealed.split(".");
    const tag = Buffer.from(parts[4], "base64url");
    tag[0] ^= 1;
    expect(() => openToken([...parts.slice(0, 4), tag.toString("base64url")].join("."), aad, [KEY])).toThrow();
    expect(() => openToken(parts.slice(0, 4).join("."), aad, [KEY])).toThrow();
    expect(() => openToken("v2.x.y.z.w", aad, [KEY])).toThrow();
  });

  it("the previous key still decrypts; new seals use the current key", () => {
    const aad = tokenAad("row", "refresh");
    const old = sealToken(TOKEN, aad, PREV);
    expect(openToken(old, aad, [KEY, PREV])).toBe(TOKEN);
    expect(() => openToken(old, aad, [KEY])).toThrow();
    expect(sealToken(TOKEN, aad, KEY).split(".")[1]).toBe(keyId(KEY));
  });

  it("errors never carry the token or the key", () => {
    const aad = tokenAad("row", "access");
    try {
      openToken(sealToken(TOKEN, aad, KEY), tokenAad("other", "access"), [KEY]);
    } catch (err) {
      const text = String(err) + String((err as Error).stack);
      expect(text).not.toContain(TOKEN);
      expect(text).not.toContain(KEY.toString("base64"));
    }
  });
});

describe("OAuth state and PKCE", () => {
  it("S256 matches the RFC 7636 appendix B vector", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("makes 43-character url-safe verifiers and states, never the same twice", () => {
    const a = newPkce();
    const b = newPkce();
    expect(a.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.challenge).toBe(pkceChallenge(a.verifier));
    expect(a.verifier).not.toBe(b.verifier);
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("a state lives 10 minutes, is used once and only for its provider", () => {
    const now = new Date("2026-11-25T10:00:00Z");
    expect(stateExpiry(now).getTime() - now.getTime()).toBe(STATE_TTL_MS);
    const row = { provider: "youtube" as const, expiresAt: stateExpiry(now), usedAt: null };
    expect(stateProblem(row, "youtube", now)).toBeNull();
    expect(stateProblem(null, "youtube", now)).toBe("unknown");
    expect(stateProblem(row, "instagram", now)).toBe("provider");
    expect(stateProblem({ ...row, usedAt: now }, "youtube", now)).toBe("used");
    expect(stateProblem(row, "youtube", new Date(now.getTime() + STATE_TTL_MS + 1))).toBe("expired");
  });
});

describe("Meta signed_request", () => {
  const SECRET = "abcdef0123456789abcdef0123456789";
  const make = (payload: object, secret = SECRET) => {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = createHmac("sha256", secret).update(body).digest("base64url");
    return `${sig}.${body}`;
  };

  it("accepts a valid request and returns the app-scoped user id", () => {
    expect(parseSignedRequest(make({ algorithm: "HMAC-SHA256", user_id: "1029384756", issued_at: 1 }), SECRET)).toEqual({ userId: "1029384756" });
  });

  it("refuses a tampered payload, another app's secret and another algorithm", () => {
    const ok = make({ algorithm: "HMAC-SHA256", user_id: "1" });
    const [sig] = ok.split(".");
    const forged = `${sig}.${Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "2" })).toString("base64url")}`;
    expect(parseSignedRequest(forged, SECRET)).toBeNull();
    expect(parseSignedRequest(make({ algorithm: "HMAC-SHA256", user_id: "1" }, "another-secret-0123456789abcdef"), SECRET)).toBeNull();
    expect(parseSignedRequest(make({ algorithm: "HMAC-SHA1", user_id: "1" }), SECRET)).toBeNull();
    expect(parseSignedRequest(make({ algorithm: "HMAC-SHA256" }), SECRET)).toBeNull();
    expect(parseSignedRequest("garbage", SECRET)).toBeNull();
    expect(parseSignedRequest("", SECRET)).toBeNull();
  });
});
