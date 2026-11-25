"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cleanUrl } from "./clean-url";
import { countedPathOf, isCleanLanding, referrerIsClean, sessionHistoryIsClean, staysOnLanding, type HistoryEntry } from "./landing";

/*
 * Google Analytics 4 and Yandex Metrica, counting visits to the landing page and /about. Production
 * deployments only (NODE_ENV and NEXT_PUBLIC_VERCEL_ENV both "production"), each counter only when
 * its public id is set (NEXT_PUBLIC_GA_ID = "G-…", NEXT_PUBLIC_YM_ID = digits); otherwise this
 * renders nothing and loads nothing.
 *
 * Counted pages only (landing.ts says why): the counters start in a document that opened on "/" or
 * "/about" and has never been anywhere else, with a clean address and referrer, no other page in its
 * own session history (historyIsClean), not prerendering. Before either script is injected, that
 * document is locked to its page: a same-origin link to another page (the other counted page too) and
 * any pushState/replaceState to another page
 * become full page loads, and a Back/Forward onto another page reloads it as its own document, so
 * the Studio, the Mini App and every other page always open without the counters. The history
 * methods are wrapped before gtag.js loads, so its enhanced-measurement wrapper sits outside this
 * one and never sees an address the document did not take. Studio usage is not counted.
 *
 * What the counters are told is cleaned too (cleanUrl: scheme, host, path), once per document:
 * - GA4: no automatic page_view, no Google signals or ad personalisation, the clean address and
 *   referrer in config, in `set` and on the page_view.
 * - Metrica: defer, the clean address and referrer in its init options (without them its first
 *   request carries location.href), a manual hit, accurateTrackBounce. clickmap and trackLinks stay
 *   off (their requests carry location.href and link hrefs whatever `url` says), no Webvisor.
 */

const gaId = process.env.NEXT_PUBLIC_GA_ID?.trim() ?? "";
const ymId = process.env.NEXT_PUBLIC_YM_ID?.trim() ?? "";
const GA_ID = /^G-[A-Z0-9]+$/.test(gaId) ? gaId : null;
const YM_ID = /^\d+$/.test(ymId) ? Number(ymId) : null;
const ENABLED =
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PUBLIC_VERCEL_ENV === "production" &&
  (GA_ID !== null || YM_ID !== null);

type Ym = ((id: number, method: string, ...args: unknown[]) => void) & { a?: IArguments[]; l?: number };

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    ym?: Ym;
  }
}

const navigationTiming = () => performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;

/** The address this document was opened with (replaceState does not change it). */
const firstHref = () => navigationTiming()?.name || window.location.href;

/** The Navigation API, where the browser has it (lib.dom does not type it yet). */
const sessionEntries = () => (window as Window & { navigation?: { entries(): HistoryEntry[] } }).navigation?.entries() ?? null;

const historyIsClean = (origin: string, path: string) =>
  sessionHistoryIsClean(origin, sessionEntries(), navigationTiming()?.type, window.history.length, path);

/** The counted page this document opened on ("/" or "/about"), or null: read once, from the opening address. */
let home: string | null | undefined;
const homePath = () => (home ??= countedPathOf(firstHref(), window.location.origin));
/** Set once the document has shown any page but its own: the counters then never start in it. */
let leftHome = false;
let locked = false;
let counted = false;

function mayStart(): boolean {
  const path = homePath();
  return (
    !!path &&
    !leftHome &&
    isCleanLanding(window.location.href, window.location.origin, path) &&
    referrerIsClean(document.referrer, window.location.origin) &&
    historyIsClean(window.location.origin, path) &&
    !(document as Document & { prerendering?: boolean }).prerendering
  );
}

