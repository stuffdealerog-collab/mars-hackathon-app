import { z } from "zod";
import { runAudit } from "@/lib/uslub/brain/audit";
import { respond } from "@/lib/uslub/brain/route-utils";
import { handle, rateLimit, readJson } from "@/lib/uslub/http";

// Node.js runtime is the default (an explicit `runtime` export is rejected with cacheComponents).
export const maxDuration = 90;

const Body = z.object({
  channel: z.string().trim().min(2).max(100),
  competitors: z.array(z.string().trim().min(2).max(100)).max(3).optional(),
  lang: z.enum(["uz", "ru", "en"]).optional(),
  category: z.string().trim().max(80).optional(),
  stream: z.boolean().optional(),
});

/**
 * POST { channel, competitors?, lang?, category?, stream? }
 *   -> { audit: ChannelAudit, ledger, rules, firedRules, findings, stats }
 * With stream=true: NDJSON {stage,...} events, then {stage:"result", ...}.
 */
export const POST = handle(async (req) => {
  rateLimit(req, "brain-analyze", 6);
  const body = await readJson(req, Body);
  return respond(Boolean(body.stream), (onStage) =>
    runAudit({ channel: body.channel, competitors: body.competitors, lang: body.lang ?? "uz", category: body.category, onStage }),
  );
});
