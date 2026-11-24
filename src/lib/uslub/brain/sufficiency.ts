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

/** Owner words for a post format key (text / photo / album / video / other). */
const FORMAT_NAME: Record<string, L> = {
  text: { uz: "matnli postlar", ru: "текстовые посты", en: "text posts" },
  photo: { uz: "suratli postlar", ru: "посты с фото", en: "photo posts" },
  album: { uz: "albomlar (bir nechta surat)", ru: "альбомы", en: "albums" },
  video: { uz: "video postlar", ru: "видео", en: "videos" },
  other: { uz: "boshqa turdagi postlar", ru: "другие посты", en: "other posts" },
};
const tx = (l: L, lang: Lang, v: Record<string, string | number> = {}) => l[lang].replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

const M = {
  timeData: { uz: "Eng yaxshi vaqt: kanalingiz ma'lumoti bo'yicha — {bucket} ({n} ta post asosida)", ru: "Лучшее время: по данным канала — {bucket} (по {n} постам)", en: "Best time: from your channel's data — {bucket} (based on {n} posts)" },
  timeBench: { uz: "Eng yaxshi vaqt: o'z postlaringiz hali kam — hozircha o'xshash kanallar bo'yicha {bucket}; bu hafta bitta postni boshqa vaqtda sinab ko'ramiz", ru: "Лучшее время: своих постов пока мало — ориентируемся на похожие каналы: {bucket}; на этой неделе один пост выйдет в другое время для проверки", en: "Best time: too few posts of your own yet — similar channels point to {bucket}; this week one post goes out at another time to test" },
  timeFlat: { uz: "Eng yaxshi vaqt: hech bir vaqt boshqalaridan aniq yaxshi emas — taxminiy vaqtlar 08:40 / 12:40 / 20:40 va bitta sinov", ru: "Лучшее время: ни одно время заметно не лучше других — ориентиры 08:40 / 12:40 / 20:40 и одна проверка", en: "Best time: no time clearly beats the others — rule-of-thumb 08:40 / 12:40 / 20:40 plus one test" },
  timePrior: { uz: "Eng yaxshi vaqt: ma'lumot hali kam — taxminiy vaqtlar 08:40 / 12:40 / 20:40 va bitta sinov", ru: "Лучшее время: данных пока мало — ориентиры 08:40 / 12:40 / 20:40 и одна проверка", en: "Best time: not enough data yet — rule-of-thumb 08:40 / 12:40 / 20:40 plus one test" },
  formatData: { uz: "Post turi: {fmt} boshqalaridan ko'proq ko'riladi ({n} ta post asosida)", ru: "Формат: {fmt} набирают больше просмотров (по {n} постам)", en: "Format: {fmt} get more views (based on {n} posts)" },
  formatNone: { uz: "Post turi: hali aniq g'olib yo'q — turli xil postlarni aralashtirib, natijani kuzatamiz", ru: "Формат: явного победителя пока нет — чередуем форматы и смотрим на результат", en: "Format: no clear winner yet — we mix formats and watch the results" },
  trendOk: { uz: "Ko'rishlar o'zgarishi: hisoblandi ({n} ta post asosida)", ru: "Динамика просмотров: посчитана (по {n} постам)", en: "View trend: computed (based on {n} posts)" },
  trendNo: { uz: "Ko'rishlar o'zgarishi: postlar hali kam ({n} ta, kerak kamida 20 ta)", ru: "Динамика просмотров: постов пока мало ({n}, нужно хотя бы 20)", en: "View trend: not enough posts yet ({n}, need at least 20)" },
  reachOk: { uz: "Qamrov: hisoblandi ({subs} obunachi)", ru: "Охват: посчитан ({subs} подписчиков)", en: "Reach: computed ({subs} subscribers)" },
  reachNo: { uz: "Qamrov: obunachilar soni ko'rinmaydi — faqat ko'rishlar bilan ishlaymiz", ru: "Охват: число подписчиков не видно — работаем только с просмотрами", en: "Reach: subscriber count hidden — we work with views only" },
  benchOk: { uz: "O'xshash kanallar bilan taqqoslash: {n} ta kanal", ru: "Сравнение с похожими каналами: {n} каналов", en: "Comparison with similar channels: {n} channels" },
  benchNo: { uz: "O'xshash kanallar bilan taqqoslash: kanallar hali kam ({n} ta, kerak {need} ta) — har bir yangi tahlil bazani to'ldiradi", ru: "Сравнение с похожими каналами: каналов пока мало ({n}, нужно {need}) — каждый новый анализ пополняет базу", en: "Comparison with similar channels: too few yet ({n}, need {need}) — every new audit adds to the base" },
  compOk: { uz: "Raqobatchilar: {n} ta haqiqiy kanal taqqoslandi", ru: "Конкуренты: сравнили {n} настоящих канала", en: "Competitors: {n} real channels compared" },
  compNo: { uz: "Raqobatchilar: {n} ta (kerak kamida 2 ta) — raqobatchi kanallarini qo'shing", ru: "Конкуренты: {n} (нужно хотя бы 2) — добавьте каналы конкурентов", en: "Competitors: {n} (need at least 2) — add competitor channels" },
  learnNone: { uz: "O'rganish: hali reja e'lon qilinmagan. Birinchi natijalar reja posti chiqqandan 72 soat keyin", ru: "Обучение: план ещё не публиковался. Первые результаты через 72 часа после поста из плана", en: "Learning: no plan published yet. First results 72 hours after a plan post goes out" },
  learnWait: { uz: "O'rganish: {plans} ta reja, o'lchangan postlar {n} ta — xulosa uchun hali kam", ru: "Обучение: планов {plans}, измерено постов {n} — для выводов пока мало", en: "Learning: {plans} plans, {n} posts measured — not enough for conclusions yet" },
  learnOk: { uz: "O'rganish: {n} ta post o'lchandi, {s} ta xulosa tasdiqlandi", ru: "Обучение: измерено {n} постов, подтверждено выводов: {s}", en: "Learning: {n} posts measured, {s} findings confirmed" },
  funnelNo: { uz: "Buyurtmalar yo'li: kuzatilgan sotuv postlari hali kam ({n} ta) — havolali sotuv posti 500 dan ko'p ko'rilgach o'lchaymiz", ru: "Путь к заказу: отслеживаемых продающих постов пока мало ({n}) — измерим, когда пост со ссылкой наберёт 500+ просмотров", en: "Path to order: too few tracked sale posts yet ({n}) — we measure once a sale post with a link passes 500 views" },
  funnelOk: { uz: "Buyurtmalar yo'li: {n} ta havolali sotuv posti o'lchandi", ru: "Путь к заказу: измерено {n} продающих постов со ссылкой", en: "Path to order: {n} sale posts with a link measured" },
  pricesNo: { uz: "Narxlar: bazada yo'q — sotuv postlari narxsiz chiqmaydi, narxlarni yuboring", ru: "Цены: в базе нет — продающие посты без цены не выходят, пришлите цены", en: "Prices: none in the knowledge base — sale posts never go out without a price" },
  pricesOk: { uz: "Narxlar: {n} ta narx bazada", ru: "Цены: в базе {n}", en: "Prices: {n} in the knowledge base" },
  proofNo: { uz: "Ishonch dalillari: {n} ta (kerak kamida 2 ta: raqamlar, mijoz fikri, yillar)", ru: "Доказательства: {n} (нужно хотя бы 2: цифры, отзывы, годы работы)", en: "Proof: {n} (need at least 2: numbers, reviews, years in business)" },
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
  out.push(fw && !s?.coldStart ? { key: "format", status: "data", n: fw[1].n, need: 3, text: tx(M.formatData, lang, { fmt: (FORMAT_NAME[fw[0]] ?? FORMAT_NAME.other)[lang], n: fw[1].n }) } : { key: "format", status: "insufficient", n: maxN(s?.formatLift), need: 3, text: tx(M.formatNone, lang) });

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
