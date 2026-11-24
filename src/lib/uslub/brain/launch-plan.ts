/**
 * Launch plan skeleton for a fresh channel (0–few subscribers, no history). Pure.
 * Two weeks, 9 posts: the pinned "who we are / what we sell / how to order" post first, then product,
 * trust, one launch offer and two posts that invite replies. Times are rule-of-thumb Tashkent hours
 * (there is no channel data to learn them from yet).
 */
import type { Goal } from "../contract";
import type { Lang } from "./types";

export type LaunchKind = "intro" | "product" | "trust" | "tip" | "offer" | "question";

export interface LaunchSlot {
  slot: number;
  day: string; // ISO date (Tashkent)
  time: string;
  goal: Goal;
  kind: LaunchKind;
  format: string;
  pinned: boolean;
  needsApproval: boolean;
}

const PATTERN: { dayOffset: number; time: string; kind: LaunchKind; goal: Goal; format: string }[] = [
  { dayOffset: 0, time: "12:40", kind: "intro", goal: "trust", format: "photo" },
  { dayOffset: 1, time: "20:40", kind: "product", goal: "sale", format: "photo" },
  { dayOffset: 3, time: "12:40", kind: "trust", goal: "trust", format: "photo" },
  { dayOffset: 5, time: "20:40", kind: "product", goal: "sale", format: "photo" },
  { dayOffset: 7, time: "12:40", kind: "tip", goal: "reach", format: "text" },
  { dayOffset: 8, time: "20:40", kind: "trust", goal: "trust", format: "photo" },
  { dayOffset: 10, time: "12:40", kind: "offer", goal: "sale", format: "photo" },
  { dayOffset: 12, time: "20:40", kind: "product", goal: "sale", format: "photo" },
  { dayOffset: 13, time: "12:40", kind: "question", goal: "reach", format: "text" },
];

const DAY = 86_400_000;
const TZ = 5 * 3_600_000; // Asia/Tashkent, UTC+5, no DST

/** ISO date (Tashkent) `offset` days after tomorrow. */
export function tashkentDay(now: number, offset: number): string {
  return new Date(now + TZ + (offset + 1) * DAY).toISOString().slice(0, 10);
}

export function launchSkeleton(now: number): LaunchSlot[] {
  return PATTERN.map((p, i) => ({
    slot: i + 1,
    day: tashkentDay(now, p.dayOffset),
    time: p.time,
    goal: p.goal,
    kind: p.kind,
    format: p.format,
    pinned: p.kind === "intro",
    // The first posts of a new channel, the offer and anything with a price are the owner's call.
    needsApproval: i < 3 || p.kind === "offer",
  }));
}

/** What each kind of slot is for (the writer's instruction, English). */
export const KIND_BRIEF: Record<LaunchKind, string> = {
  intro:
    "Pinned first post: who we are, what we sell (2–4 concrete products/services from the description), where/how we work, exactly how to order (the contact from the description; if there is none, 'write to us here'). Warm, short, no hype.",
  product: "One product or service from the description: what it is, who it's for, price only if the description gives it (otherwise invite people to ask the admin for the price), how to order.",
  trust: "Why people can rely on this business: how it is made or done, the people behind it, the place, hygiene/quality steps, delivery terms — only what the description says; otherwise ask the owner for a real photo of the process.",
  tip: "A useful tip customers can use today, connected to the product (how to choose, store, use, care). No selling in the first lines.",
  offer: "One simple launch offer for the first customers, only if the description gives one. Otherwise a 'first customers' post that invites people to ask the admin about the current offer — never name a discount, gift or deadline nobody gave.",
  question: "A question or a two-option choice that invites replies (which flavour, what to add to the menu). Short.",
};

/** Ways to get the first subscribers for a brand-new channel in Uzbekistan (the writer adapts 3–5 of them). */
export const GROWTH_IDEAS = [
  "existing customers: send the channel link personally to current customers, regulars, friends and family; ask them to forward it",
  "QR code with the channel link at the counter, on packaging, receipts, stickers and the delivery bag",
  "cross-posts with 2–3 nearby non-competing channels of the same district or audience (mahalla, school parents, local news)",
  "local Telegram groups of the district/mahalla/housing complex: one helpful post, following each group's rules",
  "Instagram bio and stories, WhatsApp/Telegram status: channel link with one reason to join",
  "a reason to join: something only channel subscribers get (first to see new items, a small bonus on the first order)",
];

