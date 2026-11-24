/**
 * Plan skeleton (spec §A3) and KPIs (§A4). Code only: the LLM never picks day,
 * time, goal, format, link, metric or approval. Pure.
 */
import { largestRemainder } from "./rules";
import { isWinner, median, WEEKDAYS } from "./stats";
import { TZ_H, type ChannelStats, type Goal, type Lang, type RuleResult } from "./types";

export interface Slot {
  slot: number; // 1-based
  day: string; // ISO date (Tashkent)
  weekday: number; // 0 = Monday
  time: string; // "20:40"
  timeSource: "data" | "competitor" | "prior";
  goal: Goal;
  format: "text" | "photo" | "album" | "video";
  exp?: "hour" | "format" | "hookType" | "length" | "language";
  calendarEvent?: string;
  link?: string;
  metric: string;
  approvalReasons: string[];
  evidence: string[];
}

export interface SkeletonInput {
  now: number;
  stats?: ChannelStats; // undefined = no history
  competitors: ChannelStats[];
  rules: RuleResult[];
  shares: Record<Goal, number>;
  category: string;
  hasPriceFact: boolean;
  hasOfferFact: boolean;
  approvedPosts: number;
  bot?: string;
  lang: Lang;
  calendar: { id: string; name: string; daysAway: number }[];
}

const fired = (rules: RuleResult[], id: string) => rules.some((r) => r.id === id && r.status === "fired");
const pad = (n: number) => String(n).padStart(2, "0");
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export function tashkentDate(ms: number): Date {
  return new Date(ms + TZ_H * 3600_000);
}

export function isoWeek(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t.getTime() - firstThu.getTime()) / 86_400_000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return { year: t.getUTCFullYear(), week };
}

export function postCount(stats: ChannelStats | undefined, rules: RuleResult[]): number {
  if (!stats || stats.postsInWindow === 0) return 3;
  const ppw = stats.postsPerWeek;
  if (fired(rules, "R.OVERPOSTING")) return Math.max(5, Math.round(0.7 * ppw));
  if (fired(rules, "R.INCONSISTENT")) return clamp(Math.round(ppw) + 1, 3, 4);
  if (ppw >= 7) return Math.min(Math.round(ppw), 10);
  const n = clamp(Math.round(ppw) + Math.max(1, Math.round(0.3 * ppw)), 3, 7);
  return Math.min(n, Math.max(3, Math.ceil(1.5 * ppw)));
}

export function goalCounts(n: number, shares: Record<Goal, number>, rules: RuleResult[], hasSaleFact: boolean): Record<Goal, number> {
  const [reach, trust, sale] = largestRemainder([shares.reach, shares.trust, shares.sale], n);
  const c: Record<Goal, number> = { reach, trust, sale };
  let cap = fired(rules, "R.TRUST_GAP") || fired(rules, "R.OVERSELLING") ? 2 : 3;
  if (fired(rules, "R.INCONSISTENT")) cap = 1;
  if (!hasSaleFact) cap = 0;
  cap = Math.min(cap, Math.floor((n + 1) / 2) - (n <= 3 ? 1 : 0)); // room for a trust post before each sale
  if (c.sale > cap) {
    c.trust += c.sale - cap;
    c.sale = cap;
  }
  if (fired(rules, "R.NEVER_ASKS") && hasSaleFact && c.sale < 2 && cap >= 2) {
    const take = 2 - c.sale;
    c.sale = 2;
    c.reach = Math.max(0, c.reach - take);
  }
  if (c.trust < 1) {
    if (c.reach > 1) c.reach--;
    else if (c.sale > 0) c.sale--;
    else c.reach = Math.max(0, c.reach - 1);
    c.trust++;
  }
  return c;
}

function isImpulse(cat: string) {
  return /cafe|kafe|кафе|restoran|food|fast|flower|gul|deliver|yetkaz|bakery/i.test(cat);
}
function isEduClinic(cat: string) {
  return /educ|o'quv|ta'lim|курс|school|clinic|klinika|клиник|med|stomat/i.test(cat);
}

function bestBucket(stats?: ChannelStats): string | undefined {
  if (!stats) return undefined;
  return Object.entries(stats.hourLift)
    .filter(([, b]) => isWinner(b))
    .sort((a, b) => (b[1].value ?? 0) - (a[1].value ?? 0))[0]?.[0];
}

