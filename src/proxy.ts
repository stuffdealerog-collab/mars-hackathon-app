import { NextResponse, type NextRequest } from "next/server";
import { STATS_REALM, statsGate } from "./lib/stats-access";

/**
 * Runs only for /stats (see `config.matcher`): HTTP Basic auth in front of the live stats page. A page cannot send
 * 401 with WWW-Authenticate itself, and without that header the browser never shows its password prompt.
 */
const NO_STORE = "private, no-store, max-age=0";

export function proxy(request: NextRequest): NextResponse {
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

export const config = {
  matcher: ["/stats", "/stats/:path*"],
};
