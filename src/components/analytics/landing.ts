/**
 * Where the visit counters may run: only in a document that is, and stays, the landing page.
 *
 * The Studio keeps the brand id in its address (`/studio?brand=<uuid>`), and for a brand made on
 * the web that id works as a key (src/lib/uslub/http.ts). GA4's enhanced measurement, which page
 * code cannot switch off, sends the raw address on every history change and the href of every
 * outbound click, and Metrica reads location.href and document.referrer on its own in places its
 * options do not reach. So the counters never share a document with the Studio, the Mini App or
 * any other page: they start on "/" and that document never leaves "/".
 */

export const LANDING_PATH = "/";

/** Query keys the landing may carry while the counters run: the UI language and campaign tags. */
const SAFE_KEYS = new Set(["lang", "ysclid", "yclid", "gclid", "fbclid"]);

export const isSafeQueryKey = (key: string) => SAFE_KEYS.has(key) || key.startsWith("utm_");

const hasSafeQuery = (url: URL) => [...url.searchParams.keys()].every(isSafeQueryKey);

function parse(href: string, base?: string): URL | null {
  try {
    return new URL(href, base);
  } catch {
    return null;
  }
}

/**
 * True when moving to `href` keeps the document on the landing: same origin, path "/", nothing but
 * safe query keys. Anything else must be a full page load.
 */
export function staysOnLanding(href: string, origin: string): boolean {
  const url = parse(href, origin);
  return !!url && url.origin === origin && url.pathname === LANDING_PATH && hasSafeQuery(url);
}

/** The landing with nothing to hide in its address: staysOnLanding and no fragment at all. */
export const isCleanLanding = (href: string, origin: string) => staysOnLanding(href, origin) && !href.includes("#");

/** A session history entry as the Navigation API gives it (navigation.entries()). */
export type HistoryEntry = { url: string | null; sameDocument: boolean };

/**
 * No page but the landing in this document's own session history, back or forward. A reload, a
 * restored tab or a Back/Forward that missed the bfcache gives a fresh "/" document that still
 * owns the earlier entries of the old one (the Studio at /studio?brand=…, then the logo's soft
 * move to "/"): Back would show the Studio's address inside it. Entries of other documents are a
 * full load away and do not matter. Without the Navigation API (`entries` null) those entries
 * cannot be seen, so a reloaded or traversed landing with any history behind it does not count.
 */
export function sessionHistoryIsClean(
  origin: string,
  entries: HistoryEntry[] | null,
  navigationType: string | undefined,
  historyLength: number,
): boolean {
  if (entries) return entries.every((e) => !e.sameDocument || (!!e.url && staysOnLanding(e.url, origin)));
  return !((navigationType === "reload" || navigationType === "back_forward") && historyLength > 1);
}

/**
 * The referrer the counters would read on their own. Another site's address is that site's
 * business; one of ours must not carry anything but safe query keys (a page opened from
 * `/studio?brand=…` has that whole address as its referrer).
 */
export function referrerIsClean(referrer: string, origin: string): boolean {
  if (!referrer) return true;
  const url = parse(referrer);
  if (!url) return false;
  return url.origin !== origin || hasSafeQuery(url);
}
