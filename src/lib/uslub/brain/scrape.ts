/**
 * Small t.me/s/<channel> scraper for the Brain. Parsing is pure (tested with a
 * saved HTML fixture); `scrapeChannelData` does the paginated fetch.
 * The public preview never shows forward counts or past subscriber history,
 * so the Brain never claims to know either.
 */
import type { ChannelData, Media, RawPost } from "./types";
import { previewRedirected, serviceTexts } from "./validity";

export class BrainScrapeError extends Error {
  constructor(
    readonly code: "BAD_CHANNEL" | "NO_PUBLIC_PREVIEW" | "FETCH_FAILED",
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const USER_RE = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;

/** "@kanal", "t.me/kanal", "https://t.me/s/kanal/12" -> "kanal" (or null). */
export function normalizeChannel(input: string): string | null {
  let s = input.trim();
  s = s.replace(/^https?:\/\//i, "").replace(/^(www\.)?(t|telegram)\.me\//i, "");
  s = s.replace(/^s\//, "").replace(/^@/, "");
  s = s.split(/[/?#]/)[0] ?? "";
  return USER_RE.test(s) ? s : null;
}

/** "12.3K" -> 12300, "3,4M" -> 3400000, "845" -> 845. */
export function parseCount(raw: string): { value: number; approx: boolean } | null {
  const s = raw.replace(/\s/g, "").replace(",", ".");
  const m = /^([\d.]+)([KkMm])?$/.exec(s);
  if (!m) return null;
  const base = Number.parseFloat(m[1]);
  if (!Number.isFinite(base)) return null;
  const mult = m[2] ? (m[2].toLowerCase() === "k" ? 1_000 : 1_000_000) : 1;
  return { value: Math.round(base * mult), approx: Boolean(m[2]) };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decode(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (all, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : all;
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

/** innerText-like: keeps line breaks, drops tags. */
export function toText(html: string): string {
  return decode(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Returns the inner HTML of the first element whose class list contains `cls` (balanced div/span/a). */
function innerOf(html: string, cls: string): string | null {
  const re = new RegExp(`<(div|span|a)\\b[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>`, "i");
  const m = re.exec(html);
  if (!m) return null;
  const tag = m[1].toLowerCase();
  const start = m.index + m[0].length;
  const tagRe = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  tagRe.lastIndex = start;
  let depth = 1;
  let t: RegExpExecArray | null;
  while ((t = tagRe.exec(html))) {
    if (t[0].endsWith("/>")) continue;
    depth += t[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, t.index);
  }
  return html.slice(start);
}

function mediaOf(chunk: string): Media {
  if (/tgme_widget_message_roundvideo|tgme_widget_message_video_player/.test(chunk)) return "video";
  if (/tgme_widget_message_grouped_wrap/.test(chunk)) return "album";
  if (/tgme_widget_message_photo_wrap/.test(chunk)) return "photo";
  if (/tgme_widget_message_document|tgme_widget_message_poll|tgme_widget_message_sticker|tgme_widget_message_voice/.test(chunk))
    return "other";
  return "text";
}

/** Parses one t.me/s page. Pure. */
export function parseChannelPage(
  channel: string,
  html: string,
): { title?: string; subscribers?: number; posts: RawPost[]; hasHeader: boolean } {
  const titleHtml = innerOf(html, "tgme_channel_info_header_title");
  const title = titleHtml ? toText(titleHtml) || undefined : undefined;

  let subscribers: number | undefined;
  const counterRe = /<div class="tgme_channel_info_counter">([\s\S]*?)<\/div>/gi;
  let c: RegExpExecArray | null;
  while ((c = counterRe.exec(html))) {
    const value = /class="counter_value">([^<]+)</.exec(c[1])?.[1];
    const type = /class="counter_type">([^<]+)</.exec(c[1])?.[1] ?? "";
    if (value && /subscriber|подписчик|obunachi|member|участник/i.test(type)) {
      subscribers = parseCount(decode(value))?.value;
      break;
    }
  }

  const posts: RawPost[] = [];
  const parts = html.split(/<div class="tgme_widget_message_wrap/).slice(1);
  for (const chunk of parts) {
    const head = /<div class="(tgme_widget_message[^"]*)"[^>]*data-post="([^"]+)"/.exec(chunk);
    if (!head) continue;
    if (/service_message/.test(head[1])) continue;
    const [ch, idStr] = head[2].split("/");
    const id = Number.parseInt(idStr ?? "", 10);
    if (!Number.isFinite(id)) continue;
    const textHtml = innerOf(chunk, "tgme_widget_message_text");
    const viewsRaw = /class="tgme_widget_message_views">([^<]+)</.exec(chunk)?.[1];
    const views = viewsRaw ? parseCount(decode(viewsRaw)) : null;
    const datetime = /<time[^>]*datetime="([^"]+)"/.exec(chunk)?.[1];
    const postedAt = datetime ? new Date(datetime) : null;
    if (!postedAt || Number.isNaN(postedAt.getTime())) continue;
    const links = [...(textHtml ?? "").matchAll(/<a\b[^>]*href="([^"]+)"/gi)].map((m) => decode(m[1]));
    posts.push({
      id,
      channel: ch || channel,
      url: `https://t.me/${ch || channel}/${id}`,
      text: textHtml ? toText(textHtml) : "",
      postedAt: postedAt.toISOString(),
      views: views?.value,
      approx: views?.approx ?? false,
      media: mediaOf(chunk),
      isForward: /tgme_widget_message_forwarded_from/.test(chunk),
      links,
    });
  }
  const hasHeader = Boolean(title) || /tgme_channel_info/.test(html);
  return { title, subscribers, posts, hasHeader };
}

/* ------------------------------------------------------------------ fetch */

const cache = new Map<string, { at: number; data: ChannelData }>();
const CACHE_MS = 30 * 60_000;

async function fetchPage(url: string, timeoutMs: number): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; UslubBrain/1.0)", "Accept-Language": "en" },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
    cache: "no-store",
  });
  if (!res.ok) throw new BrainScrapeError("FETCH_FAILED", `t.me returned ${res.status}`, 502);
  // t.me/s/<handle> redirects to the t.me/<handle> contact page when there is no public preview.
  if (res.url && previewRedirected(res.url))
    throw new BrainScrapeError("NO_PUBLIC_PREVIEW", "Kanal topilmadi yoki yopiq (ochiq ko‘rinishi yo‘q)", 404);
  return res.text();
}

/**
 * Fetches t.me/s/<ch>, then ?before=<smallest id>. Stops at `maxPosts`, when the
 * oldest post is older than 90 days, or after `maxPages` pages. Cached 30 min.
 */
export async function scrapeChannelData(
  input: string,
  opts: { maxPosts?: number; maxPages?: number; timeoutMs?: number; now?: number; onPage?: (pages: number, posts: number) => void } = {},
): Promise<ChannelData> {
  const channel = normalizeChannel(input);
  if (!channel) throw new BrainScrapeError("BAD_CHANNEL", "Kanal nomi noto‘g‘ri. Masalan: @kanal_nomi");
  const key = channel.toLowerCase();
  const hit = cache.get(key);
  const now = opts.now ?? Date.now();
  if (hit && now - hit.at < CACHE_MS) return hit.data;

  const maxPosts = opts.maxPosts ?? 60;
  const maxPages = opts.maxPages ?? 4;
  const timeoutMs = opts.timeoutMs ?? 8_000;
  const byId = new Map<number, RawPost>();
  let title: string | undefined;
  let subscribers: number | undefined;
  let hasHeader = false;
  let service: string[] = [];
  let pages = 0;
  let complete = false;
  let before: number | null = null;

  while (pages < maxPages) {
    const url: string = `https://t.me/s/${channel}${before ? `?before=${before}` : ""}`;
    let html: string;
    try {
      html = await fetchPage(url, timeoutMs);
    } catch (err) {
      if (pages === 0) {
        if (err instanceof BrainScrapeError) throw err;
        throw new BrainScrapeError("FETCH_FAILED", "Telegram javob bermadi, keyinroq urinib ko‘ring", 504);
      }
      break; // keep what we have
    }
    pages++;
    const page = parseChannelPage(channel, html);
    if (pages === 1) {
      title = page.title;
      subscribers = page.subscribers;
      hasHeader = page.hasHeader;
      service = serviceTexts(html).slice(0, 10);
    }
    const fresh = page.posts.filter((p) => !byId.has(p.id));
    for (const p of fresh) byId.set(p.id, p);
    opts.onPage?.(pages, byId.size);
    if (fresh.length === 0) {
      complete = true;
      break;
    }
    const minId = Math.min(...fresh.map((p) => p.id));
    if (minId <= 1) {
      complete = true;
      break;
    }
    const oldest = Math.min(...[...byId.values()].map((p) => Date.parse(p.postedAt)));
    if (byId.size >= maxPosts || now - oldest > 90 * 86_400_000) break;
    before = minId;
  }

  if (byId.size === 0 && !hasHeader) {
    throw new BrainScrapeError("NO_PUBLIC_PREVIEW", "Kanal topilmadi yoki yopiq (ochiq ko‘rinishi yo‘q)", 404);
  }
  const posts = [...byId.values()].sort((a, b) => b.id - a.id).slice(0, maxPosts);
  const data: ChannelData = { channel, title, subscribers, posts, complete, pages, serviceTexts: service };
  cache.set(key, { at: now, data });
  if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  return data;
}
