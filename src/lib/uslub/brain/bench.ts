/**
 * Uzbek Telegram benchmarks by niche (the data moat). Every analysed channel
 * becomes a compact ChannelSummary (no post texts); medians across channels of
 * the same niche replace the hard-coded "taxminiy" priors once n is large enough.
 * Pure: the DB layer (memory.ts) and the committed seed (bench-seed.json) feed it.
 */
import { median, pct } from "./stats";
import type { ChannelStats, LedgerEntry } from "./types";

export type Niche =
  | "cafe"
  | "fastfood"
  | "clothing"
  | "beauty"
  | "education"
  | "clinic"
  | "electronics"
  | "furniture"
  | "flowers"
  | "ecommerce"
  | "other";

export const NICHE_LABEL: Record<Niche, { uz: string; ru: string; en: string }> = {
  cafe: { uz: "kafe va qandolat", ru: "кафе и кондитерские", en: "cafes and bakeries" },
  fastfood: { uz: "fastfud va yetkazib berish", ru: "фастфуд и доставка", en: "fast food and delivery" },
  clothing: { uz: "kiyim", ru: "одежда", en: "clothing" },
  beauty: { uz: "go'zallik", ru: "красота", en: "beauty" },
  education: { uz: "o'quv markazlari", ru: "учебные центры", en: "education centres" },
  clinic: { uz: "klinikalar", ru: "клиники", en: "clinics" },
  electronics: { uz: "elektronika", ru: "электроника", en: "electronics" },
  furniture: { uz: "mebel va uy", ru: "мебель и дом", en: "furniture and home" },
  flowers: { uz: "gullar va sovg'alar", ru: "цветы и подарки", en: "flowers and gifts" },
  ecommerce: { uz: "onlayn do'konlar", ru: "онлайн-магазины", en: "online shops" },
  other: { uz: "boshqa", ru: "другое", en: "other" },
};

