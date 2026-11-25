/**
 * The owner's answers (brand_knowledge kind = 'answers', the newest row wins): the main goal, how customers order,
 * the prices of the main products, what the channel is about, and the tracked-link opt-in. Pure: the shape, merging
 * and the plain-words text the strategist and copywriter read as facts. Storage is answers-store.ts.
 */
import type { Goal } from "../contract";
import type { Lang } from "./types";

export type OrderHow = "phone" | "manager" | "own_bot" | "site" | "mercat_link";

export interface OwnerAnswers {
  /** The main goal the owner confirmed: "sale" (more orders) or "grow" (more subscribers). */
  goal?: Extract<Goal, "sale" | "grow">;
  /** How customers order (business channels). */
  orderHow?: OrderHow;
  /** The contact customers use, as the owner wrote it ("+998 90 123 45 67", "@manager"). */
  contact?: string;
  /** Prices of the main products (up to 5). */
  prices?: { name: string; price: string }[];
  /** What the channel is about, in the owner's words (growth channels). */
  about?: string;
  /** The tracked t.me/<bot>?start=src_… link in posts: opt-in, off by default, never for a brand with no owner. */
  trackLinks?: boolean;
  /** ISO time of the answer. */
  at?: string;
}

const clean = (s: string | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** A new answer on top of the saved ones: fields the owner did not send stay as they were. */
export function mergeAnswers(prev: OwnerAnswers | null | undefined, next: OwnerAnswers): OwnerAnswers {
  const out: OwnerAnswers = { ...(prev ?? {}) };
  if (next.goal) out.goal = next.goal;
  if (next.orderHow) out.orderHow = next.orderHow;
  if (next.contact != null) out.contact = clean(next.contact, 120) || undefined;
  if (next.prices) out.prices = next.prices.map((p) => ({ name: clean(p.name, 120), price: clean(p.price, 40) })).filter((p) => p.name && p.price).slice(0, 5);
  if (next.about != null) out.about = clean(next.about, 600) || undefined;
  if (next.trackLinks != null) out.trackLinks = next.trackLinks;
  out.at = next.at ?? new Date().toISOString();
  for (const k of Object.keys(out) as (keyof OwnerAnswers)[]) if (out[k] === undefined) delete out[k];
  return out;
}

const ORDER_WORDS: Record<Lang, Record<OrderHow, string>> = {
  uz: { phone: "telefon orqali", manager: "menejerga Telegram'da yozib", own_bot: "o‘z botimiz orqali", site: "saytimiz orqali", mercat_link: "postdagi havola orqali" },
  ru: { phone: "по телефону", manager: "через менеджера в Telegram", own_bot: "через наш бот", site: "через наш сайт", mercat_link: "по ссылке в посте" },
  en: { phone: "by phone", manager: "by messaging our manager on Telegram", own_bot: "through our own bot", site: "on our website", mercat_link: "through the link in the post" },
};

/**
 * The answers as plain knowledge-base lines in the owner's language: the facts step quotes them like any other text,
 * so a price the owner typed becomes a price fact. Empty when there is nothing to say.
 */
export function answersText(a: OwnerAnswers | null | undefined, lang: Lang = "uz"): string {
  if (!a) return "";
  const lines: string[] = [];
  const L = {
    uz: { head: "Egasining javoblari", order: "Buyurtma", contact: "Aloqa", price: "Narxlar", about: "Kanal haqida" },
    ru: { head: "Ответы владельца", order: "Заказ", contact: "Контакт", price: "Цены", about: "О канале" },
    en: { head: "The owner's answers", order: "Orders", contact: "Contact", price: "Prices", about: "About the channel" },
  }[lang];
  if (a.orderHow) lines.push(`${L.order}: ${ORDER_WORDS[lang][a.orderHow]}${a.contact ? ` — ${a.contact}` : ""}`);
  else if (a.contact) lines.push(`${L.contact}: ${a.contact}`);
  if (a.prices?.length) lines.push(`${L.price}:\n${a.prices.map((p) => `${p.name} — ${p.price}`).join("\n")}`);
  if (a.about) lines.push(`${L.about}: ${a.about}`);
  return lines.length ? `[${L.head}]\n${lines.join("\n")}` : "";
}

/** The contact the owner answered, when it is one customers can use (not Mercat's link). */
export function answeredContact(a: OwnerAnswers | null | undefined): string | undefined {
  if (!a?.contact || a.orderHow === "mercat_link") return undefined;
  return a.contact;
}

/**
 * Whether plan posts may carry Mercat's tracked link: the owner opted in AND the brand has an owner who receives the
 * leads (a link on an ownerless brand answers customers with "this link is not active").
 */
export function mayTrackLinks(a: OwnerAnswers | null | undefined, ownerTelegramId: number | null | undefined): boolean {
  return Boolean(a?.trackLinks || a?.orderHow === "mercat_link") && ownerTelegramId != null;
}
