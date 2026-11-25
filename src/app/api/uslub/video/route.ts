import { z } from "zod";
import { safeLogEvent } from "@/lib/track";
import { spendClaude } from "@/lib/uslub/budget";
import { handle, json, loadBrandFor, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { planVideo } from "@/lib/uslub/video";
import { labsGate } from "@/lib/ops/labs";

export const maxDuration = 60;

const Body = z.object({ brandId: z.string().trim().min(1), brief: z.string().trim().min(2).max(1000) });

/** POST { brandId, brief } -> { plan: VideoPlan } */
export const POST = handle(async (req) => {
  const closed = labsGate("video"); // no screen calls this route: 404 unless LABS_ROUTES names it
  if (closed) return closed;
  rateLimit(req, "video", 6);
  const body = await readJson(req, Body);
  const userId = telegramUserId(req);
  const brand = await loadBrandFor(body.brandId, userId);
  await spendClaude(req, userId, "video");
  const plan = await planVideo(brand, body.brief);
  await safeLogEvent(null, "video_planned", { brand_id: brand.id, scenes: plan.scenes.length });
  return json({ plan });
});
