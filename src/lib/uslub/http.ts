import "server-only";
import type { z } from "zod";
import { getEnv } from "@/lib/env";
import { authenticateRequest, validateInitData } from "@/lib/telegram-auth";
import { canAccessBrand } from "./access";
import { RateLimiter } from "./limit";
import { LlmError } from "./llm";
import { ScrapeError } from "./scrape";
import { getBrand, type StoredBrand } from "./store";

/**
 * Verified Telegram user id from the Mini App: `Authorization: tma <initData>`
 * header, or an `initData` body field. initData older than 24 h is rejected.
 * Returns null for anonymous web callers.
 */
export function telegramUserId(req: Request, initData?: string): number | null {
  const fromHeader = authenticateRequest(req);
  if (fromHeader) return fromHeader.id;
  const token = getEnv().TELEGRAM_BOT_TOKEN;
  if (initData && token) {
    const r = validateInitData(initData, token);
    if (r.ok) return r.user.id;
  }
  return null;
}

/** Loads a brand the caller may use, or throws 404/403. */
export async function loadBrandFor(brandId: string, userId: number | null): Promise<StoredBrand> {
  const brand = await getBrand(brandId);
  if (!brand) throw new HttpError(404, "Brand not found");
  if (!canAccessBrand(brand, userId)) throw new HttpError(403, "This brand belongs to another Telegram user");
  return brand;
}

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
const limiters = new Map<string, RateLimiter>();

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim();
}

export function rateLimit(req: Request, route: string, limit: number, windowMs = 60_000): void {
  let limiter = limiters.get(route);
  if (!limiter) limiters.set(route, (limiter = new RateLimiter(limit, windowMs)));
  const r = limiter.take(clientIp(req));
  if (!r.ok) {
    throw new HttpError(429, `Juda ko‘p so‘rov. ${Math.ceil(r.retryAfterMs / 1000)} soniyadan keyin qayta urinib ko‘ring.`);
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
