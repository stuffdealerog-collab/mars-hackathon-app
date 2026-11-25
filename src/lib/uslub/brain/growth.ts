/**
 * Growth rules for channels that are not shops (owner correction 2): a blog, an expert, a media digest or a community
 * grows by readers coming back, answering and sharing, not by orders. Pure: counts over the channel's own posts.
 *
 * - R.SERIES:        a recurring rubric people come back for (a hashtag, a "Kun maslahati:" opening, "3-qism");
 * - R.NO_ENGAGEMENT: posts rarely ask the reader anything (a question, a poll, "what do you think");
 * - R.CROSS_PROMO:   the channel never mentions or swaps posts with similar channels;
 * - R.SUBS_TREND:    the subscriber count over the days Mercat has measured it (channel_snapshots).
 * Rhythm and gaps (R.INCONSISTENT), best hours (R.TIME_WINNER) and formats that earn views (R.FORMAT_WINNER) are the
 * shared rules in rules.ts; their effects read for growth channels there.
 */
import { median, normApos, pct } from "./stats";
import type { LedgerEntry, RawPost, RuleResult } from "./types";

export interface SubscriberTrend {
  /** Subscribers on the first and last measured day. */
  from: number;
  to: number;
  /** Days between them. */
  days: number;
  /** Measured days. */
  n: number;
}

export interface Rubric {
  /** Normalized marker: "#maslahat", "kun maslahati", "series:qism". */
  marker: string;
  /** As the channel writes it. */
  label: string;
  n: number;
  /** Median view lift of its posts (null when too few have views). */
  lift: number | null;
}

export interface GrowthSignals {
  posts: number;
  rubrics: Rubric[];
  questionShare: number;
  crossShare: number;
}

const ENGAGE_RE =
  /fikringiz|siz qanday|sizchi|sizningcha|izohlar|izohda|kommentar|ovoz bering|so'rovnoma|qaysi birini|qaysi biri|как думаете|а вы|ваше мнение|в комментариях|комментар|голосу|опрос|какой выбер|what do you think|your take|comment below|in the comments|\bvote\b|\bpoll\b|which one/i;
const SERIES_RE = /(\d+)\s*-?\s*(qism|son|dars|часть|выпуск|урок|серия|part|episode|lesson)|(qism|часть|выпуск|урок|серия|part|episode|lesson|dars)\s*№?\s*\d+/i;
const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;

const ownPosts = (posts: RawPost[]) => posts.filter((p) => !p.isForward && p.text.trim().length >= 20);

