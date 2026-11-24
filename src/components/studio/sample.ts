/**
 * Sample data for `?mock=1` only: a made-up bakery, always shown under a "Namuna" banner.
 * Never used as a fallback for a real channel.
 */
import type { BrandProfile, ChannelAudit, ContentPlan, Goal, PostDraft } from "@/lib/uslub/contract";
import { latinToCyrillic } from "@/lib/uslub/translit";
import type { Lang } from "../ui/lang";

type L3 = Record<Lang, string>;

const FINDINGS: { kind: "problem" | "opportunity"; text: L3; evidence: L3 }[] = [
  {
    kind: "problem",
    text: {
      uz: "Narx deyarli yozilmaydi. Narxni postning o‘zida yozing, «qancha turadi?» degan savollar kamayadi.",
      ru: "Цену почти не пишут. Указывайте цену прямо в посте, и вопросов «сколько стоит?» станет меньше.",
      en: "Prices are almost never shown. Put the price in the post and you get fewer “how much?” questions.",
    },
    evidence: {
      uz: "Sotuv postlarining 12 tasidan faqat 1 tasida narx bor.",
      ru: "Цена есть только в 1 из 12 продающих постов.",
      en: "Only 1 of 12 sales posts shows a price.",
    },
  },
  {
    kind: "problem",
    text: {
      uz: "Postlarning ko‘pi kechqurun chiqadi, odamlar esa ertalab ko‘radi. Asosiy postlarni 7:00–9:00 da joylang.",
      ru: "Большинство постов выходит вечером, а читают утром. Главные посты публикуйте в 7:00–9:00.",
      en: "Most posts go out in the evening, but people read in the morning. Post the main ones at 7:00–9:00.",
    },
    evidence: {
      uz: "Ertalabki postlar o‘rtacha 820 marta, kechkilari 430 marta ko‘rilgan.",
      ru: "Утренние посты в среднем набирают 820 просмотров, вечерние — 430.",
      en: "Morning posts average 820 views, evening ones 430.",
    },
  },
  {
    kind: "opportunity",
    text: {
      uz: "Rasmli postlar ikki baravar ko‘p ko‘riladi. Har postga issiq non rasmini qo‘ying.",
      ru: "Посты с фото смотрят вдвое чаще. Добавляйте к каждому посту фото горячего хлеба.",
      en: "Posts with a photo get twice the views. Add a photo of fresh bread to every post.",
    },
    evidence: {
      uz: "Rasmli: o‘rtacha 740 ko‘rish, rasmsiz: 350.",
      ru: "С фото: в среднем 740 просмотров, без фото: 350.",
      en: "With a photo: 740 views on average, without: 350.",
    },
  },
];

const PLAN: { day: number; time: string; goal: Goal; hook: L3 }[] = [
  { day: 0, time: "07:30", goal: "sale", hook: { uz: "Ertalabki patir: narxi va manzili", ru: "Утренняя патыр: цена и адрес", en: "Morning patir: price and address" } },
  { day: 1, time: "08:00", goal: "trust", hook: { uz: "Tandirni soat 5 da yoqamiz", ru: "Мы разжигаем тандыр в 5 утра", en: "We light the tandir at 5 a.m." } },
  { day: 2, time: "07:30", goal: "sale", hook: { uz: "Oldindan buyurtma, navbatsiz", ru: "Заказ заранее, без очереди", en: "Order ahead, skip the queue" } },
  { day: 3, time: "12:00", goal: "reach", hook: { uz: "Qaysi non nimaga mos", ru: "Какой хлеб к чему", en: "Which bread goes with what" } },
  { day: 4, time: "07:30", goal: "sale", hook: { uz: "Juma oshiga katta patir", ru: "Большая патыр к пятничному плову", en: "A large patir for Friday plov" } },
  { day: 5, time: "09:00", goal: "trust", hook: { uz: "Novvoyimiz Akmal aka bilan tanishing", ru: "Знакомьтесь: наш пекарь Акмаль-ака", en: "Meet our baker, Akmal aka" } },
  { day: 6, time: "10:00", goal: "reach", hook: { uz: "Yakshanba nonushtasi: 3 ta g‘oya", ru: "Воскресный завтрак: 3 идеи", en: "Sunday breakfast: 3 ideas" } },
];

