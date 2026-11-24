/**
 * Learn loop (spec A5), pure. Joins last weeks' plans to what really happened:
 *  - the published post (found by its tracked link src_<tag>_<slot>, or by time for reach posts),
 *  - its views at 72h (snapshot nearest 72h, else the current scrape, else an early read at ≥20h),
 *  - unique bot starts for its src tag (events.type = 'start'),
 *  - orders the owner reported.
 * Then scores every tag value (hour, format, hookType, …) with k=3 shrinkage, judges the
 * week's experiment, scores the forecasts, and tells the next plan what to keep and drop.
 */
import type { Forecast } from "./forecast";
import { features, hourBucket, median, pct } from "./stats";
import type { Goal, Lang, LedgerEntry, RawPost } from "./types";

export interface StoredPlanItem {
  slot: number;
  day: string; // ISO date (Tashkent)
  time: string; // "20:40"
  weekday: number; // 0 = Monday
  goal: Goal;
  format: string;
  hookType?: string;
  exp?: string;
  src?: string; // deep-link payload, e.g. "src_k3x9qa_4"
  hook?: string;
  forecast?: Forecast;
}

export interface StoredPlan {
  id: string;
  tag: string;
  channel?: string;
  weekOf: string;
  items: StoredPlanItem[];
  baseline: { medianViews?: number; reachRate?: number; subscribers?: number };
  createdAt: string;
}

export interface Snapshot {
  postId: number;
  ageHours: number;
  views: number;
}

export type OutcomeStatus = "not_found" | "too_early" | "early" | "final";

export interface ItemOutcome {
  planTag: string;
  weekOf: string;
  slot: number;
  goal: Goal;
  format: string;
  hookType?: string;
  exp?: string;
  hour: string | null;
  status: OutcomeStatus;
  match?: "link" | "time";
  postUrl?: string;
  ageHours?: number;
  views?: number; // views at the measurement age
  lift?: number; // views at 72h / plan baseline median (early: age-adjusted)
  starts: number;
  ctr?: number;
  sold?: number;
  forecast?: { low: number; mid: number; high: number };
  inRange?: boolean;
}

const H = 3_600_000;
const TZ = 5 * H;

/** Planned slot time -> UTC ms. */
export function plannedAt(item: Pick<StoredPlanItem, "day" | "time">): number {
  return Date.parse(`${item.day}T${item.time}:00+05:00`);
}

const srcRe = (src: string) => new RegExp(`start=${src.replace(/[^\w-]/g, "")}(?![\\w-])`);

/**
 * Finds each item's post: tracked link first, then (reach posts) the nearest own post within −3h…+6h
 * of the planned time. Time matching runs only when at least one link matched, i.e. the plan is
 * provably being published in this channel (a stranger's plan for the same channel never matches).
 */
export function matchPosts(plan: StoredPlan, posts: RawPost[]): Map<number, { post: RawPost; match: "link" | "time" }> {
  const out = new Map<number, { post: RawPost; match: "link" | "time" }>();
  const used = new Set<number>();
  for (const it of plan.items) {
    if (!it.src) continue;
    const re = srcRe(it.src);
    const p = posts.find((x) => !used.has(x.id) && (x.links.some((l) => re.test(l)) || re.test(x.text)));
    if (p) {
      out.set(it.slot, { post: p, match: "link" });
      used.add(p.id);
    }
  }
  if (!out.size) return out;
  for (const it of plan.items) {
    if (out.has(it.slot) || it.src) continue;
    const t = plannedAt(it);
    const cands = posts
      .filter((x) => !used.has(x.id) && !x.isForward && !features(x).isAd)
      .map((x) => ({ x, d: Date.parse(x.postedAt) - t }))
      .filter(({ d }) => d >= -3 * H && d <= 6 * H)
      .sort((a, b) => Math.abs(a.d) - Math.abs(b.d));
    if (cands[0]) {
      out.set(it.slot, { post: cands[0].x, match: "time" });
      used.add(cands[0].x.id);
    }
  }
  return out;
}

