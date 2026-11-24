/**
 * Reads a public Telegram channel through its web preview (https://t.me/s/<username>).
 * No API keys, no login: only channels with a public preview work.
 * Pure parsing helpers are exported for tests; `scrapeChannel` does the fetch.
 */

export interface ScrapedPost {
  id?: number;
  text: string;
  views?: string; // as shown by Telegram, e.g. "1.2K"
  date?: string; // ISO
}

export interface ScrapedChannel {
  username: string;
  title?: string;
  description?: string;
  subscribers?: string; // e.g. "12.3K subscribers"
  posts: ScrapedPost[];
}

export type ScrapeErrorCode = "channel_invalid" | "channel_empty" | "telegram_unavailable" | "knowledge_needed";

export class ScrapeError extends Error {
  constructor(
    message: string,
    readonly status = 422,
    readonly code: ScrapeErrorCode = status === 400 ? "channel_invalid" : "telegram_unavailable",
    readonly details: { channel?: string; reason?: "few_posts" | "no_preview"; postsFound?: number } = {},
  ) {
    super(message);
  }
  get channel() {
    return this.details.channel;
  }
  get reason() {
    return this.details.reason;
  }
  get postsFound() {
    return this.details.postsFound;
  }
}

/** A channel with fewer posts than this is treated as empty (fresh mode): there is no voice to learn yet. */
export const MIN_CHANNEL_POSTS = 5;

const USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;

/**
 * Accepts "@name", "name", "t.me/name", "https://t.me/s/name", "telegram.me/name/123".
 * Returns null for invite links (t.me/+..., joinchat) and anything that is not a username.
 */
export function parseChannelUsername(input: string): string | null {
  let s = input.trim();
  if (!s || /\s/.test(s)) return null;
  if (/joinchat|t\.me\/\+/i.test(s)) return null;
  s = s.replace(/^https?:\/\//i, "").replace(/^(www\.)?(t|telegram)\.(me|dog)\//i, "");
  s = s.replace(/^s\//i, "").replace(/^@/, "");
  s = s.split(/[/?#\s]/)[0] ?? "";
  return USERNAME_RE.test(s) ? s : null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** Telegram message HTML -> plain text (keeps line breaks and emoji). */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const firstMatch = (html: string, re: RegExp) => {
  const m = html.match(re);
  return m ? htmlToText(m[1]) : undefined;
};

/** Parses the t.me/s/<username> HTML page. */
export function parseChannelHtml(username: string, html: string): ScrapedChannel {
  const title = firstMatch(html, /tgme_channel_info_header_title"[^>]*>([\s\S]*?)<\/div>/);
  const description = firstMatch(html, /tgme_channel_info_description"[^>]*>([\s\S]*?)<\/div>/);
  const counters = [...html.matchAll(/<span class="counter_value">([^<]+)<\/span>\s*<span class="counter_type">([^<]+)<\/span>/g)];
  const subs = counters.find((m) => /subscriber|member|подпис/i.test(m[2]));

  const posts: ScrapedPost[] = [];
  const blocks = html.split(/<div class="tgme_widget_message_wrap/).slice(1);
  for (const block of blocks) {
    const textHtml = block.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (!textHtml) continue;
    const text = htmlToText(textHtml[1]);
    if (text.length < 2) continue;
    const id = block.match(/data-post="[^"/]+\/(\d+)"/);
    const views = block.match(/tgme_widget_message_views">([^<]+)</);
    const date = block.match(/<time[^>]*datetime="([^"]+)"/);
    posts.push({
      id: id ? Number(id[1]) : undefined,
      text,
      views: views?.[1]?.trim(),
      date: date?.[1],
    });
  }
  return {
    username,
    title,
    description,
    subscribers: subs ? `${subs[1].trim()} ${subs[2].trim()}` : undefined,
    posts,
  };
}

/** Fetches the last ~20-40 posts of a public channel. Throws ScrapeError with a user-facing message. */
export async function scrapeChannel(
  input: string,
  opts: { timeoutMs?: number; maxPosts?: number; /** fewer text posts than this → ScrapeError "channel_empty" (default 1) */ minPosts?: number } = {},
): Promise<ScrapedChannel> {
  const username = parseChannelUsername(input);
  if (!username) {
    throw new ScrapeError("Kanal havolasi noto‘g‘ri. Misol: @kanal_nomi yoki https://t.me/kanal_nomi", 400, "channel_invalid");
  }
  let res: Response;
  try {
    res = await fetch(`https://t.me/s/${username}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MercatBot/1.0; +https://t.me)",
        "Accept-Language": "uz,ru;q=0.8,en;q=0.6",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
      cache: "no-store",
    });
  } catch (err) {
    const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new ScrapeError(timeout ? "Telegram javob bermadi (10 s). Qayta urinib ko‘ring." : "Telegramga ulanib bo‘lmadi.", 504);
  }
  // t.me/s/<name> redirects to t.me/<name> when there is no public preview (private, bot, user, or missing).
  if (res.status >= 300 && res.status < 400) {
    throw new ScrapeError(`@${username} ochiq kanal emas yoki mavjud emas. Ochiq kanal havolasini yuboring.`, 422, "channel_empty", {
      channel: username,
      reason: "no_preview",
      postsFound: 0,
    });
  }
  if (!res.ok) throw new ScrapeError(`Telegram ${res.status} qaytardi`, 502);
  const html = await res.text();
  const channel = parseChannelHtml(username, html);
  if (channel.posts.length < (opts.minPosts ?? 1)) {
    throw new ScrapeError(`@${username} kanalida ochiq postlar kam (${channel.posts.length}).`, 422, "channel_empty", {
      channel: username,
      reason: channel.posts.length === 0 && !channel.title ? "no_preview" : "few_posts",
      postsFound: channel.posts.length,
    });
  }
  const max = opts.maxPosts ?? 30;
  channel.posts = channel.posts.slice(-max); // newest are at the end of the page
  return channel;
}
