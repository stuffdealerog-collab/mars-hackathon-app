import { z } from "zod";
import { getEnv } from "@/lib/env";
import { studioLink } from "@/lib/uslub/handoff";
import { handle, HttpError, json, loadBrandFor, miniAppUserId, rateLimit, readJson } from "@/lib/uslub/http";

export const maxDuration = 15;

const Body = z.object({
  brandId: z.string().trim().min(1).max(64),
  initData: z.string().max(8192).optional(),
  lang: z.enum(["uz", "ru", "en"]).optional(),
});

/**
 * POST { brandId } -> { url }   the Mini App's "Kompyuterda to‘liq studiya": a desktop Studio link carrying this
 * Telegram user's signed handoff key (handoff.ts), valid 7 days.
 * Only a live Telegram session may ask (`Authorization: tma <initData>` or `initData`): a handoff key cannot mint
 * another one, so a leaked link cannot be extended. The URL is a bearer secret; it is returned, never logged.
 */
export const POST = handle(async (req) => {
  rateLimit(req, "handoff", 20);
  const body = await readJson(req, Body);
  if (!getEnv().TELEGRAM_BOT_TOKEN) throw new HttpError(503, "bot not configured", "bot_not_configured");
  const userId = miniAppUserId(req, body.initData);
  if (userId == null) throw new HttpError(401, "telegram session required", "auth_required");
  const brand = await loadBrandFor(body.brandId, userId);
  // Only for the owner's own brand (or a still-unowned one): never a key into someone else's drafts.
  if (brand.ownerTelegramId != null && brand.ownerTelegramId !== userId) throw new HttpError(403, "brand of another owner", "brand_forbidden");
  return json({ url: studioLink(brand.id, userId) });
});