/**
 * Cross-sectional view curve from one scrape: median views of own posts aged
 * 6–24h / 24–48h / 48–72h as a share of the mature (≥72h) median. Needs ≥2 posts per bucket.
 */
export function ageCurve(posts: RawPost[], now: number): Record<string, number> {
  const own = posts.filter((p) => p.views != null && !p.isForward && !features(p).isAd);
  const age = (p: RawPost) => (now - Date.parse(p.postedAt)) / H;
  const mature = own.filter((p) => age(p) >= 72).slice(0, 30);
  const mm = median(mature.map((p) => p.views as number));
  const out: Record<string, number> = {};
  if (!mm || mature.length < 5) return out;
  for (const [k, a, b] of [
    ["6-24", 6, 24],
    ["24-48", 24, 48],
    ["48-72", 48, 72],
  ] as const) {
    const vs = own.filter((p) => age(p) >= a && age(p) < b).map((p) => p.views as number);
    if (vs.length >= 2) out[k] = Math.min(1, (median(vs) as number) / mm);
  }
  return out;
}

function curveAt(curve: Record<string, number>, ageH: number): number | undefined {
  if (ageH >= 48) return curve["48-72"];
  if (ageH >= 24) return curve["24-48"];
  if (ageH >= 6) return curve["6-24"];
  return undefined;
}

export interface MeasureInput {
  plans: StoredPlan[];
  posts: RawPost[]; // current scrape of the channel
  now: number;
  snapshots?: Map<number, Snapshot[]>; // by post id
  starts?: Map<string, number>; // unique bot starts by src
  sold?: Map<string, number>; // `${planTag}:${slot}` -> owner-reported sales
}

export function measure(inp: MeasureInput): ItemOutcome[] {
  const curve = ageCurve(inp.posts, inp.now);
  const out: ItemOutcome[] = [];
  for (const plan of inp.plans) {
    const matches = matchPosts(plan, inp.posts);
    const base = plan.baseline.medianViews;
    for (const it of plan.items) {
      const m = matches.get(it.slot);
      const o: ItemOutcome = {
        planTag: plan.tag,
        weekOf: plan.weekOf,
        slot: it.slot,
        goal: it.goal,
        format: it.format,
        hookType: it.hookType,
        exp: it.exp,
        hour: hourBucket(Number.parseInt(it.time.slice(0, 2), 10)),
        status: "not_found",
        starts: it.src ? (inp.starts?.get(it.src) ?? 0) : 0,
        sold: inp.sold?.get(`${plan.tag}:${it.slot}`),
        forecast: it.forecast?.views,
      };
      if (m) {
        const p = m.post;
        o.match = m.match;
        o.postUrl = p.url;
        o.format = p.media === "other" ? it.format : p.media;
        o.hour = hourBucket(new Date(Date.parse(p.postedAt) + TZ).getUTCHours());
        const age = (inp.now - Date.parse(p.postedAt)) / H;
        const snaps = (inp.snapshots?.get(p.id) ?? []).filter((s) => s.ageHours >= 60 && s.ageHours <= 120);
        const snap = snaps.sort((a, b) => Math.abs(a.ageHours - 72) - Math.abs(b.ageHours - 72))[0];
        if (snap) {
          o.status = "final";
          o.ageHours = Math.round(snap.ageHours);
          o.views = snap.views;
        } else if (p.views != null && age >= 72) {
          o.status = "final";
          o.ageHours = Math.round(age);
          o.views = p.views;
        } else if (p.views != null && age >= 20 && curveAt(curve, age)) {
          o.status = "early";
          o.ageHours = Math.round(age);
          o.views = p.views;
        } else {
          o.status = "too_early";
          o.ageHours = Math.round(age);
          o.views = p.views;
        }
        if (base && o.views != null && (o.status === "final" || o.status === "early")) {
          const f = o.status === "early" ? (curveAt(curve, age) as number) : 1;
          o.lift = Math.round((o.views / (base * f)) * 100) / 100;
        }
        if (o.status === "final" && o.views != null && o.views >= 100 && it.src) o.ctr = o.starts / o.views;
        if (o.status === "final" && o.forecast && o.views != null) o.inRange = o.views >= o.forecast.low && o.views <= o.forecast.high;
      }
      out.push(o);
    }
  }
  return out;
}

