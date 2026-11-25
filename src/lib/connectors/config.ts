import { CONNECTOR_IDS, type ConnectorId, type ConnectorInfo, type ConnectorMode } from "./types";

/**
 * Connector env config, parsed from a plain env object (pure, unit-tested; same shape as media/config.ts).
 * Nothing here is ever logged or returned: `warnings` holds variable NAMES only, and the keys are Buffers that
 * JSON.stringify never prints as the original base64.
 *
 *   CONNECTOR_TOKEN_KEY       base64 of 32 random bytes: AES-256-GCM key for tokens at rest (env.ts)
 *   CONNECTOR_TOKEN_KEY_PREV  optional: the previous key, still accepted for reading during a rotation
 *   META_APP_ID, META_APP_SECRET          the Meta app (env.ts)
 *   META_IG_CONFIG_ID         Facebook Login for Business configuration for Instagram insights
 *   META_ADS_CONFIG_ID        Facebook Login for Business configuration for ads_read
 *   META_GRAPH_VERSION        optional, default v27.0
 *   GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET   one Google "Web application" client (env.ts)
 *   GOOGLE_ADS_API_VERSION    optional, default v26
 *   GOOGLE_ADS_DEVELOPER_TOKEN  optional (env.ts): sent only when set
 *   CONNECTOR_ENABLED         optional allowlist and kill switch: "instagram,youtube", "none"; unset = all with credentials
 *   CONNECTOR_LIVE            providers whose app review is done: everyone may connect them; the rest are test mode
 *   CONNECTOR_TESTERS         Telegram ids who see test-mode connectors (they must also be testers in the consoles)
 *
 * A provider is enabled only with the token key, an https public URL (the redirect URI host) and its own
 * credentials, on a production deployment or a local server. Never on a Vercel preview: previews share the
 * production database and the OAuth redirect URIs are registered for the production domain only.
 */

type Env = Readonly<Record<string, string | undefined>>;

export interface ProviderSetting {
  enabled: boolean;
  mode: ConnectorMode;
  /** Env names a provider still needs (for the owner's setup check; names only). */
  missing: string[];
}

export interface ConnectorConfig {
  /** Current key first, then the previous one. Empty = nothing can be stored. */
  keys: Buffer[];
  publicUrl: string | null;
  testers: ReadonlySet<number>;
  providers: Record<ConnectorId, ProviderSetting>;
  meta: { appId: string | null; appSecret: string | null; igConfigId: string | null; adsConfigId: string | null; graphVersion: string };
  google: { clientId: string | null; clientSecret: string | null; adsApiVersion: string; adsDeveloperToken: string | null };
  /** Names of variables that were present but malformed. */
  warnings: string[];
}

export const DEFAULT_GRAPH_VERSION = "v27.0";
export const DEFAULT_GOOGLE_ADS_VERSION = "v26";

const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

