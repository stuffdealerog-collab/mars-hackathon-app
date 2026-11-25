import { z } from "zod";
import { approveWeek, weekContinueUrl } from "@/lib/autopilot/approve";
import { getBot } from "@/lib/bot";
import { handle, HttpError, json, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { getBrand } from "@/lib/uslub/store";

export const maxDuration = 30;

const Uuid = z.string().trim().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const Body = z.object({
  brandId: Uuid,
  /** Exactly these posts (one post, or the owner's own pick); missing = the latest batch. */
  postIds: z.array(Uuid).min(1).max(7).optional(),
  initData: z.string().max(8192).optional(),
  lang: z.enum(["uz", "ru", "en"]).optional(),
});

/**
 * POST { brandId, postIds?, initData?, lang? } -> { queued: { postId, dueAt }[], skipped: { postId, reason, tokens?,
 * dates? }[], admin: BotAdminStatus, addAdminUrl? }
 *
 * «Approve the week»: approves the latest batch (or postIds) and queues each post for its slot; the tick publishes it
 * then (±15 min) and the owner gets "post is out" in the bot. Posts with a blank, a date that will have passed, a
 * picture still being made, a video slot without video, a passed slot, or no channel stay out, each with its reason
 * (selectWeekBatch). Idempotent: approving the same week again keeps each post's time.
 *
 * Verified Telegram owner only (Mini App initData or the Studio's handoff key). An anonymous caller gets 401
 * { code: "auth_required", continueUrl } and a brand nobody owns yet 403 { code: "brand_unowned", continueUrl }:
 * continueUrl opens the bot (t.me/<bot>?start=week_<brandId>), where a channel admin claims the brand and approves.
 */
export const POST = handle(async (req) => {
  rateLimit(req, "posts_approve_week", 20);
  const body = await readJson(req, Body);
  const userId = telegramUserId(req, body.initData);
  const brand = await getBrand(body.brandId.toLowerCase());
  if (!brand) throw new HttpError(404, "Brand not found", "brand_not_found");
  const continueUrl = weekContinueUrl(brand.id);
  if (userId == null) throw new HttpError(401, "approve-week needs a Telegram owner", "auth_required", {}, { continueUrl });
  if (brand.ownerTelegramId == null) throw new HttpError(403, "brand has no owner yet", "brand_unowned", {}, { continueUrl });
  if (brand.ownerTelegramId !== userId) throw new HttpError(403, "posts of another owner", "brand_forbidden");
  const r = await approveWeek({ brand, ownerTelegramId: userId, postIds: body.postIds?.map((id) => id.toLowerCase()), api: getBot().api });
  return json({ queued: r.queued, skipped: r.skipped, admin: r.admin, ...(r.addAdminUrl ? { addAdminUrl: r.addAdminUrl } : {}) });
});