function bucketTime(stats: ChannelStats | undefined, bucket: string): string {
  const startH = Number.parseInt(bucket.split("-")[0], 10);
  const inB = (stats?.lifts ?? [])
    .filter(({ post }) => {
      const h = new Date(Date.parse(post.postedAt) + TZ_H * 3600_000).getUTCHours();
      return h >= startH && h < startH + 3;
    })
    .sort((a, b) => b.lift - a.lift)
    .slice(0, 5);
  const mins = inB.map(({ post }) => {
    const d = new Date(Date.parse(post.postedAt) + TZ_H * 3600_000);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  });
  const m = median(mins);
  if (m == null) return `${pad((startH + 1) % 24)}:40`;
  const hh = Math.floor(m / 60);
  const mm = Math.round(m % 60);
  return `${pad(hh)}:${pad(mm === 0 ? 40 : mm)}`;
}

function fixTime(time: string, weekday: number): string {
  const [h, m] = time.split(":").map(Number);
  if (weekday === 4 && h >= 12 && h < 14) return "14:40"; // Friday juma
  return `${pad(h)}:${pad(m === 0 ? 40 : m)}`;
}

export function buildSkeleton(inp: SkeletonInput): { weekOf: string; slots: Slot[]; counts: Record<Goal, number> } {
  const { rules, stats } = inp;
  const start = tashkentDate(inp.now);
  start.setUTCDate(start.getUTCDate() + 1);
  const weekOf = start.toISOString().slice(0, 10);
  const N = postCount(stats, rules);
  const counts = goalCounts(N, inp.shares, rules, inp.hasPriceFact || inp.hasOfferFact);

  const dayOffsets = Array.from({ length: N }, (_, i) => Math.min(6, Math.round((i * 7) / N)));
  for (let i = 1; i < N; i++) if (dayOffsets[i] <= dayOffsets[i - 1] && dayOffsets[i - 1] < 6) dayOffsets[i] = dayOffsets[i - 1] + 1;
  const dates = dayOffsets.map((o) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + o);
    return d;
  });
  const weekdays = dates.map((d) => (d.getUTCDay() + 6) % 7);

  // goals
  const goals: (Goal | null)[] = Array(N).fill(null);
  const inconsistent = fired(rules, "R.INCONSISTENT");
  if (inconsistent) goals[0] = "trust";
  const bestDays = stats
    ? Object.entries(stats.weekdayLift)
        .filter(([, b]) => isWinner(b))
        .map(([k]) => WEEKDAYS.indexOf(k))
    : [];
  const preferred = bestDays.length ? bestDays : isEduClinic(inp.category) ? [6, 0] : [3, 4, 5];
  const order = Array.from({ length: N }, (_, i) => i)
    .filter((i) => i >= (inconsistent ? 2 : 1))
    .sort((a, b) => Number(!preferred.includes(weekdays[a])) - Number(!preferred.includes(weekdays[b])) || b - a);
  let sales = 0;
  for (const i of order) {
    if (sales >= counts.sale) break;
    if (goals[i] || goals[i - 1] === "sale") continue;
    const adjacent = goals.some((g, j) => g === "sale" && Math.abs(dayOffsets[j] - dayOffsets[i]) <= 1);
    if (adjacent) continue;
    goals[i] = "sale";
    goals[i - 1] = "trust";
    sales++;
  }
  counts.sale = sales;
  let trustLeft = counts.trust - goals.filter((g) => g === "trust").length;
  let reachLeft = N - sales - goals.filter((g) => g === "trust").length - Math.max(0, trustLeft);
  for (let i = 0; i < N; i++) {
    if (goals[i]) continue;
    if (reachLeft > 0) {
      goals[i] = "reach";
      reachLeft--;
    } else {
      goals[i] = "trust";
      trustLeft--;
    }
  }
  const finalCounts: Record<Goal, number> = { reach: 0, trust: 0, sale: 0 };
  for (const g of goals) finalCounts[g as Goal]++;

  // formats
  const fw = rules.find((r) => r.id === "R.FORMAT_WINNER" && r.status === "fired");
  const winner = fw?.data?.winner as string | undefined;
  const losers = (fw?.data?.losers as string[] | undefined) ?? [];
  const formats: Slot["format"][] = goals.map((g, i) => (g === "reach" ? (i === 0 ? "text" : "video") : g === "trust" ? "photo" : "photo"));
  if (!stats || stats.postsInWindow === 0) {
    // prior mix: 50% photo/album, 25% video, 25% text
    formats.forEach((_, i) => (formats[i] = i % 4 === 1 ? "video" : i % 4 === 3 ? "text" : i % 2 ? "album" : "photo"));
  }
  if (winner && ["text", "photo", "album", "video"].includes(winner)) {
    let added = 0;
    for (let i = 0; i < N && added < 2; i++)
      if (formats[i] !== winner && !(winner === "video" && goals[i] === "sale")) {
        formats[i] = winner as Slot["format"];
        added++;
      }
  }
  if (fired(rules, "R.LOW_REACH") && winner) {
    const i = goals.findIndex((g, j) => g === "reach" && formats[j] !== winner);
    if (i >= 0) formats[i] = winner as Slot["format"];
  }
  for (const l of losers) {
    let seen = 0;
    formats.forEach((f, i) => {
      if (f === l && ++seen > 1) formats[i] = "photo";
    });
  }
  let videos = 0;
  formats.forEach((f, i) => {
    if (f === "video" && ++videos > 2) formats[i] = "photo";
  });
  if (!formats.some((f) => f === "photo" || f === "video" || f === "album")) formats[goals.indexOf("trust")] = "photo";

  // times
  const own = bestBucket(stats);
  const compBuckets = inp.competitors.map(bestBucket).filter(Boolean) as string[];
  const compBest = compBuckets.sort((a, b) => compBuckets.filter((x) => x === b).length - compBuckets.filter((x) => x === a).length)[0];
  const priors = ["08:40", "12:40", "20:40"];

  // experiment variable
  const tw = rules.find((r) => r.id === "R.TIME_WINNER" && r.status === "fired");
  let expVar: Slot["exp"] = "hour";
  if (!(tw?.data?.concentrated as boolean) && own) expVar = winner ? "hookType" : "format";
  const expIdx = goals.findIndex((g, i) => g !== "sale" && i > 0) >= 0 ? goals.findIndex((g, i) => g !== "sale" && i > 0) : 0;

  const yw = isoWeek(start);
  const yyww = `${String(yw.year).slice(2)}${pad(yw.week)}`;
  const med = stats?.medianViews;
  const slots: Slot[] = goals.map((g, i) => {
    const goal = g as Goal;
    let time: string;
    let timeSource: Slot["timeSource"];
    if (own) {
      time = bucketTime(stats, own);
      timeSource = "data";
    } else if (compBest) {
      time = `${pad(Number.parseInt(compBest, 10) + 1)}:40`;
      timeSource = "competitor";
    } else {
      timeSource = "prior";
      time = priors[i % 3];
      if (goal === "sale" && isImpulse(inp.category)) time = i % 2 ? "17:40" : "11:20";
      if (goal === "sale" && isEduClinic(inp.category)) time = weekdays[i] === 0 ? "08:40" : "20:40";
    }
    const evidence: string[] = [];
    if (timeSource === "data" && own) evidence.push(`S.hourLift.${own}`);
    let exp: Slot["exp"];
    if (i === expIdx) {
      exp = expVar;
      if (expVar === "hour") {
        const busy = stats?.busiestHourBucket ?? (own || "19-22");
        time = busy.startsWith("19") || busy.startsWith("16") ? "12:40" : "20:40";
        timeSource = timeSource === "data" ? "data" : timeSource;
      }
    }
    time = fixTime(time, weekdays[i]);
    const metric =
      med == null
        ? "baseline: week 1"
        : goal === "reach"
          ? `≥${Math.round(1.2 * med)} views at 72h (lift 1.2) [S.medianViews]`
          : goal === "trust"
            ? `≥${Math.round(med)} views and ≥3 bot starts [S.medianViews]`
            : `≥${Math.max(3, Math.round(0.01 * med))} bot starts (CTR 1%, taxminiy) and ≥1 order [S.medianViews]`;
    const reasons: string[] = [];
    if (goal === "sale") reasons.push("narx");
    if (formats[i] === "video") reasons.push("video");
    if (inp.approvedPosts < 5) reasons.push("birinchi postlar");
    const link = goal !== "reach" && inp.bot ? `https://t.me/${inp.bot}?start=src_${yyww}_${i + 1}` : undefined;
    return {
      slot: i + 1,
      day: dates[i].toISOString().slice(0, 10),
      weekday: weekdays[i],
      time,
      timeSource,
      goal,
      format: formats[i],
      exp,
      link,
      metric,
      approvalReasons: reasons,
      evidence,
    };
  });

  // calendar overlay
  const ev = inp.calendar.filter((e) => e.daysAway <= 14)[0];
  if (ev) {
    const target =
      (inp.hasOfferFact && slots.find((s) => s.goal === "sale")) ||
      slots.find((s) => s.goal === "trust" && !s.exp) ||
      slots.find((s) => s.goal !== "sale");
    if (target) {
      target.calendarEvent = ev.name;
      target.approvalReasons.push("bayram");
      target.evidence.push(`S.calendar.${ev.id}`);
    }
  }
  return { weekOf, slots, counts: finalCounts };
}

