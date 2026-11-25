/**
 * Owner-readable audit text (pure). Every finding a shop owner sees is two plain sentences in their language:
 * what the numbers show (with the comparison point), then one concrete fix for this week. No ledger ids,
 * no variable names, no "n=", no "lift". Used for the keyless template fallback, for LLM findings that fail
 * the plain-language check, for evidence lines and for the "why" of top posts.
 */
import { stripIdsAll } from "./copy";
import { features, reachBand } from "./stats";
import type { ChannelStats, Lang, LedgerEntry, RawPost, RuleResult } from "./types";

type T3 = { uz: string; ru: string; en: string };
const pick = (lang: Lang, t: T3) => t[lang];

/* --------------------------------------------------------------- numbers */

/** 0.124 -> "12%", 0.004 -> "0.4%" (uz/ru: "0,4%"). */
export function pctText(x: number, lang: Lang): string {
  const v = x * 100;
  const s = v >= 10 || Number.isInteger(Math.round(v * 10) / 10) ? String(Math.round(v)) : (Math.round(v * 10) / 10).toString();
  return `${lang === "en" ? s : s.replace(".", ",")}%`;
}

/** 8860 -> "8 860" (uz/ru) / "8,860" (en); 1.5 -> "1,5" / "1.5". */
export function numText(x: number, lang: Lang, digits = 0): string {
  const r = digits ? Math.round(x * 10 ** digits) / 10 ** digits : Math.round(x);
  const [int, frac] = String(r).split(".");
  const sep = lang === "en" ? "," : " ";
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return frac ? `${grouped}${lang === "en" ? "." : ","}${frac}` : grouped;
}

const morePct = (ratio: number) => Math.max(1, Math.round((ratio - 1) * 100));
const lessPct = (ratio: number) => Math.max(1, Math.round((1 - ratio) * 100));

/** "19-22" -> "19:00–22:00". */
export function timeRange(bucket: string): string {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(bucket);
  return m ? `${m[1].padStart(2, "0")}:00–${m[2].padStart(2, "0")}:00` : bucket;
}

/* ---------------------------------------------------------------- names */

const FORMAT: Record<string, { uz: string; ru: string; en: string; uzLow: string; ruGen: string; enLow: string }> = {
  text: { uz: "Matnli postlar", ru: "Текстовые посты", en: "Text posts", uzLow: "matnli", ruGen: "текстовых постов", enLow: "text posts" },
  photo: { uz: "Suratli postlar", ru: "Посты с фото", en: "Photo posts", uzLow: "suratli", ruGen: "постов с фото", enLow: "photo posts" },
  album: { uz: "Albomlar (bir nechta surat)", ru: "Альбомы", en: "Albums", uzLow: "albom", ruGen: "альбомов", enLow: "albums" },
  video: { uz: "Video postlar", ru: "Видео", en: "Videos", uzLow: "video", ruGen: "видео", enLow: "videos" },
  other: { uz: "Boshqa turdagi postlar", ru: "Другие посты", en: "Other posts", uzLow: "boshqa turdagi", ruGen: "других постов", enLow: "other posts" },
};
const fmt = (k: string) => FORMAT[k] ?? FORMAT.other;

const LANG_NAME: Record<string, { uz: string; ruPrep: string; ruNom: string; en: string }> = {
  "uz-Latn": { uz: "O‘zbek (lotin)", ruPrep: "узбекском (латиница)", ruNom: "узбекский (латиница)", en: "Uzbek (Latin)" },
  "uz-Cyrl": { uz: "O‘zbek (kirill)", ruPrep: "узбекском (кириллица)", ruNom: "узбекский (кириллица)", en: "Uzbek (Cyrillic)" },
  ru: { uz: "Rus", ruPrep: "русском", ruNom: "русский", en: "Russian" },
  en: { uz: "Ingliz", ruPrep: "английском", ruNom: "английский", en: "English" },
  mixed: { uz: "Aralash (o‘zbek + rus)", ruPrep: "смеси узбекского и русского", ruNom: "смешанный", en: "mixed Uzbek and Russian" },
};
const langName = (k: string) => LANG_NAME[k] ?? { uz: k, ruPrep: k, ruNom: k, en: k };

const TRUST_PART: Record<string, T3> = {
  address: { uz: "manzil", ru: "адрес", en: "address" },
  map: { uz: "xarita", ru: "карта", en: "map" },
  hours: { uz: "ish vaqti", ru: "часы работы", en: "opening hours" },
  phone: { uz: "telefon", ru: "телефон", en: "phone" },
  review: { uz: "oxirgi 30 kundagi mijoz fikri", ru: "отзыв клиента за 30 дней", en: "a customer review from the last 30 days" },
};

const OFFER: Record<string, T3> = {
  discount: { uz: "chegirma", ru: "скидка", en: "a discount" },
  freeDelivery: { uz: "bepul yetkazib berish", ru: "бесплатная доставка", en: "free delivery" },
  installment: { uz: "muddatli to‘lov", ru: "рассрочка", en: "instalments" },
  gift: { uz: "sovg‘a", ru: "подарок", en: "a gift" },
  trial: { uz: "bepul sinov", ru: "бесплатная проба", en: "a free trial" },
};

