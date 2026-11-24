/**
 * Photos of a public Telegram channel's posts, read from its web preview t.me/s/<name>.
 * The preview shows each photo as `tgme_widget_message_photo_wrap … background-image:url('…')`
 * (video posts carry a thumbnail the same way). Parsing is pure and unit-tested; only
 * `fetchChannelPhotos` touches the network.
 */

export interface ChannelPhoto {
  url: string; // https://cdn*.telesco.pe/file/…jpg (may expire: re-host what we keep)
  postId: number;
  postUrl: string; // https://t.me/<name>/<id>
  date?: string; // ISO, from the post
  views?: number;
  kind: "photo" | "video_thumb";
}

/** "@name", "name", "t.me/name", "https://t.me/s/name/12" -> "name"; null when it is not a public username. */
export function normalizeChannelName(input: string): string | null {
  const s = input
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^(www\.)?(t|telegram)\.me\//i, "")
    .replace(/^s\//, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0];
  return /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(s) ? s : null;
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function parseViews(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const m = /^([\d.,]+)\s*([KM])?$/i.exec(raw.trim());
  if (!m) return undefined;
  const n = Number(m[1].replace(",", "."));
  if (!Number.isFinite(n)) return undefined;
  const mult = m[2]?.toUpperCase() === "M" ? 1e6 : m[2]?.toUpperCase() === "K" ? 1e3 : 1;
  return Math.round(n * mult);
}

/** Only Telegram's own CDN: we never follow an arbitrary URL found in a page. */
export function isTelegramCdn(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /(^|\.)telesco\.pe$/i.test(u.hostname);
  } catch {
    return false;
  }
}

/** Every post photo (and video thumbnail) on one t.me/s page, oldest first as on the page. */
export function extractChannelPhotos(html: string): ChannelPhoto[] {
  const out: ChannelPhoto[] = [];
  const blocks = html.split(/<div class="tgme_widget_message_wrap/).slice(1);
  for (const block of blocks) {
    const pid = /data-post="([^"/]+)\/(\d+)"/.exec(block);
    if (!pid) continue;
    if (/class="tgme_widget_message\b[^"]*\bservice_message\b/.test(block.slice(0, 600))) continue;
    const postId = Number(pid[2]);
    const postUrl = `https://t.me/${pid[1]}/${postId}`;
    const date = /<time datetime="([^"]+)"/.exec(block)?.[1];
    const views = parseViews(/tgme_widget_message_views">([^<]+)</.exec(block)?.[1]);
    const push = (raw: string, kind: ChannelPhoto["kind"]) => {
      const url = decode(raw);
      if (isTelegramCdn(url) && !out.some((p) => p.url === url)) out.push({ url, postId, postUrl, date, views, kind });
    };
    for (const m of block.matchAll(/tgme_widget_message_photo_wrap[^>]*background-image:url\('([^']+)'\)/g)) push(m[1], "photo");
    for (const m of block.matchAll(/tgme_widget_message_video_thumb"[^>]*background-image:url\('([^']+)'\)/g)) push(m[1], "video_thumb");
  }
  return out;
}

/**
 * Candidates for the style analysis: newest first, at most two per post (albums repeat one
 * scene), photos before video thumbnails. Claude then picks the representative ones.
 */
export function pickCandidates(photos: ChannelPhoto[], max = 10): ChannelPhoto[] {
  const newest = [...photos].sort((a, b) => b.postId - a.postId);
  const perPost = new Map<number, number>();
  const take = (kind: ChannelPhoto["kind"]) =>
    newest.filter((p) => {
      if (p.kind !== kind) return false;
      const n = perPost.get(p.postId) ?? 0;
      if (n >= 2) return false;
      perPost.set(p.postId, n + 1);
      return true;
    });
  return [...take("photo"), ...take("video_thumb")].slice(0, max);
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** The smallest post id on a page, for `?before=` paging. */
const minPostId = (html: string) => {
  const ids = [...html.matchAll(/data-post="[^"/]+\/(\d+)"/g)].map((m) => Number(m[1]));
  return ids.length ? Math.min(...ids) : undefined;
};

/**
 * Reads up to `pages` preview pages (20 posts each) until `want` photos are found.
 * Returns [] for a private, empty or unknown channel; throws only on a network failure of the first page.
 */
export async function fetchChannelPhotos(
  channel: string,
  opts: { want?: number; pages?: number; fetch?: FetchLike; timeoutMs?: number } = {},
): Promise<ChannelPhoto[]> {
  const name = normalizeChannelName(channel);
  if (!name) return [];
  const doFetch: FetchLike = opts.fetch ?? ((u, i) => fetch(u, i));
  const want = opts.want ?? 10;
  const photos: ChannelPhoto[] = [];
  let before: number | undefined;
  for (let page = 0; page < (opts.pages ?? 2); page++) {
    const url = `https://t.me/s/${name}${before ? `?before=${before}` : ""}`;
    let html: string;
    try {
      const res = await doFetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; MercatBot/1.0; +https://t.me)", "Accept-Language": "en" },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 12_000),
        cache: "no-store",
      });
      if (!res.ok) break;
      html = await res.text();
    } catch (err) {
      if (page === 0) throw err;
      break;
    }
    for (const p of extractChannelPhotos(html)) if (!photos.some((q) => q.url === p.url)) photos.push(p);
    const next = minPostId(html);
    if (photos.filter((p) => p.kind === "photo").length >= want || !next || next === before || next <= 1) break;
    before = next;
  }
  return photos;
}
