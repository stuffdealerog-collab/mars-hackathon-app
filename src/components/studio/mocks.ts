import type {
  BrandProfile,
  Flow,
  NeuroHit,
  PostDraft,
  RadarLead,
  Script,
  VideoPlan,
} from "@/lib/uslub/contract";
import { toCyrillic } from "./translit";

/* Sample data for the prototype. Business is fictional. */

export const MOCK_BRAND: BrandProfile = {
  id: "demo-nafis",
  channel: "@nafis_kiyim",
  knowledge:
    "Nafis — Toshkent, Olmazor tumanidagi ayollar kiyimi do'koni (Chorsu yonida). 2019-yildan beri. Kuzgi-qishki paltolar, trikotaj, sharflar. Narxlar: palto 690 000 – 1 450 000 so'm, sviter 240 000 – 380 000 so'm. Ish vaqti 10:00–21:00. Yetkazib berish Toshkent bo'ylab 1 kunda. Buyurtma: @nafis_admin.",
  samplePosts: [],
  createdAt: "2026-11-24T09:00:00.000Z",
  dna: {
    name: "Nafis",
    oneLiner: "Toshkentdagi ayollar kiyimi do'koni: paltolar, trikotaj, sharflar",
    audience: "25–45 yoshli ayollar, Toshkent, sifatli va sokin uslubni yoqtiradi",
    tone: "Iliq, xotirjam, maqtanchoqliksiz. Do'kondagi sotuvchi kabi gapiradi.",
    address: "siz",
    emojiDensity: "low",
    avgPostLength: 420,
    ctaStyle: "Aniq qadam: «@nafis_admin ga razmeringizni yozing»",
    hashtags: ["#nafis", "#toshkentkiyim", "#palto", "#trikotaj"],
    recurringFormats: ["Yangi kelgan mahsulot", "Mijoz obrazi", "Razmer bo'yicha maslahat", "Haftalik chegirma"],
    products: ["Kuzgi palto", "Qishki palto", "Trikotaj sviter", "Kashemir sharf"],
    doList: ["Narxni aniq yozish", "Razmerlarni ko'rsatish", "Manzil va ish vaqtini qo'shish"],
    dontList: ["«Ajoyib imkoniyat» kabi umumiy so'zlar", "Bosim o'tkazuvchi taymerlar", "3 tadan ortiq emoji"],
    languages: ["uz_latn", "uz_cyrl", "ru"],
  },
};

function hits(text: string, list: [string, string][]): NeuroHit[] {
  return list
    .map(([phrase, suggestion]) => ({ phrase, suggestion, index: text.indexOf(phrase) }))
    .filter((h) => h.index >= 0);
}

function draft(
  id: string,
  brief: string,
  latn: string,
  ru: string,
  en: string,
  neuro: { uz: [string, string][]; ru: [string, string][]; en: [string, string][] },
  humanScore: number,
): PostDraft {
  const cyrl = toCyrillic(latn);
  const cyrlHits: [string, string][] = neuro.uz.map(([p, s]) => [toCyrillic(p), toCyrillic(s)]);
  return {
    id,
    brandId: MOCK_BRAND.id,
    brief,
    variants: { uz_latn: latn, uz_cyrl: cyrl, ru, en },
    neuroHits: {
      uz_latn: hits(latn, neuro.uz),
      uz_cyrl: hits(cyrl, cyrlHits),
      ru: hits(ru, neuro.ru),
      en: hits(en, neuro.en),
    },
    humanScore,
    status: "draft",
    createdAt: "2026-11-24T09:05:00.000Z",
  };
}

