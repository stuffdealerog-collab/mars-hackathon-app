import { z } from "zod";
import { mayTrackLinks, type OwnerAnswers } from "@/lib/uslub/brain/answers";
import { loadAnswers, saveAnswers } from "@/lib/uslub/brain/answers-store";
import { questionsForBrand } from "@/lib/uslub/brain/brand-questions";
import { currentContext } from "@/lib/uslub/context";
import { assertDraftAccess, handle, HttpError, json, loadBrandFor, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { setBrandSource, setBrandTypeGoal } from "@/lib/uslub/store";

const Price = z.object({
  name: z.string().trim().min(1).max(120),
  price: z.union([z.string().trim().min(1).max(40), z.number().nonnegative().max(1e12).transform((n) => String(n))]),
});

const Body = z.object({
  brandId: z.string().trim().min(1).max(100),
  /** The main goal: more orders ("sale") or more subscribers ("grow"). */
  goal: z.enum(["sale", "grow"]).optional(),
  /** How customers order (business channels). "mercat_link" also opts in to the tracked link. */
  orderHow: z.enum(["phone", "manager", "own_bot", "site", "mercat_link"]).optional(),
  contact: z.string().trim().max(120).optional(),
  prices: z.array(Price).max(5).optional(),
  /** What the channel is about (growth channels). */
  about: z.string().trim().max(600).optional(),
  /** Mercat's tracked link in plan posts: opt-in, off by default. */
  trackLinks: z.boolean().optional(),
  lang: z.enum(["uz", "ru", "en"]).optional(),
  initData: z.string().max(8192).optional(),
});

/**
 * POST { brandId, goal?, orderHow?, contact?, prices?[≤5 {name, price}], about?, trackLinks?, lang?, initData? }
 *   -> { answers, questions, trackLinksActive }
 * The owner's answers to the run's questions, stored in brand_knowledge (kind 'answers', the newest row wins) and
 * reused by every weekly plan and post. No Claude call and no budget unit. Fields not sent keep their saved value.
 * A channel_only brand becomes the caller's own (source 'custom'): private prices never sit on a public cache row.
 * The goal is also written to brands.goal. trackLinksActive: the tracked link is on (opted in AND the brand has an
 * owner in Telegram; until it is claimed, plan posts carry no Mercat link).
 */
export const POST = handle(async (req) => {
  rateLimit(req, "answers", 20);
  const body = await readJson(req, Body);
  const userId = telegramUserId(req, body.initData);
  const brand = await loadBrandFor(body.brandId, userId);
  // An owned brand's answers come only from someone who may read its drafts.
  if (brand.ownerTelegramId != null) await assertDraftAccess(brand, userId);
  const fields: OwnerAnswers = { goal: body.goal, orderHow: body.orderHow, contact: body.contact, prices: body.prices, about: body.about, trackLinks: body.trackLinks };
  const given: OwnerAnswers = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
  if (!Object.keys(given).length) throw new HttpError(400, "Send at least one answer", "invalid_input");
  if (brand.source === "channel_only") await setBrandSource(brand.id, "custom");
  const lang = body.lang ?? currentContext()?.lang ?? "uz";
  const answers = await saveAnswers(brand.id, given, lang);
  if (given.goal) await setBrandTypeGoal(brand.id, { goal: given.goal });
  return json({
    answers,
    questions: questionsForBrand(brand, answers, lang),
    trackLinksActive: mayTrackLinks(answers, brand.ownerTelegramId),
  });
});

/**
 * GET ?brandId=&lang= -> { answers, questions, channelType, goal, trackLinksActive }
 * The saved answers and the questions still open (the goal first; for a business how customers order and prices,
 * for a blog/expert/media/community what the channel is about). Answered questions are not asked again.
 */
export const GET = handle(async (req) => {
  rateLimit(req, "answers-get", 60);
  const url = new URL(req.url);
  const userId = telegramUserId(req);
  const brand = await loadBrandFor(url.searchParams.get("brandId") ?? "", userId);
  if (brand.ownerTelegramId != null) await assertDraftAccess(brand, userId);
  const lang = currentContext()?.lang ?? "uz";
  const answers = await loadAnswers(brand.id).catch(() => null);
  return json({
    answers: answers ?? {},
    questions: questionsForBrand(brand, answers, lang),
    channelType: brand.channelType ?? null,
    goal: answers?.goal ?? brand.goal ?? null,
    trackLinksActive: mayTrackLinks(answers, brand.ownerTelegramId),
  });
});
