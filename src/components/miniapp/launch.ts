/**
 * What the Mini App was opened for. Links come in two shapes:
 * - the bot's WebApp button: `/tg?brand=<id>[&post=<id>]`, `/tg?brand=<id>&view=week` (the week's Review button)
 *   or `/tg?channel=<name>`;
 * - a Telegram deep link `t.me/<bot>?startapp=brand_<id>` (the desktop Studio's «Telegramda ochish»),
 *   `post_<id>`, `week_<id>` or `ch_<name>`. Telegram hands it over as `initDataUnsafe.start_param` and also as
 *   `tgWebAppStartParam` in the page URL; older clients only set the second.
 * Pure, so it is tested without a browser.
 */
export type LaunchTarget = { brand: string | null; post: string | null; channel: string | null; view: "week" | null };

/** Telegram allows [A-Za-z0-9_-] up to 64 characters in a start parameter; ids are UUIDs. */
const ID = /^[A-Za-z0-9-]{8,64}$/;

export function launchTarget(search: string, startParam?: string | null): LaunchTarget {
  const q = new URLSearchParams(search);
  const start = (startParam || q.get("tgWebAppStartParam") || "").trim();
  const fromStart = (prefix: string) => (start.startsWith(prefix) ? start.slice(prefix.length) : null);
  const id = (v: string | null) => (v && ID.test(v) ? v : null);
  const week = id(fromStart("week_"));
  return {
    brand: id(q.get("brand")) ?? id(fromStart("brand_")) ?? week,
    post: id(q.get("post")) ?? id(fromStart("post_")),
    channel: q.get("channel") ?? fromStart("ch_"),
    view: q.get("view") === "week" || week ? "week" : null,
  };
}
