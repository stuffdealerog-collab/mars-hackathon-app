import "server-only";
import { after } from "next/server";
import type { z } from "zod";
import { getEnv } from "@/lib/env";
import { authenticateRequest, validateInitData } from "@/lib/telegram-auth";
import { canAccessBrand } from "./access";
import { BrainScrapeError } from "./brain/scrape";
import { currentContext, flushUsage, runWithContext, setContextLang, setContextUser } from "./context";
import { type ApiLang, codeForStatus, type ErrorCode, errorText, isApiLang, pickApiLang } from "./errors";
import { RateLimiter } from "./limit";
import { LlmError } from "./llm";
import { ScrapeError } from "./scrape";
import { getBrand, type StoredBrand, wasClaimed } from "./store";

/**
 * Verified Telegram user id from the Mini App: `Authorization: tma <initData>`
 * header, or an `initData` body field. initData older than 24 h is rejected.
 * Returns null for anonymous web callers.
 */
export function telegramUserId(req: Request, initData?: string): number | null {
  const fromHeader = authenticateRequest(req);
  if (fromHeader) {
    setContextUser(fromHeader.id);
    return fromHeader.id;
  }
  const token = getEnv().TELEGRAM_BOT_TOKEN;
  if (initData && token) {
    const r = validateInitData(initData, token);
    if (r.ok) {
      setContextUser(r.user.id);
      return r.user.id;
    }
  }
  return null;
}

/**
 * Loads a brand the caller may use, or throws 404/403. A brand created anonymously on the web and later claimed
 * in the bot stays usable by whoever holds its id (the creating browser): the claim only adds publishing rights,
 * which publishPost still checks against the Telegram owner.
 */
export async function loadBrandFor(brandId: string, userId: number | null): Promise<StoredBrand> {
  const brand = await getBrand(brandId);
  if (!brand) throw new HttpError(404, "Brand not found", "brand_not_found");
  if (!canAccessBrand(brand, userId) && !(await wasClaimed(brand.id))) throw new HttpError(403, "This brand belongs to another Telegram user", "brand_forbidden");
  return brand;
}

/**
 * Drafts are private. Owner, unowned brand (id holder), or a web brand claimed in the bot (id holder) may read
 * and approve them; nobody else, whatever the brand's source (channel_only rows are public data, drafts are not).
 */
export async function assertDraftAccess(brand: StoredBrand, userId: number | null): Promise<void> {
  if (brand.ownerTelegramId == null || brand.ownerTelegramId === userId) return;
  if (await wasClaimed(brand.id)) return;
  throw new HttpError(403, "posts of another owner", "brand_forbidden");
}

/**
 * Error with an HTTP status, rendered as `{ error, code, ...extra }`. `message` is for logs; the owner sees the
 * localized text for `code` (errors.ts) in the request's language.
 */
export class HttpError extends Error {
  readonly code: ErrorCode;
  constructor(
    readonly status: number,
    message: string,
    code?: ErrorCode,
    readonly vars: Record<string, string | number> = {},
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.code = code ?? codeForStatus(status);
  }
}

export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

/** The owner-safe body for any error: localized text + stable code (+ extra fields such as `reason`). */
export function errorBody(err: unknown, lang: ApiLang = currentContext()?.lang ?? "uz"): { status: number; body: { error: string; code: ErrorCode } & Record<string, unknown> } {
  if (err instanceof BrainScrapeError) err = brainScrapeToHttp(err);
  if (err instanceof ScrapeError) err = scrapeToHttp(err);
  if (err instanceof HttpError) {
    return { status: err.status, body: { ...err.extra, error: errorText(err.code, lang, err.vars), code: err.code } };
  }
  if (err instanceof LlmError) {
    const code: ErrorCode = err.status === 503 ? "ai_not_configured" : err.status === 429 ? "ai_busy" : err.status === 422 ? "ai_refused" : "ai_failed";
    return { status: err.status, body: { error: errorText(code, lang), code } };
  }
  console.error("[uslub/api]", err instanceof Error ? (err.stack ?? err.message) : err);
  return { status: 500, body: { error: errorText("internal", lang), code: "internal" } };
}

export const errorResponse = (status: number, error: string, code: ErrorCode = codeForStatus(status)) => json({ error, code }, status);

function scrapeToHttp(err: ScrapeError): HttpError {
  if (err.code === "channel_empty") return channelEmpty(err.channel ?? "", err.reason ?? "no_preview", err.postsFound ?? 0);
  if (err.code === "knowledge_needed") return new HttpError(400, err.message, "knowledge_needed");
  if (err.code === "channel_invalid" || err.status === 400) return new HttpError(400, err.message, "channel_invalid");
  return new HttpError(err.status >= 500 ? 504 : err.status, err.message, "telegram_unavailable");
}

function brainScrapeToHttp(err: BrainScrapeError): HttpError {
  if (err.code === "BAD_CHANNEL") return new HttpError(400, err.message, "channel_invalid");
  if (err.code === "NO_PUBLIC_PREVIEW") return channelEmpty(err.channel ?? "", "no_preview", 0);
  return new HttpError(504, err.message, "telegram_unavailable");
}

/** The channel has no public preview or fewer than MIN_CHANNEL_POSTS posts: the Studio switches to fresh mode. */
export function channelEmpty(channel: string, reason: "few_posts" | "no_preview", postsFound: number): HttpError {
  const handle = channel ? `@${channel.replace(/^@/, "")}` : "";
  return new HttpError(422, `channel empty: ${handle} ${reason} ${postsFound}`, "channel_empty", { channel: handle }, { reason, postsFound, channel: handle || undefined, mode: "fresh" });
}

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
    const seconds = Math.ceil(r.retryAfterMs / 1000);
    throw new HttpError(429, "rate limited", "rate_limited", { seconds }, { retryAfterSeconds: seconds });
  }
}

export async function readJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body", "bad_request");
  }
  // The owner's language (body.lang) also decides the language of any error that follows.
  const lang = (body as { lang?: unknown } | null)?.lang;
  if (isApiLang(lang)) setContextLang(lang);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.join(".") || "body";
    throw new HttpError(400, `Invalid input: ${field} ${issue?.message ?? ""}`.trim(), "invalid_input", { field });
  }
  return parsed.data;
}

/**
 * Wraps a route handler: runs it inside a request context (language, usage accounting), maps every error to an
 * owner-safe `{ error, code }` and logs the run's Claude usage as one `llm_usage` event.
 */
export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const lang = pickApiLang(url.searchParams.get("lang"), req.headers.get("x-lang"), req.headers.get("accept-language"));
    return runWithContext({ route: url.pathname.replace(/^\/api\//, ""), lang, telegramId: null }, async () => {
      const ctx = currentContext();
      try {
        return await fn(req);
      } catch (err) {
        const { status, body } = errorBody(err);
        return json(body, status);
      } finally {
        // Streams flush their own usage when they finish; this writes whatever the handler itself spent.
        const flush = () => flushUsage(ctx);
        try {
          after(flush);
        } catch {
          await flush();
        }
      }
    });
  };
}