// A price is a number with a currency word (any suffix: so'mdan, so'mga, so'mlik, сўмдан, сумов, долларов) or with a
// thousands word that ends the phrase («180 ming», «150 тыс.», «150k»). Years and customer counts are not prices:
// «2010 yildan», «1000 dan ortiq mijoz», «5 ming obunachi», «100 sumka», «сумки». \p{L} look-arounds, not \b
// (JavaScript's \b ignores Cyrillic).
const PRICE_NUM = String.raw`\d(?:[\d\s.,]*\d)?`;
const PRICE_CUR = String.raw`(?:so['‘’ʻ]m\p{L}*|som(?:dan|ga|lik|ni|da)?(?!\p{L})|sum(?:dan|ga|lik|ni|da)?(?!\p{L})|сўм\p{L}*|сум(?:ов|а|ы|ах|ам|ами)?(?!\p{L})|uzs(?!\p{L})|usd(?!\p{L})|у\.\s?е\.|долл\p{L}*|\$)`;
const PRICE_MULT = String.raw`(?:ming|минг|тысяч\p{L}*|тыс\.?|млн|mln|k)`;
const PRICE_RE = new RegExp(
  `${PRICE_NUM}\\s*(?:${PRICE_MULT}\\s*)?${PRICE_CUR}|${PRICE_NUM}\\s*${PRICE_MULT}(?![\\p{L}\\d])(?!\\s*\\p{L})|\\$\\s?\\d`,
  "iu",
);
const ADDRESS_RE = /(ko['‘’ʻ`]?cha|mahalla|tuman|rayon|улиц|район|массив|mavze|kvartal|orientir|mo['‘’ʻ`]?ljal|chilonzor|yunusobod|sergeli|yakkasaroy|mirobod|olmazor|uchtepa|shayxontohur|bektemir|yashnobod|mirzo|ulug['‘’ʻ`]?bek|chirchiq|samarqand|buxoro|farg['‘’ʻ`]?ona|andijon|namangan|xorazm|toshkent|ташкент|address|street|юнусабад|чиланзар|мирзо|улугбек|сергел|яккасара|мирабад|алмазар|учтеп|шайхантах|бектемир|яшнабад|чирчик|самарканд|бухар|фергана|андижан|наманган|хорезм)/i;
const CONTACT_RE = /(\+?998[\s-]?\d{2}|\b\d{2}[\s-]\d{3}[\s-]\d{2}[\s-]\d{2}\b|@[A-Za-z][\w]{3,}|t\.me\/|instagram)/i;

export interface DescriptionSignals {
  hasPrice: boolean;
  hasAddress: boolean;
  hasContact: boolean;
}

export function descriptionSignals(text: string): DescriptionSignals {
  return { hasPrice: PRICE_RE.test(text), hasAddress: ADDRESS_RE.test(text), hasContact: CONTACT_RE.test(text) };
}

const Q: Record<Lang, { price: string; address: string; contact: string; proof: string; photo: string }> = {
  uz: {
    price: "Asosiy mahsulot yoki xizmatlaringiz narxi qancha? Sotuv postlari narx bilan chiqadi.",
    address: "Qayerdasiz yoki qaysi hududlarga yetkazib berasiz? Ish vaqtingiz qanday?",
    contact: "Buyurtma qanday qabul qilinadi: telefon, Telegram akkaunt yoki bot?",
    proof: "Mijozlaringizdan 2–3 ta haqiqiy fikr (ruxsati bilan) yoki raqamlar bormi: necha yildan beri ishlaysiz, nechta buyurtma qilgansiz?",
    photo: "Birinchi postlar uchun 3–5 ta haqiqiy surat yuboring: mahsulot, ish jarayoni, o‘zingiz yoki jamoa.",
  },
  ru: {
    price: "Сколько стоят основные товары или услуги? Продающие посты выходят с ценой.",
    address: "Где вы находитесь или в какие районы доставляете? Какие часы работы?",
    contact: "Как принимаете заказы: телефон, аккаунт в Telegram или бот?",
    proof: "Есть 2–3 настоящих отзыва клиентов (с разрешением) или цифры: сколько лет работаете, сколько заказов сделали?",
    photo: "Пришлите 3–5 настоящих фото для первых постов: товар, процесс, вы или команда.",
  },
  en: {
    price: "What do your main products or services cost? Sale posts go out with a price.",
    address: "Where are you, or which areas do you deliver to? What are your hours?",
    contact: "How do people order: phone, a Telegram account or a bot?",
    proof: "Do you have 2–3 real customer reviews (with consent) or numbers: years in business, orders made?",
    photo: "Send 3–5 real photos for the first posts: the product, the process, you or the team.",
  },
};

/** What we must ask the owner before the launch posts can be complete. */
export function launchQuestions(sig: DescriptionSignals, lang: Lang): string[] {
  const q = Q[lang];
  return [...(sig.hasPrice ? [] : [q.price]), ...(sig.hasContact ? [] : [q.contact]), ...(sig.hasAddress ? [] : [q.address]), q.proof, q.photo];
}

const S: Record<Lang, { noData: string; prices: string; noPrices: string; proof: string; time: string }> = {
  uz: {
    noData: "Kanal ma’lumoti hali yo‘q: kanal yangi, ko‘rishlar va obunachilar hali kam. Reja tavsifingiz asosida tuzildi; birinchi raqamlarni 2 haftadan keyin o‘lchaymiz.",
    prices: "Narxlar: tavsifingizda bor, postlarda shu narxlar ishlatiladi.",
    noPrices: "Narxlar: tavsifda yo‘q — sotuv postlari hozircha narxni adminga so‘rashga chaqiradi; narxlarni yuborsangiz, postlarga qo‘shamiz.",
    proof: "Ishonch dalillari (mijoz fikrlari, raqamlar): hali yo‘q — ularni birinchi haftada yig‘amiz.",
    time: "Vaqtlar: kanal ma’lumoti yo‘qligi uchun taxminiy (12:40 va 20:40); 2 haftadan keyin o‘zingizning ko‘rishlaringiz bo‘yicha aniqlaymiz.",
  },
  ru: {
    noData: "Данных канала пока нет: канал новый, просмотров и подписчиков мало. План составлен по вашему описанию; первые цифры замерим через 2 недели.",
    prices: "Цены: есть в описании, посты используют их.",
    noPrices: "Цены: в описании нет — пока продающие посты предлагают уточнить цену у администратора; пришлите цены, и мы добавим их в посты.",
    proof: "Доказательства (отзывы, цифры): пока нет — соберём их в первую неделю.",
    time: "Время: ориентировочное (12:40 и 20:40), данных канала ещё нет; через 2 недели уточним по вашим просмотрам.",
  },
  en: {
    noData: "No channel data yet: the channel is new, with few views and subscribers. The plan is built from your description; we measure the first numbers in 2 weeks.",
    prices: "Prices: in your description; the posts use them.",
    noPrices: "Prices: not in the description — for now sale posts invite people to ask the admin; send your prices and we add them.",
    proof: "Proof (reviews, numbers): none yet — we collect it in the first week.",
    time: "Times: rule of thumb (12:40 and 20:40) because there is no channel data; in 2 weeks we tune them to your own views.",
  },
};

export function launchSufficiency(sig: DescriptionSignals, lang: Lang) {
  const t = S[lang];
  return [
    { key: "channel", status: "insufficient" as const, n: 0, need: 1, text: t.noData },
    { key: "bestTime", status: "prior" as const, n: 0, need: 3, text: t.time },
    sig.hasPrice
      ? { key: "prices", status: "data" as const, n: 1, need: 1, text: t.prices }
      : { key: "prices", status: "insufficient" as const, n: 0, need: 1, text: t.noPrices },
    { key: "proof", status: "insufficient" as const, n: 0, need: 2, text: t.proof },
  ];
}

const K: Record<Lang, { posts: string; subs: string; orders: string; howPosts: string; howSubs: string; howOrders: string }> = {
  uz: {
    posts: "2 haftada chiqqan postlar",
    subs: "Birinchi obunachilar (taxminiy maqsad)",
    orders: "Kanal orqali kelgan buyurtmalar",
    howPosts: "Kanalni o‘qib sanaymiz",
    howSubs: "Kanal sahifasidagi obunachilar soni, 14-kuni",
    howOrders: "Kanal orqali kelgan har bir buyurtmani o‘zingiz yozib boring (masalan, telefon eslatmasida)",
  },
  ru: {
    posts: "Постов за 2 недели",
    subs: "Первые подписчики (ориентир)",
    orders: "Заказы из канала",
    howPosts: "Считаем по каналу",
    howSubs: "Число подписчиков на странице канала на 14-й день",
    howOrders: "Записывайте каждый заказ, пришедший из канала (например, в заметках телефона)",
  },
  en: {
    posts: "Posts published in 2 weeks",
    subs: "First subscribers (rough goal)",
    orders: "Orders from the channel",
    howPosts: "Counted from the channel",
    howSubs: "Subscriber count on the channel page on day 14",
    howOrders: "Note down every order that came from the channel (for example in your phone's notes)",
  },
};

export function launchKpis(slots: number, lang: Lang) {
  const t = K[lang];
  return [
    { metric: t.posts, baseline: 0, target: slots, how: t.howPosts },
    { metric: t.subs, baseline: 0, target: 50, how: t.howSubs },
    { metric: t.orders, baseline: 0, target: 3, how: t.howOrders },
  ];
}