/** Rubric markers of one post: its hashtags, a short "Label:" opening, a part number ("3-qism", "часть 2"). */
export function rubricMarkers(text: string): { marker: string; label: string }[] {
  const out: { marker: string; label: string }[] = [];
  for (const tag of new Set(text.match(HASHTAG_RE) ?? [])) out.push({ marker: tag.toLowerCase(), label: tag });
  const first = (text.split("\n").find((l) => l.trim()) ?? "").trim();
  const head = /^([^:|—–]{2,32})\s*[:|—–]/u.exec(first)?.[1];
  if (head) {
    const label = head.replace(/[\p{Extended_Pictographic}️#№\d]/gu, " ").replace(/\s+/g, " ").trim();
    if (/\p{L}{2}/u.test(label) && label.split(" ").length <= 4) out.push({ marker: normApos(label).toLowerCase(), label });
  }
  const s = SERIES_RE.exec(text);
  if (s) {
    const w = (s[2] ?? s[3] ?? "").toLowerCase();
    out.push({ marker: `series:${w}`, label: s[0] });
  }
  return out;
}

/** Signals for the growth rules from the channel's own posts and their view lifts (post id -> lift). */
export function growthSignals(posts: RawPost[], lifts: Map<number, number>, channel: string): GrowthSignals {
  const own = ownPosts(posts);
  const n = own.length;
  const byMarker = new Map<string, { label: string; ids: number[] }>();
  for (const p of own)
    for (const m of new Map(rubricMarkers(p.text).map((x) => [x.marker, x])).values()) {
      const e = byMarker.get(m.marker) ?? { label: m.label, ids: [] };
      e.ids.push(p.id);
      byMarker.set(m.marker, e);
    }
  // A rubric repeats (3+ posts) but is not on every post (a hashtag on all of them is a signature).
  const rubrics: Rubric[] = [...byMarker.entries()]
    .filter(([, e]) => e.ids.length >= 3 && e.ids.length <= Math.max(3, 0.8 * n))
    .map(([marker, e]) => {
      const ls = e.ids.map((id) => lifts.get(id)).filter((x): x is number => x != null);
      return { marker, label: e.label, n: e.ids.length, lift: ls.length >= 3 ? (median(ls) ?? null) : null };
    })
    .sort((a, b) => b.n - a.n)
    .slice(0, 5);
  const asks = (p: RawPost) => {
    const tail = p.text.trim().split("\n").filter((l) => l.trim()).slice(-2).join(" ");
    return /\?/.test(tail) || ENGAGE_RE.test(normApos(p.text)) || (p.media === "other" && /\?/.test(p.text));
  };
  const own_ = channel.replace(/^@/, "").toLowerCase();
  const mentionsOther = (p: RawPost) => {
    const handles = [...p.text.matchAll(/(?<![\w/.])@([A-Za-z]\w{3,31})/g)].map((m) => m[1].toLowerCase());
    const links = [...`${p.text}\n${p.links.join("\n")}`.matchAll(/t\.me\/([A-Za-z]\w{3,31})(?![\w])/g)].map((m) => m[1].toLowerCase());
    return [...handles, ...links].some((h) => h !== own_ && !h.endsWith("bot"));
  };
  const all = posts.filter((p) => p.text.trim().length >= 20 || p.isForward);
  return {
    posts: n,
    rubrics,
    questionShare: n ? own.filter(asks).length / n : 0,
    // Forwards from other channels and posts naming them both count as cross-promotion.
    crossShare: all.length ? all.filter((p) => p.isForward || mentionsOther(p)).length / all.length : 0,
  };
}

export const MIN_GROWTH_POSTS = 6;

/** The growth rules (only for blog / expert / media / community channels). */
export function growthRules(sig: GrowthSignals, ctx: { subscriberTrend?: SubscriberTrend; similar?: string[] } = {}): RuleResult[] {
  const out: RuleResult[] = [];
  const few = sig.posts < MIN_GROWTH_POSTS;
  const strongRubric = sig.rubrics.find((r) => r.lift != null && r.lift >= 1.1);
  out.push({
    id: "R.SERIES",
    name: "Rubrika",
    kind: strongRubric ? "strength" : "opportunity",
    severity: strongRubric ? 1 : 2,
    status: few ? "insufficient" : strongRubric || !sig.rubrics.length ? "fired" : "not_fired",
    trigger: few
      ? `own posts ${sig.posts} < ${MIN_GROWTH_POSTS}`
      : strongRubric
        ? `rubric «${strongRubric.label}» in ${strongRubric.n} posts, view lift ${strongRubric.lift?.toFixed(2)}`
        : sig.rubrics.length
          ? `rubrics ${sig.rubrics.map((r) => `«${r.label}» ×${r.n}`).join(", ")}, no lift above 1.1`
          : `no recurring rubric in ${sig.posts} posts`,
    ids: ["S.rubrics"],
    effects: strongRubric
      ? `Keep «${strongRubric.label}» every week on the same day; one slot this week is its next part.`
      : "Start one weekly rubric people come back for: the same opening words and the same day every week (grow +10).",
    n: sig.posts,
    data: { rubrics: sig.rubrics, keep: strongRubric?.label },
  });
  out.push({
    id: "R.NO_ENGAGEMENT",
    name: "Savol kam",
    kind: "opportunity",
    severity: 2,
    status: few ? "insufficient" : sig.questionShare < 0.15 ? "fired" : "not_fired",
    trigger: `posts that ask readers something ${pct(sig.questionShare, 0)} < 15%`,
    ids: ["S.questionShare"],
    effects: "engage +10, reach −10. 1–2 posts a week end with a real question or a poll the readers can answer in one tap.",
    n: sig.posts,
  });
  out.push({
    id: "R.CROSS_PROMO",
    name: "Hamkor kanallar",
    kind: "opportunity",
    severity: 1,
    status: few ? "insufficient" : sig.crossShare < 0.05 ? "fired" : "not_fired",
    trigger: `posts that mention or forward other channels ${pct(sig.crossShare, 0)} < 5%`,
    ids: ["S.crossShare"],
    effects: "grow +5. Agree a post swap with one similar channel of about the same size (same topic, not a competitor's copy); one slot this week prepares it.",
    n: sig.posts,
    data: { similar: (ctx.similar ?? []).slice(0, 3) },
  });
  const t = ctx.subscriberTrend;
  const change = t && t.from > 0 ? (t.to - t.from) / t.from : undefined;
  out.push({
    id: "R.SUBS_TREND",
    name: "Obunachilar",
    kind: change != null && change < 0 ? "problem" : "strength",
    severity: 2,
    status: !t || t.n < 2 || t.days < 7 || change == null ? "insufficient" : change <= -0.01 || change >= 0.02 ? "fired" : "not_fired",
    trigger: t && change != null ? `subscribers ${t.from} → ${t.to} in ${t.days} d (${change >= 0 ? "+" : ""}${pct(change)})` : "fewer than 2 measured days",
    ids: ["S.subsTrend"],
    effects:
      change != null && change < 0
        ? "grow +10, engage −10. Find what changed in the last weeks (topics, rhythm, ads) and bring back the posts that were forwarded."
        : "Keep the rhythm and the rubric that brought them; ask new readers what they want to read next.",
    data: t ? { ...t, change } : undefined,
  });
  return out;
}

/** Ledger entries the growth rules cite (the LLM copies numbers only from the ledger). */
export function growthLedger(sig: GrowthSignals, trend?: SubscriberTrend): LedgerEntry[] {
  const L: LedgerEntry[] = [
    {
      id: "S.rubrics",
      label: "takrorlanadigan rubrikalar",
      value: sig.rubrics.length,
      display: sig.rubrics.length ? sig.rubrics.map((r) => `«${r.label}» ×${r.n}`).join(", ") : "0",
      n: sig.posts,
      source: "stats",
    },
    { id: "S.questionShare", label: "o'quvchiga savol beradigan postlar", value: sig.questionShare, display: pct(sig.questionShare, 0), n: sig.posts, source: "stats" },
    { id: "S.crossShare", label: "boshqa kanallarni eslatgan yoki ulashgan postlar", value: sig.crossShare, display: pct(sig.crossShare, 0), n: sig.posts, source: "stats" },
  ];
  if (trend && trend.from > 0) {
    const change = (trend.to - trend.from) / trend.from;
    L.push({ id: "S.subsTrend", label: `obunachilar ${trend.days} kunda`, value: change, display: `${trend.from} → ${trend.to} (${change >= 0 ? "+" : ""}${pct(change)})`, n: trend.n, window: `${trend.days}d`, source: "stats" });
  }
  return L;
}

/** Subscriber trend from daily snapshots ({day, subscribers}, any order): first and last measured day. */
export function subscriberTrendOf(rows: { day: string; subscribers: number }[]): SubscriberTrend | undefined {
  const xs = rows.filter((r) => Number.isFinite(r.subscribers) && r.subscribers > 0).sort((a, b) => a.day.localeCompare(b.day));
  if (xs.length < 2) return undefined;
  const a = xs[0];
  const b = xs[xs.length - 1];
  const days = Math.round((Date.parse(b.day) - Date.parse(a.day)) / 86_400_000);
  return { from: a.subscribers, to: b.subscribers, days, n: xs.length };
}