/* ------------------------------------------------------------- scoring */

export const PRIOR_K = 3;
export type TagStatus = "hypothesis" | "supported" | "dropped" | "neutral";

export interface TagScore {
  tag: "hour" | "format" | "hookType" | "goal" | "exp";
  value: string;
  n: number;
  score: number; // (Σlift + 3·1.0) / (n + 3)
  weeks: number;
  status: TagStatus;
  rule: boolean; // supported in 2 separate weeks
}

export function scoreTags(outcomes: ItemOutcome[]): TagScore[] {
  const final = outcomes.filter((o) => o.status === "final" && o.lift != null);
  const groups = new Map<string, { lifts: number[]; weeks: Set<string> }>();
  const add = (tag: TagScore["tag"], value: string | null | undefined, o: ItemOutcome) => {
    if (!value) return;
    const k = `${tag}\u0000${value}`;
    const g = groups.get(k) ?? { lifts: [], weeks: new Set<string>() };
    g.lifts.push(o.lift as number);
    g.weeks.add(o.weekOf);
    groups.set(k, g);
  };
  for (const o of final) {
    add("hour", o.hour, o);
    add("format", o.format, o);
    add("hookType", o.hookType, o);
    add("goal", o.goal, o);
    if (o.exp) add("exp", o.exp, o);
  }
  return [...groups.entries()]
    .map(([k, g]) => {
      const [tag, value] = k.split("\u0000") as [TagScore["tag"], string];
      const n = g.lifts.length;
      const score = (g.lifts.reduce((a, b) => a + b, 0) + PRIOR_K * 1.0) / (n + PRIOR_K);
      const status: TagStatus = n < 3 ? "hypothesis" : score >= 1.2 ? "supported" : score < 0.8 ? "dropped" : "neutral";
      return { tag, value, n, score: Math.round(score * 100) / 100, weeks: g.weeks.size, status, rule: status === "supported" && g.weeks.size >= 2 };
    })
    .sort((a, b) => b.n - a.n || b.score - a.score);
}

export interface ExperimentResult {
  planTag: string;
  variable: string;
  slot: number;
  lift?: number;
  othersMedian?: number;
  ratio?: number;
  verdict: "won" | "lost" | "inconclusive" | "pending";
}

/** The week's single experiment vs the median of the same week's other measured posts. One post is a signal, never proof. */
export function judgeExperiments(outcomes: ItemOutcome[]): ExperimentResult[] {
  const byPlan = new Map<string, ItemOutcome[]>();
  for (const o of outcomes) byPlan.set(o.planTag, [...(byPlan.get(o.planTag) ?? []), o]);
  const res: ExperimentResult[] = [];
  for (const [tag, os] of byPlan) {
    const e = os.find((o) => o.exp);
    if (!e) continue;
    const others = os.filter((o) => o !== e && o.lift != null && (o.status === "final" || o.status === "early")).map((o) => o.lift as number);
    if (e.lift == null || others.length < 2) {
      res.push({ planTag: tag, variable: e.exp as string, slot: e.slot, lift: e.lift, verdict: "pending" });
      continue;
    }
    const om = median(others) as number;
    const ratio = e.lift / om;
    res.push({
      planTag: tag,
      variable: e.exp as string,
      slot: e.slot,
      lift: e.lift,
      othersMedian: Math.round(om * 100) / 100,
      ratio: Math.round(ratio * 100) / 100,
      verdict: ratio >= 1.3 ? "won" : ratio <= 0.7 ? "lost" : "inconclusive",
    });
  }
  return res;
}

export interface Calibration {
  n: number;
  inRange: number;
  medianRatio?: number; // actual / forecast mid
}

