import { z } from "zod";
import { handle, json, rateLimit, readJson } from "@/lib/uslub/http";
import { media } from "@/lib/uslub/media/service";
import { publicJob } from "@/lib/uslub/media/types";
import { mediaCall } from "../../errors";

const Body = z.object({ id: z.string().trim().min(1).max(64) });

/** POST { id } -> { job }  Cancels a queued/running job (best effort at the provider). */
export const POST = handle(async (req) => {
  rateLimit(req, "media_cancel", 20);
  const { id } = await readJson(req, Body);
  const job = await mediaCall(() => media().jobs.cancel(id));
  return json({ job: publicJob(job) });
});
