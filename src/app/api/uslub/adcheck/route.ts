import { z } from "zod";
import { runAdCheck } from "@/lib/uslub/brain/adcheck-run";
import { toHttp } from "@/lib/uslub/brain/route-utils";
import { handle, json, rateLimit, readJson } from "@/lib/uslub/http";

// Node.js runtime is the default (an explicit `runtime` export is rejected with cacheComponents).
export const maxDuration = 30;

const Body = z.object({
  channel: z.string().trim().min(2).max(100),
  priceUzs: z.number().int().positive().max(10_000_000_000).optional(),
  lang: z.enum(["uz", "ru", "en"]).optional(),
});

/**
 * POST { channel, priceUzs?, lang? }
 *   -> { channel, title, subscribers, verdict, summary, signals, cpm?, priceBand?, validity, sources, ... }
 * "Should I buy an ad post here?": boost signs (ERR, flat views, early saturation,
 * subscriber jumps), ad load, ad-post reach and price per 1000 views. No LLM.
 */
export const POST = handle(async (req) => {
  rateLimit(req, "brain-adcheck", 10);
  const body = await readJson(req, Body);
  try {
    return json(await runAdCheck({ channel: body.channel, priceUzs: body.priceUzs, lang: body.lang ?? "uz" }));
  } catch (err) {
    throw toHttp(err);
  }
});
