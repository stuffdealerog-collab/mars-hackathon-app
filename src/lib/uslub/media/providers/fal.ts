import {
  isObj,
  ProviderError,
  readBody,
  str,
  type FetchLike,
  type MediaProvider,
  type PollResult,
  type ProviderRef,
  type SubmitRequest,
} from "../provider";
import type { MediaKind } from "../types";

/**
 * fal.ai queue API (plain REST, no SDK):
 *   POST https://queue.fal.run/{model}            Authorization: Key $FAL_KEY
 *        -> { request_id, status_url, response_url, cancel_url, queue_position }
 *   GET  status_url   -> 202 { status: IN_QUEUE | IN_PROGRESS }, 200 { status: COMPLETED, error?, error_type? }
 *   GET  response_url -> model output ({ video: { url } } | { images: [{ url }] }); kept only 6-60 min
 *   PUT  cancel_url
 * We always use the URLs fal returns: for model ids with sub-paths the request
 * URLs use only the base app id, so building them ourselves breaks.
 */

export const FAL_DEFAULT_MODELS: Record<MediaKind, string> = {
  video: "fal-ai/kling-video/v2.6/pro/image-to-video",
  image: "fal-ai/nano-banana-pro/edit",
};

const QUEUE = "https://queue.fal.run";

/**
 * Builds the model input. Field names are from each model's OpenAPI schema
 * (checked 2026-11-24, see docs/creative/media-pipeline.md):
 * - Kling 2.6 / v3: `start_image_url`, duration is a STRING ("5" | "10" on 2.6, "3".."15" on v3),
 *   generate_audio defaults to true (we turn it off: own music + VO, and it is cheaper);
 * - Kling v4: duration is an INTEGER 3-30, `resolution`;
 * - Seedance 2.x: `image_url`, duration string, aspect follows the image;
 * - Nano Banana Pro / Seedream edit: `image_urls[]`.
 */
export function falInput(model: string, req: SubmitRequest): Record<string, unknown> {
  const secs = Math.round(req.seconds);
  if (req.kind === "image") {
    if (model.includes("seedream")) {
      const size = { "9:16": "portrait_16_9", "16:9": "landscape_16_9", "1:1": "square_hd", "4:5": "portrait_4_3" }[req.aspect];
      return { prompt: req.prompt, image_urls: [req.imageUrl], image_size: size, num_images: 1 };
    }
    return {
      prompt: req.prompt,
      image_urls: [req.imageUrl],
      num_images: 1,
      aspect_ratio: req.aspect,
      resolution: "2K",
      output_format: "png",
    };
  }
  if (model.startsWith("kling/v4")) {
    return { prompt: req.prompt, start_image_url: req.imageUrl, duration: clamp(secs, 3, 30), resolution: "1080p" };
  }
  if (model.includes("kling-video/v2")) {
    return {
      prompt: req.prompt,
      start_image_url: req.imageUrl,
      duration: secs > 7 ? "10" : "5",
      negative_prompt: req.negativePrompt,
      generate_audio: false,
    };
  }
  if (model.includes("kling")) {
    return {
      prompt: req.prompt,
      start_image_url: req.imageUrl,
      duration: String(clamp(secs, 3, 15)),
      negative_prompt: req.negativePrompt,
      generate_audio: false,
    };
  }
  if (model.includes("seedance")) {
    return {
      prompt: req.prompt,
      image_url: req.imageUrl,
      duration: String(clamp(secs, 4, model.includes("2.0") ? 15 : 30)),
      resolution: "720p",
      generate_audio: false,
    };
  }
  // Unknown model (set via FAL_VIDEO_MODEL): the most common field names.
  return { prompt: req.prompt, image_url: req.imageUrl, duration: String(secs) };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Queue URLs use only `owner/app` of the model id (the full sub-path returns 405). */
export const falBase = (model: string) => model.split("/").slice(0, 2).join("/");

/** Finds the output URL in a fal result payload. */
export function falOutput(data: unknown): { url?: string; contentType?: string } {
  if (!isObj(data)) return {};
  const video = data.video;
  if (isObj(video) && str(video.url)) return { url: str(video.url), contentType: str(video.content_type) ?? "video/mp4" };
  const images = data.images;
  if (Array.isArray(images) && isObj(images[0]) && str(images[0].url)) {
    return { url: str(images[0].url), contentType: str(images[0].content_type) ?? "image/png" };
  }
  const image = data.image;
  if (isObj(image) && str(image.url)) return { url: str(image.url), contentType: str(image.content_type) };
  return {};
}

function errorText(data: unknown, fallback: string): string {
  if (isObj(data)) {
    const d = data.detail ?? data.error ?? data.message;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && isObj(d[0]) && typeof d[0].msg === "string") return d[0].msg;
  }
  return fallback;
}

