import { connection } from "next/server";
import { getTraction } from "@/lib/traction";
import { tractionBody } from "@/lib/traction-model";

/**
 * GET /api/public/traction: how many people have tried Mercat and how many channels it has analysed (counts only,
 * see src/lib/traction.ts). Public and cached: ten minutes in the server cache and at the edge. A database error
 * answers `{ ok: false }` for a minute, and the page hides the counter.
 */
export async function GET(): Promise<Response> {
  await connection(); // read at request time (from the cache), never at build time
  const body = tractionBody(await getTraction());
  return Response.json(body, {
    headers: {
      "cache-control": body.ok ? "public, max-age=60, s-maxage=600, stale-while-revalidate=600" : "public, max-age=30, s-maxage=60",
    },
  });
}