function tagText(tag: string, lang: Lang): string {
  const [k, v] = tag.split(":");
  if (k === "format") return pick(lang, { uz: `${fmt(v).uzLow} post`, ru: fmt(v).ru.toLowerCase(), en: fmt(v).enLow });
  if (k === "len")
    return pick(
      lang,
      v === "<300"
        ? { uz: "qisqa matn (300 belgigacha)", ru: "короткий текст (до 300 знаков)", en: "short text (under 300 characters)" }
        : v === ">800"
          ? { uz: "uzun matn (800 belgidan ko‘p)", ru: "длинный текст (больше 800 знаков)", en: "long text (over 800 characters)" }
          : { uz: "o‘rtacha uzunlik (300–800 belgi)", ru: "средняя длина (300–800 знаков)", en: "medium length (300–800 characters)" },
    );
  if (k === "lang") {
    if (!LANG_NAME[v]) return ""; // "unknown" (undetected language) is never shown to the owner
    return pick(lang, { uz: `${langName(v).uz.toLowerCase()} tilida`, ru: `на ${langName(v).ruPrep}`, en: `in ${langName(v).en}` });
  }
  if (k === "hour") return pick(lang, { uz: `${timeRange(v)} oralig‘ida chiqqan`, ru: `вышли в ${timeRange(v)}`, en: `posted ${timeRange(v)}` });
  const flags: Record<string, T3> = {
    hasPrice: { uz: "narx yozilgan", ru: "указана цена", en: "a price is shown" },
    hasCTA: { uz: "aniq chaqiruv bor", ru: "есть понятный призыв", en: "a clear call to action" },
    hasMap: { uz: "xarita bor", ru: "есть карта", en: "a map" },
    isPromo: { uz: "aksiya", ru: "акция", en: "a promotion" },
    questionHook: { uz: "savol bilan boshlanadi", ru: "начинается с вопроса", en: "opens with a question" },
    numberInHook: { uz: "birinchi qatorda raqam", ru: "цифра в первой строке", en: "a number in the first line" },
  };
  return flags[tag] ? pick(lang, flags[tag]) : tag;
}

/* -------------------------------------------------------------- findings */

export interface PlainCtx {
  /** Ledger value by id (numbers only). */
  value?: (id: string) => number | undefined;
  /** Upcoming calendar events with localized names. */
  calendar?: { id: string; name: T3; daysAway: number }[];
  hasOffer?: boolean;
  proofFacts?: number;
}