export function calibration(outcomes: ItemOutcome[]): Calibration {
  const f = outcomes.filter((o) => o.status === "final" && o.forecast && o.views != null);
  return {
    n: f.length,
    inRange: f.filter((o) => o.inRange).length,
    medianRatio: f.length ? Math.round((median(f.map((o) => (o.views as number) / (o.forecast as { mid: number }).mid)) as number) * 100) / 100 : undefined,
  };
}

/** Tracked sale posts for R.FUNNEL_LEAK. */
export function funnelInput(outcomes: ItemOutcome[], weekOrders?: number) {
  return {
    posts: outcomes
      .filter((o) => o.goal === "sale" && o.status === "final" && o.views != null)
      .map((o) => ({ slot: o.slot, planTag: o.planTag, views72: o.views as number, starts: o.starts, sold: o.sold })),
    weekOrders,
  };
}

/** Measured sale CTR spread (p25–p75) once ≥3 tracked sale posts exist. */
export function measuredCtr(outcomes: ItemOutcome[]): { low: number; high: number; n: number } | undefined {
  const c = outcomes.filter((o) => o.goal === "sale" && o.ctr != null).map((o) => o.ctr as number).sort((a, b) => a - b);
  if (c.length < 3) return undefined;
  const q = (p: number) => c[Math.min(c.length - 1, Math.max(0, Math.round((c.length - 1) * p)))];
  return { low: q(0.25), high: q(0.75), n: c.length };
}

/* ------------------------------------------------------- next-plan hints */

export interface LearnHints {
  supported: TagScore[];
  dropped: TagScore[];
  testedVars: Record<string, number>; // experiment variable -> times tested
  nextExp?: "hour" | "format" | "hookType" | "length" | "language";
  ctr?: { low: number; high: number; n: number };
}

const EXP_ORDER = ["hour", "format", "hookType", "length", "language"] as const;

export function hints(outcomes: ItemOutcome[], plans: StoredPlan[]): LearnHints {
  const scores = scoreTags(outcomes);
  const testedVars: Record<string, number> = {};
  for (const p of plans) for (const it of p.items) if (it.exp) testedVars[it.exp] = (testedVars[it.exp] ?? 0) + 1;
  const nextExp = EXP_ORDER.find((v) => (testedVars[v] ?? 0) < 2) ?? EXP_ORDER[plans.length % EXP_ORDER.length];
  return {
    supported: scores.filter((s) => s.status === "supported"),
    dropped: scores.filter((s) => s.status === "dropped"),
    testedVars,
    nextExp: plans.length ? nextExp : undefined,
    ctr: measuredCtr(outcomes),
  };
}

export const learnId = (s: Pick<TagScore, "tag" | "value">) => `S.learn.${s.tag}.${s.value.replace(/[^\w.-]/g, "_")}`;

export function learnLedger(scores: TagScore[], cal: Calibration, ctr?: { low: number; high: number; n: number }): LedgerEntry[] {
  const L: LedgerEntry[] = scores.map((s) => ({
    id: learnId(s),
    label: `natija: ${s.tag} = ${s.value} (${s.status})`,
    value: s.score,
    display: `${s.score.toFixed(2)}× (n=${s.n})`,
    n: s.n,
    source: "stats",
  }));
  if (cal.n) L.push({ id: "S.learn.forecastHits", label: "prognoz oralig'iga tushgan postlar", value: cal.inRange, display: `${cal.inRange}/${cal.n}`, n: cal.n, source: "stats" });
  if (ctr) L.push({ id: "S.learn.ctr", label: "sotuv postlari CTR (o'lchangan)", value: (ctr.low + ctr.high) / 2, display: `${pct(ctr.low)}–${pct(ctr.high)}`, n: ctr.n, source: "stats" });
  return L;
}

