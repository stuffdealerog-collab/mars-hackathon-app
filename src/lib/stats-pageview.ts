import "server-only";
import { dailyVisitorKey } from "./anon-key";
import { visitSource } from "./source-category";
import { type EventEnv, eventEnv } from "./stats-meta";
import { safeLogEvent } from "./track";

/**
 * Server-side, cookie-less page views of the landing page, the explainer (/about) and the Studio, written by
 * src/proxy.ts as `page_view` events for /stats. Only a category of everything is kept:
 *
 *   { path: "landing" | "about" | "studio", source, device: "mobile" | "desktop", surface: "web", visitor, env }
 *
 * `source` comes from `?src=`, `?utm_source=` or the referrer's host category (source-category.ts visitSource);
 * `visitor` is the daily keyed hash of IP + User-Agent (anon-key.ts dailyVisitorKey). The URL's query and fragment
 * (Studio links carry bearer ids: ?brand=<uuid>, #k=<handoff key>), the full referrer, the IP and the User-Agent are
 * never stored.
 *
 * Only production counts: next dev, `next start` on a laptop and Vercel previews write no page views (and no visitor
 * keys, see stats-meta.ts), even when their DATABASE_URL points at the shared production database.
 *
 * The Studio and /about are counted on a full page load and on an in-app jump to them (a next/link click on the
 * landing page, which the browser sends as a same-origin fetch, not a document request). That is only safe because no
 * link to /studio or /about prefetches (they all set prefetch={false}; tests/analytics-tracking.test.ts checks it): in
 * the proxy, Next.js strips the headers that tell a prefetch from a click. The landing page counts full loads only,
 * since links back to "/" may prefetch.
 */

export type PageViewPath = "landing" | "about" | "studio";

const PATHS: Record<string, PageViewPath> = { "/": "landing", "/about": "about", "/studio": "studio" };
/** Pages counted on an in-app jump as well as on a load: no link to them prefetches. */
const JUMP_COUNTED: ReadonlySet<PageViewPath> = new Set(["about", "studio"]);

/** Crawlers, link previews (Telegram, WhatsApp, Facebook…), uptime checks, headless browsers and HTTP libraries. */
const NOT_A_PERSON_RE =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|vercel|headless|lighthouse|pagespeed|curl|wget|python|go-http|node-fetch|undici|axios|okhttp|java\/|libwww|httpclient|monitor|uptime/i;

const MOBILE_RE = /mobi|android|iphone|ipad|ipod/i;

export type VisitRequest = { method: string; url: string; headers: Headers };

/** How a person reached the page: a full page load, or an in-app jump (the client router's same-origin fetch). */
export type VisitKind = "load" | "jump";

/**
 * Whether a request is a person opening the page, and how: a GET for a document ("load"), or a same-origin fetch the
 * client router sends when a link is clicked ("jump"). Prefetches, assets, other methods and bots are null. Browsers
 * that send no Sec-Fetch-Dest are accepted when they ask for HTML.
 */
export function visitKind(req: VisitRequest): VisitKind | null {
  if (req.method !== "GET") return null;
  const h = req.headers;
  const ua = h.get("user-agent") ?? "";
  if (!ua || NOT_A_PERSON_RE.test(ua)) return null;
  if (/prefetch|prerender/i.test(`${h.get("sec-purpose") ?? ""} ${h.get("purpose") ?? ""} ${h.get("x-purpose") ?? ""}`)) return null;
  if (h.has("next-router-prefetch") || h.has("next-router-segment-prefetch")) return null;
  const dest = h.get("sec-fetch-dest");
  const rsc = h.has("rsc") || h.has("next-router-state-tree") || new URL(req.url).searchParams.has("_rsc");
  if (dest === "document") return rsc ? null : "load";
  if (dest === "empty") {
    const sameOrigin = h.get("sec-fetch-site") === "same-origin" && ["cors", "same-origin"].includes(h.get("sec-fetch-mode") ?? "");
    return sameOrigin ? "jump" : null;
  }
  if (dest || rsc) return null;
  return /text\/html/i.test(h.get("accept") ?? "") ? "load" : null;
}

/** A full page load by a person (see visitKind). */
export const isPageVisit = (req: VisitRequest): boolean => visitKind(req) === "load";

/** First hop of X-Forwarded-For (set by Vercel), else X-Real-IP. Never stored. */
export function visitIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "local";
}

export type PageViewProps = {
  path: PageViewPath;
  source: string;
  device: "mobile" | "desktop";
  surface: "web";
  visitor: string;
};

/**
 * The page_view props for a request, or null when it is not a counted page visit. Pure apart from the server key.
 * The Studio and /about count loads and in-app jumps; the landing page counts loads only.
 */
export function pageViewFrom(req: VisitRequest, now: Date = new Date()): PageViewProps | null {
  const url = new URL(req.url);
  const path = PATHS[url.pathname.replace(/\/+$/, "") || "/"];
  if (!path) return null;
  const kind = visitKind(req);
  if (kind !== "load" && !(kind === "jump" && JUMP_COUNTED.has(path))) return null;
  const ua = req.headers.get("user-agent") ?? "";
  return {
    path,
    source: visitSource({
      src: url.searchParams.get("src"),
      utmSource: url.searchParams.get("utm_source"),
      referrer: req.headers.get("referer"),
      ownHost: url.host,
    }),
    device: MOBILE_RE.test(ua) ? "mobile" : "desktop",
    surface: "web",
    visitor: dailyVisitorKey(visitIp(req.headers), ua, now),
  };
}

/**
 * Per-instance flood guard: one row per visitor and page per `windowMs` (a reload or a back-and-forth is one visit),
 * and at most `perMinute` rows a minute in all, so a script hitting the landing page cannot flood the table.
 */
export class VisitGuard {
  private readonly seen = new Map<string, number>();
  private minute = 0;
  private count = 0;

  constructor(
    private readonly windowMs = 30 * 60_000,
    private readonly perMinute = 300,
    private readonly maxKeys = 20_000,
  ) {}

  take(key: string, nowMs: number = Date.now()): boolean {
    const last = this.seen.get(key);
    if (last !== undefined && nowMs - last < this.windowMs) return false;
    const minute = Math.floor(nowMs / 60_000);
    if (minute !== this.minute) {
      this.minute = minute;
      this.count = 0;
    }
    if (this.count >= this.perMinute) return false;
    this.count += 1;
    if (this.seen.size >= this.maxKeys) {
      for (const [k, at] of this.seen) if (nowMs - at >= this.windowMs) this.seen.delete(k);
      if (this.seen.size >= this.maxKeys) this.seen.clear();
    }
    this.seen.set(key, nowMs);
    return true;
  }
}

const guard = new VisitGuard();

/**
 * The write for one request, or null when nothing is counted (always null outside production). The caller hands the
 * promise to waitUntil(), so the page never waits for the database and a database error never reaches it
 * (safeLogEvent does not throw).
 */
export function recordPageView(req: VisitRequest, now: Date = new Date(), env: EventEnv = eventEnv()): Promise<void> | null {
  if (env !== "prod") return null;
  const props = pageViewFrom(req, now);
  if (!props || !guard.take(`${props.visitor}|${props.path}`, now.getTime())) return null;
  return safeLogEvent(null, "page_view", props);
}
