import type { MediaProviderId } from "./types";

/**
 * Media env config, parsed from a plain env object (pure, so it is unit-tested).
 * Keys live only in .env.local / Vercel env. Nothing here is ever logged or
 * returned to the browser — only booleans like `configured`.
 *
 *   HIGGSFIELD_API_KEY      "<key id>:<key secret>" from cloud.higgsfield.ai
 *                           (or HF_API_KEY + HF_API_SECRET, the names the official SDK reads)
 *   HIGGSFIELD_VIDEO_MODEL  optional model path override, e.g. "bytedance/seedance/v1/pro/image-to-video"
 *   HIGGSFIELD_IMAGE_MODEL  optional model path override
 *   FAL_KEY                 fal.ai key
 *   FAL_VIDEO_MODEL         optional, default in providers/fal.ts
 *   FAL_IMAGE_MODEL         optional, default in providers/fal.ts
 *   MEDIA_PROVIDERS         preference order, default "higgsfield,fal"
 *   MEDIA_DAILY_LIMIT       jobs per rolling 24 h for the whole app, default 30
 *   MEDIA_USER_DAILY_LIMIT  per verified Telegram user, default 5
 *   MEDIA_ANON_DAILY_LIMIT  shared by all anonymous web callers, default 5; 0 = Telegram login required
 *   MEDIA_DEMO              "1" = offline demo provider (pre-rendered, labelled "namuna")
 *   MEDIA_VISUAL_DAILY_LIMIT        style analyses (Claude vision) per rolling 24 h, whole app, default 60
 *   MEDIA_VISUAL_BRAND_DAILY_LIMIT  style analyses per brand per rolling 24 h, default 8
 *   MEDIA_VISUAL_ACTOR_DAILY_LIMIT  style analyses per caller (Telegram user, or hashed IP) per 24 h, default 12
 */
export interface MediaConfig {
  higgsfield?: { keyId: string; keySecret: string; videoModel?: string; imageModel?: string };
  fal?: { key: string; videoModel?: string; imageModel?: string };
  order: MediaProviderId[];
  dailyLimit: number;
  userDailyLimit: number;
  anonDailyLimit: number;
  visualDailyLimit: number;
  visualBrandDailyLimit: number;
  visualActorDailyLimit: number;
  demo: boolean;
  /** Names of env vars that were present but malformed (never their values). */
  warnings: string[];
}

type Env = Record<string, string | undefined>;

const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);
const MODEL_PATH_RE = /^[a-z0-9][a-z0-9._\-/]{2,160}$/i;

export function readMediaConfig(env: Env): MediaConfig {
  const warnings: string[] = [];
  const model = (name: string) => {
    const v = clean(env[name]);
    if (v === undefined) return undefined;
    if (!MODEL_PATH_RE.test(v) || v.includes("..")) {
      warnings.push(name);
      return undefined;
    }
    return v.replace(/^\/+/, "");
  };

  let higgsfield: MediaConfig["higgsfield"];
  const combined = clean(env.HIGGSFIELD_API_KEY);
  if (combined) {
    const i = combined.indexOf(":");
    if (i > 0 && i < combined.length - 1) {
      higgsfield = { keyId: combined.slice(0, i), keySecret: combined.slice(i + 1) };
    } else {
      warnings.push("HIGGSFIELD_API_KEY");
    }
  } else if (clean(env.HF_API_KEY) && clean(env.HF_API_SECRET)) {
    higgsfield = { keyId: clean(env.HF_API_KEY)!, keySecret: clean(env.HF_API_SECRET)! };
  }
  if (higgsfield) {
    higgsfield.videoModel = model("HIGGSFIELD_VIDEO_MODEL");
    higgsfield.imageModel = model("HIGGSFIELD_IMAGE_MODEL");
  }

  let fal: MediaConfig["fal"];
  const falKey = clean(env.FAL_KEY);
  if (falKey) {
    if (/\s/.test(falKey) || falKey.length < 16) warnings.push("FAL_KEY");
    else fal = { key: falKey, videoModel: model("FAL_VIDEO_MODEL"), imageModel: model("FAL_IMAGE_MODEL") };
  }

  const known: MediaProviderId[] = ["higgsfield", "fal"];
  const order = (clean(env.MEDIA_PROVIDERS) ?? "higgsfield,fal")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is MediaProviderId => (known as string[]).includes(s));
  for (const k of known) if (!order.includes(k)) order.push(k);
  const demo = clean(env.MEDIA_DEMO) === "1";
  if (demo) order.push("demo");

  const limit = (name: string, fallback: number) => {
    const raw = clean(env[name]);
    if (raw === undefined) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      warnings.push(name);
      return fallback;
    }
    return Math.min(1000, Math.floor(n));
  };

  return {
    higgsfield,
    fal,
    order,
    dailyLimit: limit("MEDIA_DAILY_LIMIT", 30),
    userDailyLimit: limit("MEDIA_USER_DAILY_LIMIT", 5),
    anonDailyLimit: limit("MEDIA_ANON_DAILY_LIMIT", 5),
    visualDailyLimit: limit("MEDIA_VISUAL_DAILY_LIMIT", 60),
    visualBrandDailyLimit: limit("MEDIA_VISUAL_BRAND_DAILY_LIMIT", 8),
    visualActorDailyLimit: limit("MEDIA_VISUAL_ACTOR_DAILY_LIMIT", 12),
    demo,
    warnings,
  };
}

/** All secret values, for scrubbing provider error messages. */
export function configSecrets(c: MediaConfig): string[] {
  return [c.higgsfield?.keyId, c.higgsfield?.keySecret, c.fal?.key].filter((s): s is string => Boolean(s));
}
