import { daysBetween, tashkentMidnightUnix } from "../days";
import { arr, type CallOpts, isRecord, mapLimit, num, ProviderError, str } from "../net";
import { graphGet, graphPaged, type MetaCreds, metaAuthorizeUrl, metaExchange, metaRevoke } from "./meta";
import { type Connector, type ConnectorDeps, type DailyRow, type ItemRow, type MetricValue, type ProviderAccount, title200 } from "./types";

/**
 * Instagram insights, read-only, through Facebook Login for Business (plan §3: one Meta app for Instagram and ads).
 * The owner's Instagram professional account must be linked to a Facebook Page; the configuration
 * (META_IG_CONFIG_ID) asks for instagram_basic, instagram_manage_insights, pages_show_list and
 * pages_read_engagement (business_management only if a business-portfolio Page is missing: OWNER-SETUP §1.5).
 *
 * Reads: account insights per Tashkent day (views, reach, interactions…), the follower count once a day (Mercat's
 * own follower history), the last posts and reels with their insights, and live stories (readable for 24 h only,
 * so only a daily run catches them). `impressions` is never asked for (Meta replaced it with `views`). A metric
 * Instagram does not return (accounts under 100 followers miss several) is stored as null, never 0.
 *
 * A light run (the tick) reads the account insights, the follower count, the post list and the live stories, all in
 * one parallel round, and skips the per-post and per-story insights (up to 22 more calls in several rounds); the
 * card's refresh reads those.
 */

export const IG_SCOPES_NEEDED = ["instagram_basic", "instagram_manage_insights", "pages_show_list"];

export const IG_ACCOUNT_METRICS = [
  "views",
  "reach",
  "accounts_engaged",
  "total_interactions",
  "likes",
  "comments",
  "shares",
  "saves",
  "profile_links_taps",
] as const;

const MEDIA_METRICS = "views,reach,saved,shares,total_interactions";
const STORY_METRICS = "views,reach,replies,shares,total_interactions";
/** Media older than this keep their last numbers (Instagram's media insights barely move after a month). */
const MEDIA_FRESH_DAYS = 30;
const MAX_MEDIA = 12;
const MAX_STORIES = 10;

/** One day's account insights (metric_type=total_value) → metrics; missing ones stay null. */
export function parseIgAccountInsights(body: unknown): Record<string, MetricValue> {
  const out: Record<string, MetricValue> = Object.fromEntries(IG_ACCOUNT_METRICS.map((m) => [m, null]));
  for (const row of arr(isRecord(body) ? body.data : null)) {
    if (!isRecord(row)) continue;
    const name = str(row.name);
    if (!name || !(name in out)) continue;
    const total = isRecord(row.total_value) ? num(row.total_value.value) : null;
    const series = arr(row.values);
    const last = series.length && isRecord(series[series.length - 1]) ? num((series[series.length - 1] as Record<string, unknown>).value) : null;
    out[name] = total ?? last;
  }
  return out;
}

/** A media insights response → { views, reach, … } (missing = null). */
export function parseIgMediaInsights(body: unknown, metrics: string): Record<string, MetricValue> {
  const out: Record<string, MetricValue> = Object.fromEntries(metrics.split(",").map((m) => [m, null]));
  for (const row of arr(isRecord(body) ? body.data : null)) {
    if (!isRecord(row)) continue;
    const name = str(row.name);
    if (!name || !(name in out)) continue;
    const values = arr(row.values);
    const v = values.length && isRecord(values[0]) ? num((values[0] as Record<string, unknown>).value) : null;
    out[name] = isRecord(row.total_value) ? num(row.total_value.value) : v;
  }
  return out;
}

export function igItemKind(media: Record<string, unknown>): ItemRow["kind"] {
  const product = str(media.media_product_type);
  if (product === "REELS") return "reel";
  if (product === "STORY") return "story";
  if (str(media.media_type) === "CAROUSEL_ALBUM") return "carousel";
  return "post";
}

/** /me/accounts → the Instagram professional accounts linked to the owner's Pages. */
export function parseIgAccounts(body: unknown): ProviderAccount[] {
  const out: ProviderAccount[] = [];
  for (const page of arr(isRecord(body) ? body.data : null)) {
    if (!isRecord(page) || !isRecord(page.instagram_business_account)) continue;
    const ig = page.instagram_business_account;
    const id = str(ig.id);
    if (!id || out.some((a) => a.id === id)) continue;
    const handle = str(ig.username) ?? undefined;
    out.push({ id, name: str(ig.name) ?? handle ?? str(page.name) ?? "Instagram", ...(handle ? { handle } : {}) });
  }
  return out;
}

