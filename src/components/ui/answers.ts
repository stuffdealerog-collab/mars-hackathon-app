/**
 * The owner's questions at the start of a run (pure). The engine decides what to ask (runQuestions: the goal first,
 * then how customers order and prices for a shop, or what the channel is about for a blog); the Studio and the
 * Mini App draw whatever comes back and send the answers to POST /api/uslub/answers. Nothing here invents a question.
 */
import type { OwnerQuestion } from "@/lib/uslub/brain/questions";

export type Question = OwnerQuestion;
export type PriceRow = { name: string; price: string };

/** What the card holds while the owner answers (by question key). */
export type AnswerValues = { goal?: string; order?: string; contact?: string; prices?: PriceRow[]; about?: string };

/** POST /api/uslub/answers fields (without brandId, lang, initData). */
export type AnswersBody = { goal?: "sale" | "grow"; orderHow?: string; contact?: string; prices?: PriceRow[]; about?: string };

const PRICE_ROWS = 3;
const PRICES_MAX = 5;

/** The card's first state: the engine's prefill (the goal from the channel type, product names), three price rows. */
export function initialAnswers(qs: readonly Question[]): AnswerValues {
  const v: AnswerValues = {};
  for (const q of qs) {
    if (q.key === "goal" && typeof q.prefill === "string") v.goal = q.prefill;
    else if (q.key === "order" && typeof q.prefill === "string") v.order = q.prefill;
    else if (q.key === "prices") {
      const rows = Array.isArray(q.prefill) ? q.prefill.slice(0, PRICES_MAX).map((r) => ({ name: r.name ?? "", price: r.price ?? "" })) : [];
      while (rows.length < PRICE_ROWS) rows.push({ name: "", price: "" });
      v.prices = rows;
    } else if (q.key === "about") v.about = typeof q.prefill === "string" ? q.prefill : "";
  }
  return v;
}

const offered = (q: Question, value?: string) => !!value && (q.options ?? []).some((o) => o.value === value);

/** The answers to send: only questions that were asked, only values the engine offered. Null when nothing is said. */
export function answersBody(qs: readonly Question[], v: AnswerValues): AnswersBody | null {
  const out: AnswersBody = {};
  for (const q of qs) {
    if (q.key === "goal" && offered(q, v.goal) && (v.goal === "sale" || v.goal === "grow")) out.goal = v.goal;
    else if (q.key === "order" && offered(q, v.order)) {
      out.orderHow = v.order;
      const contact = v.contact?.trim();
      if (contact && v.order !== "mercat_link") out.contact = contact.slice(0, 120);
    } else if (q.key === "prices") {
      const rows = (v.prices ?? []).map((r) => ({ name: r.name.trim(), price: r.price.trim() })).filter((r) => r.name && r.price);
      if (rows.length) out.prices = rows.slice(0, PRICES_MAX);
    } else if (q.key === "about") {
      const about = v.about?.trim();
      if (about) out.about = about.slice(0, 600);
    }
  }
  return Object.keys(out).length ? out : null;
}
