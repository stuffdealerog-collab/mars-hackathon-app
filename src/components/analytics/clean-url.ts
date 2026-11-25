/**
 * The only form of an address the counters (Google Analytics, Yandex Metrica) may see: scheme,
 * host and path. The query and the fragment never leave the page: the Studio carries the brand id
 * in `?brand=` and the bot's handoff key in `#k=`, and Telegram puts the user's signed data in
 * `#tgWebAppData=`. User info (`user:pass@`) goes too. The path is kept exactly as written, so
 * `/studio` and `/studio/` stay what they were.
 *
 * Built by hand rather than from `URL.origin`, which is "null" for app referrers such as
 * `android-app://org.telegram.messenger/`. An address without a host (`about:blank`, a broken
 * string, "") gives "".
 */
export function cleanUrl(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return "";
  }
  if (!url.host) return "";
  return `${url.protocol}//${url.host}${url.pathname}`;
}