export function instagramConnector(creds: MetaCreds, deps: ConnectorDeps): Connector {
  const f = deps.fetch;
  return {
    id: "instagram",
    family: "meta",
    usesPkce: false,
    settleDays: 2,
    authorizeUrl: (p) => metaAuthorizeUrl(creds, p),
    exchange: (p, opts) => metaExchange(f, creds, p, opts),
    missingScopes: (t) => IG_SCOPES_NEEDED.filter((s) => !t.scopes.includes(s)),

    async profile(t, opts) {
      const token = t.accessToken;
      if (!token) throw new ProviderError("oauth_failed", undefined, "no_token");
      const me = await graphGet(f, creds, token, "/me", { fields: "id,name" }, opts);
      const externalId = str(me.id) ?? t.subject;
      if (!externalId) throw new ProviderError("oauth_failed", undefined, "no_user");
      const pages = await graphPaged(f, creds, token, "/me/accounts", { fields: "id,name,instagram_business_account{id,username,name}", limit: 50 }, opts, 2);
      const accounts = parseIgAccounts({ data: pages });
      if (!accounts.length) return { externalId, accounts, selected: null, status: "empty", error: "not_professional" };
      return { externalId, accounts, selected: accounts[0].id, status: "active" };
    },

    accessToken: async (stored) => {
      if (!stored.access) throw new ProviderError("expired", undefined, "no_token");
      return stored.access;
    },

    async sync({ token, account, window, today, light }, opts: CallOpts) {
      const ig = account.id;
      const days = daysBetween(window.since, window.until);
      const [dayRows, profile, media, stories] = await Promise.all([
        mapLimit(
          days,
          4,
          async (day): Promise<DailyRow> => {
            const since = tashkentMidnightUnix(day);
            const body = await graphGet(
              f,
              creds,
              token,
              `/${ig}/insights`,
              { metric: IG_ACCOUNT_METRICS.join(","), period: "day", metric_type: "total_value", since, until: since + 86_400 },
              opts,
            );
            return { accountId: ig, day, metrics: parseIgAccountInsights(body) };
          },
          opts.signal,
        ),
        graphGet(f, creds, token, `/${ig}`, { fields: "followers_count,media_count" }, opts),
        graphGet(f, creds, token, `/${ig}/media`, { fields: "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count", limit: 25 }, opts),
        graphGet(f, creds, token, `/${ig}/stories`, { fields: "id,media_type,permalink,timestamp" }, opts).catch((err): Record<string, unknown> => {
          // Stories need the same permissions; a refusal here must not lose the rest of the sync.
          if (err instanceof ProviderError && (err.code === "expired" || err.code === "rate_limited")) throw err;
          return {};
        }),
      ]);

      const daily: DailyRow[] = [...dayRows];
      const followers = num(profile.followers_count);
      if (followers != null) daily.push({ accountId: ig, day: today, metrics: { followers } });

      const fresh = Date.now() - MEDIA_FRESH_DAYS * 86_400_000;
      const mediaRows = arr(media.data).filter(isRecord).slice(0, 25);
      const insightsFor = async (id: string, metrics: string) => {
        try {
          return parseIgMediaInsights(await graphGet(f, creds, token, `/${id}/insights`, { metric: metrics }, opts), metrics);
        } catch (err) {
          if (err instanceof ProviderError && (err.code === "expired" || err.code === "rate_limited")) throw err;
          return {}; // a metric this media type does not support: keep likes and comments
        }
      };
      const withInsights = light ? [] : mediaRows.filter((m) => Date.parse(str(m.timestamp) ?? "") >= fresh).slice(0, MAX_MEDIA);
      const mediaInsights = new Map(
        await mapLimit(withInsights, 4, async (m) => [str(m.id) ?? "", await insightsFor(str(m.id) ?? "", MEDIA_METRICS)] as const, opts.signal),
      );
      const items: ItemRow[] = [];
      for (const m of mediaRows) {
        const id = str(m.id);
        if (!id) continue;
        items.push({
          kind: igItemKind(m),
          externalId: id,
          publishedAt: str(m.timestamp),
          title: title200(m.caption),
          permalink: str(m.permalink),
          metrics: { likes: num(m.like_count), comments: num(m.comments_count), ...(mediaInsights.get(id) ?? {}) },
        });
      }
      const storyRows = arr(stories.data).filter(isRecord).slice(0, MAX_STORIES);
      const storyInsights = await mapLimit(
        storyRows,
        4,
        async (s) => ({ s, metrics: light ? {} : await insightsFor(str(s.id) ?? "", STORY_METRICS) }),
        opts.signal,
      );
      for (const { s, metrics } of storyInsights) {
        const id = str(s.id);
        if (id) items.push({ kind: "story", externalId: id, publishedAt: str(s.timestamp), title: null, permalink: str(s.permalink), metrics });
      }
      return { daily, items };
    },

    async revoke(stored, opts) {
      if (stored.access) await metaRevoke(f, creds, stored.access, opts);
    },
  };
}
