import { z } from "zod";
import { runAudit } from "@/lib/uslub/brain/audit";
import { planTypeFor } from "@/lib/uslub/brain/channel-type";
import { normalizeChannel } from "@/lib/uslub/brain/scrape";
import { respond } from "@/lib/uslub/brain/route-utils";
import { spendClaude } from "@/lib/uslub/budget";
import type { ChannelType } from "@/lib/uslub/contract";
import { handle, loadBrandFor, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";

// Node.js runtime is the default (an explicit `runtime` export is rejected with cacheComponents).
export const maxDuration = 90;

const Body = z.object({
  channel: z.string().trim().min(2).max(100),
  competitors: z.array(z.string().trim().min(2).max(100)).max(3).optional(),
  lang: z.enum(["uz", "ru", "en"]).optional(),
  category: z.string().trim().max(80).optional(),
  stream: z.boolean().optional(),
  /** true = analyze again even if this channel was analyzed in the last 24 h. */
  refresh: z.boolean().optional(),
  /** The brand this channel belongs to: its stored type and the owner's confirmed goal pick the findings. */
  brandId: z.string().trim().max(100).optional(),
});

/**
 * The channel type the brand's analysis is written for: its stored type as the owner's confirmed goal plans it (a
 * shop whose owner wants subscribers is analysed as a growth channel). Undefined = detect it from the posts (no
 * brand, another channel, a brand the caller may not use, or a brand not typed yet). Never fails the analysis.
 */
async function brandChannelType(brandId: string | undefined, channel: string, userId: number | null): Promise<ChannelType | undefined> {
  if (!brandId) return undefined;
  try {
    const brand = await loadBrandFor(brandId, userId);
    const same = brand.channel && brand.channel.toLowerCase() === normalizeChannel(channel)?.toLowerCase();
    return same && brand.channelType ? planTypeFor(brand.channelType, brand.goal) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * POST { channel, competitors?, lang?, category?, stream?, refresh?, brandId? }
 * An analysis of the same channel (language, competitors, category) from the last 24 h comes back as it was:
 * cached: true, analyzedAt = when the channel was read; no scrape, no paid step, no budget unit. refresh:true
 * analyzes again (the written findings are still reused while the channel has no new post). A channel with nothing
 * to audit answers 422 channel_empty before any Claude call.
 *   -> { audit: ChannelAudit, analyzedAt, cached, ledger, rules, firedRules, findings, stats }
 *   stats.viewsAboveSubs: views exceed subscribers, so audit.reachRate is capped at 1 (show "views > subscribers").
 * With stream=true: NDJSON {stage,...} events, then {stage:"result", ...}; a saved analysis sends {stage:"cached"}.
 */
export const POST = handle(async (req) => {
  rateLimit(req, "brain-analyze", 6);
  const body = await readJson(req, Body);
  const userId = telegramUserId(req);
  const channelType = await brandChannelType(body.brandId, body.channel, userId);
  return respond(Boolean(body.stream), (onStage) =>
    runAudit({
      channel: body.channel,
      competitors: body.competitors,
      lang: body.lang ?? "uz",
      category: body.category,
      refresh: body.refresh,
      ...(channelType ? { channelType } : {}),
      onStage,
      beforeLlm: () => spendClaude(req, userId, "analyze"),
    }),
  );
});