export const MOCK_POSTS: PostDraft[] = [
  draft(
    "p-bf-1",
    "Black Friday e'loni",
    "Black Friday Nafis'da 27-noyabrdan boshlanadi 🛍\n\nKuzgi paltolar, trikotaj va sharflarga 30% dan 50% gacha chegirma. Bu ajoyib imkoniyatni qo'ldan boy bermang! Chegirma do'konda ham, kanal orqali buyurtmada ham amal qiladi.\n\nOlmazor, Chorsu yonida, 10:00–21:00.\nRazmeringizni @nafis_admin ga yozing.\n\n#nafis #palto",
    "Black Friday в Nafis начинается 27 ноября 🛍\n\nОсенние пальто, трикотаж и шарфы со скидкой от 30% до 50%. Не упустите уникальную возможность! Скидка действует в магазине и при заказе через канал.\n\nОлмазор, рядом с Чорсу, 10:00–21:00.\nНапишите свой размер @nafis_admin.\n\n#nafis #palto",
    "Black Friday at Nafis starts on November 27 🛍\n\nAutumn coats, knitwear and scarves are 30–50% off. Don't miss this unique opportunity! The discount works in store and for orders through the channel.\n\nOlmazor, next to Chorsu, 10:00–21:00.\nSend your size to @nafis_admin.\n\n#nafis #palto",
    {
      uz: [["Bu ajoyib imkoniyatni qo'ldan boy bermang!", "Ommabop razmerlar birinchi kuniyoq tugaydi."]],
      ru: [["Не упустите уникальную возможность!", "Ходовые размеры разбирают в первый же день."]],
      en: [["Don't miss this unique opportunity!", "Popular sizes usually sell out on day one."]],
    },
    78,
  ),
  draft(
    "p-bf-2",
    "Yangi qishki trikotaj",
    "Qishki trikotaj keldi. Bu zamonaviy va sifatli yechim sovuq kunlar uchun.\n\nYumshoq merinos, 4 xil rang: sut, karamel, grafit, olcha. Razmerlar S–XL, narxi 290 000 so'm.\n\nKiyib ko'rish uchun do'konga keling yoki rasmini @nafis_admin dan so'rang.",
    "Зимний трикотаж уже в магазине. Это современное и качественное решение для холодных дней.\n\nМягкий мериносовый трикотаж, 4 цвета: молочный, карамель, графит, вишня. Размеры S–XL, цена 290 000 сум.\n\nПримерьте в магазине или попросите фото у @nafis_admin.",
    "Winter knitwear is in. It is a modern and high-quality solution for cold days.\n\nSoft merino in 4 colours: milk, caramel, graphite and cherry. Sizes S–XL, 290,000 sum.\n\nTry it on in store or ask @nafis_admin for photos.",
    {
      uz: [["Bu zamonaviy va sifatli yechim sovuq kunlar uchun.", "Ichiga issiq, tashqarisi tikanak emas."]],
      ru: [["Это современное и качественное решение для холодных дней.", "Тёплый и совсем не колется."]],
      en: [["It is a modern and high-quality solution for cold days.", "Warm, and it doesn't itch."]],
    },
    84,
  ),
  draft(
    "p-bf-3",
    "Mijoz obrazi: karamel palto",
    "Dilnoza opa karamel paltoni sut rang sviter bilan oldi. Bo'yi 165, razmeri M — yelkasi bemalol, uzunligi tizzadan sal pastda.\n\nShu obraz Black Friday kuni 980 000 o'rniga 690 000 so'm.\n\nSizga qaysi razmer kerak? @nafis_admin",
    "Дилноза-опа взяла карамельное пальто с молочным свитером. Рост 165, размер M — в плечах свободно, длина чуть ниже колена.\n\nВ Black Friday этот образ стоит 690 000 сум вместо 980 000.\n\nКакой размер нужен вам? @nafis_admin",
    "Dilnoza chose the caramel coat with a milk-coloured sweater. Height 165, size M: room in the shoulders, length just below the knee.\n\nOn Black Friday this look is 690,000 sum instead of 980,000.\n\nWhich size do you need? @nafis_admin",
    { uz: [], ru: [], en: [] },
    94,
  ),
  draft(
    "p-tip-4",
    "Razmer bo'yicha maslahat",
    "Paltoning razmerini qanday tanlaysiz? Yelkadan yelkagacha o'lchang va sviter ustidan kiyishni hisobga oling: odatdagi razmeringizdan bir o'lcham kattasini oling.\n\nIkkilansangiz, bo'yingiz va vazningizni yozing — biz tanlab beramiz.",
    "Как выбрать размер пальто? Измерьте ширину плеч и учтите, что пальто носят поверх свитера: берите на размер больше обычного.\n\nСомневаетесь — напишите рост и вес, мы подберём.",
    "How do you pick a coat size? Measure shoulder to shoulder and remember it goes over a sweater: take one size up from your usual.\n\nNot sure? Send us your height and weight and we will pick one for you.",
    { uz: [], ru: [], en: [] },
    96,
  ),
];