/** From here on this document never shows another page: such navigations become full page loads. */
function lockToPage(path: string) {
  if (locked) return;
  locked = true;
  const origin = window.location.origin;

  // Links, before Next's <Link> handler (it skips a click whose default is prevented).
  document.addEventListener(
    "click",
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.hasAttribute("download")) return;
      if (link.target && link.target !== "_self") return;
      const url = new URL(link.href);
      if (url.origin !== origin || staysOnLanding(url.href, origin, path)) return;
      e.preventDefault();
      window.location.assign(url.href);
    },
    true,
  );

  // router.push/replace and anything else that rewrites the address: the address of another page
  // is never written into this document; the browser loads it instead.
  for (const method of ["pushState", "replaceState"] as const) {
    const inner = window.history[method];
    window.history[method] = function (data: unknown, unused: string, url?: string | URL | null) {
      if (url != null) {
        const next = new URL(url, window.location.href).href;
        if (!staysOnLanding(next, origin, path)) {
          window.location.assign(next);
          return;
        }
      }
      inner.call(window.history, data, unused, url);
    };
  }

  // Backstop for Back/Forward onto an entry of this document that is not its page: load that
  // address as its own document before Next draws it here or gtag reports it. A capture listener
  // on window runs before their popstate listeners, and this one stops them.
  window.addEventListener(
    "popstate",
    (e) => {
      if (staysOnLanding(window.location.href, origin, path)) return;
      e.stopImmediatePropagation();
      window.location.reload();
    },
    true,
  );
}

function gaPageView(id: string, page: string, referrer: string) {
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag() {
    // gtag.js takes its commands as `arguments` objects; it ignores plain arrays.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  const where = { page_location: page, page_referrer: referrer };
  window.gtag("js", new Date());
  window.gtag("config", id, { ...where, send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
  window.gtag("set", where);
  window.gtag("event", "page_view", where);
}

function ymPageView(id: number, page: string, referrer: string) {
  if (!window.ym) {
    const queue: Ym = Object.assign(
      function () {
        // Metrica's tag.js replays this queue of `arguments` objects when it loads.
        // eslint-disable-next-line prefer-rest-params
        (queue.a = queue.a ?? []).push(arguments);
      },
      { l: Date.now() },
    );
    window.ym = queue;
  }
  window.ym(id, "init", {
    defer: true,
    url: page,
    referrer,
    webvisor: false,
    clickmap: false,
    trackLinks: false,
    trackHash: false,
    accurateTrackBounce: true,
  });
  window.ym(id, "hit", page, { referer: referrer });
}

export function Analytics() {
  const pathname = usePathname();
  const [started, setStarted] = useState(false);

  // Waits for a clean counted page (a fragment can go with replaceState, which fires no event, so this
  // polls for a while; prerendering and hash changes have events of their own). The lock goes on
  // before the render that injects the scripts.
  useEffect(() => {
    if (!ENABLED || started) return;
    if (pathname !== homePath()) leftHome = true;
    const check = () => {
      const path = homePath();
      if (!path || !mayStart()) return;
      lockToPage(path);
      setStarted(true);
    };
    const first = window.setTimeout(check, 0);
    const poll = window.setInterval(check, 250);
    const stopPolling = window.setTimeout(() => window.clearInterval(poll), 30_000);
    document.addEventListener("prerenderingchange", check);
    window.addEventListener("hashchange", check);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(poll);
      window.clearTimeout(stopPolling);
      document.removeEventListener("prerenderingchange", check);
      window.removeEventListener("hashchange", check);
    };
  }, [started, pathname]);

  // One page view per document: once locked, the document never shows another page.
  useEffect(() => {
    if (!started || counted) return;
    counted = true;
    const page = cleanUrl(window.location.href);
    const referrer = cleanUrl(document.referrer);
    if (GA_ID) gaPageView(GA_ID, page, referrer);
    if (YM_ID) ymPageView(YM_ID, page, referrer);
  }, [started]);

  if (!started) return null;
  return (
    <>
      {GA_ID && <Script id="ga4" src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />}
      {YM_ID && <Script id="yandex-metrica" src="https://mc.yandex.ru/metrika/tag.js" strategy="afterInteractive" />}
    </>
  );
}
