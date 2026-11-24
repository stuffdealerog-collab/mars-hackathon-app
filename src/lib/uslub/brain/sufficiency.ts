/**
 * Honest "not enough data" panel. For each thing the Brain could claim, code says
 * whether the claim rests on this channel's data, on the niche benchmark, on a
 * rule of thumb, or on nothing yet, with n, what is needed and how we will get it. Pure.
 */
import { type Benchmark, benchBestHour, MIN_BENCH_N } from "./bench";
import type { LearnReport } from "./learn-run";
import { isWinner } from "./stats";
import type { ChannelStats, Lang } from "./types";

export type SufficiencyStatus = "data" | "benchmark" | "prior" | "insufficient";

export interface SufficiencyItem {
  key: "bestTime" | "format" | "trend" | "reach" | "benchmark" | "competitors" | "learn" | "funnel" | "prices" | "proof";
  status: SufficiencyStatus;
  n: number;
  need: number;
  text: string;
}

type L = Record<Lang, string>;
const tx = (l: L, lang: Lang, v: Record<string, string | number> = {}) => l[lang].replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

const M = {
  timeData: { uz: "Eng yaxshi vaqt: kanalingiz ma'lumoti bo'yicha ({bucket}, n={n})", ru: "Лучшее время: по данным канала ({bucket}, n={n})", en: "Best time: from your channel's data ({bucket}, n={n})" },
  timeBench: { uz: "Eng yaxshi vaqt: o'zingizda yetarli emas (eng ko'pi n={n} bitta oraliqda, kerak ≥3 va 1.2×) — nisha bo'yicha {bucket}; bu hafta bitta vaqt tajribasi", ru: "Лучшее время: своих данных мало (макс. n={n} в интервале, нужно ≥3 и 1.2×) — по нише {bucket}; на этой неделе один эксперимент со временем", en: "Best time: not enough own data (max n={n} per bucket, need ≥3 at 1.2×) — niche says {bucket}; one timing experiment this week" },
  timeFlat: { uz: "Eng yaxshi vaqt: hech bir vaqt oralig'i boshqalardan 1.2× yaxshi emas (eng ko'p n={n}) — taxminiy vaqtlar 08:40 / 12:40 / 20:40 va bitta vaqt tajribasi", ru: "Лучшее время: ни один интервал не лучше других в 1.2× (макс. n={n}) — ориентиры 08:40 / 12:40 / 20:40 и один эксперимент", en: "Best time: no time bucket beats the others by 1.2× (max n={n}) — rule-of-thumb 08:40 / 12:40 / 20:40 plus one timing experiment" },
  timePrior: { uz: "Eng yaxshi vaqt: ma'lumot yetarli emas (n={n}, kerak ≥3 post bitta oraliqda) — taxminiy vaqtlar 08:40 / 12:40 / 20:40 va bitta tajriba", ru: "Лучшее время: данных мало (n={n}, нужно ≥3 поста в интервале) — ориентиры 08:40 / 12:40 / 20:40 и один эксперимент", en: "Best time: not enough data (n={n}, need ≥3 posts per bucket) — rule-of-thumb 08:40 / 12:40 / 20:40 plus one experiment" },
  formatData: { uz: "Format: {fmt} yutmoqda (n={n})", ru: "Формат: выигрывает {fmt} (n={n})", en: "Format: {fmt} wins (n={n})" },
  formatNone: { uz: "Format: aniq g'olib yo'q (kerak ≥3 post va 1.2×) — formatlarni aralashtiramiz", ru: "Формат: явного победителя нет (нужно ≥3 поста и 1.2×) — чередуем форматы", en: "Format: no clear winner (need ≥3 posts at 1.2×) — formats are mixed" },
  trendOk: { uz: "Ko'rishlar trendi: hisoblandi (n={n})", ru: "Тренд просмотров: посчитан (n={n})", en: "View trend: computed (n={n})" },
  trendNo: { uz: "Ko'rishlar trendi: ma'lumot yetarli emas (n={n}, kerak ≥20 eski post)", ru: "Тренд просмотров: данных мало (n={n}, нужно ≥20 зрелых постов)", en: "View trend: not enough data (n={n}, need ≥20 mature posts)" },
  reachOk: { uz: "Qamrov: hisoblandi ({subs} obunachi)", ru: "Охват: посчитан ({subs} подписчиков)", en: "Reach: computed ({subs} subscribers)" },
  reachNo: { uz: "Qamrov: obunachilar soni ko'rinmaydi — faqat ko'rishlar bilan ishlaymiz", ru: "Охват: число подписчиков не видно — работаем только с просмотрами", en: "Reach: subscriber count hidden — we work with views only" },
  benchOk: { uz: "Nisha bo'yicha taqqoslash: {n} ta kanal ({scope})", ru: "Сравнение с нишей: {n} каналов ({scope})", en: "Niche comparison: {n} channels ({scope})" },
  benchNo: { uz: "Nisha bo'yicha taqqoslash: kanallar yetarli emas (n={n}, kerak ≥{need}) — har bir yangi tahlil bazani to'ldiradi", ru: "Сравнение с нишей: мало каналов (n={n}, нужно ≥{need}) — каждый новый анализ пополняет базу", en: "Niche comparison: not enough channels (n={n}, need ≥{need}) — every new audit adds to the base" },
  compOk: { uz: "Raqobatchilar: {n} ta haqiqiy kanal taqqoslandi", ru: "Конкуренты: сравнено {n} настоящих каналов", en: "Competitors: {n} real channels compared" },
  compNo: { uz: "Raqobatchilar: {n} ta (kerak ≥2) — raqobatchi kanallarini qo'shing", ru: "Конкуренты: {n} (нужно ≥2) — добавьте каналы конкурентов", en: "Competitors: {n} (need ≥2) — add competitor channels" },
  learnNone: { uz: "O'rganish: hali reja e'lon qilinmagan. Birinchi natijalar reja posti chiqqandan 72 soat keyin", ru: "Обучение: план ещё не публиковался. Первые результаты через 72 часа после поста из плана", en: "Learning: no plan published yet. First results 72 hours after a plan post goes out" },
  learnWait: { uz: "O'rganish: {plans} ta reja, o'lchangan postlar {n} ta (kerak ≥3 bitta belgiga)", ru: "Обучение: планов {plans}, измерено постов {n} (нужно ≥3 на признак)", en: "Learning: {plans} plans, {n} posts measured (need ≥3 per tag)" },
  learnOk: { uz: "O'rganish: {n} ta post o'lchandi, {s} ta xulosa tasdiqlandi", ru: "Обучение: измерено {n} постов, подтверждено выводов: {s}", en: "Learning: {n} posts measured, {s} findings supported" },
  funnelNo: { uz: "Voronka: kuzatilgan sotuv postlari {n} ta (kerak ≥1 post, 72 soatda ≥500 ko'rish)", ru: "Воронка: отслеживаемых продающих постов {n} (нужен ≥1 с ≥500 просмотров за 72 ч)", en: "Funnel: tracked sale posts {n} (need ≥1 with ≥500 views at 72h)" },
  funnelOk: { uz: "Voronka: {n} ta kuzatilgan sotuv posti o'lchandi", ru: "Воронка: измерено {n} отслеживаемых продающих постов", en: "Funnel: {n} tracked sale posts measured" },
  pricesNo: { uz: "Narxlar: bazada yo'q — sotuv postlari narxsiz chiqmaydi, narxlarni yuboring", ru: "Цены: в базе нет — продающие посты без цены не выходят, пришлите цены", en: "Prices: none in the knowledge base — sale posts never go out without a price" },
  pricesOk: { uz: "Narxlar: {n} ta narx bazada", ru: "Цены: в базе {n}", en: "Prices: {n} in the knowledge base" },
  proofNo: { uz: "Ishonch dalillari: {n} ta (kerak ≥2: raqamlar, mijoz fikri, yillar)", ru: "Доказательства: {n} (нужно ≥2: цифры, отзывы, годы)", en: "Proof: {n} (need ≥2: numbers, reviews, years)" },
  proofOk: { uz: "Ishonch dalillari: {n} ta", ru: "Доказательства: {n}", en: "Proof: {n}" },
} satisfies Record<string, L>;