const T: Record<Lang, { keep: string; drop: string; won: string; lost: string; inc: string; pending: string; none: string; noPost: string; cal: string }> = {
  uz: {
    keep: "{tag} «{value}»: {n} ta postda {score} → saqlaymiz",
    drop: "{tag} «{value}»: {n} ta postda {score} → bu hafta ishlatmaymiz",
    won: "Tajriba ({var}) yutdi: {ratio}× haftaning boshqa postlariga nisbatan. Bitta post — gipoteza, yana bir hafta tekshiramiz",
    lost: "Tajriba ({var}) yutqazdi: {ratio}×. Eski variantga qaytamiz",
    inc: "Tajriba ({var}) farq bermadi ({ratio}×)",
    pending: "Tajriba ({var}) hali o'lchanmadi",
    none: "Hali o'lchangan post yo'q: natijalar post chiqqandan 72 soat keyin paydo bo'ladi",
    noPost: "Reja postlari kanalda topilmadi. Postlarda reja havolasi (src_) bo'lishi kerak",
    cal: "Prognozlar: {hits}/{n} post kutilgan oraliqqa tushdi",
  },
  ru: {
    keep: "{tag} «{value}»: {score} на {n} постах → оставляем",
    drop: "{tag} «{value}»: {score} на {n} постах → на этой неделе не используем",
    won: "Эксперимент ({var}) выиграл: {ratio}× к остальным постам недели. Один пост — гипотеза, проверяем ещё неделю",
    lost: "Эксперимент ({var}) проиграл: {ratio}×. Возвращаем прежний вариант",
    inc: "Эксперимент ({var}) не дал разницы ({ratio}×)",
    pending: "Эксперимент ({var}) ещё не измерен",
    none: "Измеренных постов пока нет: результаты появляются через 72 часа после публикации",
    noPost: "Посты из плана не найдены в канале. В постах должна быть ссылка плана (src_)",
    cal: "Прогнозы: {hits}/{n} постов попали в ожидаемый диапазон",
  },
  en: {
    keep: "{tag} \"{value}\": {score} over {n} posts → keep",
    drop: "{tag} \"{value}\": {score} over {n} posts → not used this week",
    won: "Experiment ({var}) won: {ratio}× vs the week's other posts. One post is a hypothesis; we test it one more week",
    lost: "Experiment ({var}) lost: {ratio}×. Back to the previous option",
    inc: "Experiment ({var}) made no clear difference ({ratio}×)",
    pending: "Experiment ({var}) not measured yet",
    none: "No measured posts yet: results appear 72 hours after a post goes out",
    noPost: "Plan posts were not found in the channel. Posts need the plan link (src_)",
    cal: "Forecasts: {hits}/{n} posts landed in the expected range",
  },
};

const fill = (s: string, v: Record<string, unknown>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

/** "What changed and why" lines for the next plan, each ending with its ledger ids. */
export function changeLines(outcomes: ItemOutcome[], scores: TagScore[], exps: ExperimentResult[], cal: Calibration, lang: Lang): string[] {
  const t = T[lang];
  if (!outcomes.length) return [];
  const measured = outcomes.filter((o) => o.status === "final" || o.status === "early");
  if (!measured.length) return [outcomes.every((o) => o.status === "not_found") ? t.noPost : t.none];
  const lines: string[] = [];
  for (const s of scores.filter((x) => x.status === "supported")) lines.push(`${fill(t.keep, { ...s, score: `${s.score.toFixed(2)}×` })} [${learnId(s)}]`);
  for (const s of scores.filter((x) => x.status === "dropped")) lines.push(`${fill(t.drop, { ...s, score: `${s.score.toFixed(2)}×` })} [${learnId(s)}]`);
  for (const e of exps) {
    const key = e.verdict === "won" ? t.won : e.verdict === "lost" ? t.lost : e.verdict === "inconclusive" ? t.inc : t.pending;
    lines.push(fill(key, { var: e.variable, ratio: e.ratio?.toFixed(2) ?? "-" }));
  }
  if (cal.n) lines.push(`${fill(t.cal, { hits: cal.inRange, n: cal.n })} [S.learn.forecastHits]`);
  return lines;
}
