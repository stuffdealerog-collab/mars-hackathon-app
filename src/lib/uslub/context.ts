import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { safeLogEvent } from "@/lib/track";
import type { ApiLang } from "./errors";
import { summarizeUsage, usageEntry, type UsageEntry } from "./usage-cost";

/**
 * Per-request context: the owner's language (for error messages) and the Claude calls made while
 * serving the request (logged as one `llm_usage` event per run). Set by `handle()` for API routes and
 * by the bot around its slow work; code outside a context simply does not log usage.
 */
export interface RequestContext {
  route: string;
  lang: ApiLang;
  telegramId: number | null;
  usage: UsageEntry[];
}

const als = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: Omit<RequestContext, "usage">, fn: () => T): T {
  return als.run({ ...ctx, usage: [] }, fn);
}

export const currentContext = (): RequestContext | undefined => als.getStore();

export function setContextLang(lang: ApiLang): void {
  const ctx = als.getStore();
  if (ctx) ctx.lang = lang;
}

export function setContextUser(telegramId: number | null): void {
  const ctx = als.getStore();
  if (ctx && telegramId != null) ctx.telegramId = telegramId;
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
