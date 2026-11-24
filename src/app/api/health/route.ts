import { connection } from "next/server";
import { getSql, isDbConfigured, pgErrorCode } from "@/lib/db";

type DbStatus =
  | { ok: true; users: number; latency_ms: number }
  | { ok: false; error: "not_configured" | "schema_missing" | "query_failed" };

/** Real database round trip (count of app_users). Never returns connection details. */
async function checkDb(): Promise<DbStatus> {
  if (!isDbConfigured()) return { ok: false, error: "not_configured" };
  const started = performance.now();
  try {
    const rows = await getSql()`SELECT count(*)::int AS users FROM app_users`;
    const users = Number(rows[0]?.users ?? 0);
    return { ok: true, users, latency_ms: Math.round(performance.now() - started) };
  } catch (err) {
    console.error("[health] db error:", err instanceof Error ? err.message : err);
    // 42P01 = undefined_table: connected, but `pnpm db:migrate` has not been run.
    return { ok: false, error: pgErrorCode(err) === "42P01" ? "schema_missing" : "query_failed" };
  }
}

export async function GET(): Promise<Response> {
  await connection(); // always run at request time, never prerendered
  const db = await checkDb();
  return Response.json(
    { ok: db.ok, service: "mars-hackathon-app", db, time: new Date().toISOString() },
    { status: db.ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
