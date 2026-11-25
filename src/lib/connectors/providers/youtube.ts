import { arr, type CallOpts, isRecord, num, ProviderError, query, str } from "../net";
import { type GoogleCreds, googleAuthorizeUrl, googleExchange, googleGet, googleRefresh, googleRevoke } from "./google";
import { type Connector, type ConnectorDeps, type DailyRow, type ItemRow, type MetricValue, title200 } from "./types";

/**
 * YouTube, read-only: channel statistics (Data API v3) and daily numbers (YouTube Analytics API). Scopes:
 * youtube.readonly and yt-analytics.readonly. About 3 Data API units per channel per day, far inside the
 * 10 000/day bucket. Analytics lags 2-3 days, so a daily sync re-reads the last 4 days. Upload is out of scope.
 */

export const YOUTUBE_SCOPES = ["openid", "https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/yt-analytics.readonly"];

const DATA = "https://www.googleapis.com/youtube/v3";
const ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports";
const DAY_METRICS = "views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost,likes,comments,shares";
const RENAME: Record<string, string> = {
  views: "views",
  estimatedMinutesWatched: "minutes_watched",
  averageViewDuration: "avg_view_duration_s",
  subscribersGained: "subs_gained",
  subscribersLost: "subs_lost",
  likes: "likes",
  comments: "comments",
  shares: "shares",
};

/** An Analytics report (columnHeaders + rows) → one record per row, keyed by column name. */
export function parseAnalyticsReport(body: unknown): Record<string, MetricValue>[] {
  const b = isRecord(body) ? body : {};
  const cols = arr(b.columnHeaders).map((h) => (isRecord(h) ? (str(h.name) ?? "") : ""));
  return arr(b.rows)
    .filter(Array.isArray)
    .map((row) => Object.fromEntries(cols.map((c, i) => [c, typeof (row as unknown[])[i] === "string" ? ((row as unknown[])[i] as string) : num((row as unknown[])[i])])));
}

/** dimensions=day report → daily rows; dimensions=day,creatorContentType → shorts/long views merged in. */
export function youtubeDaily(channelId: string, dayReport: unknown, typeReport: unknown): DailyRow[] {
  const byDay = new Map<string, Record<string, MetricValue>>();
  for (const r of parseAnalyticsReport(dayReport)) {
    const day = typeof r.day === "string" ? r.day : null;
    if (!day) continue;
    const metrics: Record<string, MetricValue> = {};
    for (const [from, to] of Object.entries(RENAME)) metrics[to] = typeof r[from] === "number" ? r[from] : null;
    byDay.set(day, metrics);
  }
  for (const r of parseAnalyticsReport(typeReport)) {
    const day = typeof r.day === "string" ? r.day : null;
    const views = typeof r.views === "number" ? r.views : null;
    if (!day || views == null) continue;
    const m = byDay.get(day) ?? {};
    const key = r.creatorContentType === "SHORTS" ? "shorts_views" : "long_views";
    m[key] = ((typeof m[key] === "number" ? (m[key] as number) : 0) + views) as number;
    byDay.set(day, m);
  }
  return [...byDay].map(([day, metrics]) => ({ accountId: channelId, day, metrics }));
}

/** "PT1M5S" → 65. */
export function isoDurationSeconds(v: unknown): number | null {
  const m = typeof v === "string" ? /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(v) : null;
  if (!m) return null;
  return Number(m[1] ?? 0) * 86_400 + Number(m[2] ?? 0) * 3_600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
}

export function youtubeItems(videos: unknown): ItemRow[] {
  const out: ItemRow[] = [];
  for (const v of arr(isRecord(videos) ? videos.items : null)) {
    if (!isRecord(v)) continue;
    const id = str(v.id);
    if (!id) continue;
    const sn = isRecord(v.snippet) ? v.snippet : {};
    const st = isRecord(v.statistics) ? v.statistics : {};
    const cd = isRecord(v.contentDetails) ? v.contentDetails : {};
    out.push({
      kind: "video",
      externalId: id,
      publishedAt: str(sn.publishedAt),
      title: title200(sn.title),
      permalink: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
      metrics: { views: num(st.viewCount), likes: num(st.likeCount), comments: num(st.commentCount), duration_s: isoDurationSeconds(cd.duration) },
    });
  }
  return out;
}

