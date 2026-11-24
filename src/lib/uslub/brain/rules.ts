/**
 * Decision rules (spec §C), ledger building and pillar-share mechanics.
 * Fully deterministic: code decides which rules fire; the LLM only explains them.
 */
import { type Benchmark, MIN_BENCH_N } from "./bench";
import { features, fmtNum, isLoser, isWinner, median, pct, reachBand, whyLine } from "./stats";
import { LOSE, MIN_N, WIN, type ChannelStats, type Goal, type LedgerEntry, type RuleResult } from "./types";

export type Cycle = "impulse" | "considered" | "high-trust";

export interface KbSignals {
  hasPrices: boolean;
  hasProducts: boolean;
  hasOffer: boolean;
  proofFacts: number;
}

export interface RuleCtx {
  category: string;
  competitors: ChannelStats[];
  kb?: KbSignals;
  calendar?: { id: string; name: string; daysAway: number }[];
  /** Niche benchmark; replaces the prior reach bands when competitors are missing. */
  bench?: Benchmark;
  /** Tracked sale posts from the learn loop (views at 72h, unique bot starts, owner-reported sales). */
  funnel?: FunnelData;
}

export interface FunnelData {
  posts: { slot: number; planTag: string; views72: number; starts: number; sold?: number }[];
  weekOrders?: number;
  plans: number;
}

/** R.FUNNEL_LEAK (spec §C), pure: where the tracked sale posts lose people. */
export function funnelRule(f: FunnelData | undefined): RuleResult {
  const base = {
    id: "R.FUNNEL_LEAK",
    name: "Voronka teshigi",
    kind: "problem" as const,
    severity: 2 as const,
    effects: "CTR < 0.3% → offer problem; CTR ≥ 1% with 0 orders → follow-up problem; ≥5 bot starts with 0 orders → owner task.",
  };
  if (!f || f.plans === 0) return { ...base, status: "inactive", trigger: "no tracked plan yet (src_ links)", ids: [] };
  const big = f.posts.filter((p) => p.views72 >= 500);
  if (!big.length) return { ...base, status: "insufficient", trigger: `tracked sale posts with ≥500 views at 72h: 0 (n=${f.posts.length})`, ids: [], n: f.posts.length };
  const views = big.reduce((a, p) => a + p.views72, 0);
  const starts = big.reduce((a, p) => a + p.starts, 0);
  const ctr = starts / views;
  const sold = big.reduce((a, p) => a + (p.sold ?? 0), 0) + (f.weekOrders ?? 0);
  const ordersKnown = f.weekOrders != null || big.some((p) => p.sold != null);
  const ids = ["S.funnel.ctr", "S.funnel.starts"];
  const trig = `CTR ${pct(ctr)} (${starts}/${views}, n=${big.length})${ordersKnown ? ` · orders ${sold}` : " · orders: not reported"}`;
  let leak: "offer" | "followup" | "owner" | null = null;
  if (ctr < 0.003) leak = "offer";
  else if (starts >= 5 && ordersKnown && sold === 0) leak = ctr >= 0.01 ? "followup" : "owner";
  const effects =
    leak === "offer"
      ? "People see the post but do not click: test a clearer entry offer (price + one condition) on the next sale post."
      : leak === "followup"
        ? "Clicks are healthy but no orders: answer bot leads within 15 minutes and send the price list right away."
        : leak === "owner"
          ? "Leads arrive but no orders reported: owner task — reply to every lead, then tap 'Sotildi' in the bot."
          : base.effects;
  return { ...base, status: leak ? "fired" : "not_fired", trigger: trig, ids, effects, n: big.length, data: { ctr, starts, views, sold, leak } };
}

export const keyId = (k: string) => k.replace(/</g, "lt").replace(/>/g, "gt").replace(/[^\w.-]/g, "_");

export function cycleOf(category: string, kbText = ""): Cycle {
  const c = category.toLowerCase();
  if (/clinic|klinika|клиник|stomat|dental|b2b|med/.test(c)) return "high-trust";
  if (/educ|ta'lim|talim|o'quv|курс|school|maktab/.test(c) && /bolalar|дети|kids|children/i.test(kbText)) return "high-trust";
  if (/cafe|kafe|кафе|restoran|restaurant|food|fast|flower|gul|цвет|deliver|yetkaz|доставк|bakery|nonvoy/.test(c)) return "impulse";
  return "considered";
}

