/**
 * Media pipeline types (Videograf = video, Dizayner = still images).
 *
 * Not part of contract.ts on purpose: the lead owns the contract. These types are
 * proposed for it in the PR (see docs/creative/media-pipeline.md).
 * Pure module: safe in tests, the browser and the server.
 */

/** "video" = Videograf (product photo -> short ad clip); "image" = Dizayner (product photo -> ad still). */
export type MediaKind = "video" | "image";

export type MediaProviderId = "higgsfield" | "fal" | "demo";

export type MediaJobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export const TERMINAL_STATUSES: readonly MediaJobStatus[] = ["succeeded", "failed", "canceled"];
export const isTerminal = (s: MediaJobStatus) => TERMINAL_STATUSES.includes(s);

export type Aspect = "9:16" | "16:9" | "1:1" | "4:5";

export type StylePresetId = "ai-os-dark" | "warm-bazaar" | "paper-studio" | "evening-street" | "macro-detail";

/** One on-screen caption, in seconds from the start of the clip. */
export interface CaptionCue {
  start: number;
  end: number;
  text: string; // Uzbek (Latin) first; rendered by us, never by the video model
}

export interface MediaJobInput {
  kind: MediaKind;
  /** https URL of the product photo, or a data:image/...;base64 URL (small uploads). */
  imageUrl: string;
  productName?: string; // "handmade ceramic piala", "non (tandir bread)" — what must stay unchanged
  brief?: string; // optional extra direction from the owner
  presetId: StylePresetId;
  aspect: Aspect;
  seconds: number; // video length requested from the model (ignored for images)
  captions?: CaptionCue[];
  brandId?: string;
  provider?: MediaProviderId; // force a provider; default = first configured by preference
}

export interface MediaResult {
  url: string;
  contentType?: string;
  /** Provider URLs expire (Higgsfield keeps outputs >= 7 days): copy to our storage before then. */
  expiresAt?: string;
  /** true when the demo provider answered (no API key): the UI must label it "namuna". */
  demo?: boolean;
}

export interface MediaJob {
  id: string;
  kind: MediaKind;
  status: MediaJobStatus;
  provider: MediaProviderId;
  model: string;
  presetId: StylePresetId;
  aspect: Aspect;
  seconds: number;
  prompt: string;
  negativePrompt: string;
  imageRef: string; // the https URL, or "inline-upload" for data URLs (never stored)
  captions: CaptionCue[];
  brandId?: string;
  /** Who pays from which quota: "tg:<telegram id>" or "anon" (all anonymous web callers share one pool). Never sent to clients. */
  ownerKey: string;
  result?: MediaResult;
  error?: string;
  /** Provider bookkeeping (no secrets): request id and the URLs the provider told us to poll. */
  providerRequestId?: string;
  providerStatusUrl?: string;
  providerResultUrl?: string;
  providerCancelUrl?: string;
  polls: number;
  lastPolledAt?: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

/** What the API returns to the browser: no provider URLs. */
export type PublicMediaJob = Omit<MediaJob, "providerStatusUrl" | "providerResultUrl" | "providerCancelUrl" | "ownerKey">;

export const publicJob = (j: MediaJob): PublicMediaJob => {
  const out: Partial<MediaJob> = { ...j };
  delete out.providerStatusUrl;
  delete out.providerResultUrl;
  delete out.providerCancelUrl;
  delete out.ownerKey;
  return out as PublicMediaJob;
};
