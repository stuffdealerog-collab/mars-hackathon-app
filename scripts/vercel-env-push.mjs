#!/usr/bin/env node
// Pushes the app's env vars from .env.local to the linked Vercel project
// (production + preview). Empty values are skipped; values are never printed.
// Usage: pnpm env:push   (then redeploy: vercel deploy --prod)
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

// Only these names are pushed (the DB password and Vercel's own tokens stay local).
const ALLOWED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TELEGRAM_BOT_TOKEN",
  "BOT_USERNAME",
  "TELEGRAM_WEBHOOK_SECRET",
  "MENU_BUTTON_TEXT",
  "PUBLIC_URL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
];
const TARGETS = ["production", "preview"];

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

let failed = false;
for (const name of ALLOWED) {
  const value = values.get(name)?.trim();
  if (!value) {
    console.log(`skip  ${name} (empty)`);
    continue;
  }
  for (const target of TARGETS) {
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