/** Plain two-sentence finding for a fired rule, or null for rules we never show as a finding. */
export function templateFinding(rule: RuleResult, s: ChannelStats, lang: Lang, ctx: PlainCtx = {}): string | null {
  const P = (x: number) => pctText(x, lang);
  const N = (x: number, d = 0) => numText(x, lang, d);
  const v = (id: string) => ctx.value?.(id);
  const L = (t: T3) => pick(lang, t);
  const subs = s.subscribers;
  const views = s.medianViews;

  switch (rule.id) {
    case "R.COLD_START": {
      const n = s.maturePosts;
      return L({
        uz: `Kanalda ko‘rishlari bo‘yicha xulosa qilsa bo‘ladigan postlar hozircha ${n} ta — eng yaxshi vaqt va post turini aniq aytishga bu kam. Bu hafta postlarni turli vaqtda chiqarib, qaysi biri ko‘proq ko‘rilishini o‘lchaymiz; birinchi postlar sizning tasdig‘ingiz bilan chiqadi.`,
        ru: `Пока мало данных для выводов: постов, по которым уже можно судить о просмотрах, — ${n}. На этой неделе выпускаем посты в разное время и смотрим, какие собирают больше просмотров; первые посты — только с вашего одобрения.`,
        en: `There is not much to learn from yet: ${n} posts are old enough to judge by views. This week we post at different times and measure which do best; the first posts go out only with your approval.`,
      });
    }
    case "R.SUSPECT_BOOSTED": {
      const m = views != null ? N(views) : "?";
      return L({
        uz: `Postlarning ko‘rishlari bir-biriga juda o‘xshash (odatda ${m} atrofida) — bunday tekislik ko‘pincha sotib olingan ko‘rishlarda uchraydi. Obunachi yoki ko‘rish sotib olmang: postlar sonini oshirmaymiz, mijozga foydali postlarga e’tibor beramiz.`,
        ru: `Просмотры у постов почти одинаковые (обычно около ${m}) — так часто бывает при накрученных просмотрах. Не покупайте подписчиков и просмотры: частоту не повышаем, делаем ставку на полезные для клиента посты.`,
        en: `Views are almost identical from post to post (usually about ${m}), which often happens with bought views. Don't buy subscribers or views: we keep the posting rate and focus on posts that are useful to customers.`,
      });
    }
    case "R.LOW_REACH": {
      if (s.reachRate == null) return null;
      const r = P(s.reachRate);
      const band = subs ? reachBand(subs) : undefined;
      const rel = v("S.relReach") ?? v("S.bench.relReach");
      const fix = L({
        uz: " Bu hafta eng ko‘p ko‘rilgan post turidan yana bittasini qo‘shamiz va natijani obunachilar soni bilan emas, ko‘rishlar bilan o‘lchaymiz.",
        ru: " На этой неделе добавим ещё один пост в самом просматриваемом формате и будем мерить результат просмотрами, а не числом подписчиков.",
        en: " This week we add one more post in the best-viewed format and measure the result by views, not subscriber count.",
      });
      if (band && s.reachRate < band.low && subs && views != null)
        return (
          L({
            uz: `Postni obunachilarning atigi ${r} qismi ko‘radi (${N(views)} ko‘rish, ${N(subs)} obunachi); bunday kanallar uchun taxminiy me’yor — kamida ${P(band.low)}.`,
            ru: `Пост видят только ${r} подписчиков (${N(views)} просмотров при ${N(subs)} подписчиках); ориентир для каналов такого размера — от ${P(band.low)}.`,
            en: `Only ${r} of subscribers see a post (${N(views)} views, ${N(subs)} subscribers); a rule of thumb for channels this size is at least ${P(band.low)}.`,
          }) + fix
        );
      if (rel != null && rel < 1)
        return (
          L({
            uz: `Postni obunachilarning ${r} qismi ko‘radi — bu o‘xshash kanallardagidan taxminan ${lessPct(rel)}% kam.`,
            ru: `Пост видят ${r} подписчиков — примерно на ${lessPct(rel)}% меньше, чем у похожих каналов.`,
            en: `${r} of subscribers see a post — about ${lessPct(rel)}% less than similar channels.`,
          }) + fix
        );
      return null;
    }
    case "R.INCONSISTENT": {
      const ppw = N(s.postsPerWeek, 1);
      const gap = s.maxGapDays != null ? Math.round(s.maxGapDays) : undefined;
      return L({
        uz: `Kanalga haftasiga o‘rtacha ${ppw} ta post chiqadi${gap ? `, eng uzun tanaffus — ${gap} kun` : ""}. Bu hafta 3–4 ta postni aniq kun va soatga qo‘yamiz; birinchisi — «biz ishlayapmiz» posti: yangilik, haqiqiy surat, manzil va ish vaqti.`,
        ru: `Постов в неделю в среднем: ${ppw}${gap ? ` (самый долгий перерыв — ${gap} дн.)` : ""}. На этой неделе ставим 3–4 поста на конкретные дни и часы; первый — «мы на связи»: что нового, живое фото, адрес и часы работы.`,
        en: `The channel posts ${ppw} times a week on average${gap ? ` (longest gap: ${gap} days)` : ""}. This week we put 3–4 posts on fixed days and hours, starting with a "we're here" post: what's new, a real photo, address and opening hours.`,
      });
    }
    case "R.OVERPOSTING": {
      const ppw = N(s.postsPerWeek, 1);
      const target = Math.max(5, Math.round(0.7 * s.postsPerWeek));
      const drop = s.viewTrend != null && s.viewTrend < 1 ? lessPct(s.viewTrend) : undefined;
      return L({
        uz: `Kanalga haftasiga ${ppw} ta post chiqmoqda, ${drop ? `ko‘rishlar esa oldingi postlarga nisbatan ${drop}% kamaygan` : "ko‘rishlar esa o‘xshash kanallarnikidan past"}. Postlarni haftasiga ${target} taga kamaytirib, eng ko‘p ko‘rilgan turlarini qoldiramiz.`,
        ru: `Постов в неделю: ${ppw}, ${drop ? `а просмотры упали на ${drop}% к прошлым постам` : "а просмотры ниже, чем у похожих каналов"}. Сокращаем до ${target} постов в неделю и оставляем самые просматриваемые форматы.`,
        en: `The channel posts ${ppw} times a week ${drop ? `and views are down ${drop}% on earlier posts` : "and views are lower than in similar channels"}. We cut to ${target} posts a week and keep the best-viewed formats.`,
      });
    }
    case "R.DECLINING": {
      if (s.viewTrend == null) return null;
      const drop = lessPct(s.viewTrend);
      // Same split as stats.ts: 15 vs 15 from 30 posts on, otherwise the two halves of what there is.
      const recent = s.maturePosts >= 30 ? 15 : Math.floor(s.maturePosts / 2);
      const earlier = s.maturePosts >= 30 ? 15 : s.maturePosts - recent;
      const cause = String(rule.data?.cause ?? "");
      const fm = /^format (\w+)/.exec(cause);
      const hr = /^hour ([\d-]+)/.exec(cause);
      const causeText: T3 | null = fm
        ? { uz: `${fmt(fm[1]).uzLow} postlar ulushi`, ru: `доля ${fmt(fm[1]).ruGen}`, en: `the share of ${fmt(fm[1]).enLow}` }
        : /^promo/.test(cause)
          ? { uz: "aksiya postlari ulushi", ru: "доля акционных постов", en: "the share of promotions" }
          : hr
            ? { uz: `${timeRange(hr[1])} oralig‘idagi postlar ulushi`, ru: `доля постов в ${timeRange(hr[1])}`, en: `the share of posts at ${timeRange(hr[1])}` }
            : null;
      return (
        L({
          uz: `Oxirgi ${recent} ta post oldingi ${earlier} tadan ${drop}% kam ko‘rilgan.`,
          ru: `Последние ${recent} постов набрали на ${drop}% меньше просмотров, чем ${earlier} до них.`,
          en: `The last ${recent} posts got ${drop}% fewer views than the ${earlier} before them.`,
        }) +
        (causeText
          ? L({
              uz: ` Eng ko‘p o‘zgargani — ${causeText.uz}; bu taxmin, bu hafta tekshiramiz.`,
              ru: ` Сильнее всего изменилась ${causeText.ru}: это гипотеза, на этой неделе проверим.`,
              en: ` The biggest change is ${causeText.en}; that's a hypothesis we test this week.`,
            })
          : L({
              uz: " Bu hafta nima o‘zgarganini solishtirib, sababini tekshiramiz.",
              ru: " На этой неделе сравним, что изменилось, и проверим причину.",
              en: " This week we compare what changed and test the cause.",
            }))
      );
    }
    case "R.NEVER_ASKS":
      return L({
        uz: `Postlarning atigi ${P(s.saleShare)} qismi mahsulot yoki xizmatni sotishga qaratilgan. Bu hafta kamida 2 ta sotuv posti qo‘shamiz — narxi va buyurtma havolasi bilan.`,
        ru: `Только ${P(s.saleShare)} постов предлагают что-то купить. На этой неделе добавим минимум 2 продающих поста — с ценой и ссылкой для заказа.`,
        en: `Only ${P(s.saleShare)} of posts ask people to buy something. This week we add at least 2 sale posts with a price and an order link.`,
      });
    case "R.OVERSELLING": {
      const share = P(Math.max(s.saleShare, s.promoShare));
      const lift = s.saleLiftMedian?.value;
      const drop = lift != null && lift < 1 ? lessPct(lift) : undefined;
      return L({
        uz: `Postlarning ${share} qismi sotuv yoki aksiya${drop ? `, lekin bunday postlar oddiylaridan ${drop}% kam ko‘riladi` : ""}. Sotuv postlarini haftasiga 2 tagacha qisqartiramiz, har biridan oldin ishonch posti qo‘yamiz; katta chegirma o‘rniga kichik bonus taklif qilamiz.`,
        ru: `${share} постов — продажи или акции${drop ? `, но такие посты набирают на ${drop}% меньше просмотров, чем обычные` : ""}. Сокращаем продающие посты до 2 в неделю, перед каждым — пост на доверие; вместо большой скидки — небольшой бонус.`,
        en: `${share} of posts are sales or promotions${drop ? `, but they get ${drop}% fewer views than ordinary posts` : ""}. We cut sale posts to 2 a week, each after a trust post, and offer a small bonus instead of a bigger discount.`,
      });
    }
    case "R.HIDDEN_PRICE": {
      const parts: string[] = [];
      if (s.priceShareInSale != null && s.priceShareInSale < 0.5)
        parts.push(
          L({
            uz: `Sotuv postlarining faqat ${P(s.priceShareInSale)} qismida narx yozilgan.`,
            ru: `Цена указана только в ${P(s.priceShareInSale)} продающих постов.`,
            en: `Only ${P(s.priceShareInSale)} of sale posts show a price.`,
          }),
        );
      if (s.hiddenPriceCount >= 1)
        parts.push(
          L({
            uz: `${s.hiddenPriceCount} ta postda «narxi lichkada» deyilgan.`,
            ru: `Постов с «ценой в личке»: ${s.hiddenPriceCount}.`,
            en: `Posts that say "price in DM": ${s.hiddenPriceCount}.`,
          }),
        );
      if (!parts.length) return null;
      return `${parts.join(" ")}${L({
        uz: " Endi har bir sotuv postida narx bo‘ladi — «narxi lichkada» yozmaymiz.",
        ru: " Теперь в каждом продающем посте будет цена — без «цены в личке».",
        en: ' From now on every sale post shows the price — no "price in DM".',
      })}`;
    }
    case "R.DEAD_ENDS":
      return L({
        uz: `Postlarning faqat ${P(s.ctaRate)} qismida o‘quvchiga keyingi qadam aytilgan («buyurtma bering», «yozing», havola yoki telefon). Har bir postga bitta aniq qadam qo‘shamiz; sotuv postlarida u birinchi 3 qatorda bo‘ladi.`,
        ru: `Только в ${P(s.ctaRate)} постов читателю сказано, что делать дальше («закажите», «напишите», ссылка или телефон). В каждый пост добавим один понятный шаг; в продающих — в первых 3 строках.`,
        en: `Only ${P(s.ctaRate)} of posts tell the reader what to do next ("order", "write to us", a link or a phone). Every post gets one clear next step; in sale posts it goes in the first 3 lines.`,
      });
    case "R.TRUST_GAP": {
      const missing = Object.keys(TRUST_PART).filter((k) => !s.trustParts.includes(k));
      const fix = L({
        uz: " Bu hafta 2 ta ishonch posti qo‘shamiz: manzil, xarita va ish vaqti, jamoa yoki ish jarayonidan haqiqiy surat. Sizdan: 3 ta haqiqiy mijoz fikri (ruxsati bilan).",
        ru: " На этой неделе добавим 2 поста на доверие: адрес, карта и часы работы, живое фото команды или процесса. От вас: 3 настоящих отзыва (с разрешения клиентов).",
        en: " This week we add 2 trust posts: address, map and hours, a real photo of the team or the work. From you: 3 real customer reviews (with their consent).",
      });
      if (s.trustCoverage <= 2 && missing.length)
        return (
          L({
            uz: `Mijoz ishonishi uchun kerak bo‘lgan 5 ta narsadan kanalda ${s.trustCoverage} tasi bor; yo‘q: ${missing.map((k) => TRUST_PART[k].uz).join(", ")}.`,
            ru: `Из 5 вещей, которые вызывают доверие, в канале есть ${s.trustCoverage}; нет: ${missing.map((k) => TRUST_PART[k].ru).join(", ")}.`,
            en: `The channel shows ${s.trustCoverage} of the 5 things that build trust; missing: ${missing.map((k) => TRUST_PART[k].en).join(", ")}.`,
          }) + fix
        );
      if (ctx.proofFacts != null)
        return (
          L({
            uz: `Bizda biznesingiz haqida isbotlar kam: raqamlar, yillar yoki mijoz fikrlari — ${ctx.proofFacts} ta.`,
            ru: `О бизнесе мало доказательств: цифр, лет работы или отзывов — ${ctx.proofFacts}.`,
            en: `There is little proof about the business: numbers, years in business or reviews — ${ctx.proofFacts}.`,
          }) + fix
        );
      return null;
    }
    case "R.FORMAT_WINNER": {
      const winner = rule.data?.winner as string | undefined;
      const losers = (rule.data?.losers as string[] | undefined) ?? [];
      const key = winner ?? losers[0];
      if (!key) return null;
      const ratio = v(`S.formatLift.${key}`);
      const n = s.formatLift[key]?.n;
      if (ratio == null || n == null) return null;
      const f = fmt(key);
      if (winner)
        return L({
          uz: `${f.uz} boshqalaridan o‘rtacha ${morePct(ratio)}% ko‘proq ko‘riladi (${n} ta post bo‘yicha). Bu hafta shunday postlardan yana 2 ta qo‘shamiz.`,
          ru: `${f.ru} набирают в среднем на ${morePct(ratio)}% больше просмотров (по ${n} постам). На этой неделе добавим ещё 2 таких поста.`,
          en: `${f.en} get ${morePct(ratio)}% more views than other posts on average (${n} posts). This week we add 2 more of them.`,
        });
      return L({
        uz: `${f.uz} boshqalaridan o‘rtacha ${lessPct(ratio)}% kam ko‘riladi (${n} ta post bo‘yicha). Bunday postni haftasiga bittadan oshirmaymiz.`,
        ru: `${f.ru} набирают в среднем на ${lessPct(ratio)}% меньше просмотров (по ${n} постам). Оставляем не больше одного такого поста в неделю.`,
        en: `${f.en} get ${lessPct(ratio)}% fewer views than other posts on average (${n} posts). We keep them to one a week at most.`,
      });
    }
    case "R.TIME_WINNER": {
      const bucket = rule.data?.bucket as string | undefined;
      if (bucket) {
        const ratio = v(`S.hourLift.${bucket}`);
        const n = s.hourLift[bucket]?.n;
        if (ratio == null || n == null) return null;
        const t = timeRange(bucket);
        return L({
          uz: `${t} oralig‘ida chiqqan postlar boshqa vaqtdagilardan ${morePct(ratio)}% ko‘proq ko‘riladi (${n} ta post). Sotuv postlarini shu vaqtga qo‘yamiz.`,
          ru: `Посты, вышедшие в ${t}, набирают на ${morePct(ratio)}% больше просмотров, чем в другое время (по ${n} постам). Продающие посты ставим на это время.`,
          en: `Posts published ${t} get ${morePct(ratio)}% more views than at other times (${n} posts). Sale posts go into this window.`,
        });
      }
      if (s.hourConcentration == null || !s.busiestHourBucket) return null;
      const t = timeRange(s.busiestHourBucket);
      return L({
        uz: `Postlarning ${P(s.hourConcentration)} qismi bir xil vaqtda — ${t} — chiqadi, shuning uchun boshqa vaqt yaxshiroqmi, hali noma’lum. Bu hafta bitta postni boshqa vaqtda chiqarib sinab ko‘ramiz.`,
        ru: `${P(s.hourConcentration)} постов выходят в одно и то же время — ${t}, поэтому неизвестно, не лучше ли другое. На этой неделе выпустим один пост в другое время и сравним.`,
        en: `${P(s.hourConcentration)} of posts go out at the same time (${t}), so we don't know yet whether another time works better. This week one post goes out at a different time to compare.`,
      });
    }
    case "R.LANGUAGE_WINNER": {
      const [a, b] = rule.ids.map((id) => id.replace(/^S\.langLift\./, ""));
      const va = v(rule.ids[0]);
      const vb = v(rule.ids[1]);
      if (!a || !b || !LANG_NAME[a] || !LANG_NAME[b] || va == null || vb == null || vb <= 0) return null;
      const more = morePct(va / vb);
      const A = langName(a);
      const B = langName(b);
      return L({
        uz: `${A.uz} tilidagi postlar ${B.uz.toLowerCase()} tilidagilardan ${more}% ko‘proq ko‘riladi. Asosiy til — ${A.uz.toLowerCase()}; boshqa tildagi matnni alohida post qilamiz, bitta postda aralashtirmaymiz.`,
        ru: `Посты на ${A.ruPrep} набирают на ${more}% больше просмотров, чем на ${B.ruPrep}. Основной язык — ${A.ruNom}; текст на другом языке — отдельным постом, не вперемешку.`,
        en: `Posts in ${A.en} get ${more}% more views than posts in ${B.en}. ${A.en} stays the main language; the other goes in a separate post, never mixed into one.`,
      });
    }
    case "R.REPLICATE_WINNERS": {
      const tags = ((rule.data?.features as string[] | undefined) ?? []).map((t) => tagText(t, lang)).filter(Boolean);
      if (!tags.length) return null;
      return L({
        uz: `Eng ko‘p ko‘rilgan 5 ta postning kamida 3 tasida umumiy jihat bor: ${tags.join(", ")}; eng kam ko‘rilganlarda bu deyarli yo‘q. Bu hafta 2 ta postda shu usulni takrorlaymiz.`,
        ru: `У минимум 3 из 5 самых просматриваемых постов есть общее: ${tags.join(", ")}; у самых слабых этого почти нет. На этой неделе повторим этот приём в 2 постах.`,
        en: `At least 3 of the 5 best-viewed posts share this: ${tags.join(", ")}; the weakest posts almost never do. This week we repeat it in 2 posts.`,
      });
    }
    case "R.COMPETITOR_OUTPERFORMS": {
      const ch = (rule.data?.channels as string[] | undefined)?.[0];
      const theirs = ch ? v(`S.comp.${ch}.reachRate`) : undefined;
      if (!ch || theirs == null || s.reachRate == null) return null;
      return L({
        uz: `@${ch} kanalida postni obunachilarning ${P(theirs)} qismi ko‘radi, sizda — ${P(s.reachRate)}. Ularning eng yaxshi postlari qanday tuzilganini ko‘rib chiqamiz va formatini moslaymiz (matnini emas).`,
        ru: `У @${ch} пост видят ${P(theirs)} подписчиков, у вас — ${P(s.reachRate)}. Разберём, как устроены их лучшие посты, и возьмём формат (не текст).`,
        en: `@${ch} reaches ${P(theirs)} of its subscribers per post; you reach ${P(s.reachRate)}. We study how their best posts are built and borrow the format, never the text.`,
      });
    }
    case "R.VALIDATED_OFFER": {
      const o = (rule.data?.offers as { channel: string; offer: string; n: number }[] | undefined)?.[0];
      if (!o) return null;
      const name = OFFER[o.offer] ?? { uz: o.offer, ru: o.offer, en: o.offer };
      return L({
        uz: `@${o.channel} so‘nggi 60 kunda «${name.uz}» taklifini ${o.n} marta ishlatgan — demak, u mijozlarga yoqmoqda. Shunga o‘xshash taklifni sinab ko‘rishimiz mumkin: shartlari va muddatini o‘zingiz aytasiz.`,
        ru: `@${o.channel} за последние 60 дней ${o.n} раз использовал предложение «${name.ru}» — похоже, оно работает. Можем протестировать похожее: условия и срок — за вами.`,
        en: `@${o.channel} used ${name.en} ${o.n} times in the last 60 days, so it seems to work. We can test something similar; you set the terms and the deadline.`,
      });
    }
    case "R.CALENDAR": {
      const events = ((rule.data?.events as { id: string; name: string; daysAway: number }[] | undefined) ?? []).slice(0, 2);
      if (!events.length) return null;
      const named = events.map((e) => ({ ...e, local: ctx.calendar?.find((c) => c.id === e.id)?.name ?? { uz: e.name, ru: e.name, en: e.name } }));
      const when = named
        .map((e) =>
          L({
            uz: `${e.local.uz} — ${e.daysAway} kundan keyin`,
            ru: `${e.local.ru} — через ${e.daysAway} дн.`,
            en: `${e.local.en} is ${e.daysAway} days away`,
          }),
        )
        .join("; ");
      return `${when}${lang === "ru" ? "" : "."}${L(
        ctx.hasOffer
          ? {
              uz: " 2–4 kun oldin taklif posti va o‘sha kuni eslatma tayyorlaymiz (sizning tasdig‘ingiz bilan).",
              ru: " За 2–4 дня — пост с предложением, в сам день — напоминание (с вашего одобрения).",
              en: " We prepare a sale post 2–4 days before and a reminder on the day (with your approval).",
            }
          : {
              uz: " Shu kunga bitta foydali post tayyorlaymiz (sizning tasdig‘ingiz bilan).",
              ru: " К этому дню подготовим один полезный пост (с вашего одобрения).",
              en: " We prepare one useful post for the day (with your approval).",
            },
      )}`;
    }
    case "R.NOISE": {
      const parts: T3[] = [];
      if (s.emojiPer100 > 3) parts.push({ uz: `100 belgiga ${N(s.emojiPer100, 1)} ta emoji`, ru: `${N(s.emojiPer100, 1)} эмодзи на 100 знаков`, en: `${N(s.emojiPer100, 1)} emoji per 100 characters` });
      if (s.hashtagsPerPost > 3) parts.push({ uz: `har postda o‘rtacha ${N(s.hashtagsPerPost, 1)} ta heshteg`, ru: `хештегов на пост в среднем: ${N(s.hashtagsPerPost, 1)}`, en: `${N(s.hashtagsPerPost, 1)} hashtags per post on average` });
      if (s.forwardShare > 0.35) parts.push({ uz: `postlarning ${P(s.forwardShare)} qismi boshqa kanallardan ulashilgan`, ru: `${P(s.forwardShare)} постов — пересылки из других каналов`, en: `${P(s.forwardShare)} of posts are forwards from other channels` });
      if (s.neuroDensity > 1) parts.push({ uz: "shablon iboralar ko‘p", ru: "много шаблонных фраз", en: "a lot of stock phrases" });
      if (!parts.length) return null;
      return L({
        uz: `Postlarda «shovqin» ko‘p: ${parts.map((p) => p.uz).join(", ")}. Postlarni tozalaymiz: 3 tagacha emoji, 2 tagacha heshteg, o‘z ma’lumotlaringizdan yozilgan matn.`,
        ru: `В постах много «шума»: ${parts.map((p) => p.ru).join(", ")}. Чистим: до 3 эмодзи, до 2 хештегов, текст из ваших фактов.`,
        en: `The posts are noisy: ${parts.map((p) => p.en).join(", ")}. We clean them up: up to 3 emoji, up to 2 hashtags, text written from your own facts.`,
      });
    }
    default:
      return null;
  }
}

