/**
 * The Video tab's sample (`?mock=1` only, under the "Namuna" banner): the made-up bakery's video posts, one in each
 * state (needs a script, waits for the video, video received, queued, out, an approved idea). They live in the Video
 * tab's own store, so the sample's Posts tab and its week stay as they are. Never a fallback for a real channel.
 */
import type { PostDraft, PostSchedule, Script, VideoPlan } from "@/lib/uslub/contract";
import { latinToCyrillic } from "../../lib/uslub/translit";
import type { Lang } from "../ui/lang";

type L3 = Record<Lang, string>;
type Scene = { seconds: number; visual: L3; voiceover: L3; caption: L3 };

const DAWN: { hook: L3; scenes: Scene[]; music: L3 } = {
  hook: {
    uz: "Soat 6:00. Tandir qopqog‘i ochiladi, bug‘ ko‘tariladi.",
    ru: "6:00 утра. Открывается крышка тандыра, поднимается пар.",
    en: "6 a.m. The tandir lid opens and steam rises.",
  },
  scenes: [
    {
      seconds: 3,
      visual: { uz: "Tandir qopqog‘i ochilayotgan payt, yaqindan", ru: "Крышка тандыра открывается, крупным планом", en: "The tandir lid opening, close up" },
      voiceover: { uz: "Har kuni ertalab oltida birinchi non chiqadi.", ru: "Каждое утро в шесть выходит первый хлеб.", en: "Every morning at six the first bread comes out." },
      caption: { uz: "Soat 6:00", ru: "6:00 утра", en: "6 a.m." },
    },
    {
      seconds: 4,
      visual: { uz: "Novvoy patirni tandirdan oladi, yon tomondan", ru: "Пекарь достаёт патыр из тандыра, сбоку", en: "The baker takes a patir out of the tandir, from the side" },
      voiceover: { uz: "Mana shu patir uchun odamlar ertalab navbatga turadi.", ru: "Вот за этим патыром по утрам стоит очередь.", en: "This is the patir people queue for in the morning." },
      caption: { uz: "Issiq patir", ru: "Горячий патыр", en: "Hot patir" },
    },
    {
      seconds: 4,
      visual: { uz: "Patirni ikkiga bo‘lish, ichidan bug‘ chiqadi", ru: "Патыр разламывают, изнутри идёт пар", en: "Breaking the patir in two, steam inside" },
      voiceover: { uz: "Tagi qarsillaydi, ichi yumshoq.", ru: "Снизу хрустит, внутри мягкий.", en: "Crisp underneath, soft inside." },
      caption: { uz: "Qarsildoq", ru: "Хрустит", en: "Crisp" },
    },
    {
      seconds: 3,
      visual: { uz: "Peshtaxtadagi narx yozuvi", ru: "Ценник на прилавке", en: "The price card on the counter" },
      voiceover: { uz: "Katta patir 12 000 so‘m.", ru: "Большой патыр — 12 000 сум.", en: "A large patir is 12,000 UZS." },
      caption: { uz: "12 000 so‘m", ru: "12 000 сум", en: "12,000 UZS" },
    },
    {
      seconds: 3,
      visual: { uz: "Do‘kon eshigi va ko‘cha", ru: "Дверь пекарни и улица", en: "The bakery door and the street" },
      voiceover: { uz: "Chilonzor 9-kvartal, bozor yonida. Adminga yozing, olib qo‘yamiz.", ru: "Чиланзар, 9-й квартал, у базара. Напишите админу, отложим.", en: "Chilonzor, block 9, by the bazaar. Message the admin and we'll keep one." },
      caption: { uz: "Adminga yozing", ru: "Напишите админу", en: "Message the admin" },
    },
  ],
  music: { uz: "Tinch, iliq tong", ru: "Спокойное тёплое утро", en: "Calm, warm morning" },
};

const ORDER: { hook: L3; scenes: Scene[]; music: L3 } = {
  hook: {
    uz: "Navbatsiz non olishning bitta yo‘li bor.",
    ru: "Есть один способ взять хлеб без очереди.",
    en: "There's one way to get your bread without the queue.",
  },
  scenes: [
    {
      seconds: 3,
      visual: { uz: "Ertalabki navbat, uzoqdan", ru: "Утренняя очередь, общий план", en: "The morning queue, wide shot" },
      voiceover: { uz: "Ertalab navbat uzun bo‘ladi.", ru: "По утрам очередь длинная.", en: "The morning queue gets long." },
      caption: { uz: "Navbat?", ru: "Очередь?", en: "The queue?" },
    },
    {
      seconds: 4,
      visual: { uz: "Telefonda adminga xabar yozish, ekran yaqindan", ru: "Сообщение админу в телефоне, экран крупно", en: "Typing a message to the admin, phone screen close up" },
      voiceover: { uz: "Kechqurun adminga yozing: qaysi non va nechta.", ru: "Вечером напишите админу: какой хлеб и сколько.", en: "In the evening, message the admin: which bread and how many." },
      caption: { uz: "Kechqurun yozing", ru: "Напишите вечером", en: "Message in the evening" },
    },
    {
      seconds: 4,
      visual: { uz: "Nom yozilgan qopdagi non, peshtaxtada", ru: "Хлеб в пакете с именем на прилавке", en: "Bread in a bag with a name on it, on the counter" },
      voiceover: { uz: "Ertalab yettida nomingiz yozilgan qopda tayyor turadi.", ru: "В семь утра всё ждёт в пакете с вашим именем.", en: "At seven it's ready in a bag with your name on it." },
      caption: { uz: "7:00 da tayyor", ru: "Готово к 7:00", en: "Ready at 7:00" },
    },
    {
      seconds: 3,
      visual: { uz: "Mijoz qopni olib, jilmayib chiqib ketadi", ru: "Покупатель берёт пакет и с улыбкой уходит", en: "A customer takes the bag and walks out smiling" },
      voiceover: { uz: "Navbatsiz. Adminga yozing.", ru: "Без очереди. Напишите админу.", en: "No queue. Message the admin." },
      caption: { uz: "Navbatsiz", ru: "Без очереди", en: "No queue" },
    },
  ],
  music: { uz: "Yengil, shoshilmagan", ru: "Лёгкая, неспешная", en: "Light, unhurried" },
};

