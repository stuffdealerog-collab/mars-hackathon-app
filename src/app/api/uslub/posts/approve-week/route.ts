import { z } from "zod";
import { approveWeek, weekContinueUrl } from "@/lib/autopilot/approve";
import { WEEK_HASH_RE } from "@/lib/autopilot/week-hash";
import { getBot } from "@/lib/bot";
import { handle, HttpError, json, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { getBrand } from "@/lib/uslub/store";

export const maxDuration = 30;

const Uuid = z.string().trim().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const Body = z.object({
  brandId: Uuid,
  /** Exactly these posts (one post, or the owner's own pick); missing = the latest batch. */
  postIds: z.array(Uuid).min(1).max(7).optional(),
  /** The week the owner was shown (week-hash.ts weekHashForClient); another batch now answers 409 batch_changed. */
  hash: z.string().regex(WEEK_HASH_RE).optional(),
  initData: z.string().max(8192).optional(),
  lang: z.enum(["uz", "ru", "en"]).optional(),
});

/**
 * POST { brandId, postIds?, hash?, initData?, lang? } -> { queued: { postId, dueAt }[], skipped: { postId, reason,
 * tokens?, dates? }[], admin: BotAdminStatus, addAdminUrl? }
 *
 * «Approve the week»: approves the latest batch (or postIds) and queues each post for its slot; the tick publishes it
 * then (±15 min) and the owner gets "post is out" in the bot. Posts with a blank, a date that will have passed, a
 * picture still being made, a video slot without video, a passed slot, or no channel stay out, each with its reason
 * (selectWeekBatch). Idempotent: approving the same week again keeps each post's time.
 *
 * `hash` ties the tap to what the owner saw: the weekHash of the batch on screen (selectWeekBatch over the same posts,
 * week-hash.ts weekHashForClient). When the batch is another one now (a new Monday batch, a picture that finished, an
 * edit, a slot that passed) or has nothing left to approve, nothing is approved: 409 { code: "batch_changed" }, and
 * the client shows the week again.
 * The Studio and the Mini App always send it; without it the batch at tap time is approved.
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
  const r = await approveWeek({ brand, ownerTelegramId: userId, postIds: body.postIds?.map((id) => id.toLowerCase()), hash: body.hash, api: getBot().api });
  if (r.changed) throw new HttpError(409, "the week changed since it was shown", "batch_changed");
  return json({ queued: r.queued, skipped: r.skipped, admin: r.admin, ...(r.addAdminUrl ? { addAdminUrl: r.addAdminUrl } : {}) });
});
