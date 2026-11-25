/**
 * The owner's questions at the start of a run (pure, adaptive, type-aware). The Studio, the Mini App and the bot show
 * whatever this returns; the answers go to POST /api/uslub/answers and are reused every week.
 * - goal: always first until answered: "more orders or more subscribers?", pre-filled from the channel type;
 * - a business (goal "sale"): how customers order (a confirmation when the channel's posts show a contact) and the
 *   prices of the 3 main products (skipped when the posts already have 3 current prices; old prices are confirmed);
 * - a blog, expert, media or community channel (goal "grow"): what the channel is about. Never prices or orders.
 */
import type { ChannelType, Goal } from "../contract";
import { contactsIn } from "../ending";
import type { OwnerAnswers } from "./answers";
import { defaultGoalFor } from "./channel-type";
import type { Lang } from "./types";

export type QuestionKey = "goal" | "order" | "prices" | "about";

export interface OwnerQuestion {
  key: QuestionKey;
  /** The question in the owner's language. */
  text: string;
  /** How the UI asks it: one tap among options, a short text, or product + price rows. */
  input: "choice" | "text" | "prices";
  options?: { value: string; label: string }[];
  /** What the answer starts as: the option to pre-select, the contact found in the posts, product rows. */
  prefill?: string | { name: string; price: string }[];
  /** One line under the question (why we ask), optional. */
  hint?: string;
}

export interface QuestionInput {
  lang: Lang;
  channelType?: ChannelType | null;
  answers?: OwnerAnswers | null;
  /** The contact line the channel's posts end with (BrandDNA.postEnding.contact), if any. */
  contact?: string;
  /** The channel's own @username and Mercat's bot: neither is the contact customers order through. */
  channel?: string;
  bot?: string;
  /** Current price facts known from the posts or the owner. */
  priceFacts?: number;
  /** Price lines older than 90 days ("Medovik — 180 000 so'm"): asked to confirm instead of asked again. */
  stalePrices?: string[];
  /** Product names from the brand DNA, to pre-fill the price rows. */
  products?: string[];
}

const T = {
  uz: {
    goal: "Kanalning asosiy maqsadi nima?",
    goalSale: "Ko‘proq buyurtma",
    goalGrow: "Ko‘proq obunachi",
    goalHint: "Reja, tahlil va haftalik hisobot shu maqsadga qarab tuziladi.",
    orderConfirm: (c: string) => `Buyurtmalarni ${c} orqali qabul qilasizmi?`,
    order: "Mijozlar qanday buyurtma beradi?",
    phone: "Telefon",
    manager: "@menejerga yozib",
    own_bot: "O‘z botimiz",
    site: "Sayt",
    mercat_link: "Mercat havolasi (har bir postdan kelganlarni sanaydi)",
    orderHint: "Postlar kanalingiz yozganidek tugaydi; aloqani o‘zgartirmaymiz.",
    prices: "3 ta asosiy mahsulot yoki xizmatingiz narxi qancha?",
    stale: (p: string) => `Bu narxlar hali amaldami? ${p}`,
    pricesHint: "Sotuv postlari narx bilan chiqadi.",
    about: "Kanal nima haqida? Bir-ikki gapda: mavzular va kim o‘qiydi.",
  },
  ru: {
    goal: "Главная цель канала?",
    goalSale: "Больше заказов",
    goalGrow: "Больше подписчиков",
    goalHint: "От этого зависят план, разбор и отчёт по понедельникам.",
    orderConfirm: (c: string) => `Заказы принимаете по ${c}?`,
    order: "Как клиенты делают заказ?",
    phone: "По телефону",
    manager: "Пишут @менеджеру",
    own_bot: "Через наш бот",
    site: "Через сайт",
    mercat_link: "Ссылка Mercat (считает, кто пришёл с каждого поста)",
    orderHint: "Посты заканчиваются так же, как у вас в канале; контакт не меняем.",
    prices: "Сколько стоят 3 ваших главных товара или услуги?",
    stale: (p: string) => `Эти цены ещё действуют? ${p}`,
    pricesHint: "Продающие посты выходят с ценой.",
    about: "О чём канал? В двух словах: темы и кто читает.",
  },
  en: {
    goal: "What is the channel's main goal?",
    goalSale: "More orders",
    goalGrow: "More subscribers",
    goalHint: "The plan, the analysis and the Monday report follow it.",
    orderConfirm: (c: string) => `Do customers order through ${c}?`,
    order: "How do customers order?",
    phone: "By phone",
    manager: "They message a @manager",
    own_bot: "Our own bot",
    site: "Our website",
    mercat_link: "A Mercat link (counts who came from each post)",
    orderHint: "Posts end the way your channel's posts do; we keep your contact.",
    prices: "What do your 3 main products or services cost?",
    stale: (p: string) => `Are these prices still current? ${p}`,
    pricesHint: "Sale posts go out with a price.",
    about: "What is the channel about? A sentence or two: topics and who reads it.",
  },
} as const;

