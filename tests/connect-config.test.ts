import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canConnect, readConnectorConfig, visibleConnectors } from "../src/lib/connectors/config";

const KEY = randomBytes(32).toString("base64");

const META = { META_APP_ID: "1234567890", META_APP_SECRET: "abcdef0123456789abcdef0123456789", META_IG_CONFIG_ID: "111222333", META_ADS_CONFIG_ID: "444555666" };
const GOOGLE = { GOOGLE_OAUTH_CLIENT_ID: "123-abc.apps.googleusercontent.com", GOOGLE_OAUTH_CLIENT_SECRET: "GOCSPX-secret_value-123" };
const BASE = { CONNECTOR_TOKEN_KEY: KEY, PUBLIC_URL: "https://mercat.example", VERCEL_ENV: "production" };

describe("readConnectorConfig", () => {
  it("turns nothing on without a complete set", () => {
    const cfg = readConnectorConfig({});
    expect(Object.values(cfg.providers).every((p) => !p.enabled)).toBe(true);
    // A provider's credentials without the token key: still off.
    const noKey = readConnectorConfig({ ...META, PUBLIC_URL: "https://mercat.example" });
    expect(noKey.providers.instagram.enabled).toBe(false);
    expect(noKey.providers.instagram.missing).toContain("CONNECTOR_TOKEN_KEY");
  });

  it("enables each provider only with its own credentials", () => {
    const cfg = readConnectorConfig({ ...BASE, ...META });
    expect(cfg.providers.instagram.enabled).toBe(true);
    expect(cfg.providers.meta_ads.enabled).toBe(true);
    expect(cfg.providers.youtube.enabled).toBe(false);
    expect(cfg.providers.google_ads.enabled).toBe(false);
    expect(cfg.providers.youtube.missing).toEqual(["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"]);
    const ig = readConnectorConfig({ ...BASE, ...META, META_ADS_CONFIG_ID: "" });
    expect(ig.providers.instagram.enabled).toBe(true);
    expect(ig.providers.meta_ads.enabled).toBe(false);
    expect(ig.providers.meta_ads.missing).toEqual(["META_ADS_CONFIG_ID"]);
  });

  it("needs a 32-byte key and an https public URL", () => {
    const short = readConnectorConfig({ ...BASE, ...GOOGLE, CONNECTOR_TOKEN_KEY: randomBytes(16).toString("base64") });
    expect(short.providers.youtube.enabled).toBe(false);
    expect(short.warnings).toContain("CONNECTOR_TOKEN_KEY");
    const http = readConnectorConfig({ ...BASE, ...GOOGLE, PUBLIC_URL: "http://mercat.example" });
    expect(http.providers.youtube.enabled).toBe(false);
    expect(readConnectorConfig({ ...BASE, ...GOOGLE, PUBLIC_URL: "http://localhost:3000", VERCEL_ENV: undefined }).providers.youtube.enabled).toBe(true);
    // Falls back to the Vercel production host like getPublicUrl.
    const vercel = readConnectorConfig({ ...BASE, ...GOOGLE, PUBLIC_URL: undefined, VERCEL_PROJECT_PRODUCTION_URL: "mercat-ai.vercel.app" });
    expect(vercel.publicUrl).toBe("https://mercat-ai.vercel.app");
    expect(vercel.providers.youtube.enabled).toBe(true);
  });

  it("is off on preview deployments (they share the production database, redirect URIs are production only)", () => {
    const cfg = readConnectorConfig({ ...BASE, ...META, ...GOOGLE, VERCEL_ENV: "preview" });
    expect(Object.values(cfg.providers).every((p) => !p.enabled)).toBe(true);
  });

  it("CONNECTOR_ENABLED is an allowlist and kill switch", () => {
    const cfg = readConnectorConfig({ ...BASE, ...META, ...GOOGLE, CONNECTOR_ENABLED: "instagram, youtube" });
    expect(cfg.providers.instagram.enabled).toBe(true);
    expect(cfg.providers.youtube.enabled).toBe(true);
    expect(cfg.providers.meta_ads.enabled).toBe(false);
    expect(cfg.providers.google_ads.enabled).toBe(false);
    expect(readConnectorConfig({ ...BASE, ...META, CONNECTOR_ENABLED: "none" }).providers.instagram.enabled).toBe(false);
  });

  it("modes are test unless CONNECTOR_LIVE names the provider; the tester gate follows", () => {
    const cfg = readConnectorConfig({ ...BASE, ...META, ...GOOGLE, CONNECTOR_LIVE: "instagram", CONNECTOR_TESTERS: "42, 77" });
    expect(cfg.providers.instagram.mode).toBe("live");
    expect(cfg.providers.youtube.mode).toBe("test");
    expect(canConnect(cfg, "instagram", 1)).toBe(true);
    expect(canConnect(cfg, "youtube", 1)).toBe(false);
    expect(canConnect(cfg, "youtube", 42)).toBe(true);
    expect(canConnect(cfg, "youtube", null)).toBe(false);
    expect(visibleConnectors(cfg, 1).map((c) => c.id)).toEqual(["instagram"]);
    expect(visibleConnectors(cfg, 77)).toEqual([
      { id: "instagram", mode: "live" },
      { id: "meta_ads", mode: "test" },
      { id: "youtube", mode: "test" },
      { id: "google_ads", mode: "test" },
    ]);
  });

  it("warnings name variables, never their values", () => {
    const secret = "not-a-number-secret-value";
    const cfg = readConnectorConfig({ ...BASE, META_APP_ID: secret, META_APP_SECRET: "x", CONNECTOR_TESTERS: `42,${secret}`, CONNECTOR_TOKEN_KEY: "short" });
    expect(cfg.warnings.length).toBeGreaterThan(0);
    expect(JSON.stringify(cfg.warnings)).not.toContain(secret);
    expect(cfg.warnings).toEqual(expect.arrayContaining(["META_APP_ID", "META_APP_SECRET", "CONNECTOR_TESTERS", "CONNECTOR_TOKEN_KEY"]));
    // The parsed key is never part of a serialisable shape.
    expect(JSON.stringify(readConnectorConfig({ ...BASE, ...META }))).not.toContain(KEY);
  });

  it("reads the previous key for rotation and the API versions", () => {
    const prev = randomBytes(32).toString("base64");
    const cfg = readConnectorConfig({ ...BASE, ...META, ...GOOGLE, CONNECTOR_TOKEN_KEY_PREV: prev, META_GRAPH_VERSION: "v28.0", GOOGLE_ADS_API_VERSION: "v27" });
    expect(cfg.keys).toHaveLength(2);
    expect(cfg.meta.graphVersion).toBe("v28.0");
    expect(cfg.google.adsApiVersion).toBe("v27");
    const defaults = readConnectorConfig({ ...BASE, ...META, META_GRAPH_VERSION: "latest" });
    expect(defaults.meta.graphVersion).toBe("v27.0");
    expect(defaults.warnings).toContain("META_GRAPH_VERSION");
  });
});