/* ------------------------------------------------------------------ KPIs */

const KPI_T: Record<Lang, Record<string, string>> = {
  uz: {
    ppw: "Haftasiga postlar (reja bajarilishi)",
    views: "72 soatdagi median ko'rishlar",
    reach: "Qamrov (ko'rishlar / obunachilar), %",
    starts: "Botga yozganlar / hafta",
    ctr: "Sotuv postidan botga o'tish (CTR), % — taxminiy 1%",
    howScrape: "har kuni t.me/s orqali hisoblanadi",
    howTags: "src_ teglari hisoblagichi (botda)",
    howCtr: "src_ teglari + egasining haftalik javobi (buyurtmalar)",
  },
  ru: {
    ppw: "Постов в неделю (выполнение плана)",
    views: "Медиана просмотров через 72 ч",
    reach: "Охват (просмотры / подписчики), %",
    starts: "Переходы в бота / неделя",
    ctr: "CTR продающих постов, % — ориентир 1%",
    howScrape: "ежедневно по t.me/s",
    howTags: "счётчик меток src_ в боте",
    howCtr: "метки src_ + еженедельный ответ владельца (заказы)",
  },
  en: {
    ppw: "Posts per week kept",
    views: "Median views at 72h",
    reach: "Reach rate (views / subscribers), %",
    starts: "Bot starts per week",
    ctr: "Sale CTR (starts / views), % — 1% rule of thumb",
    howScrape: "daily t.me/s scrape",
    howTags: "src_ tag counter in the bot",
    howCtr: "src_ tags + owner's weekly one-tap answer (orders)",
  },
};