const POSTS: { uz: string; ru: string; en: string }[] = [
  {
    uz: "Ertalab 7:00 dan issiq patir bor 🫓\n\nKatta patir — 12 000 so‘m, kichigi — 7 000 so‘m. Chilonzor 9-kvartal, bozor yonida.\n\nOldindan buyurtma uchun adminga yozing — soat 7 ga tayyorlab qo‘yamiz.",
    ru: "С 7:00 утра горячие лепёшки 🫓\n\nБольшой патыр — 12 000 сум, маленький — 7 000 сум. Чиланзар, 9-й квартал, рядом с базаром.\n\nЗаказ заранее: напишите админу, приготовим к 7 утра.",
    en: "Hot flatbread from 7:00 in the morning 🫓\n\nLarge patir — 12,000 UZS, small — 7,000 UZS. Chilonzor, block 9, next to the bazaar.\n\nOrder ahead: message the admin and we’ll have it ready by 7.",
  },
  {
    uz: "Tandirni har kuni soat 5 da yoqamiz. Bir soatda kerakli issiqlik chiqadi. Shundan keyingina birinchi xamir kiradi.\n\nShuning uchun patirimizning tagi qarsillaydi, ichi yumshoq bo‘ladi.\n\nErtalab o‘tib keting, issig‘idan oling.",
    ru: "Тандыр мы разжигаем каждый день в 5 утра. За час он набирает нужный жар. Только потом идёт первое тесто.\n\nПоэтому у нашего патыра хрустящее дно и мягкая середина.\n\nЗаходите утром, берите горячий.",
    en: "We light the tandir at 5 every morning. It takes an hour to reach the right heat. Only then does the first dough go in.\n\nThat’s why our patir is crisp underneath and soft inside.\n\nCome by in the morning and take one hot.",
  },
  {
    uz: "Oldindan buyurtma bersangiz, navbat kutmaysiz.\n\nKechqurun adminga yozing: qaysi non va nechta. Ertalab 7:00 da nomingiz yozilgan qopda tayyor turadi.\n\nPatir — 12 000 so‘m, obi non — 5 000 so‘m.",
    ru: "Закажите заранее и не стойте в очереди.\n\nВечером напишите админу: какой хлеб и сколько. В 7:00 утра всё будет готово, в пакете с вашим именем.\n\nПатыр — 12 000 сум, оби нон — 5 000 сум.",
    en: "Order ahead and skip the queue.\n\nMessage the admin in the evening: which bread and how many. It’ll be ready at 7:00, in a bag with your name on it.\n\nPatir — 12,000 UZS, obi non — 5,000 UZS.",
  },
  {
    uz: "Qaysi non nimaga mos?\n\nSho‘rvaga — obi non: ichi yumshoq, sho‘rvani yaxshi shimib oladi. Oshga — yupqa patir. Choyga — kunjutli kulcha.\n\nSiz qaysi birini ko‘proq olasiz?",
    ru: "Какой хлеб к чему?\n\nК шурпе — оби нон: мягкий, хорошо впитывает бульон. К плову — тонкий патыр. К чаю — кульча с кунжутом.\n\nА вы какой берёте чаще?",
    en: "Which bread goes with what?\n\nWith shurpa — obi non: soft, it soaks up the broth. With plov — a thin patir. With tea — sesame kulcha.\n\nWhich one do you buy most?",
  },
  {
    uz: "Juma kuni uyda osh bo‘lsa, katta patirni oldindan buyurtma qiling.\n\nKatta patir — 12 000 so‘m. Payshanba kechqurungacha adminga yozing, juma ertalab 7:00 da tayyor bo‘ladi.\n\nChilonzor 9-kvartal, bozor yonida.",
    ru: "Если в пятницу дома плов, закажите большой патыр заранее.\n\nБольшой патыр — 12 000 сум. Напишите админу до вечера четверга, в пятницу в 7:00 будет готово.\n\nЧиланзар, 9-й квартал, рядом с базаром.",
    en: "Having plov at home on Friday? Order a large patir ahead.\n\nLarge patir — 12,000 UZS. Message the admin by Thursday evening and it’ll be ready on Friday at 7:00.\n\nChilonzor, block 9, next to the bazaar.",
  },
];

