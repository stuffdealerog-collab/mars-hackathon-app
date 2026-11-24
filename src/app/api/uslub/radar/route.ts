import { z } from "zod";
import { safeLogEvent } from "@/lib/track";
import { spendClaude } from "@/lib/uslub/budget";
import { handle, json, loadBrandFor, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { findLeads } from "@/lib/uslub/radar";

export const maxDuration = 120; // up to two search passes

const Body = z.object({ brandId: z.string().trim().min(1), goal: z.string().max(500).optional() });

/** POST { brandId, goal? } -> { leads: RadarLead[]; reason?: string } (reason is set when leads is empty) */
export const POST = handle(async (req) => {
  rateLimit(req, "radar", 4);
  const body = await readJson(req, Body);
  const userId = telegramUserId(req);
  const brand = await loadBrandFor(body.brandId, userId);
  await spendClaude(req, userId, "radar");
  const { leads, reason } = await findLeads(brand, body.goal);
  await safeLogEvent(null, "radar_run", { brand_id: brand.id, leads: leads.length, empty_reason: reason ? "set" : null });
  return json({ leads, ...(reason ? { reason } : {}) });
});