const BASE: Record<Cycle, Record<Goal, number>> = {
  impulse: { reach: 35, trust: 25, sale: 40 },
  considered: { reach: 30, trust: 40, sale: 30 },
  "high-trust": { reach: 25, trust: 50, sale: 25 },
};

const DELTAS: Record<string, Partial<Record<Goal, number>>> = {
  "R.COLD_START": { trust: 10, sale: -10 },
  "R.LOW_REACH": { reach: 10, sale: -10 },
  "R.NEVER_ASKS": { sale: 10, trust: -10 },
  "R.OVERSELLING": { sale: -10, trust: 10 },
  "R.TRUST_GAP": { trust: 10, reach: -10 },
};

/** Largest-remainder rounding of shares to integers summing to `total`. */
export function largestRemainder(values: number[], total: number): number[] {
  const sum = values.reduce((a, b) => a + b, 0) || 1;
  const raw = values.map((v) => (v / sum) * total);
  const floor = raw.map(Math.floor);
  let left = total - floor.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    floor[i]++;
    left--;
  }
  return floor;
}

export type PillarStep = { rule: string; delta: Partial<Record<Goal, number>>; shares: Record<Goal, number> };

export function pillarShares(cycle: Cycle, fired: RuleResult[]): { base: Record<Goal, number>; steps: PillarStep[]; final: Record<Goal, number> } {
  const base = { ...BASE[cycle] };
  const cur = { ...base };
  const steps: PillarStep[] = [];
  for (const id of Object.keys(DELTAS)) {
    if (!fired.some((r) => r.id === id && r.status === "fired")) continue;
    const d = DELTAS[id];
    for (const g of ["reach", "trust", "sale"] as Goal[]) cur[g] = Math.min(55, Math.max(15, cur[g] + (d[g] ?? 0)));
    steps.push({ rule: id, delta: d, shares: { ...cur } });
  }
  const [reach, trust, sale] = largestRemainder([cur.reach, cur.trust, cur.sale], 100);
  return { base, steps, final: { reach, trust, sale } };
}

/* ------------------------------------------------------------------ rules */

const r2 = (x: number) => x.toFixed(2);