function monday(): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  const shift = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - shift + 7); // next week's Monday
  return d;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The sample bakery's channel: the Studio's sample and the landing's sign. */
export const SAMPLE_CHANNEL = "@namuna";

export function sampleBrand(lang: Lang): BrandProfile {
  const L = <T,>(v: Record<Lang, T>) => v[lang];
  return {
    id: "sample",
    mode: "channel",
    knowledge: "",
    samplePosts: [],
    createdAt: new Date().toISOString(),
    dna: {
      name: "Tandir non",
      oneLiner: L({ uz: "Chilonzordagi tandir non va patir do‘koni", ru: "Пекарня тандырного хлеба и патыр на Чиланзаре", en: "A tandir bread and patir bakery in Chilonzor" }),
      audience: L({ uz: "atrofdagi oilalar, ertalab ishga ketayotganlar", ru: "семьи по соседству и те, кто утром идёт на работу", en: "families nearby and people on their way to work" }),
      tone: L({ uz: "iliq, qisqa, uydagidek", ru: "тёплый, короткий, по-домашнему", en: "warm, short, homely" }),
      address: "siz",
      emojiDensity: "low",
      avgPostLength: 320,
      ctaStyle: L({ uz: "«Adminga yozing, olib qo‘yamiz»", ru: "«Напишите админу, отложим для вас»", en: "“Message the admin, we’ll keep one for you”" }),
      hashtags: [],
      recurringFormats: [],
      products: ["patir", "obi non", "kulcha"],
      doList: [],
      dontList: [],
      languages: ["uz_latn", "ru"],
    },
  };
}

export function sampleAudit(lang: Lang): ChannelAudit {
  return {
    channel: SAMPLE_CHANNEL,
    title: "Tandir non",
    subscribers: 2140,
    postsAnalyzed: 60,
    postsPerWeek: 3.2,
    avgViews: 610,
    reachRate: 0.285,
    bestHours: [7, 8],
    bestWeekdays: [0, 4],
    formatMix: { text: 0.55, photo: 0.45 },
    topPosts: [],
    findings: FINDINGS.map((f) => ({ kind: f.kind, text: f.text[lang], evidence: f.evidence[lang] })),
  };
}

export function samplePlan(lang: Lang): ContentPlan {
  const mon = monday();
  return {
    weekOf: iso(mon),
    rationale: "",
    items: PLAN.map((p) => {
      const d = new Date(mon);
      d.setDate(mon.getDate() + p.day);
      return {
        day: iso(d),
        time: p.time,
        goal: p.goal,
        pillar: p.goal,
        format: "photo",
        hook: p.hook[lang],
        cta: "",
        brief: p.hook[lang],
        metric: "",
        needsApproval: p.goal === "sale",
      };
    }),
  };
}

export function samplePosts(lang: Lang): PostDraft[] {
  const plan = samplePlan(lang);
  return POSTS.map((p, i) => {
    const it = plan.items[i];
    return {
      id: `sample-${i + 1}`,
      brandId: "sample",
      brief: it.hook,
      variants: { uz_latn: p.uz, uz_cyrl: latinToCyrillic(p.uz), ru: p.ru, en: p.en },
      neuroHits: {},
      humanScore: 92,
      status: "draft",
      slot: { day: it.day, time: it.time, goal: it.goal, hook: it.hook, cta: it.cta },
      createdAt: new Date().toISOString(),
    };
  });
}