/** Only follow URLs on fal's own queue host (never a URL injected into a stored job). */
function falUrl(url: string | undefined, fallback: string): string {
  if (url && url.startsWith(`${QUEUE}/`)) return url;
  return fallback;
}

export function falProvider(opts: {
  key?: string;
  videoModel?: string;
  imageModel?: string;
  fetch?: FetchLike;
}): MediaProvider {
  const doFetch: FetchLike = opts.fetch ?? ((u, i) => fetch(u, i));
  const models: Record<MediaKind, string> = {
    video: opts.videoModel ?? FAL_DEFAULT_MODELS.video,
    image: opts.imageModel ?? FAL_DEFAULT_MODELS.image,
  };
  const headers = () => ({ Authorization: `Key ${opts.key}`, "Content-Type": "application/json" });

  async function call(url: string, init: RequestInit): Promise<unknown> {
    let res: Response;
    try {
      res = await doFetch(url, { ...init, headers: headers(), cache: "no-store" });
    } catch {
      throw new ProviderError("fal.ai is unreachable", undefined, true);
    }
    const body = await readBody(res);
    if (!res.ok) {
      throw new ProviderError(`fal.ai ${res.status}: ${errorText(body.json, body.text.slice(0, 200))}`, res.status, res.status >= 500 || res.status === 429);
    }
    return body.json;
  }

  return {
    id: "fal",
    label: "fal.ai",
    acceptsDataUrls: true, // fal accepts base64 data URIs for image inputs
    retentionMs: undefined, // media URLs follow the account's expiration setting: copy results to our storage
    isConfigured: () => Boolean(opts.key),
    supports: () => true,
    model: (kind) => models[kind],

    async submit(req: SubmitRequest): Promise<ProviderRef> {
      const model = models[req.kind];
      const data = await call(`${QUEUE}/${model}`, { method: "POST", body: JSON.stringify(falInput(model, req)) });
      if (!isObj(data) || !str(data.request_id)) throw new ProviderError("fal.ai: no request_id in the submit response");
      return {
        requestId: str(data.request_id)!,
        model,
        statusUrl: str(data.status_url),
        resultUrl: str(data.response_url),
        cancelUrl: str(data.cancel_url),
      };
    },

    async poll(ref: ProviderRef): Promise<PollResult> {
      const base = `${QUEUE}/${falBase(ref.model)}/requests/${encodeURIComponent(ref.requestId)}`;
      const status = await call(falUrl(ref.statusUrl, `${base}/status`), { method: "GET" }); // 202 while running, 200 when done
      const s = isObj(status) ? str(status.status) : undefined;
      if (s === "IN_QUEUE") {
        return { status: "queued", queuePosition: isObj(status) && typeof status.queue_position === "number" ? status.queue_position : undefined };
      }
      if (s === "IN_PROGRESS") return { status: "running" };
      if (s !== "COMPLETED") return { status: "running" }; // unknown/new state: keep polling
      // failed and cancelled requests also end as COMPLETED, with `error` + `error_type`
      if (isObj(status) && str(status.error)) {
        return { status: str(status.error_type) === "client_cancelled" ? "canceled" : "failed", error: str(status.error) };
      }
      try {
        const result = await call(falUrl(ref.resultUrl, base), { method: "GET" });
        const out = falOutput(result);
        return out.url ? { status: "succeeded", outputUrl: out.url, contentType: out.contentType } : { status: "failed", error: "fal.ai: empty result" };
      } catch (err) {
        if (err instanceof ProviderError && err.status && err.status < 500) return { status: "failed", error: err.message };
        throw err;
      }
    },

    async cancel(ref: ProviderRef) {
      const base = `${QUEUE}/${falBase(ref.model)}/requests/${encodeURIComponent(ref.requestId)}`;
      await call(falUrl(ref.cancelUrl, `${base}/cancel`), { method: "PUT" });
    },
  };
}
