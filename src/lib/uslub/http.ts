import "server-only";
import type { z } from "zod";
import { LlmError } from "./llm";
import { ScrapeError } from "./scrape";

/** Error with an HTTP status, rendered as `{ error }`. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export const errorResponse = (status: number, error: string) => json({ error }, status);

/* ------------------------------------------------------------- rate limit
 * Per-instance, per-IP sliding window. Protects API spend from a booth crowd
 * or a script; not a security boundary. */
const buckets = new Map<string, number[]>();

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim();
}

export function rateLimit(req: Request, route: string, limit: number, windowMs = 60_000): void {
  const key = `${route}:${clientIp(req)}`;
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    throw new HttpError(429, "Juda ko‘p so‘rov. Bir daqiqadan keyin qayta urinib ko‘ring.");
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
  }
}

export async function readJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HttpError(400, `Invalid input: ${issue?.path.join(".") || "body"} ${issue?.message ?? ""}`.trim());
  }
  return parsed.data;
}

/** Wraps a route handler: maps known errors to `{ error }` with the right status. */
export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await fn(req);
    } catch (err) {
      if (err instanceof HttpError) return errorResponse(err.status, err.message);
      if (err instanceof ScrapeError) return errorResponse(err.status, err.message);
      if (err instanceof LlmError) return errorResponse(err.status, err.message);
      console.error("[uslub/api]", err instanceof Error ? err.message : err);
      return errorResponse(500, "Internal error");
    }
  };
}