/* ------------------------------------------------- LLM text, plain check */

const TECH = [
  /\b[SRPFW]\.[A-Za-z_]/, // S.reachRate, R.DEAD_ENDS, P.chan/12
  /\b[FW]\d+\b/, // F3, W1
  /\bn\s*=\s*\d/i, // n=12
  /\d\s*×/, // 1.4×
  /\b(lift|CV|ctr|reachRate|ctaRate|saleShare|promoShare|priceShareInSale|hiddenPrice\w*|trustCoverage|viewTrend|viewCV|postsPerWeek|maxGap\w*|formatLift|hourLift|langLift|relReach|maturePosts|medianViews|forwardShare|emojiPer100|hashtagsPerPost|neuroDensity|hourConcentration|R_[A-Z]+)\b/,
  /\b[a-z]+[A-Z][a-zA-Z]+\b/, // any leftover camelCase identifier
];

/** Marketing/engine jargon an owner should not have to decode (any language). */
const JARGON = /\b(slot\w*|CTA|KPI|funnel|engagement|benchmark|prior|awareness|conversion|baseline|ledger)\b|слот|воронк|бенчмарк|конверси|охват\w* \(reach\)/i;

/** Strips ledger citations; returns null when the sentence still reads like a developer's log or mixes languages. */
export function plainOrNull(text: string, lang: Lang = "uz"): string | null {
  const t = stripIdsAll(text.replace(/\s*\[[^\]]*\]\s*$/g, ""));
  if (t.length < 20) return null;
  if (TECH.some((re) => re.test(t)) || JARGON.test(t)) return null;
  // English glosses inside uz/ru text ("ориентир (rule of thumb)") read as machine output.
  if (lang !== "en" && /\b(rule of thumb|neighbou?ring posts|per week|views)\b/i.test(t)) return null;
  return t;
}

