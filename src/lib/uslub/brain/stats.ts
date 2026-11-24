/**
 * Deterministic metrics (spec §B). Pure functions — no I/O, `now` is injected.
 */
import {
  LOSE,
  MATURE_H,
  MIN_CHANNEL_N,
  MIN_N,
  NEIGHBOURS,
  TZ_H,
  type BucketStat,
  type ChannelData,
  type ChannelStats,
  type Media,
  type PostLang,
  type RawPost,
} from "./types";

export const normApos = (s: string) => s.replace(/[ʻʼ’‘`´]/g, "'");

const RE = {
  price: /\d[\d\s.,]*\s?(so'?m|сўм|сум|sum\b|uzs|ming\b|минг|тыс|k\b|\$|usd)/i,
  hiddenPrice:
    /narx(i|ini)?\s*(lichka|shaxsiy|direkt|dm)|narxini bilish uchun|цен[аыу]\s*(в\s*)?(лс|личк|директ)|пишите в (лс|директ)/i,
  buyVerb:
    /buyurtma|band qiling|yozing|qo'ng'iroq|ro'yxatdan|bron|sotib ol|заказ|пишите|звоните|запис|брониру/i,
  bot: /t\.me\/\w+bot\b|\?start=/i,
  phone: /\+?998[\s-]?\(?\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/,
  map: /yandex\.(uz|ru|com)\/maps|maps\.app\.goo\.gl|google\.[a-z.]+\/maps|2gis\./i,
  mention: /@\w{4,}/,
  dm: /t\.me\/(?!s\/|\+|joinchat)[A-Za-z]\w{3,}(?!\w*bot\b)(?!\/\d)/i,
  promo:
    /chegirma|aksiya|skidka|скидк|акци|bepul|бесплатн|sovg'a|подар|\d+\s?%|1\s?\+\s?1|nasiya|muddatli to'lov|рассрочк/i,
  ad: /#reklama|#реклама|(^|[^\p{L}])реклама([^\p{L}]|$)|\breklama\b|homiy|#ad\b|erid/iu,
  hours: /\d{1,2}[:.]\d{2}\s?[-–—]\s?\d{1,2}[:.]\d{2}|ish vaqti|режим работы/i,
  address: /ko'chasi|mavzesi|tumani|ул\.|метро|mo'ljal|ориентир/i,
  review: /fikr|otziv|отзыв|mijozimiz/i,
  emoji: /\p{Extended_Pictographic}/gu,
  hashtag: /#[\p{L}\d_]+/gu,
};

const OFFER_RE: Record<string, RegExp> = {
  discount: /%|chegirma|скидк/i,
  freeDelivery: /bepul yetkaz|бесплатн\w* доставк/i,
  installment: /nasiya|muddatli|рассрочк/i,
  gift: /sovg'a|подар|1\s?\+\s?1/i,
  trial: /sinov dars|bepul dars|пробн|bepul (konsultatsiya|ko'rik)|бесплатн\w* консульт/i,
};

/** Small "neuro-word" lexicon (machine-sounding clichés), uz/ru/en. */
export const LEXICON = [
  "sizni ajoyib takliflar kutmoqda",
  "ajoyib imkoniyat",
  "eng yaxshi tanlov",
  "sifatli xizmat",
  "yuqori sifat",
  "professional jamoa",
  "amalga oshirish",
  "o'z ichiga oladi",
  "unutilmas taassurot",
  "hurmatli mijozlar",
  "shoshiling",
  "уникальная возможность",
  "не упустите",
  "высокое качество",
  "индивидуальный подход",
  "команда профессионалов",
  "широкий ассортимент",
  "лучшие цены",
  "unique opportunity",
  "don't miss out",
  "high quality",
  "elevate",
  "unlock",
];

export function lexiconHits(text: string): string[] {
  const t = normApos(text).toLowerCase();
  return LEXICON.filter((p) => t.includes(p));
}

export function detectLang(text: string): PostLang {
  const t = normApos(text);
  if (!t.trim()) return "unknown";
  const words = t.split(/\s+/).filter(Boolean);
  const cyr = words.filter((w) => /[а-яёўқғҳ]/i.test(w)).length;
  const lat = words.filter((w) => /[a-z]/i.test(w) && !/[а-яё]/i.test(w)).length;
  if (words.length >= 5 && cyr / words.length > 0.2 && lat / words.length > 0.2) return "mixed";
  if (/[ўқғҳЎҚҒҲ]/.test(t)) return "uz-Cyrl";
  if (/[а-яё]/i.test(t)) return "ru";
  if (/o'|g'|\b(va|uchun|bilan|siz|bizda|kerak|bor)\b/i.test(t)) return "uz-Latn";
  if (/\b(the|and|for|you|our)\b/i.test(t)) return "en";
  return /[a-z]/i.test(t) ? "uz-Latn" : "unknown";
}

export function localDate(iso: string): Date {
  return new Date(Date.parse(iso) + TZ_H * 3600_000); // read with getUTC*
}

const HOUR_BUCKETS: [string, number, number][] = [
  ["07-10", 7, 10],
  ["10-13", 10, 13],
  ["13-16", 13, 16],
  ["16-19", 16, 19],
  ["19-22", 19, 22],
];

export function hourBucket(h: number): string | null {
  for (const [k, a, b] of HOUR_BUCKETS) if (h >= a && h < b) return k;
  if (h >= 22 || h < 1) return "22-01";
  return null; // 01-07: excluded from best-hour analysis
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface PostFeatures {
  hasPrice: boolean;
  hiddenPrice: boolean;
  buyVerb: boolean;
  bot: boolean;
  phone: boolean;
  map: boolean;
  mention: boolean;
  dm: boolean;
  hasCTA: boolean;
  isPromo: boolean;
  isSale: boolean;
  isAd: boolean;
  hasHours: boolean;
  hasAddress: boolean;
  isReview: boolean;
  offerType?: string;
  lang: PostLang;
  emojiPer100: number;
  hashtags: number;
  firstLine: string;
  hookLen: number;
  lengthBucket: "<300" | "300-800" | ">800";
  questionHook: boolean;
  numberInHook: boolean;
  localHour: number;
  hourBucket: string | null;
  weekday: number; // 0 = Monday
  neuroHits: number;
  words: number;
}

export function features(post: RawPost): PostFeatures {
  const text = normApos(post.text);
  const all = `${text}\n${post.links.join("\n")}`;
  const hasPrice = RE.price.test(text);
  const buyVerb = RE.buyVerb.test(text);
  const bot = RE.bot.test(all);
  const phone = RE.phone.test(text);
  const map = RE.map.test(all);
  const mention = RE.mention.test(text);
  const dm = post.links.some((l) => RE.dm.test(l) && !RE.bot.test(l) && !l.includes(`/${post.channel}/`));
  const isPromo = RE.promo.test(text);
  const firstLine = (text.split("\n").find((l) => l.trim()) ?? "").trim();
  const ld = localDate(post.postedAt);
  const h = ld.getUTCHours();
  const chars = Math.max(1, text.length);
  const offerType = Object.entries(OFFER_RE).find(([, re]) => re.test(text))?.[0];
  return {
    hasPrice,
    hiddenPrice: RE.hiddenPrice.test(text),
    buyVerb,
    bot,
    phone,
    map,
    mention,
    dm,
    hasCTA: bot || phone || map || mention || dm || buyVerb,
    isPromo,
    isSale: hasPrice || isPromo || (buyVerb && (bot || dm || phone)),
    isAd: RE.ad.test(text),
    hasHours: RE.hours.test(text),
    hasAddress: RE.address.test(text),
    isReview: RE.review.test(text),
    offerType,
    lang: detectLang(text),
    emojiPer100: ((text.match(RE.emoji)?.length ?? 0) / chars) * 100,
    hashtags: text.match(RE.hashtag)?.length ?? 0,
    firstLine,
    hookLen: firstLine.length,
    lengthBucket: text.length < 300 ? "<300" : text.length <= 800 ? "300-800" : ">800",
    questionHook: firstLine.endsWith("?"),
    numberInHook: /\d/.test(firstLine),
    localHour: h,
    hourBucket: hourBucket(h),
    weekday: (ld.getUTCDay() + 6) % 7,
    neuroHits: lexiconHits(text).length,
    words: text.split(/\s+/).filter(Boolean).length,
  };
}

/* ------------------------------------------------------------- helpers */

export function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
}

function stdev(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** Lift of each post vs the median of its NEIGHBOURS nearest (by time) other posts. */
export function computeLifts(posts: RawPost[]): Map<number, number> {
  const sorted = [...posts].filter((p) => p.views != null).sort((a, b) => Date.parse(a.postedAt) - Date.parse(b.postedAt));
  const out = new Map<number, number>();
  for (let i = 0; i < sorted.length; i++) {
    const others = sorted.filter((_, j) => j !== i);
    let pool: RawPost[];
    if (others.length < 6) pool = others;
    else {
      const t = Date.parse(sorted[i].postedAt);
      pool = [...others].sort((a, b) => Math.abs(Date.parse(a.postedAt) - t) - Math.abs(Date.parse(b.postedAt) - t)).slice(0, NEIGHBOURS);
    }
    const med = median(pool.map((p) => p.views as number));
    if (med && med > 0) out.set(sorted[i].id, (sorted[i].views as number) / med);
  }
  return out;
}

function bucketLift<T extends string>(items: { key: T | null; lift: number }[]): Record<string, BucketStat> {
  const groups = new Map<string, number[]>();
  for (const { key, lift } of items) {
    if (key == null) continue;
    groups.set(key, [...(groups.get(key) ?? []), lift]);
  }
  const out: Record<string, BucketStat> = {};
  for (const [k, ls] of groups) {
    const ok = ls.length >= MIN_N;
    const v = ok ? (median(ls) as number) : null;
    out[k] = { value: v, n: ls.length, label: ok ? `${(v as number).toFixed(2)}× (n=${ls.length})` : `insufficient (n=${ls.length})` };
  }
  return out;
}

const share = (n: number, d: number) => (d ? n / d : 0);

/** Channel statistics (spec §B). `kbAddress` adds the address point to trustCoverage. */
export function computeStats(data: ChannelData, now: number, opts: { kbAddress?: string } = {}): ChannelStats {
  const DAY = 86_400_000;
  const window = data.posts.filter((p) => now - Date.parse(p.postedAt) <= 90 * DAY);
  const feats = new Map(window.map((p) => [p.id, features(p)]));
  const f = (p: RawPost) => feats.get(p.id) as PostFeatures;
  const own = window.filter((p) => !f(p).isAd && !p.isForward);
  const mature = own
    .filter((p) => now - Date.parse(p.postedAt) >= MATURE_H * 3600_000 && p.views != null)
    .sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt)); // newest first
  const views = (ps: RawPost[]) => ps.map((p) => p.views as number);

  const medianViews = mature.length >= 3 ? median(views(mature.slice(0, 30))) : undefined;
  const reachRate = medianViews != null && data.subscribers ? medianViews / data.subscribers : undefined;

  // cadence
  const times = data.posts.map((p) => Date.parse(p.postedAt)).sort((a, b) => a - b);
  const oldest = times[0];
  const ageDays = oldest != null ? (now - oldest) / DAY : undefined;
  let postsPerWeek = 0;
  if (times.length) {
    const in28 = times.filter((t) => now - t <= 28 * DAY).length;
    if (data.complete && ageDays != null && ageDays < 28) postsPerWeek = times.length / Math.max(1, ageDays / 7);
    else if (!data.complete && ageDays != null && ageDays < 28) postsPerWeek = times.length / Math.max(1, ageDays / 7);
    else postsPerWeek = in28 / 4;
  }
  let maxGapDays: number | undefined;
  const wTimes = times.filter((t) => now - t <= 90 * DAY);
  if (wTimes.length) {
    let gap = (now - wTimes[wTimes.length - 1]) / DAY;
    for (let i = 1; i < wTimes.length; i++) gap = Math.max(gap, (wTimes[i] - wTimes[i - 1]) / DAY);
    maxGapDays = gap;
  } else if (times.length) maxGapDays = (now - times[times.length - 1]) / DAY;

  // trend + CV
  let viewTrend: number | undefined;
  if (mature.length >= 20) {
    const [a, b] = mature.length >= 30 ? [mature.slice(0, 15), mature.slice(15, 30)] : [mature.slice(0, mature.length >> 1), mature.slice(mature.length >> 1)];
    const ma = median(views(a));
    const mb = median(views(b));
    if (ma != null && mb) viewTrend = ma / mb;
  }
  let viewCV: number | undefined;
  if (mature.length >= MIN_CHANNEL_N) {
    const v = views(mature.slice(0, 20));
    const m = mean(v);
    if (m > 0) viewCV = stdev(v) / m;
  }

  const coldStart = mature.length < MIN_CHANNEL_N || (data.complete && (ageDays ?? 0) < 28);
  const liftMap = coldStart ? new Map<number, number>() : computeLifts(mature);
  const lifts = mature.filter((p) => liftMap.has(p.id)).map((p) => ({ post: p, lift: liftMap.get(p.id) as number }));
  const L = (key: (p: RawPost) => string | null) => bucketLift(lifts.map(({ post, lift }) => ({ key: key(post), lift })));

  // hour concentration (all window posts)
  const hourCounts = new Map<string, number>();
  for (const p of window) {
    const b = f(p).hourBucket;
    if (b) hourCounts.set(b, (hourCounts.get(b) ?? 0) + 1);
  }
  const busiest = [...hourCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  const sale = window.filter((p) => f(p).isSale);
  const saleLifts = lifts.filter(({ post }) => f(post).isSale).map((x) => x.lift);

  // trust coverage
  const all = window.map((p) => f(p));
  const parts: string[] = [];
  if (all.some((x) => x.map)) parts.push("map");
  if (all.some((x) => x.phone)) parts.push("phone");
  if (all.some((x) => x.hasHours)) parts.push("hours");
  if (all.some((x) => x.hasAddress) || (opts.kbAddress && window.some((p) => normApos(p.text).includes(opts.kbAddress as string))))
    parts.push("address");
  if (window.some((p) => now - Date.parse(p.postedAt) <= 30 * DAY && f(p).isReview)) parts.push("review");

  const ownF = own.map((p) => f(p));
  const formatMix = { text: 0, photo: 0, album: 0, video: 0, other: 0 } as Record<Media, number>;
  for (const p of window) formatMix[p.media]++;
  for (const k of Object.keys(formatMix) as Media[]) formatMix[k] = share(formatMix[k], window.length);

  const langCounts: Record<string, number> = {};
  for (const x of ownF) langCounts[x.lang] = (langCounts[x.lang] ?? 0) + 1;
  const langShares = Object.fromEntries(Object.entries(langCounts).map(([k, v]) => [k, share(v, ownF.length)]));
  const majorityLang = Object.entries(langCounts)
    .filter(([k]) => k !== "unknown")
    .sort((a, b) => b[1] - a[1])[0]?.[0] as PostLang | undefined;

  const offerTypeCounts60d: Record<string, number> = {};
  for (const p of window) {
    const o = f(p).offerType;
    if (o && now - Date.parse(p.postedAt) <= 60 * DAY) offerTypeCounts60d[o] = (offerTypeCounts60d[o] ?? 0) + 1;
  }

  const totalWords = ownF.reduce((a, x) => a + x.words, 0);
  return {
    channel: data.channel,
    subscribers: data.subscribers,
    postsInWindow: window.length,
    maturePosts: mature.length,
    medianViews,
    medianLowConfidence: mature.length < MIN_CHANNEL_N,
    reachRate,
    postsPerWeek,
    maxGapDays,
    viewTrend,
    viewCV,
    ageDays,
    coldStart,
    formatLift: L((p) => p.media),
    hourLift: L((p) => f(p).hourBucket),
    weekdayLift: L((p) => WEEKDAYS[f(p).weekday]),
    langLift: L((p) => f(p).lang),
    lengthLift: L((p) => f(p).lengthBucket),
    hourConcentration: busiest ? share(busiest[1], window.length) : undefined,
    busiestHourBucket: busiest?.[0],
    saleShare: share(sale.length, window.length),
    promoShare: share(window.filter((p) => f(p).isPromo).length, window.length),
    ctaRate: share(window.filter((p) => f(p).hasCTA).length, window.length),
    forwardShare: share(window.filter((p) => p.isForward).length, window.length),
    priceShareInSale: sale.length >= 3 ? share(sale.filter((p) => f(p).hasPrice).length, sale.length) : undefined,
    saleLiftMedian: saleLifts.length >= MIN_N ? { value: median(saleLifts) as number, n: saleLifts.length } : undefined,
    hiddenPriceCount: window.filter((p) => f(p).hiddenPrice).length,
    trustCoverage: parts.length,
    trustParts: parts,
    emojiPer100: mean(ownF.map((x) => x.emojiPer100)),
    hashtagsPerPost: mean(ownF.map((x) => x.hashtags)),
    neuroDensity: totalWords ? (ownF.reduce((a, x) => a + x.neuroHits, 0) / totalWords) * 100 : 0,
    formatMix,
    langShares,
    majorityLang,
    offerTypeCounts60d,
    lifts,
    suspectBoosted: viewCV != null && viewCV < 0.12 && mature.length >= MIN_CHANNEL_N,
  };
}

/** Code-built "why" for a top post: "2.1× vs neighbours · video · 19–22 · price shown". */
export function whyLine(post: RawPost, lift: number): string {
  const x = features(post);
  const bits = [`${lift.toFixed(1)}× vs neighbours`, post.media];
  if (x.hourBucket) bits.push(x.hourBucket.replace("-", "–"));
  if (x.hasPrice) bits.push("price shown");
  if (x.isPromo) bits.push("promo");
  if (x.questionHook) bits.push("question hook");
  if (x.hasCTA) bits.push("has CTA");
  return bits.join(" · ");
}

export const isWinner = (b?: BucketStat) => b?.value != null && b.n >= MIN_N && b.value >= 1.2;
export const isLoser = (b?: BucketStat) => b?.value != null && b.n >= MIN_N && b.value <= LOSE;

/* ------------------------------------------------------------ formatting */

export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits).replace(/\.0$/, "")}%`;
export const fmtNum = (x: number) => (Math.abs(x) >= 100 ? Math.round(x).toLocaleString("en-US") : x.toFixed(1).replace(/\.0$/, ""));

/** reachRate prior bands by subscriber count (taxminiy). */
export function reachBand(subs: number): { low: number; high: number; label: string } {
  if (subs < 1000) return { low: 0.15, high: 0.35, label: "<1k" };
  if (subs < 10_000) return { low: 0.1, high: 0.25, label: "1k–10k" };
  if (subs < 50_000) return { low: 0.07, high: 0.15, label: "10k–50k" };
  return { low: 0.04, high: 0.1, label: ">50k" };
}
