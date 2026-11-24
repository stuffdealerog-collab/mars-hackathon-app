import "server-only";
import { calibration, changeLines, funnelInput, hints, judgeExperiments, learnLedger, measure, scoreTags, type ItemOutcome, type LearnHints, type StoredPlan } from "./learn";
import { loadOutcomes, loadPlans, loadSnapshots, startsBySrc } from "./memory";
import type { FunnelData } from "./rules";
import type { Lang, LedgerEntry, RawPost } from "./types";

export interface LearnReport {
  plans: { id: string; tag: string; weekOf: string; items: number; weekOrders?: number }[];
  outcomes: ItemOutcome[];
  scores: ReturnType<typeof scoreTags>;
  experiments: ReturnType<typeof judgeExperiments>;
  calibration: ReturnType<typeof calibration>;
  funnel: FunnelData;
  hints: LearnHints;
  ledger: LedgerEntry[];
  changes: string[];
}

/**
 * Measures this channel's previous plans against the fresh scrape: matched posts,
 * views at 72h (snapshots), unique bot starts per tracked link, owner-reported orders.
 * Plans from the current week are excluded from scoring until they have results.
 */
export async function learnFor(
  channel: string,
  posts: RawPost[],
  now: number,
  lang: Lang,
  opts: { brandId?: string; ownerReports?: boolean } = {},
): Promise<LearnReport> {
  // Owner reports (orders) are private: then only this brand's own plans are measured. Without them, any plan
  // for the channel is measured from public signals only, and matchPosts ignores plans whose links never appear in it.
  const ownerMode = Boolean(opts.ownerReports && opts.brandId);
  const plans: StoredPlan[] = await loadPlans(ownerMode ? { brandId: opts.brandId, limit: 6 } : { channel, limit: 6 }).catch(() => []);
  const srcs = plans.flatMap((p) => p.items.map((i) => i.src).filter((s): s is string => Boolean(s)));
  const [snapshots, starts, owner] = await Promise.all([
    loadSnapshots(channel, posts.map((p) => p.id)).catch(() => new Map()),
    startsBySrc(srcs).catch(() => new Map<string, number>()),
    // Owner-reported orders are private: only used when the caller proved brand ownership.
    (ownerMode ? loadOutcomes(plans) : Promise.reject(new Error("skip"))).catch(() => ({ weekOrders: new Map<string, number>(), sold: new Map<string, number>() })),
  ]);
  const outcomes = measure({ plans, posts, now, snapshots, starts, sold: owner.sold });
  const scores = scoreTags(outcomes);
  const experiments = judgeExperiments(outcomes);
  const cal = calibration(outcomes);
  const weekOrdersTotal = owner.weekOrders.size ? [...owner.weekOrders.values()].reduce((a, b) => a + b, 0) : undefined;
  const h = hints(outcomes, plans);
  return {
    plans: plans.map((p) => ({ id: p.id, tag: p.tag, weekOf: p.weekOf, items: p.items.length, weekOrders: owner.weekOrders.get(p.tag) })),
    outcomes,
    scores,
    experiments,
    calibration: cal,
    funnel: { ...funnelInput(outcomes, weekOrdersTotal), plans: plans.length },
    hints: h,
    ledger: learnLedger(scores, cal, h.ctr),
    changes: changeLines(outcomes, scores, experiments, cal, lang),
  };
}

/** Funnel ledger entries for R.FUNNEL_LEAK (S.funnel.*). */
export function funnelLedger(f: FunnelData): LedgerEntry[] {
  const big = f.posts.filter((p) => p.views72 >= 500);
  if (!big.length) return [];
  const views = big.reduce((a, p) => a + p.views72, 0);
  const starts = big.reduce((a, p) => a + p.starts, 0);
  return [
    { id: "S.funnel.starts", label: "botga o'tganlar (kuzatilgan sotuv postlari)", value: starts, display: String(starts), n: big.length, source: "stats" },
    { id: "S.funnel.ctr", label: "sotuv postidan botga o'tish (CTR)", value: starts / views, display: `${((starts / views) * 100).toFixed(2)}%`, n: big.length, source: "stats" },
  ];
}