export function youtubeConnector(creds: GoogleCreds, deps: ConnectorDeps): Connector {
  const f = deps.fetch;
  const channelInfo = async (token: string, opts: CallOpts) => {
    const body = await googleGet(f, `${DATA}/channels?${query({ part: "snippet,statistics,contentDetails", mine: "true" })}`, token, opts);
    const ch = arr(body.items).find(isRecord);
    return ch ?? null;
  };
  return {
    id: "youtube",
    family: "google",
    usesPkce: true,
    settleDays: 4,
    authorizeUrl: (p) => googleAuthorizeUrl(creds, YOUTUBE_SCOPES, p),
    exchange: (p, opts) => googleExchange(f, creds, p, opts),
    missingScopes: (t) => YOUTUBE_SCOPES.filter((s) => s !== "openid" && !t.scopes.includes(s)),

    async profile(t, opts) {
      if (!t.accessToken) throw new ProviderError("oauth_failed", undefined, "no_token");
      const ch = await channelInfo(t.accessToken, opts);
      const id = ch ? str(ch.id) : null;
      if (!ch || !id) return { externalId: t.subject ?? "none", accounts: [], selected: null, status: "empty", error: "no_channel" };
      const sn = isRecord(ch.snippet) ? ch.snippet : {};
      const handle = str(sn.customUrl)?.replace(/^@/, "");
      return { externalId: id, accounts: [{ id, name: str(sn.title) ?? "YouTube", ...(handle ? { handle } : {}) }], selected: id, status: "active" };
    },

    async accessToken(stored, opts) {
      if (!stored.refresh) throw new ProviderError("expired", undefined, "no_refresh_token");
      return googleRefresh(f, creds, stored.refresh, opts);
    },

    async sync({ token, account, window, today }, opts) {
      const report = (dims: string, metrics: string) =>
        googleGet(
          f,
          `${ANALYTICS}?${query({ ids: "channel==MINE", startDate: window.since, endDate: window.until, metrics, dimensions: dims, sort: "day" })}`,
          token,
          opts,
        );
      const [dayReport, typeReport, ch] = await Promise.all([
        report("day", DAY_METRICS),
        report("day,creatorContentType", "views").catch((err) => {
          if (err instanceof ProviderError && (err.code === "expired" || err.code === "rate_limited")) throw err;
          return {}; // the split is a bonus; the day totals are enough
        }),
        channelInfo(token, opts),
      ]);
      const daily = youtubeDaily(account.id, dayReport, typeReport);
      const stats = ch && isRecord(ch.statistics) ? ch.statistics : {};
      // YouTube rounds public subscriber counts to 3 significant figures; hidden counts come back absent.
      const subs = stats.hiddenSubscriberCount === true ? null : num(stats.subscriberCount);
      if (subs != null) daily.push({ accountId: account.id, day: today, metrics: { subscribers: subs } });

      let items: ItemRow[] = [];
      const uploads = ch && isRecord(ch.contentDetails) && isRecord(ch.contentDetails.relatedPlaylists) ? str(ch.contentDetails.relatedPlaylists.uploads) : null;
      if (uploads) {
        const list = await googleGet(f, `${DATA}/playlistItems?${query({ part: "contentDetails", playlistId: uploads, maxResults: 15 })}`, token, opts);
        const ids = arr(list.items)
          .map((it) => (isRecord(it) && isRecord(it.contentDetails) ? str(it.contentDetails.videoId) : null))
          .filter((id): id is string => !!id);
        if (ids.length) {
          const videos = await googleGet(f, `${DATA}/videos?${query({ part: "snippet,statistics,contentDetails", id: ids.join(",") })}`, token, opts);
          items = youtubeItems(videos);
        }
      }
      return { daily, items };
    },

    async revoke(stored, opts) {
      if (stored.refresh) await googleRevoke(f, stored.refresh, opts);
    },
  };
}
