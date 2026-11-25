/**
 * Which pictures the export proxy may fetch (pure): a post picture on fal.media over https, nothing else. The same
 * host rule as the pictures the bot publishes (botpublish-shown.ts shownPhoto), so the proxy can never be pointed at
 * an internal address or another site.
 */
const MAX_URL = 2048;

export function exportImageUrl(raw: string | null | undefined): string | null {
  if (!raw || raw.length > MAX_URL) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  if (!/(^|\.)fal\.media$/i.test(u.hostname)) return null;
  return u.toString();
}