export function buildKpis(stats: ChannelStats | undefined, rules: RuleResult[], n: number, slots: Slot[], lang: Lang) {
  const t = KPI_T[lang];
  const k: { metric: string; baseline?: number; target: number; how: string }[] = [];
  k.push({ metric: t.ppw, baseline: stats ? Math.round(stats.postsPerWeek * 10) / 10 : undefined, target: n, how: t.howScrape });
  if (stats?.medianViews != null) {
    const up = fired(rules, "R.LOW_REACH") ? 1.2 : 1.15;
    k.push({ metric: `${t.views} (+${Math.round((up - 1) * 100)}% / 4 hafta)`, baseline: Math.round(stats.medianViews), target: Math.round(stats.medianViews * up), how: t.howScrape });
  }
  if (stats?.reachRate != null && stats.subscribers) {
    const lowBand = fired(rules, "R.LOW_REACH");
    const base = Math.round(stats.reachRate * 1000) / 10;
    k.push({ metric: t.reach, baseline: base, target: lowBand ? Math.round((base + 2) * 10) / 10 : base, how: t.howScrape });
  }
  const med = stats?.medianViews;
  const starts = slots.reduce((a, s) => a + (s.goal === "trust" ? 3 : s.goal === "sale" ? Math.max(3, Math.round(0.01 * (med ?? 0))) : 0), 0);
  k.push({ metric: t.starts, target: starts, how: t.howTags });
  if (slots.some((s) => s.goal === "sale")) k.push({ metric: t.ctr, target: 1, how: t.howCtr });
  return k.slice(0, 5);
}
