/**
 * Decides whether a post needs the owner's approval before publishing.
 * Routine posts may later go out on autopilot; sensitive ones never do.
 * Pure (no server-only imports).
 */

export type SensitivityReason = "promo" | "price" | "video" | "first_posts";

export interface Sensitivity {
  sensitive: boolean;
  reasons: SensitivityReason[];
}

const PROMO_RE =
  /(chegirma|aksiya|aktsiya|sovg[‘'ʻ’`]?a|bepul|tekin|konkurs|yutuq|promokod|promo|skidka|скидк|акци|распродаж|бесплатн|подар|розыгрыш|конкурс|промокод|чегирма|акция|бепул|совға|sale|discount|giveaway|free|% ?off|-\d{1,2} ?%|\d{1,2} ?% ?(chegirma|скидк|off))/iu;

const PRICE_RE =
  /(\d[\d\s.,]*\s?(so[‘'ʻ’`]?m|sum|сум|сўм|ming|минг|тыс|mln|млн|\$|usd|y\.e|у\.е)|\$\s?\d|narx|нарх|цен[аы]|стоимост|price|to[‘'ʻ’`]?lov|тўлов|оплат)/iu;

const VIDEO_RE = /(video|reels|rolik|tiktok|shorts|видео|ролик|рилс|видео)/iu;

export function classifySensitivity(
  text: string,
  brief = "",
  opts: { publishedCount?: number } = {},
): Sensitivity {
  const reasons: SensitivityReason[] = [];
  const all = `${text}\n${brief}`;
  if (PROMO_RE.test(all)) reasons.push("promo");
  if (PRICE_RE.test(text)) reasons.push("price");
  if (VIDEO_RE.test(brief)) reasons.push("video");
  if ((opts.publishedCount ?? 0) < 3) reasons.push("first_posts");
  return { sensitive: reasons.length > 0, reasons };
}
