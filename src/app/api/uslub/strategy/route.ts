import { z } from "zod";
import { respond } from "@/lib/uslub/brain/route-utils";
import { buildStrategy } from "@/lib/uslub/brain/strategy";
import { HttpError, handle, loadBrandFor, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";

// Node.js runtime is the default (an explicit `runtime` export is rejected with cacheComponents).
export const maxDuration = 60;

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
  stream: z.boolean().optional(),
});

/**
 * POST { brandId? | knowledge?, channel?, audit?, goal?, lang?, category?, competitors? }
 *   -> { strategy: Strategy, plan: ContentPlan, ledger, firedRules, ownerQuestions, criticReport, pillar, facts }
 */
export const POST = handle(async (req) => {
  rateLimit(req, "brain-strategy", 4);
  const body = await readJson(req, Body);
  let knowledge = body.knowledge ?? "";
  let channel = body.channel ?? body.audit?.channel;
  let brandName = body.brandName;
  if (body.brandId) {
    try {
      const brand = await loadBrandFor(body.brandId, telegramUserId(req));
      knowledge = [brand.knowledge, knowledge].filter(Boolean).join("\n\n");
      channel ??= brand.channel;
      brandName ??= brand.dna?.name;
    } catch (err) {
      if (err instanceof HttpError && err.status === 403) throw err;
      if (!knowledge) throw err instanceof HttpError ? err : new HttpError(404, "Brand not found");
    }
  }
  if (!knowledge.trim() && !channel) throw new HttpError(400, "Provide brandId, knowledge or channel");
  return respond(Boolean(body.stream), (onStage) =>
    buildStrategy({
      knowledge,
      channel: channel?.replace(/^@/, ""),
      competitors: body.competitors,
      goal: body.goal,
      lang: body.lang ?? "uz",
      category: body.category,
      brandName,
      approvedPosts: body.approvedPosts,
      onStage,
    }),
  );
});
