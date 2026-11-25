import { after } from "next/server";
import { connectorConfig, type FinishResult, finishConnect, runSync } from "@/lib/connectors/service";

export const maxDuration = 60;

/**
 * GET ?code=&state=   (or ?error=…)   the redirect URI registered in each console:
 *   <PUBLIC_URL>/api/connect/callback/<instagram | meta_ads | youtube | google_ads>
 *
 * Runs in the owner's browser with no Telegram session: the single-use, 10-minute state row is what proves who
 * started it. Always answers with a redirect: to the Studio (`?connected=` / `?connect_error=`) or to
 * /connect/done for the Mini App path. Never a 500 page, never the provider's error text, never a token or the
 * code in a URL. On success the first sync (28 days back) runs after the response.
 */
export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }): Promise<Response> {
  const { provider } = await ctx.params;
  const cfg = connectorConfig();
  const url = new URL(req.url);
  let result: FinishResult;
  try {
    result = await finishConnect(cfg, provider, url.searchParams);
  } catch (err) {
    console.warn("[connectors] callback failed:", err instanceof Error ? err.name : "error");
    result = { location: "/connect/done?error=oauth_failed" };
  }
  const id = result.connectionId;
  if (id) {
    const work = () => runSync(cfg, id, Date.now() + 55_000).catch(() => undefined);
    try {
      after(work);
    } catch {
      void work();
    }
  }
  const base = cfg.publicUrl ?? url.origin;
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL(result.location, base).toString(),
      "Cache-Control": "no-store",
      // The callback URL holds the code and the state: never pass it on as a referrer.
      "Referrer-Policy": "no-referrer",
    },
  });
}
