import { z } from "zod";
import { safeLogEvent } from "@/lib/track";
import { handle, HttpError, json, rateLimit, readJson } from "@/lib/uslub/http";
import { findLeads } from "@/lib/uslub/radar";
import { getBrand } from "@/lib/uslub/store";

export const maxDuration = 90;

const Body = z.object({ brandId: z.string().trim().min(1), goal: z.string().max(500).optional() });

/** POST { brandId, goal? } -> { leads: RadarLead[] } */
export const POST = handle(async (req) => {
  rateLimit(req, "radar", 4);
  const body = await readJson(req, Body);
  const brand = await getBrand(body.brandId);
  if (!brand) throw new HttpError(404, "Brand not found");
  const leads = await findLeads(brand, body.goal);
  await safeLogEvent(null, "radar_run", { brand_id: brand.id, leads: leads.length });
  return json({ leads });
});