/* ----------------------------------------------------------- evidence */

const LABEL: Record<string, T3> = {
  "S.subscribers": { uz: "obunachilar", ru: "подписчики", en: "subscribers" },
  "S.postsAnalyzed": { uz: "o‘qilgan postlar", ru: "прочитано постов", en: "posts read" },
  "S.maturePosts": { uz: "ko‘rishlari to‘plangan postlar", ru: "постов с устоявшимися просмотрами", en: "posts with settled views" },
  "S.medianViews": { uz: "odatdagi ko‘rishlar", ru: "обычно просмотров", en: "typical views" },
  "S.recentMedianViews": { uz: "yangi post odatda oladigan ko‘rishlar", ru: "обычно просмотров у новых постов", en: "typical views of new posts" },
  "S.reachRate": { uz: "postni ko‘radigan obunachilar", ru: "доля подписчиков, видящих пост", en: "subscribers who see a post" },
  "S.viewsAboveSubs": { uz: "ko‘rishlar obunachilardan ko‘p", ru: "просмотров больше, чем подписчиков", en: "views exceed subscribers" },
  "S.reachBandLow": { uz: "taxminiy me’yor", ru: "ориентир", en: "rule of thumb" },
  "S.postsPerWeek": { uz: "haftasiga postlar", ru: "постов в неделю", en: "posts a week" },
  "S.maxGapDays": { uz: "eng uzun tanaffus, kun", ru: "самый долгий перерыв, дн.", en: "longest gap, days" },
  "S.saleShare": { uz: "sotuv postlari", ru: "продающих постов", en: "sale posts" },
  "S.promoShare": { uz: "aksiya postlari", ru: "акционных постов", en: "promotions" },
  "S.ctaRate": { uz: "keyingi qadam aytilgan postlar", ru: "постов с призывом", en: "posts with a next step" },
  "S.forwardShare": { uz: "ulashilgan (forward) postlar", ru: "пересылок", en: "forwards" },
  "S.priceShareInSale": { uz: "narxi yozilgan sotuv postlari", ru: "продающих постов с ценой", en: "sale posts with a price" },
  "S.hiddenPriceCount": { uz: "«narxi lichkada» postlar", ru: "постов «цена в личке»", en: '"price in DM" posts' },
  "S.trustCoverage": { uz: "ishonch belgilari (5 tadan)", ru: "признаков доверия (из 5)", en: "trust signals (of 5)" },
  "S.viewTrend": { uz: "oxirgi postlar ko‘rishi / oldingilar", ru: "просмотры новых постов к прежним", en: "views of recent posts vs earlier ones" },
  "S.emojiPer100": { uz: "emoji, 100 belgiga", ru: "эмодзи на 100 знаков", en: "emoji per 100 characters" },
  "S.hashtagsPerPost": { uz: "heshteglar, bir postda", ru: "хештегов на пост", en: "hashtags per post" },
  "S.relReach": { uz: "qamrov raqobatchilarga nisbatan", ru: "охват относительно конкурентов", en: "reach vs competitors" },
  "S.bench.relReach": { uz: "qamrov o‘xshash kanallarga nisbatan", ru: "охват относительно похожих каналов", en: "reach vs similar channels" },
  "S.hourConcentration": { uz: "bir vaqtda chiqqan postlar", ru: "постов в одно и то же время", en: "posts at the same time of day" },
};