export function runRules(s: ChannelStats, ctx: RuleCtx): RuleResult[] {
  const out: RuleResult[] = [];
  const add = (r: Omit<RuleResult, "status"> & { status?: RuleResult["status"] }, fired: boolean | "insufficient") =>
    out.push({ ...r, status: r.status ?? (fired === "insufficient" ? "insufficient" : fired ? "fired" : "not_fired") });
  const comps = ctx.competitors.filter((c) => !c.suspectBoosted && c.reachRate != null);
  const compReach = comps.length >= 2 ? median(comps.map((c) => c.reachRate as number)) : undefined;
  const benchReach = !compReach && ctx.bench?.reachRate && ctx.bench.n >= MIN_BENCH_N ? ctx.bench.reachRate.median : undefined;
  const relReach = (compReach ?? benchReach) && s.reachRate != null ? s.reachRate / ((compReach ?? benchReach) as number) : undefined;
  const relId = compReach ? "S.relReach" : "S.bench.relReach";
  const compPpw = comps.length >= 2 ? median(comps.map((c) => c.postsPerWeek)) : undefined;
  const kb = ctx.kb;

  add(
    {
      id: "R.COLD_START",
      name: "Ma'lumot kam",
      kind: "problem",
      severity: 1,
      trigger: `mature posts ${s.maturePosts} < 10${s.ageDays != null ? `, age ${Math.round(s.ageDays)}d` : ""}`,
      ids: ["S.maturePosts"],
      effects: "Hour/format/language from competitors or priors; trust +10, sale −10; first 5 posts need approval; no internal hour/format findings.",
      n: s.maturePosts,
    },
    s.coldStart,
  );

  add(
    {
      id: "R.SUSPECT_BOOSTED",
      name: "Ko'rishlar shubhali tekis",
      kind: "problem",
      severity: 2,
      trigger: s.viewCV != null ? `viewCV ${r2(s.viewCV)} < 0.12 (taxminiy)` : "viewCV n<10",
      ids: ["S.viewCV"],
      effects: "Do not raise frequency. Never recommend buying subscribers or views.",
      n: s.maturePosts,
    },
    s.viewCV == null ? "insufficient" : s.suspectBoosted,
  );

  const band = s.subscribers ? reachBand(s.subscribers) : undefined;
  const lowReach =
    s.reachRate != null && (s.subscribers ?? 0) > 1000 && ((band && s.reachRate < band.low) || (relReach != null && relReach < 0.7));
  add(
    {
      id: "R.LOW_REACH",
      name: "Qamrov past",
      kind: "problem",
      severity: 3,
      trigger:
        s.reachRate != null && band
          ? `reachRate ${pct(s.reachRate)} ${s.reachRate < band.low ? "<" : "≥"} ${pct(band.low, 0)} (taxminiy, ${band.label})${relReach != null ? ` · relReach ${r2(relReach)}${benchReach ? ` (nisha, n=${ctx.bench?.n})` : ""}` : ""}`
          : "subscribers unknown",
      ids: ["S.reachRate", ...(relReach != null ? [relId] : [])],
      effects: "reach +10, sale −10. KPI = reachRate and median views, not subscribers. No giveaways. +1 slot of the top-lift format.",
      n: s.maturePosts,
    },
    s.reachRate == null ? "insufficient" : Boolean(lowReach),
  );

  const inconsistent = s.postsInWindow > 0 && (s.postsPerWeek < 2 || (s.maxGapDays ?? 0) > 10);
  add(
    {
      id: "R.INCONSISTENT",
      name: "Nomuntazam",
      kind: "problem",
      severity: 2,
      trigger: `postsPerWeek ${fmtNum(s.postsPerWeek)}${s.maxGapDays != null ? ` · maxGap ${fmtNum(s.maxGapDays)}d` : ""} (taxminiy: <2/hafta yoki >10 kun)`,
      ids: ["S.postsPerWeek", "S.maxGapDays"],
      effects: "N = 3–4. Item 1 is a 'we're here' trust post (what's new, real photo, address and hours, no apology). At most 1 sale post, not in slots 1–2.",
    },
    inconsistent,
  );

  const overposting =
    (s.postsPerWeek > 14 && s.viewTrend != null && s.viewTrend < 0.8) ||
    (relReach != null && relReach < 0.7 && compPpw != null && s.postsPerWeek > 1.5 * compPpw);
  add(
    {
      id: "R.OVERPOSTING",
      name: "Juda ko'p post",
      kind: "problem",
      severity: 2,
      trigger: `postsPerWeek ${fmtNum(s.postsPerWeek)}${s.viewTrend != null ? ` · viewTrend ${r2(s.viewTrend)}` : ""}`,
      ids: ["S.postsPerWeek", "S.viewTrend"],
      effects: "N = max(5, round(0.7 × postsPerWeek)); keep the top-lift formats.",
    },
    overposting,
  );

  add(
    {
      id: "R.DECLINING",
      name: "Ko'rishlar pasaymoqda",
      kind: "problem",
      severity: 2,
      trigger: s.viewTrend != null ? `viewTrend ${r2(s.viewTrend)} < 0.8` : "n<20",
      ids: ["S.viewTrend"],
      effects: "Compare the last 15 vs previous 15 posts; the largest change is the probable cause (hypothesis).",
      n: s.maturePosts,
      data: s.viewTrend != null && s.viewTrend < 0.8 ? { cause: decliningCause(s) } : undefined,
    },
    s.viewTrend == null ? "insufficient" : s.viewTrend < LOSE,
  );

  add(
    {
      id: "R.NEVER_ASKS",
      name: "Sotuvga chaqirmaydi",
      kind: "opportunity",
      severity: 2,
      trigger: `saleShare ${pct(s.saleShare)} < 15%`,
      ids: ["S.saleShare"],
      effects: "sale +10, trust −10; at least 2 sale slots with tracked links.",
    },
    s.postsInWindow > 0 && s.saleShare < 0.15 && !lowReach && Boolean(kb?.hasProducts && kb?.hasPrices),
  );

  const overselling =
    (s.promoShare > 0.4 || s.saleShare > 0.5) && s.saleLiftMedian != null && s.saleLiftMedian.value < LOSE && s.saleLiftMedian.n >= MIN_N;
  add(
    {
      id: "R.OVERSELLING",
      name: "Ortiqcha sotuv",
      kind: "problem",
      severity: 2,
      trigger: `promoShare ${pct(s.promoShare)} · saleShare ${pct(s.saleShare)}${s.saleLiftMedian ? ` · sale lift ${r2(s.saleLiftMedian.value)} (n=${s.saleLiftMedian.n})` : ""}`,
      ids: ["S.promoShare", "S.saleShare", "S.saleLift"],
      effects: "sale −10, trust +10. Max 2 sale posts, each preceded by a trust post. Prefer a bonus/entry offer over a bigger discount.",
    },
    overselling,
  );

  const hidden = (s.hiddenPriceCount >= 1 || (s.priceShareInSale != null && s.priceShareInSale < 0.5)) && Boolean(kb?.hasPrices ?? true);
  add(
    {
      id: "R.HIDDEN_PRICE",
      name: "Narx yashirilgan",
      kind: "problem",
      severity: 3,
      trigger: `hiddenPrice ${s.hiddenPriceCount}${s.priceShareInSale != null ? ` · priceShareInSale ${pct(s.priceShareInSale)}` : ""}`,
      ids: ["S.hiddenPriceCount", "S.priceShareInSale"],
      effects: "Every sale item carries the KB price. 'narxi lichkada' is banned.",
    },
    hidden,
  );

  add(
    {
      id: "R.DEAD_ENDS",
      name: "Harakatga chaqiruv yo'q",
      kind: "problem",
      severity: 2,
      trigger: `ctaRate ${pct(s.ctaRate)} < 50%`,
      ids: ["S.ctaRate"],
      effects: "Every non-reach item gets exactly 1 tracked link; sale posts put the CTA within the first 3 lines.",
    },
    s.postsInWindow > 0 && s.ctaRate < 0.5,
  );

  const proof = kb?.proofFacts;
  add(
    {
      id: "R.TRUST_GAP",
      name: "Ishonch belgilari kam",
      kind: "problem",
      severity: 2,
      trigger: `trustCoverage ${s.trustCoverage}/5${proof != null ? ` · proof facts ${proof}` : ""}`,
      ids: ["S.trustCoverage"],
      effects: "trust +10, reach −10. ≥2 trust items (address+map+hours; real team/process photo or round video). Max 2 sale posts. Owner: 3 real reviews, pinned post.",
    },
    s.trustCoverage <= 2 || (proof != null && proof < 2),
  );

  // FORMAT_WINNER
  const fWin = Object.entries(s.formatLift).filter(([, b]) => isWinner(b)).sort((a, b) => (b[1].value ?? 0) - (a[1].value ?? 0))[0];
  const fLose = Object.entries(s.formatLift).filter(([, b]) => isLoser(b));
  add(
    {
      id: "R.FORMAT_WINNER",
      name: "Yutuvchi format",
      kind: fWin ? "strength" : "problem",
      severity: 1,
      trigger: fWin
        ? `formatLift.${fWin[0]} ${r2(fWin[1].value as number)} ≥ ${WIN} (n=${fWin[1].n})`
        : fLose.length
          ? `formatLift.${fLose[0][0]} ${r2(fLose[0][1].value as number)} ≤ ${LOSE} (n=${fLose[0][1].n})`
          : "no format with n≥3 and lift ≥1.2",
      ids: fWin ? [`S.formatLift.${fWin[0]}`] : fLose.map(([k]) => `S.formatLift.${k}`),
      effects: fWin
        ? `+2 slots of ${fWin[0]}${fWin[0] === "video" ? " (needs approval, ≤60 s phone shot list)" : ""}.`
        : `Loser format: at most 1 slot.`,
      data: { winner: fWin?.[0], losers: fLose.map(([k]) => k) },
    },
    Object.keys(s.formatLift).length === 0 ? "insufficient" : Boolean(fWin || fLose.length),
  );

  const hWin = Object.entries(s.hourLift).filter(([, b]) => isWinner(b)).sort((a, b) => (b[1].value ?? 0) - (a[1].value ?? 0))[0];
  const concentrated = (s.hourConcentration ?? 0) > 0.7;
  add(
    {
      id: "R.TIME_WINNER",
      name: "Yaxshi vaqt",
      kind: hWin ? "strength" : "opportunity",
      severity: 1,
      trigger: hWin
        ? `hourLift.${hWin[0]} ${r2(hWin[1].value as number)} ≥ ${WIN} (n=${hWin[1].n})`
        : `hourConcentration ${pct(s.hourConcentration ?? 0)} in ${s.busiestHourBucket ?? "?"}`,
      ids: hWin ? [`S.hourLift.${hWin[0]}`] : ["S.hourConcentration"],
      effects: hWin
        ? `Sale slots go into ${hWin[0]}.`
        : `Best time unknown — you have only posted at ${s.busiestHourBucket}; the experiment tests an untested hour.`,
      data: { bucket: hWin?.[0], concentrated },
    },
    Object.keys(s.hourLift).length === 0 && !concentrated ? "insufficient" : Boolean(hWin || concentrated),
  );

  // "unknown" is posts whose language could not be detected, not a language to recommend.
  const langs = Object.entries(s.langLift)
    .filter(([k, b]) => k !== "unknown" && b.value != null && b.n >= MIN_N)
    .sort((a, b) => (b[1].value as number) - (a[1].value as number));
  const lw = langs.length >= 2 && (langs[0][1].value as number) / (langs[langs.length - 1][1].value as number) >= 1.25;
  add(
    {
      id: "R.LANGUAGE_WINNER",
      name: "Til tanlovi",
      kind: "strength",
      severity: 1,
      trigger: lw ? `langLift.${langs[0][0]} / langLift.${langs[langs.length - 1][0]} ≥ 1.25` : "need 2 languages with n≥3",
      ids: lw ? [`S.langLift.${langs[0][0]}`, `S.langLift.${langs[langs.length - 1][0]}`] : [],
      effects: lw ? `${langs[0][0]} is the primary language; the other appears only as a separate post, never mixed.` : "",
      data: { primary: lw ? langs[0][0] : s.majorityLang ?? "uz-Latn" },
    },
    langs.length < 2 ? "insufficient" : lw,
  );

  // REPLICATE_WINNERS
  const sorted = [...s.lifts].sort((a, b) => b.lift - a.lift);
  let replicate: string[] = [];
  if (sorted.length >= 10) {
    const top = sorted.slice(0, 5).map((x) => featureTags(x.post));
    const bottom = sorted.slice(-5).map((x) => featureTags(x.post));
    const tags = new Set(top.flat());
    replicate = [...tags].filter((t) => top.filter((x) => x.includes(t)).length >= 3 && bottom.filter((x) => x.includes(t)).length <= 1);
  }
  add(
    {
      id: "R.REPLICATE_WINNERS",
      name: "Yutuqni takrorlash",
      kind: "strength",
      severity: 1,
      trigger: replicate.length ? `${replicate.join(", ")} in ≥3 of top-5, ≤1 of bottom-5` : "no shared feature",
      ids: sorted.slice(0, 3).map((x) => `P.${x.post.channel}/${x.post.id}`),
      effects: replicate.length ? `Use ${replicate.join(", ")} in 2 items this week.` : "",
      data: { features: replicate },
    },
    sorted.length < 10 ? "insufficient" : replicate.length > 0,
  );

  const better = comps.filter((c) => s.reachRate != null && (c.reachRate as number) >= 1.5 * s.reachRate);
  add(
    {
      id: "R.COMPETITOR_OUTPERFORMS",
      name: "Raqobatchi oldinda",
      kind: "opportunity",
      severity: 2,
      trigger: better.length ? `@${better[0].channel} reachRate ${pct(better[0].reachRate as number)} ≥ 1.5 × ${pct(s.reachRate ?? 0)}` : "no competitor ≥1.5× our reachRate",
      ids: better.length ? [`S.comp.${better[0].channel}.reachRate`, "S.reachRate"] : [],
      effects: "Compare their top-quartile post features with ours; adapt the format, never the text.",
      data: { channels: better.map((c) => c.channel) },
    },
    ctx.competitors.length === 0 || s.reachRate == null ? "insufficient" : better.length > 0,
  );

  const validated: { channel: string; offer: string; n: number }[] = [];
  for (const c of ctx.competitors) for (const [o, n] of Object.entries(c.offerTypeCounts60d)) if (n >= 3) validated.push({ channel: c.channel, offer: o, n });
  add(
    {
      id: "R.VALIDATED_OFFER",
      name: "Sinalgan taklif",
      kind: "opportunity",
      severity: 1,
      trigger: validated.length ? `@${validated[0].channel} used ${validated[0].offer} ${validated[0].n}× in 60d` : "no repeated competitor offer",
      ids: validated.map((v) => `S.comp.${v.channel}.offer.${v.offer}`),
      effects: "Test the same mechanic; numbers and terms come only from the owner (owner question).",
      data: { offers: validated },
    },
    ctx.competitors.length === 0 ? "insufficient" : validated.length > 0,
  );

  const cal = (ctx.calendar ?? []).filter((e) => e.daysAway <= 14);
  add(
    {
      id: "R.CALENDAR",
      name: "Taqvim",
      kind: "opportunity",
      severity: 1,
      trigger: cal.length ? cal.map((e) => `${e.name} in ${e.daysAway}d`).join(" · ") : "no fitting event ≤14d",
      ids: cal.map((e) => `S.calendar.${e.id}`),
      effects: kb?.hasOffer ? "Sale post 2–4 days before + reminder on the day (needs approval)." : "One value/trust post (no 'sale' wording), needs approval.",
      data: { events: cal },
    },
    cal.length > 0,
  );

  const noise = s.emojiPer100 > 3 || s.hashtagsPerPost > 3 || s.forwardShare > 0.35 || s.neuroDensity > 1;
  add(
    {
      id: "R.NOISE",
      name: "Shovqin",
      kind: "problem",
      severity: 1,
      trigger: `emoji/100 ${fmtNum(s.emojiPer100)} · hashtags ${fmtNum(s.hashtagsPerPost)} · forwards ${pct(s.forwardShare)} · neuro ${fmtNum(s.neuroDensity)}/100w`,
      ids: ["S.emojiPer100", "S.hashtagsPerPost", "S.forwardShare", "S.neuroDensity"],
      effects: "Lint caps: ≤3 emoji, ≤2 hashtags. Write own posts from KB facts.",
    },
    s.postsInWindow > 0 && noise,
  );

  out.push(funnelRule(ctx.funnel));

  // COLD_START suppresses internal hour/format/language findings
  if (s.coldStart) {
    for (const r of out)
      if (["R.FORMAT_WINNER", "R.TIME_WINNER", "R.LANGUAGE_WINNER", "R.REPLICATE_WINNERS", "R.DECLINING"].includes(r.id) && r.status === "fired")
        r.status = "insufficient";
  }
  return out;
}