const NICHE_RE: [Niche, RegExp][] = [
  ["clinic", /clinic|klinik|клиник|stomat|стомат|dental|med\b|medic|tibbiy|shifo/i],
  ["education", /educ|ta'?lim|o'?quv|курс|school|maktab|academy|akadem|ielts|english|ingliz|repetitor/i],
  ["fastfood", /fast ?food|fastfud|burger|lavash|pizza|пицц|доставк|delivery|yetkaz|kfc|evos|oqtepa/i],
  ["cafe", /cafe|kafe|кафе|restoran|ресторан|bakery|nonvoy|qandolat|кондитер|tort|торт|coffee|kofe|кофе|choyxona/i],
  ["flowers", /flower|gul\b|gullar|цвет|bouquet|buket|sovg'a|подар|gift/i],
  ["beauty", /beauty|go'?zallik|salon|салон|kosmet|космет|nail|barber|sartarosh|spa\b|lash|brow/i],
  ["clothing", /cloth|kiyim|одежд|fashion|moda|мода|shoes|poyabzal|обув|textile|tekstil/i],
  ["electronics", /electr|elektr|электрон|phone|telefon|смартфон|gadget|texnika|техник|apple|samsung/i],
  ["furniture", /furnit|mebel|мебел|home|uy jihoz|интерьер|interior|oshxona mebel/i],
  ["ecommerce", /market|marketplace|online|onlayn|shop|do'?kon|магазин|uzum|ecom/i],
];

/** Category / title / description text -> niche (first match wins, ordered from specific to generic). */
export function nicheOf(...texts: (string | undefined)[]): Niche {
  const t = texts.filter(Boolean).join(" ").replace(/[ʻʼ’‘`´]/g, "'");
  for (const [n, re] of NICHE_RE) if (re.test(t)) return n;
  return "other";
}

export type SizeBand = "<1k" | "1k-10k" | "10k-50k" | "50k+";
export function sizeBand(subs?: number): SizeBand | undefined {
  if (subs == null) return undefined;
  if (subs < 1000) return "<1k";
  if (subs < 10_000) return "1k-10k";
  if (subs < 50_000) return "10k-50k";
  return "50k+";
}

/** Compact, text-free stats of one channel at one point in time. */
export interface ChannelSummary {
  channel: string;
  niche: Niche;
  subscribers?: number;
  medianViews?: number;
  reachRate?: number;
  postsPerWeek: number;
  maturePosts: number;
  suspect: boolean;
  hourLift: Record<string, number>; // only buckets with n >= 3
  formatLift: Record<string, number>;
  weekdayLift: Record<string, number>;
  formatMix: Record<string, number>;
  saleShare: number;
  ctaRate: number;
  emojiPer100: number;
  capturedAt: string;
}

const vals = (rec: Record<string, { value: number | null; n: number }>) =>
  Object.fromEntries(Object.entries(rec).filter(([, b]) => b.value != null && b.n >= 3).map(([k, b]) => [k, Math.round((b.value as number) * 1000) / 1000]));

export function summarize(stats: ChannelStats, niche: Niche, capturedAt: string): ChannelSummary {
  const r3 = (x?: number) => (x == null ? undefined : Math.round(x * 10_000) / 10_000);
  return {
    channel: stats.channel.toLowerCase(),
    niche,
    subscribers: stats.subscribers,
    medianViews: stats.medianViews != null ? Math.round(stats.medianViews) : undefined,
    reachRate: r3(stats.reachRate),
    postsPerWeek: Math.round(stats.postsPerWeek * 10) / 10,
    maturePosts: stats.maturePosts,
    suspect: stats.suspectBoosted,
    hourLift: vals(stats.hourLift),
    formatLift: vals(stats.formatLift),
    weekdayLift: vals(stats.weekdayLift),
    formatMix: Object.fromEntries(Object.entries(stats.formatMix).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    saleShare: Math.round(stats.saleShare * 100) / 100,
    ctaRate: Math.round(stats.ctaRate * 100) / 100,
    emojiPer100: Math.round(stats.emojiPer100 * 10) / 10,
    capturedAt,
  };
}

export const MIN_BENCH_N = 5; // channels needed before a niche median replaces a prior

export interface Benchmark {
  niche: Niche;
  scope: "niche" | "all"; // "all" = not enough channels in the niche, all niches pooled
  n: number; // channels used (non-suspect, latest row per channel, >= 10 mature posts)
  reachRate?: { p25: number; median: number; p75: number };
  postsPerWeek?: number;
  hourLift: Record<string, { median: number; n: number }>;
  formatLift: Record<string, { median: number; n: number }>;
  saleShare?: number;
  ctaRate?: number;
  channels: string[];
}

function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** Latest summary per channel. */
export function latestPerChannel(rows: ChannelSummary[]): ChannelSummary[] {
  const by = new Map<string, ChannelSummary>();
  for (const r of rows) {
    const cur = by.get(r.channel);
    if (!cur || Date.parse(r.capturedAt) > Date.parse(cur.capturedAt)) by.set(r.channel, r);
  }
  return [...by.values()];
}

function pool(rows: ChannelSummary[], niche: Niche, scope: Benchmark["scope"]): Benchmark {
  const bucket = (pick: (r: ChannelSummary) => Record<string, number>) => {
    const acc = new Map<string, number[]>();
    for (const r of rows) for (const [k, v] of Object.entries(pick(r))) acc.set(k, [...(acc.get(k) ?? []), v]);
    return Object.fromEntries([...acc.entries()].filter(([, v]) => v.length >= 3).map(([k, v]) => [k, { median: Math.round((median(v) as number) * 100) / 100, n: v.length }]));
  };
  const reach = rows.map((r) => r.reachRate).filter((x): x is number => x != null);
  return {
    niche,
    scope,
    n: rows.length,
    reachRate: reach.length >= 3 ? { p25: quantile(reach, 0.25), median: median(reach) as number, p75: quantile(reach, 0.75) } : undefined,
    postsPerWeek: rows.length ? Math.round((median(rows.map((r) => r.postsPerWeek)) as number) * 10) / 10 : undefined,
    hourLift: bucket((r) => r.hourLift),
    formatLift: bucket((r) => r.formatLift),
    saleShare: rows.length ? median(rows.map((r) => r.saleShare)) : undefined,
    ctaRate: rows.length ? median(rows.map((r) => r.ctaRate)) : undefined,
    channels: rows.map((r) => r.channel).sort(),
  };
}

/**
 * Niche benchmark from all known channel summaries. Excludes the channel itself,
 * suspect (boosted) channels and channels with < 10 mature posts. Falls back to
 * all niches pooled when the niche has fewer than MIN_BENCH_N channels.
 */
export function benchmarkFor(rows: ChannelSummary[], niche: Niche, exclude?: string): Benchmark | undefined {
  const clean = latestPerChannel(rows).filter((r) => !r.suspect && r.maturePosts >= 10 && r.channel !== exclude?.toLowerCase());
  const inNiche = clean.filter((r) => r.niche === niche);
  if (inNiche.length >= MIN_BENCH_N) return pool(inNiche, niche, "niche");
  if (clean.length >= MIN_BENCH_N) return pool(clean, niche, "all");
  return undefined;
}

/** Ledger entries for a benchmark (S.bench.*). Each display names n and the scope, so the LLM copies both. */
export function benchLedger(b: Benchmark, own: { reachRate?: number }, lang: "uz" | "ru" | "en" = "uz"): LedgerEntry[] {
  const scopeLabel = b.scope === "niche" ? NICHE_LABEL[b.niche][lang] : lang === "uz" ? "barcha nishalar" : lang === "ru" ? "все ниши" : "all niches";
  const tag = `n=${b.n} ${lang === "uz" ? "kanal" : lang === "ru" ? "каналов" : "channels"}, ${scopeLabel}`;
  const L: LedgerEntry[] = [];
  if (b.reachRate) {
    L.push({ id: "S.bench.reachRate", label: `median qamrov (${scopeLabel})`, value: b.reachRate.median, display: `${pct(b.reachRate.median)} (${tag})`, n: b.n, source: "stats" });
    if (own.reachRate != null) {
      const rel = own.reachRate / b.reachRate.median;
      L.push({ id: "S.bench.relReach", label: `qamrov nisha medianiga nisbatan (${scopeLabel})`, value: rel, display: `${rel.toFixed(2)}×`, n: b.n, source: "stats" });
    }
  }
  if (b.postsPerWeek != null) L.push({ id: "S.bench.postsPerWeek", label: `haftasiga postlar, nisha medianasi`, value: b.postsPerWeek, display: `${b.postsPerWeek} (${tag})`, n: b.n, source: "stats" });
  for (const [k, v] of Object.entries(b.hourLift)) L.push({ id: `S.bench.hourLift.${k}`, label: `soat ${k} lift, nisha medianasi`, value: v.median, display: `${v.median.toFixed(2)}× (n=${v.n} kanal)`, n: v.n, source: "stats" });
  for (const [k, v] of Object.entries(b.formatLift)) L.push({ id: `S.bench.formatLift.${k}`, label: `format ${k} lift, nisha medianasi`, value: v.median, display: `${v.median.toFixed(2)}× (n=${v.n} kanal)`, n: v.n, source: "stats" });
  return L;
}

/** Best hour bucket across the niche (median lift >= 1.1 over >= 3 channels), for channels without their own winner. */
export function benchBestHour(b?: Benchmark): string | undefined {
  if (!b) return undefined;
  return Object.entries(b.hourLift)
    .filter(([, v]) => v.median >= 1.1 && v.n >= 3)
    .sort((x, y) => y[1].median - x[1].median)[0]?.[0];
}
