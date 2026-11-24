/**
 * Telegram ad-placement check: before an owner pays for an ad post in someone
 * else's channel, show the signs of boosted ("nakrutka") audiences and what an
 * advertiser actually gets per 1000 views. Pure — `now` is injected.
 *
 * Every threshold is a rule of thumb from public ad-buyer guides (labelled
 * "taxminiy"); the output lists signals, never a "fake" verdict as fact.
 */
import { features, median } from "./stats";
import { MATURE_H, type ChannelData, type ChannelStats, type RawPost } from "./types";
import type { Msg } from "./validity";

export const SOURCES = {
  tgstatErr: "https://checkroi.ru/blog/analitika-telegram-kanalov/",
  boostSigns2023:
    "https://ppc.world/articles/kak-proverit-telegram-kanal-prezhde-chem-kupit-v-nem-reklamu-4-markera-nakrutki-instrumenty-chtoby-ih-zametit/",
  boostSigns2025: "https://vc.ru/marketing/1802829-kak-raskusit-nakrutku-v-telegram-kanalah-4-parametra-kotorye-stoit-proverit",
  uzPrices2025: "https://www.spot.uz/ru/2025/01/14/telegram-ad/",
} as const;

export const ERR_LOW = 0.1;
export const ERR_HIGH = 0.5;
export const FLAT_CV = 0.12;
export const SATURATION = 0.85;
export const AD_LOAD_MAX = 0.4;
export const JUMP_ABS = 5000;
export const JUMP_REL = 10;

export type SignalId = "err" | "flat" | "saturation" | "adLoad" | "adReach" | "jumps";
export type SignalStatus = "ok" | "warn" | "insufficient";

export interface AdSignal {
  id: SignalId;
  status: SignalStatus;
  value?: number;
  display: string;
  threshold: string;
  source: "heuristic" | "data";
  n?: number;
  note: Msg;
}

export type Verdict = "ok" | "caution" | "suspect" | "insufficient";

export interface PriceBand {
  low: number;
  high: number;
  label: string;
  source: string;
}

export interface AdCheck {
  verdict: Verdict;
  signals: AdSignal[];
  err?: number;
  matureMedian?: number;
  adMedian?: { value: number; n: number };
  expectedAdViews?: { value: number; basis: "adPosts" | "mature"; n: number };
  cpm?: { priceUzs: number; value: number; display: string; basis: "adPosts" | "mature" };
  priceBand?: PriceBand & { position?: "below" | "within" | "above" };
  summary: Msg;
}

const H = 3_600_000;
const DAY = 86_400_000;
const pct0 = (x: number) => `${Math.round(x * 100)}%`;
/** 1234567 -> "1 234 567" (plain spaces). */
export const uzs = (x: number) => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

const NAMES: Record<SignalId, Msg> = {
  err: { uz: "ko‘rish/obunachi (ERR)", ru: "просмотры/подписчики (ERR)", en: "views per subscriber (ERR)" },
  flat: { uz: "bir xil ko‘rishlar", ru: "одинаковые просмотры", en: "flat view counts" },
  saturation: { uz: "ko‘rishlar birdan kelgan", ru: "просмотры пришли сразу", en: "views arrived at once" },
  adLoad: { uz: "reklama ulushi", ru: "доля рекламы", en: "ad load" },
  adReach: { uz: "reklama postlari qamrovi", ru: "охват рекламных постов", en: "ad-post reach" },
  jumps: { uz: "obunachilar sakrashi", ru: "скачки подписчиков", en: "subscriber jumps" },
};

/** Spot.uz (Jan 2025) price tiers per ad post, UZS, excluding VAT. A prior, not a quote. */
export function priceBand(subscribers?: number): PriceBand | undefined {
  if (subscribers == null) return undefined;
  const source = `taxminiy narx, manba: spot.uz 2025-01-14 (${SOURCES.uzPrices2025})`;
  if (subscribers < 100_000) return { low: 300_000, high: 500_000, label: "<100k obunachi, mavzuli kanal", source };
  if (subscribers <= 500_000) return { low: 1_000_000, high: 2_000_000, label: "≤500k obunachi", source };
  return { low: 2_000_000, high: 15_000_000, label: "muallif/media kanallar", source };
}