function featureTags(p: import("./types").RawPost): string[] {
  const f = features(p);
  // "unknown" (undetected language) is not a feature anyone can repeat: it never becomes a tag.
  const t = [`format:${p.media}`, `len:${f.lengthBucket}`, ...(f.lang !== "unknown" ? [`lang:${f.lang}`] : [])];
  if (f.hourBucket) t.push(`hour:${f.hourBucket}`);
  if (f.hasPrice) t.push("hasPrice");
  if (f.hasCTA) t.push("hasCTA");
  if (f.map) t.push("hasMap");
  if (f.isPromo) t.push("isPromo");
  if (f.questionHook) t.push("questionHook");
  if (f.numberInHook) t.push("numberInHook");
  return t;
}

function decliningCause(s: ChannelStats): string {
  const recent = s.lifts.slice(0, 15).map((x) => x.post);
  const prev = s.lifts.slice(15, 30).map((x) => x.post);
  if (!recent.length || !prev.length) return "unknown";
  const shareOf = (ps: typeof recent, pred: (p: (typeof recent)[number]) => boolean) => ps.filter(pred).length / ps.length;
  const cands: [string, number][] = [];
  for (const m of ["text", "photo", "album", "video"]) cands.push([`format ${m}`, Math.abs(shareOf(recent, (p) => p.media === m) - shareOf(prev, (p) => p.media === m))]);
  cands.push(["promo share", Math.abs(shareOf(recent, (p) => features(p).isPromo) - shareOf(prev, (p) => features(p).isPromo))]);
  for (const b of ["07-10", "10-13", "13-16", "16-19", "19-22", "22-01"])
    cands.push([`hour ${b}`, Math.abs(shareOf(recent, (p) => features(p).hourBucket === b) - shareOf(prev, (p) => features(p).hourBucket === b))]);
  cands.sort((a, b) => b[1] - a[1]);
  return `${cands[0][0]} (hypothesis)`;
}

