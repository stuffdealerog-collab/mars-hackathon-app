import type { Aspect, MediaJobStatus, MediaKind, MediaProviderId } from "./types";

/**
 * A media provider turns (prompt + product photo) into a video or an image,
 * asynchronously: submit -> poll -> result URL. Adapters take `fetch` as a
 * dependency so the lifecycle is unit-tested without the network.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface SubmitRequest {
  kind: MediaKind;
  prompt: string;
  negativePrompt: string;
  imageUrl: string; // https URL or data: URL
  aspect: Aspect;
  seconds: number;
  /** Our job id: sent as the provider's idempotency key so a retried submit never bills twice. */
  idempotencyKey: string;
}

export interface ProviderRef {
  requestId: string;
  model: string;
  statusUrl?: string;
  resultUrl?: string;
  cancelUrl?: string;
}

export type SubmitResult = ProviderRef;

export interface PollResult {
  status: MediaJobStatus;
  outputUrl?: string;
  contentType?: string;
  error?: string;
  queuePosition?: number;
}

export interface MediaProvider {
  id: MediaProviderId;
  label: string;
  isConfigured(): boolean;
  supports(kind: MediaKind): boolean;
  /** Model id/path used for this kind (for the job record and the UI). */
  model(kind: MediaKind): string;
  /** Accepts data: URLs directly (else the caller must pass an https URL). */
  acceptsDataUrls: boolean;
  /** How long the provider keeps outputs (ms), so we can warn before links die. */
  retentionMs?: number;
  submit(req: SubmitRequest): Promise<SubmitResult>;
  poll(ref: ProviderRef): Promise<PollResult>;
  cancel?(ref: ProviderRef): Promise<void>;
}

/** Error from a provider call. `message` must never contain credentials. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Removes anything that looks like a credential from a provider error before we store or show it. */
export function redactSecrets(text: string, secrets: (string | undefined)[] = []): string {
  let out = text;
  for (const s of secrets) {
    if (s && s.length >= 6) out = out.split(s).join("[redacted]");
  }
  return out
    .replace(/(Authorization|Key|Bearer|api[_-]?key|secret)(["'\s:=]+)[A-Za-z0-9._:\-]{12,}/gi, "$1$2[redacted]")
    .slice(0, 300);
}

/** Reads a JSON body without throwing on HTML error pages; returns the raw text on failure. */
export async function readBody(res: Response): Promise<{ json?: unknown; text: string }> {
  const text = await res.text();
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { text };
  }
}

export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
