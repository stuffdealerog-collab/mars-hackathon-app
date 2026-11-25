#!/usr/bin/env node
// Pushes the app's env vars from .env.local to the linked Vercel project
// (production + preview; the PRODUCTION_ONLY group below goes to production only). Empty values
// are skipped; values are never printed. CRON_SECRET, LABS_ROUTES and STATS_PASSWORD are never
// pushed: set them in the Vercel dashboard on purpose (see .env.example).
// Usage: pnpm env:push   (then redeploy: vercel deploy --prod)
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

// Vars that Vercel integrations manage (Neon: DATABASE_URL, DATABASE_URL_UNPOOLED,
// PG*, POSTGRES_*, NEON_*) and Vercel's own VERCEL_* vars are never pushed.
const MANAGED = /^(DATABASE_URL|PG[A-Z_]*|POSTGRES_[A-Z0-9_]*|NEON_[A-Z0-9_]*|VERCEL_[A-Z0-9_]*)$/;

// Only these names are pushed (Vercel's own tokens stay local).
const ALLOWED = [
  "TELEGRAM_BOT_TOKEN",
  "BOT_USERNAME",
  "TELEGRAM_WEBHOOK_SECRET",
  "MENU_BUTTON_TEXT",
  "PUBLIC_URL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "CLAUDE_DAILY_LIMIT",
  "CLAUDE_ANON_DAILY_LIMIT",
  // Media (post pictures): provider keys and daily limits.
  "FAL_KEY",
  "FAL_IMAGE_MODEL",
  "HIGGSFIELD_API_KEY",
  "HF_API_KEY",
  "HF_API_SECRET",
  "MEDIA_PROVIDERS",
  "MEDIA_ANON_DAILY_LIMIT",
  "MEDIA_DAILY_LIMIT",
  "MEDIA_USER_DAILY_LIMIT",
  "MEDIA_IMAGE_DAILY_LIMIT",
  "MEDIA_IMAGE_ANON_DAILY_LIMIT",
  "MEDIA_IMAGE_USER_DAILY_LIMIT",
  "MEDIA_IMAGE_BRAND_DAILY_LIMIT",
  "MEDIA_VISUAL_DAILY_LIMIT",
  "MEDIA_VISUAL_BRAND_DAILY_LIMIT",
  "MEDIA_VISUAL_ACTOR_DAILY_LIMIT",
  "MEDIA_IMAGE_ANON_ACTOR_DAILY_LIMIT",
  "MEDIA_ANON_ACTOR_DAILY_LIMIT",
  // Visit counters: public ids, inlined into the client at build time (redeploy after a change).
  "NEXT_PUBLIC_GA_ID",
  "NEXT_PUBLIC_YM_ID",
  // Stats page: the team's ids (STATS_PASSWORD is set in the dashboard, production only).
  "STATS_TEAM_TG_IDS",
  // Value loop 2026-11-25: team alerts, connectors. Not here on purpose: CRON_SECRET (a local copy
  // would let a dev server run the tick against the production database), LABS_ROUTES (a value
  // tried locally would open paid routes in production).
  "OPS_CHAT_ID",
  "CONNECTOR_TOKEN_KEY",
  "META_APP_ID",
  "META_APP_SECRET",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_ADS_DEVELOPER_TOKEN",
];
const TARGETS = ["production", "preview"];
// Production only:
// - visit counter ids: preview deployments must not count as visits;
// - OPS_CHAT_ID: alerts from previews would be noise;
// - connector keys: the OAuth redirect URIs are registered for the production domain only.
const PRODUCTION_ONLY = new Set([
  "NEXT_PUBLIC_GA_ID",
  "NEXT_PUBLIC_YM_ID",
  "OPS_CHAT_ID",
  "CONNECTOR_TOKEN_KEY",
  "META_APP_ID",
  "META_APP_SECRET",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_ADS_DEVELOPER_TOKEN",
]);

if (!existsSync(".env.local")) {
  console.error("No .env.local found.");
  process.exit(1);
}

const values = new Map();
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!match) continue;
  let value = match[2];
  if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
  values.set(match[1], value);
}

const managed = [...values.keys()].filter((name) => MANAGED.test(name) || name.startsWith("DATABASE_URL"));
if (managed.length) console.log(`skip  ${managed.join(", ")} (managed by Vercel / the Neon integration)`);

let failed = false;
for (const name of ALLOWED.filter((n) => !MANAGED.test(n) && !n.startsWith("DATABASE_URL"))) {
  const value = values.get(name)?.trim();
  if (!value) {
    console.log(`skip  ${name} (empty)`);
    continue;
  }
  for (const target of PRODUCTION_ONLY.has(name) ? ["production"] : TARGETS) {
    const result = spawnSync("vercel", ["env", "add", name, target, "--force", "--yes"], {
      input: value,
      encoding: "utf8",
    });
    if (result.status === 0) {
      console.log(`set   ${name} -> ${target}`);
    } else {
      failed = true;
      const output = `${result.stderr ?? ""}${result.stdout ?? ""}`.split(value).join("<redacted>");
      console.error(`FAIL  ${name} -> ${target}\n${output.trim().split("\n").slice(-3).join("\n")}`);
    }
  }
}
process.exit(failed ? 1 : 0);
