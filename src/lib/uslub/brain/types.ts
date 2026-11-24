/**
 * Uslub Brain v1 — shared primitives (pure, no I/O).
 * Core principle: code decides what is true, when to post and why; the LLM only
 * decides how to say it, and its output is checked against the ledger.
 */

export const TZ_H = 5; // Asia/Tashkent, fixed UTC+5, no DST
export const MATURE_H = 72; // only posts >= 72h old enter view stats
export const MIN_N = 3; // min posts per bucket
export const MIN_CHANNEL_N = 10; // min mature posts for channel-level lift/trend/CV
export const WIN = 1.2;
export const LOSE = 0.8;
export const NEIGHBOURS = 10;

export type Lang = "uz" | "ru" | "en";
export type PostLang = "uz-Latn" | "uz-Cyrl" | "ru" | "en" | "mixed" | "unknown";
export type Media = "text" | "photo" | "album" | "video" | "other";
export type Goal = "reach" | "trust" | "sale";

export interface LedgerEntry {
  id: string; // "S.reachRate" | "S.formatLift.video" | "F7" | "W2" | "P.kafe_uz/812" | "R.HIDDEN_PRICE"
  label: string;
  value: number | string;
  display: string; // the LLM must copy this exact text
  n?: number;
  window?: string;
  source: "stats" | "kb" | "web" | "post" | "rule" | "owner";
  prior?: boolean;
  url?: string;
  quote?: string;
}

export const ID_RE = /\b(S\.[\w.-]+[\w]|F\d+|W\d+|P\.\w+\/\d+|R\.[A-Z_]+)\b/g;

/** A post as scraped from t.me/s/<channel>. */
export interface RawPost {
  id: number;
  channel: string;
  url: string;
  text: string;
  postedAt: string; // ISO, UTC
  views?: number;
  approx: boolean; // views shown with K/M suffix (about ±5%)
  media: Media;
  isForward: boolean;
  links: string[];
}

export interface ChannelData {
  channel: string;
  title?: string;
  subscribers?: number;
  posts: RawPost[]; // newest first
  complete: boolean; // true when the scrape reached the start of the channel
  pages: number;
}

export type BucketStat = { value: number | null; n: number; label: string };

export interface ChannelStats {
  channel: string;
  subscribers?: number;
  postsInWindow: number;
  maturePosts: number;
  medianViews?: number;
  medianLowConfidence: boolean;
  reachRate?: number;
  postsPerWeek: number;
  maxGapDays?: number;
  viewTrend?: number;
  viewCV?: number;
  ageDays?: number;
  coldStart: boolean;
  formatLift: Record<string, BucketStat>;
  hourLift: Record<string, BucketStat>;
  weekdayLift: Record<string, BucketStat>;
  langLift: Record<string, BucketStat>;
  lengthLift: Record<string, BucketStat>;
  hourConcentration?: number;
  busiestHourBucket?: string;
  saleShare: number;
  promoShare: number;
  ctaRate: number;
  forwardShare: number;
  priceShareInSale?: number;
  saleLiftMedian?: { value: number; n: number };
  hiddenPriceCount: number;
  trustCoverage: number;
  trustParts: string[];
  emojiPer100: number;
  hashtagsPerPost: number;
  neuroDensity: number;
  formatMix: Record<Media, number>;
  langShares: Record<string, number>;
  majorityLang?: PostLang;
  offerTypeCounts60d: Record<string, number>;
  lifts: { post: RawPost; lift: number }[]; // mature own posts with a lift, newest first
  suspectBoosted: boolean;
}

export type RuleKind = "problem" | "opportunity" | "strength";

export interface RuleResult {
  id: string; // "R.LOW_REACH"
  name: string;
  status: "fired" | "not_fired" | "insufficient" | "inactive";
  kind: RuleKind;
  severity: 1 | 2 | 3;
  trigger: string; // "reachRate 6.2% < 10% (taxminiy, 1k–10k)"
  ids: string[];
  effects: string;
  n?: number;
  data?: Record<string, unknown>;
}

export type FiredRule = RuleResult & { status: "fired" };
