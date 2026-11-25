/**
 * The owner's open questions for a stored brand, without a plan run (GET/POST /api/uslub/answers): what the brand
 * already shows (its type, the contact its posts end with, prices in its posts, its products) pre-fills them. Pure.
 */
import type { BrandProfile } from "../contract";
import type { OwnerAnswers } from "./answers";
import { runQuestions, type OwnerQuestion } from "./questions";
import type { Lang } from "./types";

const PRICE_RE = /\d[\d\s.,]*\s?(so['‘’ʻ]?m|сўм|сум|sum\b|uzs|ming\b|минг|тыс)/i;

export function questionsForBrand(brand: Pick<BrandProfile, "channelType" | "dna" | "samplePosts" | "knowledge">, answers: OwnerAnswers | null, lang: Lang): OwnerQuestion[] {
  // Price posts stand in for price facts here (no facts step without a plan run): three of them mean prices are known.
  const pricePosts = [...brand.samplePosts, brand.knowledge].filter((t) => PRICE_RE.test(t)).length;
  return runQuestions({
    lang,
    channelType: brand.channelType,
    answers,
    contact: brand.dna?.postEnding?.contact ?? answers?.contact,
    priceFacts: Math.min(3, pricePosts),
    products: brand.dna?.products,
  });
}
