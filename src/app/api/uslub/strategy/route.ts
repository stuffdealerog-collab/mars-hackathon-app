import { z } from "zod";
import { loadKnowledge } from "@/lib/uslub/brain/kbstore";
import { buildLaunchStrategy } from "@/lib/uslub/brain/launch";
import { respond } from "@/lib/uslub/brain/route-utils";
import { buildStrategy } from "@/lib/uslub/brain/strategy";
import { HttpError, handle, loadBrandFor, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";

// Node.js runtime is the default (an explicit `runtime` export is rejected with cacheComponents).
// The channel strategy returns by ~45 s; the fresh launch plan by ~35 s. Vercel allows up to 300 s.
export const maxDuration = 90;

const Body = z.object({
  brandId: z.string().trim().min(1).max(100).optional(),
  knowledge: z.string().max(20_000).optional(),
  channel: z.string().trim().max(100).optional(),
  competitors: z.array(z.string().trim().min(2).max(100)).max(3).optional(),
  audit: z.object({ channel: z.string() }).passthrough().optional(),
  goal: z.string().max(500).optional(),
  lang: z.enum(["uz", "ru", "en"]).optional(),
  category: z.string().trim().max(80).optional(),
  brandName: z.string().trim().max(120).optional(),
  approvedPosts: z.number().int().min(0).max(10_000).optional(),
  mode: z.enum(["channel", "fresh"]).optional(),
  stream: z.boolean().optional(),
});

/**
 * POST { brandId? | knowledge?, channel?, audit?, goal?, lang?, category?, competitors?, mode? }
 * A fresh brand (mode "fresh", or no channel and no posts) gets a 2-week LAUNCH plan instead:
 *   -> { mode: "fresh", strategy, plan (9 items, slot 1 = pinned intro), launch: { weeks, pinnedSlot, tactics[] },
 *        ownerQuestions, sufficiency }  (same NDJSON stages: skeleton, item, strategy, done, result)
 *   -> { strategy: Strategy, plan: ContentPlan, planId, planTag, ledger, firedRules, ownerQuestions, criticReport,
 *        pillar, facts, competitorIssues, bench, learn, web, sufficiency, promptVersion }
 * With stream=true (recommended): NDJSON events in this order — facts, scrape/validity/bench/learn/stats/rules,
 * skeleton (all slots with time, goal, format, forecast, hookType), item (one per slot as it passes the critic),
 * web, strategy, done, then {stage:"result", ...}.
 */
export const POST = handle(async (req) => {
  rateLimit(req, "brain-strategy", 4);
  const body = await readJson(req, Body);
  let knowledge = body.knowledge ?? "";
  let channel = body.channel ?? body.audit?.channel;
  let brandName = body.brandName;
  let category = body.category;
  const userId = telegramUserId(req);
  let brandId: string | undefined;
  let ownerVerified = false;
  let fresh = body.mode === "fresh";
  if (body.brandId) {
    try {
      const brand = await loadBrandFor(body.brandId, userId);
      brandId = brand.id;
      const requested = (body.channel ?? body.audit?.channel)?.replace(/^@/, "").toLowerCase();
      ownerVerified =
        brand.source === "custom" && brand.ownerTelegramId != null && brand.ownerTelegramId === userId && (!requested || !brand.channel || requested === brand.channel.toLowerCase());
      // Brand memory: what the owner gave us (docs, site, PDF, price list) comes first.
      const owner = await loadKnowledge(brand.id).catch(() => ({ text: "" }));
      knowledge = [owner.text, brand.knowledge, knowledge].filter(Boolean).join("\n\n");
      channel ??= brand.channel;
      brandName ??= brand.dna?.name;
      // A brand built from the owner's description (empty or new channel) gets the 2-week launch plan.
      if (brand.mode === "fresh" || (!brand.channel && !brand.samplePosts.length)) fresh = true;
      // The Studio sends no category: the brand's one-liner ("Toshkentdagi qandolatxona…") drives the buying cycle and niche.
      category ??= brand.dna?.oneLiner?.slice(0, 80);
    } catch (err) {
      if (err instanceof HttpError && err.status === 403) throw err;
      if (!knowledge) throw err instanceof HttpError ? err : new HttpError(404, "Brand not found", "brand_not_found");
    }
  }
  if (!knowledge.trim() && !channel) throw new HttpError(400, "Provide brandId, knowledge or channel", "knowledge_needed");
  if (fresh) {
    if (knowledge.trim().length < 30) throw new HttpError(400, "fresh mode needs the owner's description", "knowledge_needed");
    return respond(Boolean(body.stream), (onStage) =>
      buildLaunchStrategy({ knowledge, brandName, channel: channel?.replace(/^@/, ""), goal: body.goal, lang: body.lang ?? "uz", onStage }),
    );
  }
  return respond(Boolean(body.stream), (onStage) =>
    buildStrategy({
      knowledge,
      channel: channel?.replace(/^@/, ""),
      competitors: body.competitors,
      goal: body.goal,
      lang: body.lang ?? "uz",
      category,
      brandName,
      brandId,
      ownerTelegramId: userId,
      ownerVerified,
      approvedPosts: body.approvedPosts,
      onStage,
    }),
  );
});