/* ----------------------------------------------------------------- ledger */

export function statsLedger(s: ChannelStats, competitors: ChannelStats[]): LedgerEntry[] {
  const L: LedgerEntry[] = [];
  const w = "90d";
  const push = (e: LedgerEntry) => L.push(e);
  if (s.subscribers != null) push({ id: "S.subscribers", label: "obunachilar", value: s.subscribers, display: String(s.subscribers), source: "stats" });
  push({ id: "S.postsAnalyzed", label: "tahlil qilingan postlar", value: s.postsInWindow, display: String(s.postsInWindow), n: s.postsInWindow, window: w, source: "stats" });
  push({ id: "S.maturePosts", label: "72 soatdan eski postlar", value: s.maturePosts, display: String(s.maturePosts), n: s.maturePosts, window: w, source: "stats" });
  if (s.medianViews != null)
    push({ id: "S.medianViews", label: "o'rtacha (median) ko'rishlar", value: s.medianViews, display: String(Math.round(s.medianViews)), n: Math.min(30, s.maturePosts), window: w, source: "stats" });
  if (s.reachRate != null) {
    const band = reachBand(s.subscribers as number);
    push({ id: "S.reachRate", label: "qamrov (ko'rishlar / obunachilar)", value: s.reachRate, display: pct(s.reachRate), n: Math.min(30, s.maturePosts), window: w, source: "stats" });
    push({ id: "S.reachBandLow", label: `qamrov quyi chegarasi (${band.label})`, value: band.low, display: pct(band.low, 0), source: "rule", prior: true });
  }
  push({ id: "S.postsPerWeek", label: "haftasiga postlar", value: s.postsPerWeek, display: fmtNum(s.postsPerWeek), window: "28d", source: "stats" });
  if (s.maxGapDays != null) push({ id: "S.maxGapDays", label: "eng uzun tanaffus (kun)", value: s.maxGapDays, display: String(Math.round(s.maxGapDays)), window: w, source: "stats" });
  if (s.viewTrend != null) push({ id: "S.viewTrend", label: "ko'rishlar trendi (oxirgi/oldingi)", value: s.viewTrend, display: `${s.viewTrend.toFixed(2)}×`, source: "stats" });
  if (s.viewCV != null) push({ id: "S.viewCV", label: "ko'rishlar tebranishi (CV)", value: s.viewCV, display: s.viewCV.toFixed(2), n: Math.min(20, s.maturePosts), source: "stats" });
  const shares: [string, string, number][] = [
    ["saleShare", "sotuv postlari ulushi", s.saleShare],
    ["promoShare", "aksiya postlari ulushi", s.promoShare],
    ["ctaRate", "harakatga chaqiruvli postlar", s.ctaRate],
    ["forwardShare", "forward postlar ulushi", s.forwardShare],
  ];
  for (const [id, label, v] of shares) push({ id: `S.${id}`, label, value: v, display: pct(v, 0), n: s.postsInWindow, window: w, source: "stats" });
  if (s.priceShareInSale != null) push({ id: "S.priceShareInSale", label: "narxi ko'rsatilgan sotuv postlari", value: s.priceShareInSale, display: pct(s.priceShareInSale, 0), source: "stats" });
  if (s.saleLiftMedian) push({ id: "S.saleLift", label: "sotuv postlari lift", value: s.saleLiftMedian.value, display: `${s.saleLiftMedian.value.toFixed(2)}×`, n: s.saleLiftMedian.n, source: "stats" });
  push({ id: "S.hiddenPriceCount", label: "'narxi lichkada' postlar", value: s.hiddenPriceCount, display: String(s.hiddenPriceCount), source: "stats" });
  push({ id: "S.trustCoverage", label: "ishonch belgilari (0–5)", value: s.trustCoverage, display: `${s.trustCoverage}/5`, quote: s.trustParts.join(", "), source: "stats" });
  if (s.hourConcentration != null)
    push({ id: "S.hourConcentration", label: `eng band vaqt oralig'i (${s.busiestHourBucket})`, value: s.hourConcentration, display: pct(s.hourConcentration, 0), source: "stats" });
  push({ id: "S.emojiPer100", label: "emoji / 100 belgi", value: s.emojiPer100, display: s.emojiPer100.toFixed(1), source: "stats" });
  push({ id: "S.hashtagsPerPost", label: "heshteg / post", value: s.hashtagsPerPost, display: s.hashtagsPerPost.toFixed(1), source: "stats" });
  push({ id: "S.neuroDensity", label: "shablon iboralar / 100 so'z", value: s.neuroDensity, display: s.neuroDensity.toFixed(1), source: "stats" });
  for (const [fam, rec] of [
    ["formatLift", s.formatLift],
    ["hourLift", s.hourLift],
    ["weekdayLift", s.weekdayLift],
    ["langLift", s.langLift],
    ["lengthLift", s.lengthLift],
  ] as const) {
    for (const [k, b] of Object.entries(rec))
      if (!(fam === "langLift" && k === "unknown")) // the model never sees an "unknown" language to write about
        push({ id: `S.${fam}.${keyId(k)}`, label: `${fam} ${k}`, value: b.value ?? "insufficient", display: b.value != null ? `${b.value.toFixed(2)}×` : `n=${b.n}`, n: b.n, window: w, source: "stats" });
  }
  const comps = competitors.filter((c) => !c.suspectBoosted && c.reachRate != null);
  if (comps.length >= 2 && s.reachRate != null) {
    const rel = s.reachRate / (median(comps.map((c) => c.reachRate as number)) as number);
    push({ id: "S.relReach", label: "qamrov raqobatchilar medianiga nisbatan", value: rel, display: `${rel.toFixed(2)}×`, n: comps.length, source: "stats" });
  }
  for (const c of competitors) {
    const p = `S.comp.${c.channel}`;
    if (c.subscribers != null) push({ id: `${p}.subscribers`, label: `@${c.channel} obunachilar`, value: c.subscribers, display: String(c.subscribers), source: "stats" });
    if (c.medianViews != null) push({ id: `${p}.medianViews`, label: `@${c.channel} median ko'rishlar`, value: c.medianViews, display: String(Math.round(c.medianViews)), source: "stats" });
    if (c.reachRate != null) push({ id: `${p}.reachRate`, label: `@${c.channel} qamrov`, value: c.reachRate, display: pct(c.reachRate), source: "stats" });
    push({ id: `${p}.postsPerWeek`, label: `@${c.channel} haftasiga postlar`, value: c.postsPerWeek, display: fmtNum(c.postsPerWeek), source: "stats" });
    for (const [o, n] of Object.entries(c.offerTypeCounts60d)) push({ id: `${p}.offer.${o}`, label: `@${c.channel} ${o} 60 kunda`, value: n, display: String(n), source: "stats" });
  }
  return L;
}

