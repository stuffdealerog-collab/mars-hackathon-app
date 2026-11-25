import { connection } from "next/server";
import { z } from "zod";
import { safeLogEvent } from "@/lib/track";
import { assertDraftAccess, clientIp, handle, HttpError, json, loadBrandFor, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { PRESET_IDS } from "@/lib/uslub/media/presets";
import { media } from "@/lib/uslub/media/service";
import { publicJob, type StylePresetId } from "@/lib/uslub/media/types";
import { actorKey } from "@/lib/uslub/visual/service";
import { mediaCall } from "../errors";
import { labsGate } from "@/lib/ops/labs";

export const maxDuration = 60;

const Cue = z.object({ start: z.number().min(0).max(60), end: z.number().min(0).max(60), text: z.string().max(200) });

const Body = z.object({
  kind: z.enum(["video", "image"]).default("video"),
  imageUrl: z.string().trim().min(10).max(3_000_000).optional(),
  referenceUrls: z.array(z.string().trim().min(10).max(2048)).max(8).optional(), // https style references (images only)
  productName: z.string().trim().max(120).optional(),
  brief: z.string().trim().max(500).optional(),
  presetId: z.enum(PRESET_IDS as [StylePresetId, ...StylePresetId[]]).default("paper-studio"), // neutral; never Mercat's own neon look on a client's ad
  aspect: z.enum(["9:16", "16:9", "1:1", "4:5"]).default("9:16"),
  seconds: z.number().min(3).max(12).default(5),
  captions: z.array(Cue).max(12).optional(),
  brandId: z.string().trim().min(1).max(64).optional(),
  provider: z.enum(["higgsfield", "fal", "demo"]).optional(),
  initData: z.string().max(8192).optional(),
});

/**
 * POST { kind, imageUrl?, referenceUrls?, productName?, brief?, presetId, aspect, seconds, captions?, brandId? }
 *   -> { job }   (status "queued", or "failed" with `error` if the provider refused it)
 * 503 when no provider key is configured; 401 when anonymous use is off; 429 when a daily cap is reached;
 * 403 when `brandId` names a brand that belongs to another Telegram user.
 */
export const POST = handle(async (req) => {
  const closed = labsGate("media/jobs"); // no screen calls this route: 404 unless LABS_ROUTES names it
  if (closed) return closed;
  rateLimit(req, "media_create", 4);
  const body = await readJson(req, Body);
  // Paid generation: a verified Telegram user spends their own daily quota; anonymous web
  // callers share one small pool (MEDIA_ANON_DAILY_LIMIT, 0 = login required), each IP only a
  // part of it (MEDIA_ANON_ACTOR_DAILY_LIMIT). See jobs.ts.
  const telegramId = telegramUserId(req, body.initData);
  if (body.brandId) {
    // A job counts against its brand's picture cap: only the owner (or an unowned / claimed web
    // brand's id holder) may spend it, the same rule as the post pictures.
    const brand = await loadBrandFor(body.brandId, telegramId);
    await assertDraftAccess(brand, telegramId);
  }
  const job = await mediaCall(() =>
    media().jobs.create({
      kind: body.kind,
      imageUrl: body.imageUrl,
      referenceUrls: body.referenceUrls,
      productName: body.productName,
      brief: body.brief,
      presetId: body.presetId,
      aspect: body.aspect,
      seconds: body.seconds,
      captions: body.captions,
      brandId: body.brandId,
      provider: body.provider,
    }, { telegramId, ipKey: actorKey(null, clientIp(req)) }),
  );
  await safeLogEvent(null, "media_job_created", {
    job_id: job.id,
    kind: job.kind,
    provider: job.provider,
    preset: job.presetId,
    status: job.status,
    brand_id: job.brandId ?? null,
  });
  return json({ job: publicJob(job) }, job.status === "failed" ? 502 : 201);
});

const poll = handle(async (req) => {
  rateLimit(req, "media_poll", 120);
  const id = new URL(req.url).searchParams.get("id")?.trim() ?? "";
  if (!id) throw new HttpError(400, "id is required");
  // Mini App callers send `Authorization: tma <initData>`; their jobs are visible only to them.
  const job = await mediaCall(() => media().jobs.refresh(id, { telegramId: telegramUserId(req) }));
  return json({ job: publicJob(job) });
});

/** GET ?id= -> { job }  Polls the provider when due (at most every few seconds per job). */
export async function GET(req: Request) {
  await connection(); // outside handle(): its try/catch must not swallow Next's prerender signal
  return labsGate("media/jobs") ?? poll(req);
}
