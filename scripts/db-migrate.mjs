#!/usr/bin/env node
// Applies db/schema.sql to the Neon database (idempotent, safe to re-run).
// Connection: DATABASE_URL_UNPOOLED (preferred for DDL), else DATABASE_URL,
// from the environment or .env.local. Connection strings are never printed;
// the output is limited to table names and row counts.
// Usage: pnpm db:migrate
import { existsSync, readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const varName = ["DATABASE_URL_UNPOOLED", "DATABASE_URL"].find((n) => process.env[n]?.trim());
if (!varName) {
  console.error(
    "DATABASE_URL_UNPOOLED / DATABASE_URL not set. Pull them from Vercel first:\n" +
      "  vercel env pull .env.neon --environment=production --yes\n" +
      "then copy the DATABASE_URL and DATABASE_URL_UNPOOLED lines into .env.local and delete .env.neon.",
  );
  process.exit(1);
}
const url = process.env[varName].trim().replace(/^(["'])(.*)\1$/, "$2");

// Never let a connection string or password reach the terminal.
function redact(message) {
  let out = String(message).split(url).join("<redacted>");
  try {
    const { password } = new URL(url);
    if (password) out = out.split(decodeURIComponent(password)).join("<redacted>").split(password).join("<redacted>");
  } catch {}
  return out;
}

// The HTTP driver runs one statement per query, so split the file on ";".
const statements = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8")
  .split(/\r?\n/)
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n")
  .split(/;\s*(?:\n|$)/)
  .map((s) => s.trim())
  .filter(Boolean);

try {
  const sql = neon(url);
  console.log(`Applying db/schema.sql (${statements.length} statements) using ${varName}...`);
  await sql.transaction(statements.map((s) => sql.query(s)));

  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  const [counts] = await sql`
    SELECT (SELECT count(*)::int FROM app_users) AS app_users,
           (SELECT count(*)::int FROM events) AS events
  `;
  console.log(`Tables: ${tables.map((t) => t.table_name).join(", ")}`);
  for (const [name, n] of Object.entries(counts)) console.log(`  ${name}: ${n} rows`);
  console.log("Migration complete.");
} catch (err) {
  console.error("Migration failed:", redact(err instanceof Error ? err.message : err));
  process.exit(1);
}