/** The questions to ask now, at most 3, the goal first. Answered ones are never asked again. */
export function runQuestions(inp: QuestionInput): OwnerQuestion[] {
  const t = T[inp.lang] ?? T.uz;
  const a = inp.answers ?? {};
  const out: OwnerQuestion[] = [];
  const goal: Goal = a.goal ?? defaultGoalFor(inp.channelType);
  if (!a.goal)
    out.push({
      key: "goal",
      text: t.goal,
      input: "choice",
      options: [
        { value: "sale", label: t.goalSale },
        { value: "grow", label: t.goalGrow },
      ],
      prefill: goal === "sale" ? "sale" : "grow",
      hint: t.goalHint,
    });
  // The goal decides, not the type: a shop that wants subscribers is asked what the channel is about.
  if (goal !== "sale") {
    if (!a.about) out.push({ key: "about", text: t.about, input: "text" });
    return out.slice(0, 3);
  }
  if (!a.orderHow) {
    const options = (["phone", "manager", "own_bot", "site", "mercat_link"] as const).map((v) => ({ value: v, label: t[v] }));
    // Only the contact itself goes in the question ("+998 90 123 45 67", "@safia_admin"), never the whole ending line
    // ("📞 Buyurtma uchun: +998…" would read "Buyurtmalarni 📞 Buyurtma uchun: … orqali").
    const line = inp.contact?.trim();
    const c = line ? contactsIn(line, { channel: inp.channel, bot: inp.bot }).map((x) => x.raw).filter((x, i, all) => all.indexOf(x) === i).join(", ") || line : undefined;
    const byPhone = c && /\d{2}[\s-]?\d{3}/.test(c);
    out.push(
      c
        ? { key: "order", text: t.orderConfirm(c), input: "choice", options, prefill: byPhone ? "phone" : /bot\b/i.test(c) ? "own_bot" : "manager", hint: t.orderHint }
        : { key: "order", text: t.order, input: "choice", options, hint: t.orderHint },
    );
  }
  const known = (a.prices?.length ?? 0) + (inp.priceFacts ?? 0);
  if (inp.stalePrices?.length && !a.prices?.length)
    out.push({ key: "prices", text: t.stale(inp.stalePrices.slice(0, 3).join("; ")), input: "prices", prefill: inp.stalePrices.slice(0, 3).map(splitPrice), hint: t.pricesHint });
  else if (known < 3 && !a.prices?.length)
    out.push({ key: "prices", text: t.prices, input: "prices", prefill: (inp.products ?? []).slice(0, 3).map((name) => ({ name, price: "" })), hint: t.pricesHint });
  return out.slice(0, 3);
}

/** "Medovik — 180 000 so'm" -> { name: "Medovik", price: "180 000 so'm" } (the whole line as the name otherwise). */
function splitPrice(line: string): { name: string; price: string } {
  const m = /^(.*?)[\s—–:-]+(\d[\d\s.,]*\s?\S*)\s*$/u.exec(line.trim());
  return m ? { name: m[1].trim(), price: m[2].trim() } : { name: line.trim(), price: "" };
}