/** "postni ko‘radigan obunachilar: 52.4% · 30 ta post" — plain evidence for a finding (ids the owner can't read are dropped). */
const DAY_NAMES: Record<string, T3> = {
  Mon: { uz: "dushanba", ru: "в понедельник", en: "Monday" },
  Tue: { uz: "seshanba", ru: "во вторник", en: "Tuesday" },
  Wed: { uz: "chorshanba", ru: "в среду", en: "Wednesday" },
  Thu: { uz: "payshanba", ru: "в четверг", en: "Thursday" },
  Fri: { uz: "juma", ru: "в пятницу", en: "Friday" },
  Sat: { uz: "shanba", ru: "в субботу", en: "Saturday" },
  Sun: { uz: "yakshanba", ru: "в воскресенье", en: "Sunday" },
};
const FORMAT_LABEL: Record<string, T3> = {
  text: { uz: "matnli postlar", ru: "текстовые посты", en: "text posts" },
  photo: { uz: "suratli postlar", ru: "посты с фото", en: "photo posts" },
  album: { uz: "albomlar", ru: "альбомы", en: "albums" },
  video: { uz: "video postlar", ru: "видео", en: "video posts" },
  other: { uz: "boshqa postlar", ru: "другие посты", en: "other posts" },
};
const LANG_LABEL: Record<string, T3> = {
  "uz-Latn": { uz: "lotincha postlar", ru: "посты на латинице", en: "posts in Uzbek (Latin)" },
  "uz-Cyrl": { uz: "kirillcha postlar", ru: "посты на кириллице", en: "posts in Uzbek (Cyrillic)" },
  ru: { uz: "ruscha postlar", ru: "посты на русском", en: "posts in Russian" },
  en: { uz: "inglizcha postlar", ru: "посты на английском", en: "posts in English" },
  mixed: { uz: "aralash tildagi postlar", ru: "посты на двух языках", en: "posts in two languages" },
};
const LENGTH_LABEL: Record<string, T3> = {
  "<300": { uz: "qisqa postlar (300 belgigacha)", ru: "короткие посты (до 300 знаков)", en: "short posts (under 300 characters)" },
  "300-800": { uz: "o‘rtacha postlar (300–800 belgi)", ru: "средние посты (300–800 знаков)", en: "medium posts (300–800 characters)" },
  ">800": { uz: "uzun postlar (800 belgidan ko‘p)", ru: "длинные посты (больше 800 знаков)", en: "long posts (over 800 characters)" },
};

