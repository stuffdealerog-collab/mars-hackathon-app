import type { ConnectError } from "./types";

/**
 * Provider HTTP calls. Every call has a timeout and follows the caller's abort signal (the tick's budget). Errors
 * carry a stable code and the HTTP status only: never the URL (Meta's token exchange puts the app secret in the
 * query), never a token, never the provider's message text.
 */

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface CallOpts {
  signal?: AbortSignal;
  /** Per-request timeout, default 10 s. */
  timeoutMs?: number;
}

export class ProviderError extends Error {
  constructor(
    readonly code: ConnectError,
    readonly status?: number,
    /** For the server log only: the provider's own error code (e.g. "190", "invalid_grant"), never its text. */
    readonly detail?: string,
  ) {
    super(`provider error ${code}${status ? ` (${status})` : ""}${detail ? ` [${detail}]` : ""}`);
  }
}

export type ErrorMapper = (status: number, body: unknown) => { code: ConnectError; detail?: string };

export function query(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  return q.toString();
}

function signalFor(opts: CallOpts): AbortSignal {
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 10_000);
  return opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
}

export async function requestJson(fetchFn: FetchFn, url: string, init: RequestInit, opts: CallOpts, mapError: ErrorMapper): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchFn(url, { ...init, signal: signalFor(opts), cache: "no-store" });
  } catch {
    throw new ProviderError("sync_failed", undefined, "network");
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const { code, detail } = mapError(res.status, body);
    throw new ProviderError(code, res.status, detail);
  }
  return body;
}

/** Runs `fn` over `items` with at most `limit` in flight; stops starting new ones once `signal` aborts. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>, signal?: AbortSignal): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      if (signal?.aborted) return;
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out.filter((v) => v !== undefined);
}

/** A number from a provider value: numbers, numeric strings ("12.34", int64 as "1200000"); anything else is null. */
export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(v.trim())) return Number(v);
  return null;
}

export const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const str = (v: unknown): string | null => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : null);
