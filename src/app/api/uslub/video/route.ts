import { z } from "zod";
import { safeLogEvent } from "@/lib/track";
import { handle, json, loadBrandFor, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { planVideo } from "@/lib/uslub/video";

export const maxDuration = 60;

const Body = z.object({ brandId: z.string().trim().min(1), brief: z.string().trim().min(2).max(1000) });

/** POST { brandId, brief } -> { plan: VideoPlan } */
export const POST = handle(async (req) => {
  rateLimit(req, "video", 6);
  const body = await readJson(req, Body);
  const brand = await loadBrandFor(body.brandId, telegramUserId(req));
  const plan = await planVideo(brand, body.brief);
  await safeLogEvent(null, "video_planned", { brand_id: brand.id, scenes: plan.scenes.length });
  return json({ plan });
});
