import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";
import { STATS_REALM, statsGate } from "./lib/stats-access";
import { recordPageView } from "./lib/stats-pageview";

/**
 * Runs only for the paths in `config.matcher`:
 *
 * - /stats: HTTP Basic auth in front of the live stats page. A page cannot send 401 with WWW-Authenticate itself,
 *   and without that header the browser never shows its password prompt.
 * - /, /about and /studio: counts the visit server-side without cookies (stats-pageview.ts) and passes the request on
 *   untouched. The write runs after the response (waitUntil), so the page never waits for it or fails because of it.
 */
const NO_STORE = "private, no-store, max-age=0";

export function proxy(request: NextRequest, event?: NextFetchEvent): NextResponse {
  if (!isStatsPath(new URL(request.url).pathname)) {
    try {
      const write = recordPageView(request);
      if (write) event?.waitUntil(write);
    } catch (err) {
      console.error("[proxy] page view:", err instanceof Error ? err.message : err);
    }
    return NextResponse.next();
  }

  const gate = statsGate(request.headers.get("authorization"));
  if (gate === "hidden") {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "cache-control": NO_STORE, "content-type": "text/plain; charset=utf-8" },
    });
  }
  if (gate === "challenge") {
    return new NextResponse("Password required", {
      status: 401,
      headers: {
        "www-authenticate": STATS_REALM,
        "cache-control": NO_STORE,
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }
  const response = NextResponse.next();
  response.headers.set("cache-control", NO_STORE);
  return response;
}

const isStatsPath = (pathname: string) => pathname === "/stats" || pathname.startsWith("/stats/");

export const config = {
  matcher: ["/", "/about", "/studio", "/stats", "/stats/:path*"],
};
