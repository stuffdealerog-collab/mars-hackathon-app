import { z } from "zod";
import { handle, json, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { media } from "@/lib/uslub/media/service";
import { publicJob } from "@/lib/uslub/media/types";
import { mediaCall } from "../../errors";
import { labsGate } from "@/lib/ops/labs";

const Body = z.object({ id: z.string().trim().min(1).max(64), initData: z.string().max(8192).optional() });

/**
 * POST { id, initData? } -> { job }  Cancels a queued/running job (best effort at the provider).
 * A job created by a Telegram user can be cancelled only by that user (`Authorization: tma …`
 * or `initData`); anyone else gets 404. Anonymous jobs: the unguessable id is the capability.
 */
export const POST = handle(async (req) => {
  const closed = labsGate("media/jobs"); // no screen calls this route: 404 unless LABS_ROUTES names it
  if (closed) return closed;
  rateLimit(req, "media_cancel", 20);
  const { id, initData } = await readJson(req, Body);
  const job = await mediaCall(() => media().jobs.cancel(id, { telegramId: telegramUserId(req, initData) }));
  return json({ job: publicJob(job) });
});
