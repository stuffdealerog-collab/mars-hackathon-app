import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { runWithEventMeta, setEventMeta, type Surface } from "../stats-meta";
import { safeLogEvent } from "@/lib/track";
import type { ApiLang } from "./errors";
import { summarizeUsage, usageEntry, type UsageEntry } from "./usage-cost";

/**
 * Per-request context: the owner's language (for error messages) and the Claude calls made while
 * serving the request (logged as one `llm_usage` event per run). Set by `handle()` for API routes and
 * by the bot around its slow work; code outside a context simply does not log usage.
 *
 * It also sets the ambient analytics fields of every event logged inside (stats-meta.ts EventMeta): the surface (given,
 * or "bot" for a `bot/…` route), the anonymous web visitor key, and the verified Telegram user.
 */
export interface RequestContext {
  route: string;
  lang: ApiLang;
  telegramId: number | null;
  usage: UsageEntry[];
}

/** Analytics fields a run may start with (see stats-meta.ts). Never part of the context object itself. */
export type RunAnalytics = { surface?: Surface; visitor?: string | null };

const als = new AsyncLocalStorage<RequestContext>();

export const surfaceForRoute = (route: string): Surface | undefined => (route.startsWith("bot/") ? "bot" : undefined);

export function runWithContext<T>(ctx: Omit<RequestContext, "usage"> & RunAnalytics, fn: () => T): T {
  const { surface, visitor, ...rest } = ctx;
  const meta = { surface: surface ?? surfaceForRoute(rest.route), visitor: visitor ?? null, telegramId: rest.telegramId };
  return als.run({ ...rest, usage: [] }, () => runWithEventMeta(meta, fn));
}

export const currentContext = (): RequestContext | undefined => als.getStore();

export function setContextLang(lang: ApiLang): void {
  const ctx = als.getStore();
  if (ctx) ctx.lang = lang;
}

export function setContextUser(telegramId: number | null): void {
  const ctx = als.getStore();
  if (ctx && telegramId != null) {
    ctx.telegramId = telegramId;
    setEventMeta({ telegramId });
  }
}

/** The request turned out to come from another surface (the Mini App, once its initData verifies). */
export function setContextSurface(surface: Surface): void {
  if (als.getStore()) setEventMeta({ surface });
}

/** Records one Claude call (model, tokens, web searches, latency) in the current request context. */
export function recordUsage(model: string, usage: unknown, startedAt: number, purpose?: string): void {
  const ctx = als.getStore();
  if (!ctx) return;
  ctx.usage.push(usageEntry(model, usage, Date.now() - startedAt, purpose));
}

/** Writes the calls recorded so far as one `llm_usage` event and clears them. Never throws. */
export async function flushUsage(ctx: RequestContext | undefined = als.getStore()): Promise<void> {
  if (!ctx || !ctx.usage.length) return;
  const entries = ctx.usage.splice(0, ctx.usage.length);
  try {
    await safeLogEvent(ctx.telegramId, "llm_usage", { ...summarizeUsage(ctx.route, entries) });
  } catch {
    // best effort
  }
}
