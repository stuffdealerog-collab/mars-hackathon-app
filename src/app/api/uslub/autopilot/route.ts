import { z } from "zod";
import { weekContinueUrl } from "@/lib/autopilot/approve";
import { autopilotInfo, setAutopilot } from "@/lib/autopilot/service";
import { currentContext } from "@/lib/uslub/context";
import { assertDraftAccess, handle, HttpError, json, loadBrandFor, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { getBrand } from "@/lib/uslub/store";

export const maxDuration = 15;

const Uuid = z.string().trim().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const Body = z.object({
  brandId: Uuid,
  on: z.boolean(),
  initData: z.string().max(8192).optional(),
  lang: z.enum(["uz", "ru", "en"]).optional(),
});

/**
 * GET ?brandId= -> { autopilot: { on, since?, trialEndsAt?, paused?, trialDaysLeft? }, admin: BotAdminStatus,
 *                    schedule: Record<postId, PostSchedule> }
 * The brand's autopilot, the bot's rights in its channel (from Telegram's my_chat_member updates and the last
 * check), and the queue state of its posts. Same access as the brand's drafts.
 */
export const GET = handle(async (req) => {
  rateLimit(req, "autopilot_get", 60);
  const brandId = new URL(req.url).searchParams.get("brandId") ?? "";
  const userId = telegramUserId(req);
  const brand = await loadBrandFor(brandId, userId);
  await assertDraftAccess(brand, userId);
  return json(await autopilotInfo(brand, currentContext()?.lang ?? "uz"));
});

/**
 * POST { brandId, on, initData?, lang? } -> same as GET.
 * Turns the autopilot on or off. The first "on" starts the 7-day trial; off and on again keeps the same dates.
 * Verified Telegram owner only; anonymous: 401 { code: "auth_required", continueUrl } (the bot's week view has the
 * same switch).
 */
export const POST = handle(async (req) => {
  rateLimit(req, "autopilot_set", 20);
  const body = await readJson(req, Body);
  const userId = telegramUserId(req, body.initData);
  const brand = await getBrand(body.brandId.toLowerCase());
  if (!brand) throw new HttpError(404, "Brand not found", "brand_not_found");
  if (userId == null) throw new HttpError(401, "autopilot needs a Telegram owner", "auth_required", {}, { continueUrl: weekContinueUrl(brand.id) });
  if (brand.ownerTelegramId == null) throw new HttpError(403, "brand has no owner yet", "brand_unowned", {}, { continueUrl: weekContinueUrl(brand.id) });
  if (brand.ownerTelegramId !== userId) throw new HttpError(403, "brand of another owner", "brand_forbidden");
  await setAutopilot(brand.id, body.on, userId);
  return json(await autopilotInfo(brand, currentContext()?.lang ?? "uz"));
});
