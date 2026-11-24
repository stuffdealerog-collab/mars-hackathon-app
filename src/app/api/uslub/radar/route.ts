import { z } from "zod";
import { safeLogEvent } from "@/lib/track";
import { handle, json, loadBrandFor, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { findLeads } from "@/lib/uslub/radar";

export const maxDuration = 90;

const Body = z.object({ brandId: z.string().trim().min(1), goal: z.string().max(500).optional() });

/** POST { brandId, goal? } -> { leads: RadarLead[] } */
export const POST = handle(async (req) => {
  rateLimit(req, "radar", 4);
  const body = await readJson(req, Body);
  const brand = await loadBrandFor(body.brandId, telegramUserId(req));
  const leads = await findLeads(brand, body.goal);
  await safeLogEvent(null, "radar_run", { brand_id: brand.id, leads: leads.length });
  return json({ leads });
});