export const MOCK_LEADS: RadarLead[] = [
  {
    kind: "telegram_group",
    name: "Chilonzor va Olmazor onalari",
    why: "Mahalladagi 25–40 yoshli ayollar kiyim va bolalar narsalarini shu yerda maslahatlashadi.",
    action: "Admin bilan kelishib, guruh a'zolari uchun −10% kod joylash",
  },
  {
    kind: "telegram_channel",
    name: "Toshkent chegirmalari",
    why: "Black Friday haftasida odamlar aynan chegirma kanallarini kuzatadi.",
    action: "26-noyabrga bitta reklama post sotib olish",
  },
  {
    kind: "instagram",
    name: "Kundalik obraz bloggerlari (Toshkent)",
    why: "Auditoriyangiz kiyimni real odamda ko'rib tanlaydi.",
    action: "2 ta bloggerga palto berib, halol sharh so'rash",
  },
  {
    kind: "marketplace",
    name: "Uzum Market — ayollar kiyimi",
    why: "Do'konga kela olmaydiganlar shu yerda qidiradi.",
    action: "10 ta eng ko'p sotiladigan mahsulotni joylash",
  },
  {
    kind: "website",
    name: "Yandex va Google xaritalar",
    why: "«Palto Chorsu» deb qidirganlar do'konni xaritadan topadi.",
    action: "Kartochkani to'ldirish: 6 ta rasm, ish vaqti, telefon",
  },
  {
    kind: "event",
    name: "Qishki yarmarka (dekabr, Toshkent)",
    why: "Yangi yil oldidan sovg'a qidiradigan xaridorlar oqimi.",
    action: "Sharflar bilan kichik stend olish",
  },
  {
    kind: "telegram_group",
    name: "Ofis xodimlari chatlari (Yunusobod)",
    why: "Ish kiyimi va paltoga ehtiyoj, tushlikda xarid qilishadi.",
    action: "Korporativ −15% taklifini HR ga yuborish",
  },
  {
    kind: "youtube",
    name: "O'zbekcha uslub va kiyim tanlash vloglari",
    why: "Razmer va mato haqida savol beradiganlar shu yerda.",
    action: "«Paltoni qanday tanlash kerak» qisqa video bilan hamkorlik",
  },
  {
    kind: "marketplace",
    name: "OLX — kiyim bo'limi",
    why: "Narxni solishtiradigan xaridorlar oldin shu yerga qaraydi.",
    action: "3 ta palto e'lonini do'kon manzili bilan joylash",
  },
  {
    kind: "other",
    name: "Universitet talabalar kengashlari",
    why: "Yosh xaridorlar trikotaj va sharfni ko'p oladi.",
    action: "Talaba guvohnomasi bilan −10% taklif",
  },
];

export const MOCK_VIDEO: VideoPlan = {
  hook: "Bitta palto — uch xil obraz. Uchinchisi Black Friday narxida.",
  musicMood: "Sokin lo-fi, 90 BPM, oxirida ritm tezlashadi",
  scenes: [
    { seconds: 2, visual: "Karamel palto ilgichda, kamera yaqinlashadi", voiceover: "Bitta palto.", caption: "1 palto" },
    { seconds: 3, visual: "Sut rang sviter bilan, ofis oldida", voiceover: "Ishga — sviter bilan.", caption: "Ish uchun" },
    { seconds: 3, visual: "Sharf va jinsi bilan, Chorsu yonida", voiceover: "Dam olishga — sharf bilan.", caption: "Dam olish" },
    { seconds: 3, visual: "Kechki ko'ylak ustidan, chiroqlar", voiceover: "Kechqurun — ko'ylak ustidan.", caption: "Kechki" },
    { seconds: 4, visual: "Narx yorlig'i: 980 000 → 690 000", voiceover: "27-noyabrdan 690 ming. Razmeringizni yozing.", caption: "@nafis_admin" },
  ],
};

const n = (id: string, kind: Flow["nodes"][number]["kind"], label: string) => ({ id, kind, label });
const e = (from: string, to: string) => ({ from, to });