/** Labels for the per-bucket ids (S.hourLift.19-22, S.weekdayLift.Mon, S.formatLift.photo…); the raw key is in e.label. */
function bucketLabel(id: string, e: LedgerEntry): T3 | undefined {
  const m = /^S\.(formatLift|hourLift|weekdayLift|langLift|lengthLift)\./.exec(id);
  if (!m) return undefined;
  const key = String(e.label).split(" ").slice(1).join(" ");
  if (m[1] === "hourLift") {
    const h = /^(\d{1,2})-(\d{1,2})$/.exec(key);
    if (!h) return undefined;
    const span = `${h[1].padStart(2, "0")}:00–${h[2].padStart(2, "0")}:00`;
    return { uz: `${span} dagi postlar`, ru: `посты в ${span}`, en: `posts at ${span}` };
  }
  if (m[1] === "weekdayLift") {
    const d = DAY_NAMES[key];
    return d && { uz: `${d.uz} kungi postlar`, ru: `посты ${d.ru}`, en: `${d.en} posts` };
  }
  if (m[1] === "formatLift") return FORMAT_LABEL[key];
  if (m[1] === "langLift") return LANG_LABEL[key];
  return LENGTH_LABEL[key];
}

export function evidenceText(ids: string[], ledger: Map<string, LedgerEntry>, lang: Lang): string {
  const out: string[] = [];
  for (const id of ids) {
    const e = ledger.get(id);
    if (!e || e.source === "rule") continue;
    if (e.source === "post") {
      if (e.url) out.push(`${pick(lang, { uz: "post", ru: "пост", en: "post" })}: ${e.url}`);
      continue;
    }
    const label = LABEL[id] ?? bucketLabel(id, e);
    if (!label) continue;
    const v = typeof e.value === "number" ? e.value : undefined;
    // A bucket with too few posts has no number to show ("n=2"): it is not evidence the owner can read.
    if (v == null && /^n=/.test(e.display)) continue;
    const display =
      v != null && /%$/.test(e.display)
        ? pctText(v, lang)
        : v != null && /×$/.test(e.display)
          ? `${v >= 1 ? "+" : "−"}${Math.round(Math.abs(v - 1) * 100)}%` // ratios read as a change: 0.66× -> −34%
          : e.display;
    out.push(`${pick(lang, label)}: ${display}`);
  }
  return [...new Set(out)].join(" · ");
}

/** Owner-readable "why" for a top post: "2.1 baravar ko‘p ko‘rilgan · surat · 19:00–22:00 · narx yozilgan". */
export function whyText(post: RawPost, lift: number, lang: Lang): string {
  const x = features(post);
  const ratio = numText(lift, lang, 1);
  const bits = [
    pick(lang, {
      uz: `qo‘shni postlardan ${ratio} baravar ko‘p ko‘rilgan`,
      ru: `в ${ratio} раза больше просмотров, чем у соседних постов`,
      en: `${ratio} times the views of neighbouring posts`,
    }),
    pick(lang, { uz: fmt(post.media).uzLow, ru: fmt(post.media).ru.toLowerCase(), en: fmt(post.media).enLow }),
  ];
  if (x.hourBucket) bits.push(timeRange(x.hourBucket));
  if (x.hasPrice) bits.push(tagText("hasPrice", lang));
  if (x.isPromo) bits.push(tagText("isPromo", lang));
  if (x.questionHook) bits.push(tagText("questionHook", lang));
  if (x.hasCTA) bits.push(tagText("hasCTA", lang));
  return bits.join(" · ");
}
