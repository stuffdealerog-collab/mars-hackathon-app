import { metaDeauthorize } from "@/lib/connectors/meta-callbacks";
import { connectorConfig } from "@/lib/connectors/service";
import { rateLimit } from "@/lib/uslub/http";

export const maxDuration = 15;

/**
 * POST signed_request=…   Meta's "Deauthorize callback URL": the person removed Mercat in Facebook or Instagram.
 * Their Instagram and Meta ads connections are deleted with every number read through them.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    rateLimit(req, "connect-meta", 60);
    const r = await metaDeauthorize(connectorConfig(), req);
    return Response.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const status = (err as { status?: unknown })?.status === 429 ? 429 : 500;
    if (status === 500) console.warn("[connectors] deauthorize failed:", err instanceof Error ? err.name : "error");
    return Response.json({ error: status === 429 ? "rate limited" : "failed" }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