export function sufficiency(
  inp: { stats?: ChannelStats; bench?: Benchmark; competitors: number; learn?: Pick<LearnReport, "plans" | "outcomes" | "scores" | "funnel">; facts?: { prices: number; proof: number } },
  lang: Lang,
): SufficiencyItem[] {
  const s = inp.stats;
  const out: SufficiencyItem[] = [];
  const maxN = (rec?: Record<string, { n: number }>) => Math.max(0, ...Object.values(rec ?? {}).map((b) => b.n));

  const hw = s ? Object.entries(s.hourLift).filter(([, b]) => isWinner(b)).sort((a, b) => (b[1].value ?? 0) - (a[1].value ?? 0))[0] : undefined;
  const bb = benchBestHour(inp.bench);
  if (hw && !s?.coldStart) out.push({ key: "bestTime", status: "data", n: hw[1].n, need: 3, text: tx(M.timeData, lang, { bucket: hw[0], n: hw[1].n }) });
  else if (bb) out.push({ key: "bestTime", status: "benchmark", n: maxN(s?.hourLift), need: 3, text: tx(M.timeBench, lang, { bucket: bb, n: maxN(s?.hourLift) }) });
  else out.push({ key: "bestTime", status: "prior", n: maxN(s?.hourLift), need: 3, text: tx(maxN(s?.hourLift) >= 3 ? M.timeFlat : M.timePrior, lang, { n: maxN(s?.hourLift) }) });

  const fw = s ? Object.entries(s.formatLift).filter(([, b]) => isWinner(b)).sort((a, b) => (b[1].value ?? 0) - (a[1].value ?? 0))[0] : undefined;
  out.push(fw && !s?.coldStart ? { key: "format", status: "data", n: fw[1].n, need: 3, text: tx(M.formatData, lang, { fmt: fw[0], n: fw[1].n }) } : { key: "format", status: "insufficient", n: maxN(s?.formatLift), need: 3, text: tx(M.formatNone, lang) });

  const mature = s?.maturePosts ?? 0;
  out.push(s?.viewTrend != null ? { key: "trend", status: "data", n: mature, need: 20, text: tx(M.trendOk, lang, { n: mature }) } : { key: "trend", status: "insufficient", n: mature, need: 20, text: tx(M.trendNo, lang, { n: mature }) });
  out.push(s?.subscribers ? { key: "reach", status: "data", n: s.subscribers, need: 1, text: tx(M.reachOk, lang, { subs: s.subscribers }) } : { key: "reach", status: "insufficient", n: 0, need: 1, text: tx(M.reachNo, lang) });

  const b = inp.bench;
  out.push(
    b && b.n >= MIN_BENCH_N
      ? { key: "benchmark", status: b.scope === "niche" ? "data" : "benchmark", n: b.n, need: MIN_BENCH_N, text: tx(M.benchOk, lang, { n: b.n, scope: b.scope === "niche" ? b.niche : "all" }) }
      : { key: "benchmark", status: "insufficient", n: b?.n ?? 0, need: MIN_BENCH_N, text: tx(M.benchNo, lang, { n: b?.n ?? 0, need: MIN_BENCH_N }) },
  );
  out.push(inp.competitors >= 2 ? { key: "competitors", status: "data", n: inp.competitors, need: 2, text: tx(M.compOk, lang, { n: inp.competitors }) } : { key: "competitors", status: "insufficient", n: inp.competitors, need: 2, text: tx(M.compNo, lang, { n: inp.competitors }) });

  const l = inp.learn;
  const measured = l?.outcomes.filter((o) => o.status === "final").length ?? 0;
  const supported = l?.scores.filter((x) => x.status === "supported").length ?? 0;
  if (!l || !l.plans.length) out.push({ key: "learn", status: "insufficient", n: 0, need: 3, text: tx(M.learnNone, lang) });
  else if (supported) out.push({ key: "learn", status: "data", n: measured, need: 3, text: tx(M.learnOk, lang, { n: measured, s: supported }) });
  else out.push({ key: "learn", status: "insufficient", n: measured, need: 3, text: tx(M.learnWait, lang, { plans: l.plans.length, n: measured }) });

  const tracked = l?.funnel.posts.filter((p) => p.views72 >= 500).length ?? 0;
  out.push(tracked ? { key: "funnel", status: "data", n: tracked, need: 1, text: tx(M.funnelOk, lang, { n: tracked }) } : { key: "funnel", status: "insufficient", n: l?.funnel.posts.length ?? 0, need: 1, text: tx(M.funnelNo, lang, { n: l?.funnel.posts.length ?? 0 }) });

  if (inp.facts) {
    out.push(inp.facts.prices ? { key: "prices", status: "data", n: inp.facts.prices, need: 1, text: tx(M.pricesOk, lang, { n: inp.facts.prices }) } : { key: "prices", status: "insufficient", n: 0, need: 1, text: tx(M.pricesNo, lang) });
    out.push(inp.facts.proof >= 2 ? { key: "proof", status: "data", n: inp.facts.proof, need: 2, text: tx(M.proofOk, lang, { n: inp.facts.proof }) } : { key: "proof", status: "insufficient", n: inp.facts.proof, need: 2, text: tx(M.proofNo, lang, { n: inp.facts.proof }) });
  }
  return out;
}
