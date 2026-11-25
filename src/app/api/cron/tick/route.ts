import { connection } from "next/server";
import { tickSecret } from "@/lib/cron/auth";
import { pgLock } from "@/lib/cron/lock";
import { cronRegistry } from "@/lib/cron/tasks";
import { tick } from "@/lib/cron/tick";
import { getSql, isDbConfigured } from "@/lib/db";
import { getEnv } from "@/lib/env";

// The tick: Vercel Cron calls it once a day (vercel.json) and GitHub Actions every 10 minutes
// (.github/workflows/tick.yml), both with `Authorization: Bearer <CRON_SECRET>`. See src/lib/cron/tick.ts.
// Tasks run on the production deployment only (tickSecret): local servers and previews share the production
// database, so there the tick answers health whatever is sent.
export const maxDuration = 300;

async function handle(req: Request): Promise<Response> {
  await connection(); // always at request time, never prerendered
  const { status, body } = await tick({
    authorization: req.headers.get("authorization"),
    secret: tickSecret(process.env, getEnv().CRON_SECRET),
    lock: isDbConfigured() ? pgLock(getSql()) : null,
    tasks: cronRegistry.list(),
  });
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(req: Request): Promise<Response> {
  return handle(req);
}

export async function POST(req: Request): Promise<Response> {
  return handle(req);
}