const ownMature = (posts: RawPost[], now: number) =>
  posts.filter((p) => p.views != null && !p.isForward && now - Date.parse(p.postedAt) >= MATURE_H * H && now - Date.parse(p.postedAt) <= 90 * DAY);

export function adSignals(
  data: ChannelData,
  stats: ChannelStats,
  now: number,
  opts: { priceUzs?: number; history?: { at: string; subscribers: number }[] } = {},
): AdCheck {
  const signals: AdSignal[] = [];
  const subs = data.subscribers;
  const med = stats.medianViews;

  // 1. ERR the TGStat way: median reach of mature own posts / subscribers.
  const err = med != null && subs ? med / subs : undefined;
  if (err == null) {
    signals.push({
      id: "err",
      status: "insufficient",
      display: subs ? `n=${stats.maturePosts}` : "obunachilar noma'lum",
      threshold: "taxminiy: 10%–50%",
      source: "heuristic",
      n: stats.maturePosts,
      note: {
        uz: "ERR hisoblab bo‘lmadi: kamida 3 ta 72 soatdan eski post va obunachilar soni kerak.",
        ru: "ERR не посчитать: нужно минимум 3 поста старше 72 ч и число подписчиков.",
        en: "ERR can't be computed: needs at least 3 posts older than 72 h and a subscriber count.",
      },
    });
  } else if ((subs ?? 0) <= 1000) {
    signals.push({
      id: "err",
      status: "insufficient",
      value: err,
      display: pct0(err),
      threshold: "≤1000 obunachi: chegara qo‘llanilmaydi",
      source: "heuristic",
      n: Math.min(30, stats.maturePosts),
      note: {
        uz: `ERR ${pct0(err)}, lekin 1000 dan kam obunachili kanalda bu chegara ishlamaydi.`,
        ru: `ERR ${pct0(err)}, но для канала меньше 1000 подписчиков этот порог не работает.`,
        en: `ERR is ${pct0(err)}, but the threshold doesn't apply below 1000 subscribers.`,
      },
    });
  } else {
    const warn = err > ERR_HIGH || err < ERR_LOW;
    signals.push({
      id: "err",
      status: warn ? "warn" : "ok",
      value: err,
      display: pct0(err),
      threshold: "taxminiy: 10%–50%",
      source: "heuristic",
      n: Math.min(30, stats.maturePosts),
      note: warn
        ? err > ERR_HIGH
          ? {
              uz: `Post o‘rtacha ${pct0(err)} obunachiga yetadi — bu juda baland, ko‘rishlar sotib olingan bo‘lishi mumkin.`,
              ru: `Пост в среднем видят ${pct0(err)} подписчиков — слишком много, просмотры могли купить.`,
              en: `A post reaches ${pct0(err)} of subscribers on median — unusually high; views may be bought.`,
            }
          : {
              uz: `Post o‘rtacha atigi ${pct0(err)} obunachiga yetadi — obunachilarning katta qismi o‘lik yoki sotib olingan bo‘lishi mumkin.`,
              ru: `Пост в среднем видят всего ${pct0(err)} подписчиков — большая часть аудитории может быть мёртвой или купленной.`,
              en: `A post reaches only ${pct0(err)} of subscribers on median — much of the audience may be dead or bought.`,
            }
        : {
            uz: `Post o‘rtacha ${pct0(err)} obunachiga yetadi — odatiy oraliqda.`,
            ru: `Пост в среднем видят ${pct0(err)} подписчиков — в обычных пределах.`,
            en: `A post reaches ${pct0(err)} of subscribers on median — within the usual range.`,
          },
    });
  }

  // 2. Flat bars: real audiences give uneven view counts.
  const cv = stats.viewCV;
  signals.push(
    cv == null
      ? {
          id: "flat",
          status: "insufficient",
          display: `n=${stats.maturePosts}`,
          threshold: "taxminiy: CV < 0.12",
          source: "heuristic",
          n: stats.maturePosts,
          note: {
            uz: "Kamida 10 ta 72 soatdan eski post kerak.",
            ru: "Нужно минимум 10 постов старше 72 ч.",
            en: "Needs at least 10 posts older than 72 h.",
          },
        }
      : {
          id: "flat",
          status: cv < FLAT_CV ? "warn" : "ok",
          value: cv,
          display: cv.toFixed(2),
          threshold: "taxminiy: CV < 0.12",
          source: "heuristic",
          n: Math.min(20, stats.maturePosts),
          note:
            cv < FLAT_CV
              ? {
                  uz: `Oxirgi postlarning ko‘rishlari deyarli bir xil (CV ${cv.toFixed(2)}). Jonli auditoriyada ular har xil bo‘ladi.`,
                  ru: `Просмотры последних постов почти одинаковые (CV ${cv.toFixed(2)}). У живой аудитории они разные.`,
                  en: `Recent posts have nearly identical views (CV ${cv.toFixed(2)}). Live audiences produce uneven counts.`,
                }
              : {
                  uz: `Ko‘rishlar tabiiy ravishda har xil (CV ${cv.toFixed(2)}).`,
                  ru: `Просмотры естественно разные (CV ${cv.toFixed(2)}).`,
                  en: `Views vary naturally (CV ${cv.toFixed(2)}).`,
                },
        },
  );

  // 3. Early saturation: a 2–24 h old post already at ≥85% of the mature median.
  const young = data.posts.filter((p) => {
    const age = (now - Date.parse(p.postedAt)) / H;
    return p.views != null && !p.isForward && age >= 2 && age <= 24;
  });
  if (!young.length || med == null) {
    signals.push({
      id: "saturation",
      status: "insufficient",
      display: young.length ? "median noma'lum" : "yosh post yo‘q",
      threshold: "taxminiy: 2–24 soatlik post ≥85% median",
      source: "heuristic",
      n: young.length,
      note: {
        uz: "Tekshirish uchun 2–24 soat oldin chiqqan post kerak.",
        ru: "Для проверки нужен пост, вышедший 2–24 ч назад.",
        en: "Needs a post published 2–24 h ago.",
      },
    });
  } else {
    const saturated = young.filter((p) => (p.views as number) >= SATURATION * med);
    const warn = saturated.length >= 2;
    signals.push({
      id: "saturation",
      status: warn ? "warn" : "ok",
      value: saturated.length,
      display: `${saturated.length}/${young.length}`,
      threshold: "taxminiy: ≥2 ta yosh post ≥85% median",
      source: "heuristic",
      n: young.length,
      note: warn
        ? {
            uz: `${young.length} ta yangi postdan ${saturated.length} tasi bir kunga yetmay odatdagi ko‘rishlarga yetgan. Sotib olingan ko‘rishlar birdan keladi, jonli ko‘rishlar sekin yig‘iladi.`,
            ru: `${saturated.length} из ${young.length} свежих постов меньше чем за сутки набрали обычные просмотры. Купленные просмотры приходят сразу, живые копятся постепенно.`,
            en: `${saturated.length} of ${young.length} fresh posts hit typical views in under a day. Bought views arrive at once; organic views build up.`,
          }
        : {
            uz: "Yangi postlarning ko‘rishlari sekin yig‘ilmoqda — tabiiy.",
            ru: "Просмотры свежих постов копятся постепенно — естественно.",
            en: "Fresh posts are accumulating views gradually — looks organic.",
          },
    });
  }

  // 4. Ad load: how many posts in the window are ads.
  const window = data.posts.filter((p) => now - Date.parse(p.postedAt) <= 90 * DAY);
  const adPosts = window.filter((p) => features(p).isAd);
  if (!window.length) {
    signals.push({
      id: "adLoad",
      status: "insufficient",
      display: "post yo‘q",
      threshold: "taxminiy: ≤40%",
      source: "heuristic",
      n: 0,
      note: { uz: "90 kunda post yo‘q.", ru: "За 90 дней нет постов.", en: "No posts in 90 days." },
    });
  } else {
    const load = adPosts.length / window.length;
    const warn = load > AD_LOAD_MAX;
    signals.push({
      id: "adLoad",
      status: warn ? "warn" : "ok",
      value: load,
      display: `${pct0(load)} (${adPosts.length}/${window.length})`,
      threshold: "taxminiy: ≤40%",
      source: "heuristic",
      n: window.length,
      note: warn
        ? {
            uz: `Postlarning ${pct0(load)} qismi reklama — o‘quvchilar reklamaga ko‘nikib qolgan, sizning postingiz yo‘qolib ketadi.`,
            ru: `${pct0(load)} постов — реклама: читатели привыкли пролистывать, ваш пост потеряется.`,
            en: `${pct0(load)} of posts are ads — readers are used to skipping them; yours will get lost.`,
          }
        : {
            uz: `Reklama ulushi ${pct0(load)} — me'yorda.`,
            ru: `Доля рекламы ${pct0(load)} — в норме.`,
            en: `Ad load is ${pct0(load)} — reasonable.`,
          },
    });
  }

  // 5. Ad-post reach: what an advertiser actually got here.
  const adMature = ownMature(adPosts, now);
  const adMed = adMature.length >= 3 ? median(adMature.map((p) => p.views as number)) : undefined;
  if (adMed == null || med == null) {
    signals.push({
      id: "adReach",
      status: "insufficient",
      display: `n=${adMature.length}`,
      threshold: "kamida 3 ta reklama posti",
      source: "data",
      n: adMature.length,
      note: {
        uz: `Kanalda 72 soatdan eski reklama postlari kam (n=${adMature.length}). Reklama qanday ko‘rilishini oldindan aytib bo‘lmaydi.`,
        ru: `Мало рекламных постов старше 72 ч (n=${adMature.length}). Охват рекламы заранее не оценить.`,
        en: `Too few ad posts older than 72 h (n=${adMature.length}) to predict ad reach.`,
      },
    });
  } else {
    const ratio = adMed / med;
    const warn = ratio < 0.5;
    signals.push({
      id: "adReach",
      status: warn ? "warn" : "ok",
      value: adMed,
      display: `${uzs(adMed)} (${ratio.toFixed(2)}×)`,
      threshold: "reklama median / oddiy post median",
      source: "data",
      n: adMature.length,
      note: {
        uz: `Bu kanaldagi reklama postlari odatda ${uzs(adMed)} marta ko‘rilgan (n=${adMature.length}), oddiy postlar ${uzs(med)}.`,
        ru: `Рекламные посты здесь обычно набирают ${uzs(adMed)} просмотров (n=${adMature.length}), обычные посты — ${uzs(med)}.`,
        en: `Ad posts here typically got ${uzs(adMed)} views (n=${adMature.length}) vs ${uzs(med)} for regular posts.`,
      },
    });
  }

  // 6. Subscriber jumps (needs a history of subscriber counts).
  const hist = [...(opts.history ?? [])].filter((x) => Number.isFinite(Date.parse(x.at))).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (hist.length < 2) {
    signals.push({
      id: "jumps",
      status: "insufficient",
      display: "tarix yo‘q",
      threshold: `taxminiy: +${uzs(JUMP_ABS)} yoki 10× odatiy kunlik o‘sish`,
      source: "heuristic",
      n: hist.length,
      note: {
        uz: "Obunachilar tarixi yo‘q: Telegram ochiq sahifasi faqat hozirgi sonni ko‘rsatadi. Kanalni bir necha kun kuzatsak, sakrashlarni ko‘ramiz.",
        ru: "Нет истории подписчиков: публичная страница показывает только текущее число. Понаблюдаем несколько дней — увидим скачки.",
        en: "No subscriber history: the public page shows only the current count. Tracking the channel for a few days will show jumps.",
      },
    });
  } else {
    const steps = hist.slice(1).map((x, i) => {
      const delta = x.subscribers - hist[i].subscribers;
      const days = Math.max(1 / 24, (Date.parse(x.at) - Date.parse(hist[i].at)) / DAY);
      return { delta, rate: delta / days, at: x.at };
    });
    const normal = steps.length >= 3 ? median(steps.map((s) => Math.abs(s.rate))) : undefined;
    const jump = steps.find((s) => s.delta >= JUMP_ABS || (normal != null && normal > 0 && s.rate >= JUMP_REL * normal));
    signals.push({
      id: "jumps",
      status: jump ? "warn" : "ok",
      value: jump?.delta ?? Math.max(...steps.map((s) => s.delta)),
      display: jump ? `+${uzs(jump.delta)} (${jump.at.slice(0, 10)})` : "sakrash yo‘q",
      threshold: `taxminiy: +${uzs(JUMP_ABS)} yoki 10× odatiy kunlik o‘sish`,
      source: "heuristic",
      n: hist.length,
      note: jump
        ? {
            uz: `${jump.at.slice(0, 10)} kuni obunachilar birdan +${uzs(jump.delta)} ga oshgan. Sababsiz sakrash — sotib olingan obunachilar belgisi.`,
            ru: `${jump.at.slice(0, 10)} подписчики резко выросли на +${uzs(jump.delta)}. Скачок без причины — признак накрутки.`,
            en: `Subscribers jumped by +${uzs(jump.delta)} on ${jump.at.slice(0, 10)}. A jump with no visible cause is a sign of bought subscribers.`,
          }
        : {
            uz: "Obunachilar bir tekis o‘zgarmoqda.",
            ru: "Подписчики меняются плавно.",
            en: "Subscriber count changes smoothly.",
          },
    });
  }

  // Verdict: only the boost signs count.
  const core = signals.filter((s) => ["err", "flat", "saturation", "jumps"].includes(s.id));
  const warns = core.filter((s) => s.status === "warn");
  const evaluated = signals.filter((s) => s.status !== "insufficient").length;
  const verdict: Verdict = warns.length >= 2 ? "suspect" : warns.length === 1 ? "caution" : evaluated >= 3 ? "ok" : "insufficient";

  // CPM: price per 1000 views an advertiser can expect.
  const expected =
    adMed != null ? { value: adMed, basis: "adPosts" as const, n: adMature.length } : med != null ? { value: med, basis: "mature" as const, n: Math.min(30, stats.maturePosts) } : undefined;
  const band = priceBand(subs);
  let cpm: AdCheck["cpm"];
  if (opts.priceUzs != null && opts.priceUzs > 0 && expected && expected.value > 0) {
    const value = (opts.priceUzs / expected.value) * 1000;
    cpm = { priceUzs: opts.priceUzs, value, display: `${uzs(value)} so‘m / 1000 ko‘rish`, basis: expected.basis };
  }
  const position =
    band && opts.priceUzs != null ? (opts.priceUzs < band.low ? "below" : opts.priceUzs > band.high ? "above" : "within") : undefined;

  const list = (l: keyof Msg) => warns.map((s) => NAMES[s.id][l]).join(", ");
  const summary: Msg =
    verdict === "suspect"
      ? {
          uz: `Nakrutka belgilari bor: ${list("uz")}. Bu hukm emas, lekin pul to‘lashdan oldin admin'dan oxirgi reklama postining 24 soatlik statistikasini so‘rang.`,
          ru: `Есть признаки накрутки: ${list("ru")}. Это не приговор, но перед оплатой попросите у админа статистику последнего рекламного поста за 24 ч.`,
          en: `Signs of boosting: ${list("en")}. Not proof, but before paying ask the admin for 24 h stats of their last ad post.`,
        }
      : verdict === "caution"
        ? {
            uz: `Bitta shubhali belgi: ${list("uz")}. Avval kichik reklama bilan sinab ko‘ring va alohida havola bilan natijani o‘lchang.`,
            ru: `Один подозрительный признак: ${list("ru")}. Сначала протестируйте небольшим размещением с отдельной ссылкой.`,
            en: `One warning sign: ${list("en")}. Test with a small placement and a separate tracked link first.`,
          }
        : verdict === "ok"
          ? {
              uz: `Nakrutka belgilari topilmadi (${evaluated} ta tekshiruv). Bu kafolat emas — reklamaga alohida havola qo‘ying va natijani o‘lchang.`,
              ru: `Признаков накрутки не найдено (${evaluated} проверок). Это не гарантия — поставьте отдельную ссылку и измерьте результат.`,
              en: `No boosting signs found (${evaluated} checks). Not a guarantee — use a separate tracked link and measure.`,
            }
          : {
              uz: `Xulosa uchun ma'lumot yetarli emas (faqat ${evaluated} ta tekshiruv ishladi).`,
              ru: `Данных для вывода недостаточно (сработало только ${evaluated} проверок).`,
              en: `Not enough data for a conclusion (only ${evaluated} checks could run).`,
            };

  return {
    verdict,
    signals,
    err,
    matureMedian: med,
    adMedian: adMed != null ? { value: adMed, n: adMature.length } : undefined,
    expectedAdViews: expected,
    cpm,
    priceBand: band ? { ...band, ...(position ? { position } : {}) } : undefined,
    summary,
  };
}