export function postLedger(s: ChannelStats, competitors: ChannelStats[]): LedgerEntry[] {
  const L: LedgerEntry[] = [];
  const sorted = [...s.lifts].sort((a, b) => b.lift - a.lift);
  const pick = sorted.length > 10 ? [...sorted.slice(0, 5), ...sorted.slice(-5)] : sorted;
  for (const { post, lift } of pick)
    L.push({
      id: `P.${post.channel}/${post.id}`,
      label: whyLine(post, lift),
      value: lift,
      display: `${lift.toFixed(1)}×`,
      n: post.views,
      url: post.url,
      quote: Array.from(post.text).slice(0, 280).join(""),
      source: "post",
    });
  for (const c of competitors)
    for (const { post, lift } of [...c.lifts].sort((a, b) => b.lift - a.lift).slice(0, 3))
      L.push({ id: `P.${post.channel}/${post.id}`, label: `@${c.channel} top · ${whyLine(post, lift)}`, value: lift, display: `${lift.toFixed(1)}×`, n: post.views, url: post.url, quote: Array.from(post.text).slice(0, 280).join(""), source: "post" });
  return L;
}

export function ruleLedger(rules: RuleResult[]): LedgerEntry[] {
  return rules
    .filter((r) => r.status === "fired")
    .map((r) => ({ id: r.id, label: r.name, value: r.trigger, display: r.trigger, source: "rule" as const, prior: /taxminiy/.test(r.trigger) }));
}
