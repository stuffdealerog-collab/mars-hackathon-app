"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cleanUrl } from "./clean-url";

/*
 * Google Analytics 4 and Yandex Metrica, counting visits for the owner. Production builds only,
 * each counter only when its public id is set (NEXT_PUBLIC_GA_ID = "G-…", NEXT_PUBLIC_YM_ID =
 * digits); with neither set this renders nothing and loads nothing.
 *
 * The counters only ever see scheme, host and path (cleanUrl). Every page view is sent by hand,
 * on the first load and on each client navigation, with the cleaned address and referrer.
 *
 * - Never in the Telegram Mini App: a document that opened on /tg (or with Telegram's
 *   #tgWebAppData) keeps both counters off for its whole life. That fragment holds the user's id,
 *   name and the signature of the launch data.
 * - Neither script loads while the address bar has a fragment (the Studio takes its #k= handoff
 *   key out right after it opens) or while the browser is prerendering the page: Metrica reads
 *   location.href itself in a few places that its options do not reach (its prerender hit, and a
 *   cookie sync with mobile operators that Yandex switches on per visitor from its server).
 * - Metrica gets the clean address and referrer in its init options too (`url`, `referrer`):
 *   without them its first request carries location.href with the query and the fragment.
 *   clickmap and trackLinks stay off: their requests carry location.href, and the hrefs of
 *   t.me links with post and brand ids, whatever `url` says. No Webvisor.
 * - GA4: no automatic page_view, no Google signals or ad personalisation. The cleaned address is
 *   set in config as well, so the events gtag sends on its own (user_engagement) use it.
 *   Enhanced measurement is configured in the GA4 property, not here: its history-change page
 *   views fire even with send_page_view off, so it must be switched off there (see the PR).
 */

const gaId = process.env.NEXT_PUBLIC_GA_ID?.trim() ?? "";
const ymId = process.env.NEXT_PUBLIC_YM_ID?.trim() ?? "";
const GA_ID = /^G-[A-Z0-9]+$/.test(gaId) ? gaId : null;
const YM_ID = /^\d+$/.test(ymId) ? Number(ymId) : null;
const ENABLED = process.env.NODE_ENV === "production" && (GA_ID !== null || YM_ID !== null);

type Ym = ((id: number, method: string, ...args: unknown[]) => void) & { a?: IArguments[]; l?: number };

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    ym?: Ym;
  }
}

const isMiniApp = (path: string) => path === "/tg" || path.startsWith("/tg/");

/** Decided once per document, from the address it opened with. */
let miniAppDocument: boolean | undefined;
const openedAsMiniApp = () => (miniAppDocument ??= isMiniApp(window.location.pathname) || window.location.hash.includes("tgWebApp"));

/** Nothing in the fragment (not even a bare "#") and the page is really on screen, not prerendered. */
const addressIsClear = () =>
  !window.location.href.includes("#") && !(document as Document & { prerendering?: boolean }).prerendering;

let gaStarted = false;
let ymStarted = false;

function gaPageView(id: string, page: string, referrer: string) {
  if (!gaStarted) {
    gaStarted = true;
    window.dataLayer = window.dataLayer ?? [];
    window.gtag = function gtag() {
      // gtag.js takes its commands as `arguments` objects; it ignores plain arrays.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", id, {
      send_page_view: false,
      page_location: page,
      page_referrer: referrer,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
  }
  window.gtag!("event", "page_view", { page_location: page, page_referrer: referrer });
}

function ymPageView(id: number, page: string, referrer: string) {
  if (!ymStarted) {
    ymStarted = true;
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
  }
  window.ym!(id, "hit", page, { referer: referrer });
}

export function Analytics() {
  const pathname = usePathname();
  const [started, setStarted] = useState(false);
  const previousPage = useRef<string | null>(null);

  // Waits for a clear address bar. The Studio drops #k= with history.replaceState, which fires
  // no event, so this polls for a while (again after each client navigation); prerendering and
  // hash changes have events of their own.
  useEffect(() => {
    if (!ENABLED || started || openedAsMiniApp()) return;
    const check = () => {
      if (addressIsClear()) setStarted(true);
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

  useEffect(() => {
    if (!started || isMiniApp(pathname)) return;
    const page = cleanUrl(window.location.href);
    if (!page) return;
    const referrer = previousPage.current ?? cleanUrl(document.referrer);
    previousPage.current = page;
    if (GA_ID) gaPageView(GA_ID, page, referrer);
    if (YM_ID) ymPageView(YM_ID, page, referrer);
  }, [started, pathname]);

  if (!started) return null;
  return (
    <>
      {GA_ID && <Script id="ga4" src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />}
      {YM_ID && <Script id="yandex-metrica" src="https://mc.yandex.ru/metrika/tag.js" strategy="afterInteractive" />}
    </>
  );
}