export const TEMPLATES: { key: string; name: string; hint: string; task: string; flow: Flow }[] = [
  {
    key: "bir-havola",
    name: "Bir havola",
    hint: "Kanal havolasidan butun bo'lim ishga tushadi",
    task: "t.me/nafis_kiyim — butun marketingni yo'lga qo'ying",
    flow: {
      id: "f-bir-havola",
      title: "Bir havola — butun marketing bo'limi",
      nodes: [
        n("in", "input", "t.me/nafis_kiyim"),
        n("brand", "brand", "Brend DNK"),
        n("an", "analyst", "60 post tahlili"),
        n("strat", "strategist", "Strategiya + reja"),
        n("copy", "copywriter", "7 ta post"),
        n("edit", "editor", "Neyro-so'zlarsiz"),
        n("tr", "translator", "4 yozuv"),
        n("video", "video", "Reels ssenariy"),
        n("radar", "radar", "10 ta joy"),
        n("ok", "approval", "Tasdiqlash"),
        n("pub", "publisher", "Telegram"),
      ],
      edges: [
        e("in", "brand"),
        e("brand", "an"),
        e("an", "strat"),
        e("strat", "copy"),
        e("copy", "edit"),
        e("edit", "tr"),
        e("strat", "video"),
        e("strat", "radar"),
        e("tr", "ok"),
        e("video", "ok"),
        e("radar", "ok"),
        e("ok", "pub"),
      ],
    },
  },
  {
    key: "haftalik",
    name: "Haftalik kontent",
    hint: "7 kunlik postlar 4 yozuvda",
    task: "Keyingi hafta uchun 7 ta post tayyorlang",
    flow: {
      id: "f-haftalik",
      title: "Haftalik kontent",
      nodes: [
        n("in", "input", "1 hafta"),
        n("brand", "brand", "Brend ovozi"),
        n("strat", "strategist", "Kontent reja"),
        n("copy", "copywriter", "7 ta post"),
        n("edit", "editor", "Tekshiruv"),
        n("tr", "translator", "4 yozuv"),
        n("design", "designer", "Muqovalar"),
        n("ok", "approval", "Tasdiqlash"),
        n("pub", "publisher", "Telegram"),
      ],
      edges: [e("in", "brand"), e("brand", "strat"), e("strat", "copy"), e("copy", "edit"), e("edit", "tr"), e("strat", "design"), e("tr", "ok"), e("design", "ok"), e("ok", "pub")],
    },
  },
  {
    key: "aksiya",
    name: "Aksiya",
    hint: "Chegirma: postlar, muqova va Reels",
    task: "Black Friday uchun 1 haftalik kontent va Reels",
    flow: {
      id: "f-aksiya",
      title: "Black Friday aksiyasi",
      nodes: [
        n("in", "input", "Black Friday"),
        n("strat", "strategist", "Aksiya rejasi"),
        n("copy", "copywriter", "5 ta post"),
        n("edit", "editor", "Tekshiruv"),
        n("tr", "translator", "4 yozuv"),
        n("design", "designer", "Banner"),
        n("video", "video", "Reels"),
        n("ok", "approval", "Tasdiqlash"),
        n("pub", "publisher", "Telegram"),
      ],
      edges: [e("in", "strat"), e("strat", "copy"), e("copy", "edit"), e("edit", "tr"), e("strat", "design"), e("strat", "video"), e("tr", "ok"), e("design", "ok"), e("video", "ok"), e("ok", "pub")],
    },
  },
  {
    key: "mijoz",
    name: "Mijoz qidirish",
    hint: "Mijozlaringiz qayerda — va nima qilish kerak",
    task: "Yangi mijozlarni qayerdan topamiz?",
    flow: {
      id: "f-mijoz",
      title: "Mijoz qidirish",
      nodes: [n("in", "input", "Yangi mijozlar"), n("brand", "brand", "Auditoriya"), n("radar", "radar", "10 ta joy"), n("strat", "strategist", "Harakat rejasi"), n("ok", "approval", "Tasdiqlash")],
      edges: [e("in", "brand"), e("brand", "radar"), e("radar", "strat"), e("strat", "ok")],
    },
  },
  {
    key: "reels",
    name: "Reels",
    hint: "15 soniyalik video ssenariy va subtitrlar",
    task: "Yangi palto uchun 15 soniyalik Reels",
    flow: {
      id: "f-reels",
      title: "Reels",
      nodes: [n("in", "input", "Reels"), n("brand", "brand", "Uslub"), n("video", "video", "Ssenariy"), n("edit", "editor", "Matn"), n("tr", "translator", "Subtitrlar"), n("ok", "approval", "Tasdiqlash"), n("pub", "publisher", "Telegram")],
      edges: [e("in", "brand"), e("brand", "video"), e("video", "edit"), e("edit", "tr"), e("tr", "ok"), e("ok", "pub")],
    },
  },
];

/** Picks a template from the task text (mock stand-in for POST /api/uslub/plan). */
export function mockPlan(task: string): Flow {
  const t = task.toLowerCase();
  const pick = (k: string) => TEMPLATES.find((x) => x.key === k)!.flow;
  let flow: Flow;
  if (/t\.me\/|@\w{4,}|havola/.test(t)) flow = pick("bir-havola");
  else if (/mijoz|klient|client|customer|qayerda/.test(t)) flow = pick("mijoz");
  else if (/aksiya|chegirma|black friday|скидк|sale/.test(t)) flow = pick("aksiya");
  else if (/reels|tiktok|video|видео/.test(t)) flow = pick("reels");
  else flow = pick("haftalik");
  // The input node must show the channel the owner actually pasted, never the sample one.
  const channel = task.match(/(?:https?:\/\/)?t\.me\/[A-Za-z0-9_]{4,}|@[A-Za-z0-9_]{4,}/)?.[0];
  if (channel) {
    const label = channel.replace(/^https?:\/\//, "");
    flow = { ...flow, nodes: flow.nodes.map((node) => (node.kind === "input" ? { ...node, label } : node)) };
  }
  return { ...flow, title: task.trim() ? task.trim().slice(0, 80) : flow.title };
}

export const SCRIPT_LABEL: Record<Script, string> = {
  uz_latn: "O'zbek lotin",
  uz_cyrl: "Ўзбек кирилл",
  ru: "Русский",
  en: "English",
};
