import { connection } from "next/server";
import { z } from "zod";
import { safeLogEvent } from "@/lib/track";
import { handle, HttpError, json, loadBrandFor, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { PRESET_IDS } from "@/lib/uslub/media/presets";
import { media } from "@/lib/uslub/media/service";
import { publicJob, type StylePresetId } from "@/lib/uslub/media/types";
import { mediaCall } from "../errors";

export const maxDuration = 60;

const Cue = z.object({ start: z.number().min(0).max(60), end: z.number().min(0).max(60), text: z.string().max(200) });

const Body = z.object({
  kind: z.enum(["video", "image"]).default("video"),
  imageUrl: z.string().trim().min(10).max(3_000_000),
  productName: z.string().trim().max(120).optional(),
  brief: z.string().trim().max(500).optional(),
  presetId: z.enum(PRESET_IDS as [StylePresetId, ...StylePresetId[]]).default("ai-os-dark"),
  aspect: z.enum(["9:16", "16:9", "1:1", "4:5"]).default("9:16"),
  seconds: z.number().min(3).max(12).default(5),
  captions: z.array(Cue).max(12).optional(),
  brandId: z.string().trim().min(1).max(64).optional(),
  provider: z.enum(["higgsfield", "fal", "demo"]).optional(),
  initData: z.string().max(8192).optional(),
});

/**
 * POST { kind, imageUrl, productName?, brief?, presetId, aspect, seconds, captions?, brandId? }
 *   -> { job }   (status "queued", or "failed" with `error` if the provider refused it)
 * 503 when no provider key is configured, 429 when the daily cap is reached.
 */
export const POST = handle(async (req) => {
  rateLimit(req, "media_create", 4);
  const body = await readJson(req, Body);
  if (body.brandId) await loadBrandFor(body.brandId, telegramUserId(req, body.initData));
  const job = await mediaCall(() =>
    media().jobs.create({
      kind: body.kind,
      imageUrl: body.imageUrl,
      productName: body.productName,
      brief: body.brief,
      presetId: body.presetId,
      aspect: body.aspect,
      seconds: body.seconds,
      captions: body.captions,
      brandId: body.brandId,
      provider: body.provider,
    }),
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

/** GET ?id= -> { job }  Polls the provider when due (at most every few seconds per job). */
export const GET = handle(async (req) => {
  await connection();
  rateLimit(req, "media_poll", 120);
  const id = new URL(req.url).searchParams.get("id")?.trim() ?? "";
  if (!id) throw new HttpError(400, "id is required");
  const job = await mediaCall(() => media().jobs.refresh(id));
  return json({ job: publicJob(job) });
});
