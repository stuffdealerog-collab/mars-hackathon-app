import { z } from "zod";
import { spendClaude } from "@/lib/uslub/budget";
import { handle, json, loadBrandFor, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { planFlow } from "@/lib/uslub/planner";
import { saveFlow } from "@/lib/uslub/store";
import { labsGate } from "@/lib/ops/labs";

export const maxDuration = 30;

const Body = z.object({ brandId: z.string().trim().optional(), task: z.string().trim().min(2).max(1000) });

/** POST { brandId, task } -> { flow: Flow } */
export const POST = handle(async (req) => {
  const closed = labsGate("plan"); // no screen calls this route: 404 unless LABS_ROUTES names it
  if (closed) return closed;
  rateLimit(req, "plan", 10);
  const body = await readJson(req, Body);
  const userId = telegramUserId(req);
  const brand = body.brandId ? await loadBrandFor(body.brandId, userId) : null;
  await spendClaude(req, userId, "plan");
  const flow = await saveFlow(await planFlow(brand, body.task), brand?.id ?? null);
  return json({ flow });
});
