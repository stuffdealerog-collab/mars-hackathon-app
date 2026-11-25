import "server-only";
import { dailyVisitorKey } from "./anon-key";
import { visitSource } from "./source-category";
import { safeLogEvent } from "./track";

/**
 * Server-side, cookie-less page views of the landing page and the Studio, written by src/proxy.ts as `page_view`
 * events for /stats. Only a category of everything is kept:
 *
 *   { path: "landing" | "studio", source, device: "mobile" | "desktop", surface: "web", visitor, env }
 *
 * `source` comes from `?src=`, `?utm_source=` or the referrer's host category (source-category.ts visitSource);
 * `visitor` is the daily keyed hash of IP + User-Agent (anon-key.ts dailyVisitorKey). The URL's query and fragment
 * (Studio links carry bearer ids: ?brand=<uuid>, #k=<handoff key>), the full referrer, the IP and the User-Agent are
 * never stored.
 */

export type PageViewPath = "landing" | "studio";

const PATHS: Record<string, PageViewPath> = { "/": "landing", "/studio": "studio" };

/** Crawlers, link previews (Telegram, WhatsApp, Facebook…), uptime checks, headless browsers and HTTP libraries. */
const NOT_A_PERSON_RE =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|vercel|headless|lighthouse|pagespeed|curl|wget|python|go-http|node-fetch|undici|axios|okhttp|java\/|libwww|httpclient|monitor|uptime/i;

const MOBILE_RE = /mobi|android|iphone|ipad|ipod/i;

export type VisitRequest = { method: string; url: string; headers: Headers };

/**
 * Whether a request is a person opening the page: a GET for a document (not a prefetch, an RSC navigation, an asset
 * or a bot). Browsers that send no Sec-Fetch-Dest are accepted when they ask for HTML.
 */
export function isPageVisit(req: VisitRequest): boolean {
  if (req.method !== "GET") return false;
  const h = req.headers;
  const ua = h.get("user-agent") ?? "";
  if (!ua || NOT_A_PERSON_RE.test(ua)) return false;
  if (/prefetch|prerender/i.test(`${h.get("sec-purpose") ?? ""} ${h.get("purpose") ?? ""} ${h.get("x-purpose") ?? ""}`)) return false;
  if (h.has("next-router-prefetch") || h.has("rsc") || h.has("next-router-state-tree")) return false;
  if (new URL(req.url).searchParams.has("_rsc")) return false;
  const dest = h.get("sec-fetch-dest");
  if (dest) return dest === "document";
  return /text\/html/i.test(h.get("accept") ?? "");
}

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

/** The page_view props for a request, or null when it is not a counted page visit. Pure apart from the server key. */
export function pageViewFrom(req: VisitRequest, now: Date = new Date()): PageViewProps | null {
  const url = new URL(req.url);
  const path = PATHS[url.pathname.replace(/\/+$/, "") || "/"];
  if (!path || !isPageVisit(req)) return null;
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
 * The write for one request, or null when nothing is counted. The caller hands the promise to waitUntil(), so the
 * page never waits for the database and a database error never reaches it (safeLogEvent does not throw).
 */
export function recordPageView(req: VisitRequest, now: Date = new Date()): Promise<void> | null {
  const props = pageViewFrom(req, now);
  if (!props || !guard.take(`${props.visitor}|${props.path}`, now.getTime())) return null;
  return safeLogEvent(null, "page_view", props);
}
