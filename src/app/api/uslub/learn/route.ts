import { z } from "zod";
import { learnFor } from "@/lib/uslub/brain/learn-run";
import { toHttp } from "@/lib/uslub/brain/route-utils";
import { normalizeChannel, scrapeChannelData } from "@/lib/uslub/brain/scrape";
import { HttpError, handle, json, loadBrandFor, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";

export const maxDuration = 30;

const Body = z.object({
  channel: z.string().trim().min(2).max(100).optional(),
  brandId: z.string().trim().min(1).max(100).optional(),
  lang: z.enum(["uz", "ru", "en"]).optional(),
});

/**
 * POST { channel? | brandId?, lang? } -> the learn-loop scoreboard for the channel's last plans:
 *   { channel, plans, outcomes, scores, experiments, calibration, funnel, changes }
 * outcomes[i].status: not_found | too_early | early (≥20 h, age-adjusted) | final (72 h).
 */
export const POST = handle(async (req) => {
  rateLimit(req, "brain-learn", 10);
  const body = await readJson(req, Body);
  let channel = body.channel ? normalizeChannel(body.channel) : null;
  let owner = false;
  if (body.brandId) {
    const brand = await loadBrandFor(body.brandId, telegramUserId(req));
    channel ??= brand.channel ? normalizeChannel(brand.channel) : null;
    owner = brand.source === "custom" && brand.ownerTelegramId != null;
  }
  if (!channel) throw new HttpError(400, "Provide channel or a brandId with a linked channel");
  try {
    const data = await scrapeChannelData(channel);
    const r = await learnFor(data.channel, data.posts, Date.now(), body.lang ?? "uz", { brandId: body.brandId, ownerReports: owner });
    // Owner-reported orders are private: only the verified owner of the brand sees them.
    const plans = owner ? r.plans : r.plans.map((p) => ({ ...p, weekOrders: undefined }));
    const outcomes = owner ? r.outcomes : r.outcomes.map((o) => ({ ...o, sold: undefined }));
    const funnel = owner ? r.funnel : { ...r.funnel, weekOrders: undefined, posts: r.funnel.posts.map((p) => ({ ...p, sold: undefined })) };
    return json({ channel: `@${data.channel}`, plans, outcomes, scores: r.scores, experiments: r.experiments, calibration: r.calibration, funnel, changes: r.changes });
  } catch (err) {
    throw toHttp(err);
  }
});
