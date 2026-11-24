import type { ChannelAudit, ContentPlan, Strategy } from "@/lib/uslub/contract";

/* Sample analysis for the fictional demo brand. Live mode replaces it with real channel data. */

export const MOCK_AUDIT: ChannelAudit = {
  channel: "@kanalingiz",
  title: "Nafis — ayollar kiyimi",
  subscribers: 4820,
  postsAnalyzed: 60,
  postsPerWeek: 3.5,
  avgViews: 1310,
  reachRate: 0.27,
  bestHours: [12, 19, 20, 21],
  bestWeekdays: [3, 5, 6],
  formatMix: { photo: 0.58, album: 0.22, text: 0.12, video: 0.08 },
  topPosts: [
    { url: "https://t.me/kanalingiz/412", views: 3900, why: "Mijoz obrazi: real ayol, bo'yi va razmeri yozilgan" },
    { url: "https://t.me/kanalingiz/398", views: 3150, why: "Narx aniq: «690 000 so'm», razmerlar ro'yxati bilan" },
    { url: "https://t.me/kanalingiz/377", views: 2740, why: "15 soniyalik video: bitta palto, uch obraz" },
  ],
  findings: [
    { kind: "strength", text: "Mijoz obrazlari o'rtacha postdan 2,6 barobar ko'p ko'riladi", evidence: "12 ta obraz posti, median 3 400 ko'rish" },
    { kind: "problem", text: "Postlarning 40% i 10:00 da chiqadi — eng past soat", evidence: "10:00 dagi median 760 ko'rish, 20:00 da 1 690" },
    { kind: "opportunity", text: "Video atigi 8%, lekin eng yuqori qamrov videoda", evidence: "5 ta video, median 2 300 ko'rish" },
    { kind: "problem", text: "Har uchinchi postda chaqiriq (CTA) yo'q", evidence: "60 tadan 21 tasida @kanalingiz_admin yoki savol yo'q" },
  ],
  benchmark: [
    { channel: "@raqobatchi_moda", subscribers: 12400, avgViews: 2100, reachRate: 0.17, postsPerWeek: 9 },
    { channel: "@palto_uz", subscribers: 3100, avgViews: 980, reachRate: 0.32, postsPerWeek: 4 },
  ],
};

export const MOCK_STRATEGY: Strategy = {
  positioning:
    "Toshkentdagi sifatli va sokin uslubni yoqtiradigan ayollar uchun Nafis — razmerini oldindan aniq aytib beradigan kiyim do'koni; bozordagi tasodifiy tanlovdan farqli, har bir narsani real odamda ko'rsatadi.",
  audiences: [
    {
      name: "Ishlaydigan ayollar, 28–40",
      job: "Ishga ham, tadbirga ham mos bitta yaxshi palto topish",
      pains: ["Razmer to'g'ri kelmasligi", "Bozorda vaqt yo'qotish"],
      triggers: ["Birinchi sovuq kunlar", "Black Friday"],
      whereTheyAre: ["Ofis chatlari", "Mahalla onalar guruhlari"],
    },
    {
      name: "Talabalar, 18–24",
      job: "Arzon, lekin chiroyli trikotaj",
      pains: ["Byudjet cheklangan"],
      triggers: ["Stipendiya kuni", "Chegirma kodlari"],
      whereTheyAre: ["Universitet kanallari", "Instagram bloggerlari"],
    },
  ],
  offer: "Razmerni yozing — 10 daqiqada mos variantlar rasmini yuboramiz, Toshkent bo'ylab 1 kunda yetkazamiz.",
  proofPoints: ["2019-yildan beri Olmazorda", "Mijoz obrazlari — real xaridorlar", "1 kunda yetkazib berish"],
  pillars: [
    { name: "Mijoz obrazlari", goal: "trust", share: 0.35, examples: ["Dilnoza opa: karamel palto, M"] },
    { name: "Razmer va mato bo'yicha maslahat", goal: "reach", share: 0.25, examples: ["Paltoni qanday tanlash kerak"] },
    { name: "Yangi kelganlar", goal: "sale", share: 0.25, examples: ["Qishki trikotaj, 4 rang"] },
    { name: "Aksiyalar", goal: "sale", share: 0.15, examples: ["Black Friday: 30–50%"] },
  ],
  kpis: [
    { metric: "O'rtacha ko'rish", baseline: 1310, target: 1700, how: "Postlarni 19:00–21:00 ga ko'chirish" },
    { metric: "Qamrov (ko'rish / obunachi)", baseline: 0.27, target: 0.33, how: "Haftada 1 ta video" },
    { metric: "Haftalik buyurtma so'rovlari", target: 25, how: "Har postda aniq chaqiriq" },
  ],
  risks: ["Chegirmalar ko'payib ketsa, brend arzon ko'rinadi", "Video tayyorlash vaqt talab qiladi"],
};

const d = (day: number) => `2026-11-${String(23 + day).padStart(2, "0")}`;

export const MOCK_PLAN: ContentPlan = {
  weekOf: "2026-11-23",
  rationale: "Eng yaxshi soatlar 19:00–21:00, obraz postlari ishonch beradi, Black Friday payshanbadan boshlanadi.",
  items: [
    { day: d(0), time: "19:00", goal: "reach", pillar: "Razmer va mato bo'yicha maslahat", format: "Albom", hook: "Paltoni qanday tanlaysiz: 3 ta o'lchov", cta: "Bo'yingizni yozing — tanlab beramiz", brief: "Razmer tanlash maslahati", metric: "Saqlashlar", needsApproval: false },
    { day: d(1), time: "20:00", goal: "sale", pillar: "Yangi kelganlar", format: "Rasm", hook: "Qishki trikotaj keldi: 4 rang", cta: "Rangni tanlang, @kanalingiz_admin", brief: "Yangi qishki trikotaj", metric: "Buyurtma so'rovlari", needsApproval: true },
    { day: d(2), time: "12:00", goal: "trust", pillar: "Mijoz obrazlari", format: "Rasm", hook: "Dilnoza opa: karamel palto, M", cta: "Sizga qaysi razmer?", brief: "Mijoz obrazi", metric: "Izohlar", needsApproval: true },
    { day: d(3), time: "19:00", goal: "sale", pillar: "Aksiyalar", format: "Albom", hook: "Black Friday: 30–50% chegirma", cta: "Razmeringizni yozing", brief: "Black Friday e'loni", metric: "Buyurtma so'rovlari", needsApproval: true },
    { day: d(4), time: "20:00", goal: "reach", pillar: "Aksiyalar", format: "Reels", hook: "Bitta palto — uch obraz", cta: "Saqlab qo'ying", brief: "Reels", metric: "Ko'rishlar", needsApproval: true },
    { day: d(5), time: "21:00", goal: "trust", pillar: "Mijoz obrazlari", format: "Rasm", hook: "Shanba obrazi: sharf va jinsi", cta: "Qaysi biri yoqdi?", brief: "Dam olish obrazi", metric: "Izohlar", needsApproval: false },
    { day: d(6), time: "19:00", goal: "sale", pillar: "Aksiyalar", format: "Matn", hook: "Black Friday oxirgi kuni", cta: "Bugun 21:00 gacha", brief: "Oxirgi kun eslatmasi", metric: "Buyurtma so'rovlari", needsApproval: true },
  ],
};
