import { connection } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/lib/supabase";

type DbStatus =
  | { ok: true; users: number; latency_ms: number }
  | { ok: false; error: "not_configured" | "query_failed" };

async function checkDb(): Promise<DbStatus> {
  if (!isDbConfigured()) return { ok: false, error: "not_configured" };
  const started = performance.now();
  try {
    const { count, error } = await getSupabaseAdmin()
      .from("app_users")
      .select("*", { count: "exact", head: true });
    if (error) {
      console.error("[health] db error:", error.message);
      return { ok: false, error: "query_failed" };
    }
    return { ok: true, users: count ?? 0, latency_ms: Math.round(performance.now() - started) };
  } catch (err) {
    console.error("[health] db error:", err instanceof Error ? err.message : err);
    return { ok: false, error: "query_failed" };
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
