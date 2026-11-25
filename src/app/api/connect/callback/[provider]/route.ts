import { after } from "next/server";
import { anyEnabled } from "@/lib/connectors/config";
import { bindCookieName, clearBindCookie, readCookie } from "@/lib/connectors/browser-bind";
import { connectorConfig, type FinishResult, finishConnect, runSync } from "@/lib/connectors/service";
import { isConnectorId } from "@/lib/connectors/types";
import { rateLimit } from "@/lib/uslub/http";

export const maxDuration = 60;

/** The first sync's deadline, counted from the request's start: the function is stopped at maxDuration. */
const FIRST_SYNC_MS = 55_000;

/**
 * GET ?code=&state=   (or ?error=…)   the redirect URI registered in each console:
 *   <PUBLIC_URL>/api/connect/callback/<instagram | meta_ads | youtube | google_ads>
 *
 * Runs in the owner's browser with no Telegram session: the single-use, 10-minute state row is what proves who
 * started it, and for the Studio path the browser must also bring back the cookie POST /start set
 * (src/lib/connectors/browser-bind.ts). Always answers with a redirect: to the Studio (`?connected=` /
 * `?connect_error=`) or to /connect/done for the Mini App path. Never a 500 page, never the provider's error text,
 * never a token or the code in a URL. On success the first sync (28 days back) runs after the response.
 * While no provider is configured it answers at once, without a database call.
 */
export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }): Promise<Response> {
  const started = Date.now();
  const { provider } = await ctx.params;
  const cfg = connectorConfig();
  const url = new URL(req.url);
  const base = cfg.publicUrl ?? url.origin;
  const secure = base.startsWith("https://");
  const redirect = (location: string) => {
    const headers = new Headers({
      Location: new URL(location, base).toString(),
      "Cache-Control": "no-store",
      // The callback URL holds the code and the state: never pass it on as a referrer.
      "Referrer-Policy": "no-referrer",
    });
    // The browser binding is single-use, like the state.
    if (isConnectorId(provider)) headers.append("Set-Cookie", clearBindCookie(provider, secure));
    return new Response(null, { status: 303, headers });
  };

  if (!anyEnabled(cfg)) return redirect("/connect/done?error=connector_off");
  try {
    rateLimit(req, "connect-callback", 30);
  } catch {
    return redirect("/connect/done?error=rate_limited");
  }

  let result: FinishResult;
  try {
    const cookie = isConnectorId(provider) ? readCookie(req.headers.get("cookie"), bindCookieName(provider)) : null;
    result = await finishConnect(cfg, provider, url.searchParams, { cookie });
  } catch (err) {
    console.warn("[connectors] callback failed:", err instanceof Error ? err.name : "error");
    result = { location: "/connect/done?error=oauth_failed" };
  }
  const id = result.connectionId;
  if (id) {
    const work = () => runSync(cfg, id, started + FIRST_SYNC_MS).catch(() => undefined);
    try {
      after(work);
    } catch {
      void work();
    }
  }
  return redirect(result.location);
}
