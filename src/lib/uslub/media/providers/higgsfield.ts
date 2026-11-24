import {
  inputImages,
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
import type { Aspect, MediaKind } from "../types";

/**
 * Higgsfield Cloud API (developer API, pay-as-you-go USD balance — NOT the
 * subscription/MCP credits). Verified against docs.higgsfield.ai on 2026-11-24:
 *   POST https://api.higgsfield.ai/{endpoint}   Authorization: Key ID:SECRET, Idempotency-Key
 *        flat JSON body -> { status: "queued", request_id, status_url, cancel_url, expires_after }
 *   GET  /requests/{id}/status -> { status: queued|in_progress|completed|failed|nsfw|canceled,
 *                                   video?: { url }, images?: [{ url }], error? }  (outputs live here)
 *   POST /requests/{id}/cancel -> 202 (400 once it has started)
 *   POST /files/generate-upload-url { content_type } -> { public_url, upload_url, upload_headers }
 * Outputs are kept 7 days. Failed / NSFW jobs are not charged.
 */

const API = "https://api.higgsfield.ai";

export const HIGGSFIELD_DEFAULT_MODELS: Record<MediaKind, string> = {
  video: "bytedance/seedance-2.5/image-to-video",
  image: "marketing-studio/image/flare", // GPT Image 2.5 "Flare": edits with reference images
};

const SEVEN_DAYS = 7 * 24 * 3600_000;

const ratio = (a: Aspect, allowed: string[], fallback: string) => (allowed.includes(a) ? a : a === "4:5" && allowed.includes("3:4") ? "3:4" : fallback);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Model-specific body. Most endpoints set additionalProperties:false, so we never send extra fields. */
export function higgsfieldInput(model: string, req: SubmitRequest, imageUrl: string): Record<string, unknown> {
  const secs = Math.round(req.seconds);
  if (req.kind === "image") {
    if (model.includes("qwen-image")) {
      return {
        prompt: req.prompt,
        image_urls: [imageUrl],
        resolution: "2k",
        aspect_ratio: ratio(req.aspect, ["1:1", "9:16", "16:9", "3:4", "4:3"], "1:1"),
        negative_prompt: req.negativePrompt,
      };
    }
    if (model.includes("soul")) {
      return {
        prompt: req.prompt,
        image_reference_url: imageUrl,
        aspect_ratio: ratio(req.aspect, ["9:16", "16:9", "4:3", "3:4", "1:1"], "1:1"),
        resolution: "1080p",
      };
    }
    // marketing-studio/image(/flare), xai/grok-imagine-image-2.0
    return {
      prompt: req.prompt,
      image_urls: [imageUrl],
      resolution: "2k",
      aspect_ratio: ratio(req.aspect, ["1:1", "9:16", "16:9", "3:4", "4:3"], "1:1"),
      ...(model.includes("marketing-studio") ? { quality: "high" } : {}),
    };
  }
  if (model.includes("seedance")) {
    // no aspect_ratio / negative_prompt: the frame follows the photo; audio off = we add music + VO
    return {
      image_url: imageUrl,
      prompt: req.prompt,
      duration: clamp(secs, 4, model.includes("2.0") ? 15 : 30),
      resolution: "720p",
      generate_audio: false,
    };
  }
  if (model.includes("kling-video/v2.6")) {
    return {
      image_url: imageUrl,
      prompt: req.prompt,
      duration: secs > 7 ? 10 : 5,
      aspect_ratio: ratio(req.aspect, ["16:9", "9:16", "1:1"], "9:16"),
      sound: "off",
    };
  }
  if (model.includes("kling")) {
    return { image_url: imageUrl, prompt: req.prompt, duration: clamp(secs, 3, 15), sound: "off" };
  }
  return { image_url: imageUrl, prompt: req.prompt, duration: secs };
}

export function higgsfieldOutput(data: unknown): { url?: string; contentType?: string } {
  if (!isObj(data)) return {};
  if (isObj(data.video) && str(data.video.url)) return { url: str(data.video.url), contentType: str(data.video.content_type) ?? "video/mp4" };
  const images = data.images;
  if (Array.isArray(images) && isObj(images[0]) && str(images[0].url)) {
    return { url: str(images[0].url), contentType: str(images[0].content_type) ?? "image/png" };
  }
  return {};
}

function errorText(data: unknown, fallback: string): string {
  if (!isObj(data)) return fallback;
  const d = data.detail ?? data.details ?? data.message ?? data.error;
  if (typeof d === "string") return d;
  if (isObj(d) && typeof d.message === "string") return d.message;
  if (Array.isArray(d) && isObj(d[0]) && typeof d[0].msg === "string") return d[0].msg;
  return fallback;
}

/** Only follow URLs on Higgsfield's own API host. */
const apiUrl = (url: string | undefined, fallback: string) => (url && url.startsWith(`${API}/`) ? url : fallback);

const DATA_URL = /^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/;

export function higgsfieldProvider(opts: {
  keyId?: string;
  keySecret?: string;
  videoModel?: string;
  imageModel?: string;
  fetch?: FetchLike;
}): MediaProvider {
  const doFetch: FetchLike = opts.fetch ?? ((u, i) => fetch(u, i));
  const models: Record<MediaKind, string> = {
    video: opts.videoModel ?? HIGGSFIELD_DEFAULT_MODELS.video,
    image: opts.imageModel ?? HIGGSFIELD_DEFAULT_MODELS.image,
  };
  const auth = () => ({ Authorization: `Key ${opts.keyId}:${opts.keySecret}` });

  async function call(url: string, init: RequestInit & { headers?: Record<string, string> }): Promise<unknown> {
    let res: Response;
    try {
      res = await doFetch(url, { ...init, headers: { ...auth(), ...(init.headers ?? {}) }, cache: "no-store" });
    } catch {
      throw new ProviderError("Higgsfield API is unreachable", undefined, true);
    }
    const body = await readBody(res);
    if (!res.ok) {
      const hint = res.status === 403 ? " (insufficient API balance?)" : "";
      throw new ProviderError(
        `Higgsfield ${res.status}: ${errorText(body.json, body.text.slice(0, 200))}${hint}`,
        res.status,
        res.status >= 500 || res.status === 429,
      );
    }
    return body.json;
  }

  /** data: URL -> presigned upload -> public https URL (the API does not take data URIs). */
  async function toPublicUrl(imageUrl: string): Promise<string> {
    const m = DATA_URL.exec(imageUrl);
    if (!m) return imageUrl;
    const contentType = m[1] === "image/jpg" ? "image/jpeg" : m[1];
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    const up = await call(`${API}/files/generate-upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content_type: contentType }),
    });
    if (!isObj(up) || !str(up.upload_url) || !str(up.public_url)) throw new ProviderError("Higgsfield: no upload URL returned");
    const headers = isObj(up.upload_headers) ? (up.upload_headers as Record<string, string>) : { "Content-Type": contentType };
    let put: Response;
    try {
      // no Authorization header to the storage URL
      put = await doFetch(str(up.upload_url)!, { method: "PUT", headers, body: bytes });
    } catch {
      throw new ProviderError("Higgsfield upload failed (network)", undefined, true);
    }
    if (!put.ok) throw new ProviderError(`Higgsfield upload failed: ${put.status}`, put.status);
    return str(up.public_url)!;
  }

  return {
    id: "higgsfield",
    label: "Higgsfield",
    acceptsDataUrls: true, // via the presigned upload above
    retentionMs: SEVEN_DAYS,
    isConfigured: () => Boolean(opts.keyId && opts.keySecret),
    supports: () => true,
    model: (kind) => models[kind],

    async submit(req: SubmitRequest): Promise<ProviderRef> {
      const model = models[req.kind];
      // Higgsfield models take one input image: the product photo, else the first reference.
      const first = inputImages(req)[0];
      if (!first) throw new ProviderError("Higgsfield needs an input image", 400);
      const imageUrl = await toPublicUrl(first);
      const data = await call(`${API}/${model}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": req.idempotencyKey },
        body: JSON.stringify(higgsfieldInput(model, req, imageUrl)),
      });
      if (!isObj(data) || !str(data.request_id)) throw new ProviderError("Higgsfield: no request_id in the submit response");
      const id = str(data.request_id)!;
      return {
        requestId: id,
        model,
        statusUrl: str(data.status_url) ?? `${API}/requests/${encodeURIComponent(id)}/status`,
        cancelUrl: str(data.cancel_url) ?? `${API}/requests/${encodeURIComponent(id)}/cancel`,
      };
    },

    async poll(ref: ProviderRef): Promise<PollResult> {
      const data = await call(apiUrl(ref.statusUrl, `${API}/requests/${encodeURIComponent(ref.requestId)}/status`), { method: "GET" });
      const s = isObj(data) ? str(data.status) : undefined;
      switch (s) {
        case "queued":
          return { status: "queued" };
        case "in_progress":
          return { status: "running" };
        case "completed": {
          const out = higgsfieldOutput(data);
          return out.url ? { status: "succeeded", outputUrl: out.url, contentType: out.contentType } : { status: "failed", error: "Higgsfield: completed without an output URL" };
        }
        case "nsfw":
          return { status: "failed", error: "Higgsfield moderatsiyasi rad etdi (NSFW). Boshqa rasm yuboring. / Модерация отклонила запрос." };
        case "failed":
          return { status: "failed", error: errorText(data, "Generation failed") };
        case "canceled":
          return { status: "canceled" };
        default:
          return { status: "running" }; // unknown state: keep polling
      }
    },

    async cancel(ref: ProviderRef) {
      await call(apiUrl(ref.cancelUrl, `${API}/requests/${encodeURIComponent(ref.requestId)}/cancel`), { method: "POST" });
    },
  };
}