const SCRIPT: Record<Lang, Script> = { uz: "uz_latn", ru: "ru", en: "en" };

function plan(src: typeof DAWN, lang: Lang): VideoPlan {
  return {
    hook: src.hook[lang],
    scenes: src.scenes.map((s) => ({ seconds: s.seconds, visual: s.visual[lang], voiceover: s.voiceover[lang], caption: s.caption[lang] })),
    musicMood: src.music[lang],
    lang: SCRIPT[lang],
  };
}

const CAPTIONS: L3[] = [
  { uz: "Ertalab oltida birinchi non chiqadi 🫓\n\nAdminga yozing, issig‘idan olib qo‘yamiz.", ru: "В шесть утра выходит первый хлеб 🫓\n\nНапишите админу, отложим горячий.", en: "The first bread comes out at six 🫓\n\nMessage the admin and we'll keep a hot one for you." },
  { uz: "Navbatsiz non: kechqurun adminga yozing, ertalab 7:00 da tayyor.", ru: "Хлеб без очереди: напишите админу вечером, к 7:00 всё готово.", en: "Bread without the queue: message the admin in the evening, ready at 7:00." },
];

function monday(): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7); // next week's Monday
  return d;
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The sample's video posts and their queue entries, in the page language. */
export function sampleVideo(lang: Lang): { posts: PostDraft[]; schedule: Record<string, PostSchedule> } {
  const mon = monday();
  const day = (n: number) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + n);
    return iso(d);
  };
  const hookOf = (src: typeof DAWN) => src.hook[lang];
  const caption = (i: number) => {
    const uz = CAPTIONS[i].uz;
    return { uz_latn: uz, uz_cyrl: latinToCyrillic(uz), ru: CAPTIONS[i].ru, en: CAPTIONS[i].en };
  };
  const now = Date.now();
  const ago = (h: number) => new Date(now - h * 3600_000).toISOString();
  const base = (id: string, i: number, over: Partial<PostDraft>): PostDraft => ({
    id,
    brandId: "sample",
    brief: "",
    variants: caption(i),
    neuroHits: {},
    humanScore: 91,
    status: "draft",
    createdAt: ago(2),
    ...over,
  });
  const slot = (d: number, time: string, hook: string) => ({ day: day(d), time, goal: "reach" as const, hook, cta: "", format: "video" });
  const file = (seconds: number) => ({ fileId: "sample", as: "video" as const, duration: seconds, width: 720, height: 1280 });
  const queuedSlot = slot(4, "18:30", hookOf(DAWN));
  const posts: PostDraft[] = [
    base("sample-v1", 0, { slot: slot(1, "19:00", { uz: "Bir kunda nechta non pishiramiz", ru: "Сколько хлеба мы печём за день", en: "How much bread we bake in a day" }[lang]) }),
    base("sample-v2", 0, { slot: slot(2, "08:00", hookOf(DAWN)), video: { plan: plan(DAWN, lang), plannedAt: ago(1) } }),
    base("sample-v3", 1, { slot: slot(3, "19:30", hookOf(ORDER)), video: { plan: plan(ORDER, lang), plannedAt: ago(5), ...file(19) } }),
    base("sample-v4", 0, { slot: queuedSlot, status: "approved", approvedAt: ago(3), video: { plan: plan(DAWN, lang), plannedAt: ago(30), ...file(24) } }),
    base("sample-v5", 1, {
      slot: { ...slot(0, "08:00", hookOf(ORDER)), day: iso(new Date(now - 2 * 86_400_000)) },
      status: "published",
      publishedUrl: "https://t.me/namuna/131",
      video: { plan: plan(ORDER, lang), plannedAt: ago(100), ...file(17) },
    }),
    base("sample-v6", 1, { status: "approved", approvedAt: ago(1), createdAt: ago(6), video: { plan: plan(ORDER, lang), plannedAt: ago(6), ...file(21) } }),
  ];
  return {
    posts,
    schedule: { "sample-v4": { dueAt: new Date(Date.parse(`${queuedSlot.day}T${queuedSlot.time}:00+05:00`)).toISOString(), status: "queued" } },
  };
}

/** What the sample's Videographer writes when asked (the same bakery, the dawn script). */
export const sampleVideoPlan = (lang: Lang): VideoPlan => plan(DAWN, lang);
/** A sample idea: the order-ahead script. */
export const sampleIdeaPlan = (lang: Lang): VideoPlan => plan(ORDER, lang);
/** The sample caption written with a script. */
export const sampleCaption = (): Record<Script, string> => {
  const uz = CAPTIONS[0].uz;
  return { uz_latn: uz, uz_cyrl: latinToCyrillic(uz), ru: CAPTIONS[0].ru, en: CAPTIONS[0].en };
};