export function parseKey(raw: string | undefined): Buffer | null {
  const v = clean(raw);
  if (!v || !/^[A-Za-z0-9+/_-]{43}={0,1}$/.test(v)) return null;
  const buf = Buffer.from(v.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  return buf.length === 32 ? buf : null;
}

function publicUrlOf(env: Env): string | null {
  const raw = clean(env.PUBLIC_URL) ?? (clean(env.VERCEL_PROJECT_PRODUCTION_URL) ? `https://${clean(env.VERCEL_PROJECT_PRODUCTION_URL)}` : undefined);
  if (!raw) return null;
  const url = raw.replace(/\/+$/, "");
  return /^https:\/\/[^\s/]+$/.test(url) || /^http:\/\/localhost(:\d+)?$/.test(url) ? url : null;
}

function idList(raw: string | undefined): Set<string> | null {
  const v = clean(raw);
  if (!v) return null;
  return new Set(v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

export function readConnectorConfig(env: Env): ConnectorConfig {
  const warnings: string[] = [];
  const pick = (name: string, re: RegExp): string | null => {
    const v = clean(env[name]);
    if (!v) return null;
    if (re.test(v)) return v;
    warnings.push(name);
    return null;
  };

  const key = parseKey(env.CONNECTOR_TOKEN_KEY);
  if (clean(env.CONNECTOR_TOKEN_KEY) && !key) warnings.push("CONNECTOR_TOKEN_KEY");
  const prev = parseKey(env.CONNECTOR_TOKEN_KEY_PREV);
  if (clean(env.CONNECTOR_TOKEN_KEY_PREV) && !prev) warnings.push("CONNECTOR_TOKEN_KEY_PREV");
  const keys = key ? [key, ...(prev ? [prev] : [])] : [];

  const publicUrl = publicUrlOf(env);
  if (clean(env.PUBLIC_URL) && !publicUrl) warnings.push("PUBLIC_URL");

  const testers = new Set<number>();
  for (const part of (clean(env.CONNECTOR_TESTERS) ?? "").split(",")) {
    const s = part.trim();
    if (!s) continue;
    const n = Number(s);
    if (/^\d{1,20}$/.test(s) && Number.isSafeInteger(n)) testers.add(n);
    else if (!warnings.includes("CONNECTOR_TESTERS")) warnings.push("CONNECTOR_TESTERS");
  }

  let graphVersion = DEFAULT_GRAPH_VERSION;
  const gv = clean(env.META_GRAPH_VERSION);
  if (gv) {
    if (/^v\d{1,3}\.\d$/.test(gv)) graphVersion = gv;
    else warnings.push("META_GRAPH_VERSION");
  }
  let adsApiVersion = DEFAULT_GOOGLE_ADS_VERSION;
  const av = clean(env.GOOGLE_ADS_API_VERSION);
  if (av) {
    if (/^v\d{1,3}$/.test(av)) adsApiVersion = av;
    else warnings.push("GOOGLE_ADS_API_VERSION");
  }

  const meta = {
    appId: pick("META_APP_ID", /^\d{5,20}$/),
    appSecret: pick("META_APP_SECRET", /^[A-Za-z0-9]{16,64}$/),
    igConfigId: pick("META_IG_CONFIG_ID", /^\d{5,20}$/),
    adsConfigId: pick("META_ADS_CONFIG_ID", /^\d{5,20}$/),
    graphVersion,
  };
  const google = {
    clientId: pick("GOOGLE_OAUTH_CLIENT_ID", /^[A-Za-z0-9-]+\.apps\.googleusercontent\.com$/),
    clientSecret: pick("GOOGLE_OAUTH_CLIENT_SECRET", /^[A-Za-z0-9_-]{16,128}$/),
    adsApiVersion,
    adsDeveloperToken: pick("GOOGLE_ADS_DEVELOPER_TOKEN", /^[A-Za-z0-9_-]{16,64}$/),
  };

  const allow = idList(env.CONNECTOR_ENABLED);
  const live = idList(env.CONNECTOR_LIVE) ?? new Set<string>();
  // Vercel sets VERCEL_ENV at runtime: production, preview or development (vercel env pull). Unset = next dev / tests.
  const deployOk = env.VERCEL_ENV !== "preview";

  const need: Record<ConnectorId, [string, string | null][]> = {
    instagram: [
      ["META_APP_ID", meta.appId],
      ["META_APP_SECRET", meta.appSecret],
      ["META_IG_CONFIG_ID", meta.igConfigId],
    ],
    meta_ads: [
      ["META_APP_ID", meta.appId],
      ["META_APP_SECRET", meta.appSecret],
      ["META_ADS_CONFIG_ID", meta.adsConfigId],
    ],
    youtube: [
      ["GOOGLE_OAUTH_CLIENT_ID", google.clientId],
      ["GOOGLE_OAUTH_CLIENT_SECRET", google.clientSecret],
    ],
    google_ads: [
      ["GOOGLE_OAUTH_CLIENT_ID", google.clientId],
      ["GOOGLE_OAUTH_CLIENT_SECRET", google.clientSecret],
    ],
  };

  const providers = {} as Record<ConnectorId, ProviderSetting>;
  for (const id of CONNECTOR_IDS) {
    const missing = need[id].filter(([, v]) => !v).map(([name]) => name);
    if (!key) missing.unshift("CONNECTOR_TOKEN_KEY");
    if (!publicUrl) missing.push("PUBLIC_URL");
    const allowed = !allow || allow.has(id);
    providers[id] = { enabled: deployOk && allowed && missing.length === 0, mode: live.has(id) ? "live" : "test", missing };
  }

  return { keys, publicUrl, testers, providers, meta, google, warnings };
}

/** The caller may start a connection: the provider is on, and live, or the caller is a tester. */
export function canConnect(cfg: ConnectorConfig, id: ConnectorId, telegramId: number | null): boolean {
  const p = cfg.providers[id];
  if (!p.enabled) return false;
  return p.mode === "live" || (telegramId != null && cfg.testers.has(telegramId));
}

/** Connectors the caller may connect, in a fixed order (Instagram first: it matters most to Tashkent shops). */
export function visibleConnectors(cfg: ConnectorConfig, telegramId: number | null): ConnectorInfo[] {
  return CONNECTOR_IDS.filter((id) => canConnect(cfg, id, telegramId)).map((id) => ({ id, mode: cfg.providers[id].mode }));
}

/** At least one provider is configured (the tick task and the list route return at once otherwise). */
export const anyEnabled = (cfg: ConnectorConfig) => CONNECTOR_IDS.some((id) => cfg.providers[id].enabled);

/** The redirect URI registered in each console: exactly `<public url>/api/connect/callback/<provider>`. */
export const redirectUri = (cfg: Pick<ConnectorConfig, "publicUrl">, id: ConnectorId) => `${cfg.publicUrl}/api/connect/callback/${id}`;
