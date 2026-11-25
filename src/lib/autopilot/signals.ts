/**
 * Channel signals (pure rules + the two daily/tick jobs that read them, with I/O injected):
 * - subscribers per channel per Tashkent day (getChatMemberCount, else the public t.me/s page);
 * - views of Mercat's posts 24 h and 72 h after they went out (the Bot API has no view counts for channel posts, so
 *   they come from the public channel page; forwards are on neither and stay empty);
 * - reactions (message_reaction_count updates) and joins/leaves (chat_member updates), parsed here for the bot.
 */

const HOUR = 3600_000;

/* ------------------------------------------------------------ bot updates */

type MemberLike = { status: string; is_member?: boolean } | null | undefined;

const inChannel = (m: MemberLike) =>
  m?.status === "creator" || m?.status === "administrator" || m?.status === "member" || (m?.status === "restricted" && m.is_member === true);

/** A chat_member update as a join or a leave of the channel; null when membership did not change. */
export function memberChange(before: MemberLike, after: MemberLike): "join" | "leave" | null {
  const was = inChannel(before);
  const is = inChannel(after);
  if (!was && is) return "join";
  if (was && !is) return "leave";
  return null;
}

type ReactionCount = { type: { type: string; emoji?: string; custom_emoji_id?: string }; total_count: number };

/** message_reaction_count: total and per reaction (emoji, custom emoji id, or "paid"). */
export function reactionTotals(reactions: readonly ReactionCount[]): { total: number; counts: Record<string, number> } {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const r of reactions) {
    const n = Number.isFinite(r.total_count) ? Math.max(0, Math.round(r.total_count)) : 0;
    const key = r.type.type === "emoji" ? (r.type.emoji ?? "?") : r.type.type === "custom_emoji" ? `custom:${r.type.custom_emoji_id ?? "?"}` : r.type.type;
    counts[key] = (counts[key] ?? 0) + n;
    total += n;
  }
  return { total, counts };
}

/** The channel key of a chat: its public username in lowercase, else its numeric id. */
export const chatKey = (chat: { id: number; username?: string }) => (chat.username ? chat.username.toLowerCase() : String(chat.id));

/* ---------------------------------------------------------------- metrics */

/** Which readings to store for a post seen now with `views`: 24 h (read 24–48 h after) and 72 h (72–120 h after). */
export function metricPatch(
  row: { publishedAt: number; views24h: number | null; views72h: number | null },
  views: number,
  now: number,
): { views: number; views24h?: number; views72h?: number } {
  const age = now - row.publishedAt;
  const out: { views: number; views24h?: number; views72h?: number } = { views };
  if (row.views24h == null && age >= 24 * HOUR && age < 48 * HOUR) out.views24h = views;
  if (row.views72h == null && age >= 72 * HOUR && age < 120 * HOUR) out.views72h = views;
  return out;
}

export function median(xs: readonly number[]): number | undefined {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return undefined;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2);
}

/** The channel's typical post: median views of posts at least 72 h old (not forwards from elsewhere). */
export function typicalViews(posts: readonly { postedAt: string; views?: number; isForward?: boolean }[], now: number): number | undefined {
  const mature = posts.filter((p) => !p.isForward && typeof p.views === "number" && now - Date.parse(p.postedAt) >= 72 * HOUR).map((p) => p.views as number);
  return mature.length >= 3 ? median(mature) : undefined;
}

/* ------------------------------------------------------------------- jobs */

export interface RunControl {
  signal?: AbortSignal;
  timeLeft(): number;
}

export interface SnapshotDeps {
  today: string; // Tashkent date
  channels(): Promise<string[]>;
  /** getChatMemberCount; null when Telegram cannot tell (private or unknown channel). */
  memberCount(channel: string): Promise<number | null>;
  /** Subscribers from the public t.me/s page; null when it has none. */
  scrapeCount(channel: string): Promise<number | null>;
  save(channel: string, day: string, subscribers: number, source: "bot" | "scrape"): Promise<void>;
}

/** One subscriber count per channel per day. A channel that fails is tried again on the next tick. */
export async function runSnapshots(deps: SnapshotDeps, ctl: RunControl): Promise<{ saved: number; missing: number }> {
  let saved = 0;
  let missing = 0;
  for (const channel of await deps.channels()) {
    if (ctl.signal?.aborted || ctl.timeLeft() < 4_000) break;
    let n = await deps.memberCount(channel).catch(() => null);
    let source: "bot" | "scrape" = "bot";
    if (n == null) {
      n = await deps.scrapeCount(channel).catch(() => null);
      source = "scrape";
    }
    if (n == null || !Number.isFinite(n) || n < 0) {
      missing++;
      continue;
    }
    await deps.save(channel, deps.today, Math.round(n), source);
    saved++;
  }
  return { saved, missing };
}

export interface MetricsDeps {
  now(): number;
  due(): Promise<{ channel: string; messageId: number; publishedAt: number; views24h: number | null; views72h: number | null }[]>;
  /** The public page's posts of a channel: id and views. */
  channelPosts(channel: string): Promise<{ id: number; views?: number }[]>;
  save(channel: string, messageId: number, v: { views: number; views24h?: number; views72h?: number }): Promise<void>;
}

/** 24 h / 72 h views of Mercat's posts, one page read per channel. */
export async function runMetrics(deps: MetricsDeps, ctl: RunControl): Promise<{ measured: number; notFound: number; channels: number }> {
  const rows = await deps.due();
  const byChannel = new Map<string, typeof rows>();
  for (const r of rows) {
    // A channel without a public username has no public page to read.
    if (/^-?\d+$/.test(r.channel)) continue;
    byChannel.set(r.channel, [...(byChannel.get(r.channel) ?? []), r]);
  }
  let measured = 0;
  let notFound = 0;
  let channels = 0;
  for (const [channel, items] of byChannel) {
    if (ctl.signal?.aborted || ctl.timeLeft() < 8_000) break;
    const posts = await deps.channelPosts(channel).catch(() => null);
    if (!posts) continue;
    channels++;
    const views = new Map(posts.map((p) => [p.id, p.views]));
    const now = deps.now();
    for (const it of items) {
      const v = views.get(it.messageId);
      if (typeof v !== "number") {
        notFound++;
        continue;
      }
      await deps.save(channel, it.messageId, metricPatch(it, v, now));
      measured++;
    }
  }
  return { measured, notFound, channels };
}
