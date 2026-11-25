/**
 * Lab routes: API routes that no screen, Mini App or bot calls (checked with a grep over src on
 * 2026-11-25). They still spend Claude, web search or video credits for anyone who POSTs to them,
 * and their QA runs filled the production funnel. They answer 404 unless LABS_ROUTES names them.
 *
 *   LABS_ROUTES=all                       every lab route on (also "1", "true", "*")
 *   LABS_ROUTES=radar,video,media/jobs    only these
 *   unset / empty                         all off (production default)
 *
 * The code behind them stays (radar becomes a lamp later), only the public door is closed. /video left the list on
 * 2026-11-25: the Video tab calls it (the owner's scripts, with auth, rate limit and budget units).
 */
export const LABS_ROUTES = ["department", "radar", "plan", "neuro", "adcheck", "learn", "media/captions", "media/jobs"] as const;
export type LabsRoute = (typeof LABS_ROUTES)[number];

const ALL = new Set(["all", "1", "true", "*", "on"]);

export function labsRouteEnabled(name: LabsRoute, raw: string | undefined = process.env.LABS_ROUTES): boolean {
  const items = (raw ?? "")
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase().replace(/^\/?(api\/)?(uslub\/)?/, ""))
    .filter(Boolean);
  return items.some((s) => ALL.has(s) || s === name);
}

/** null = go on; otherwise the 404 to return before any work (no rate-limit slot, no spend). */
export function labsGate(name: LabsRoute): Response | null {
  if (labsRouteEnabled(name)) return null;
  return Response.json({ error: "Not found", code: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
}
