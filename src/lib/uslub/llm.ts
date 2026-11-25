import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { getEnv } from "@/lib/env";
import { watchAnthropicBilling } from "../ops/alert";
import { recordUsage } from "./context";
import { wellFormed, wellFormedFetch } from "./text";

/** Quality model for copy, brand DNA and research; fast model for cheap steps. */
export const MODEL_QUALITY = "claude-sonnet-5-5";
export const MODEL_FAST = "claude-haiku-5-5";

// Models that accept the server-side refusal fallback (`fallbacks: "default"`).
const FALLBACK_MODELS = new Set(["claude-sonnet-5-5", "claude-opus-5-5"]);
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export type Effort = "low" | "medium" | "high";

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

let client: Anthropic | null = null;

export function isLlmConfigured(): boolean {
  return Boolean(getEnv().ANTHROPIC_API_KEY);
}

export function getAnthropic(): Anthropic {
  const apiKey = getEnv().ANTHROPIC_API_KEY;
  if (!apiKey) throw new LlmError("AI is not configured (ANTHROPIC_API_KEY)", 503);
  // wellFormedFetch: every request body leaves without half an emoji (a lone surrogate makes it invalid JSON for
  // the API: "unexpected end of hex escape"), whoever built it — llmJson, brainJson, knowledge, web, visual.
  // watchAnthropicBilling: a billing refusal (no credit, spend cap) also alerts the team (src/lib/ops/alert.ts).
  client ??= new Anthropic({ apiKey, timeout: 55_000, maxRetries: 1, fetch: watchAnthropicBilling(wellFormedFetch()) });
  return client;
}

function describeError(err: unknown): LlmError {
  if (err instanceof LlmError) return err;
  if (err instanceof Anthropic.RateLimitError) return new LlmError("AI is busy, try again in a minute", 429);
  if (err instanceof Anthropic.APIError) {
    console.error(`[uslub/llm] API error ${err.status}: ${err.message}`);
    return new LlmError("AI request failed", 502);
  }
  console.error("[uslub/llm] request failed:", err instanceof Error ? err.message : err);
  return new LlmError("AI request failed", 502);
}

/**
 * One structured-output call: the response is validated against `schema`.
 * Throws LlmError (with an HTTP-ish status) on refusal, timeout or bad output.
 */
export async function llmJson<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  prompt: string;
  model?: string;
  effort?: Effort;
  maxTokens?: number;
  timeoutMs?: number;
  /** Short label for usage logs, e.g. "copywriter". */
  purpose?: string;
  /** SDK retries (client default 1). Deadline-bound calls pass 0: a retry after a timeout can outlive the route. */
  maxRetries?: number;
}): Promise<z.infer<S>> {
  const anthropic = getAnthropic();
  const model = opts.model ?? MODEL_QUALITY;
  const t0 = Date.now();
  try {
    const response = await anthropic.beta.messages.parse(
      {
        model,
        max_tokens: opts.maxTokens ?? 8000,
        output_config: { effort: opts.effort ?? "low", format: betaZodOutputFormat(opts.schema) },
        ...(FALLBACK_MODELS.has(model) ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
        system: wellFormed(opts.system),
        messages: [{ role: "user", content: wellFormed(opts.prompt) }],
      },
      { timeout: opts.timeoutMs ?? 55_000, ...(opts.maxRetries != null ? { maxRetries: opts.maxRetries } : {}) },
    );
    recordUsage(response.model ?? model, response.usage, t0, opts.purpose);
    if (response.stop_reason === "refusal") throw new LlmError("AI declined this request", 422);
    if (response.stop_reason === "max_tokens") throw new LlmError("AI answer was cut off", 502);
    const parsed = response.parsed_output;
    if (parsed == null) throw new LlmError("AI returned an unexpected format", 502);
    return parsed as z.infer<S>;
  } catch (err) {
    throw describeError(err);
  }
}

/**
 * Free-text call with Claude's server-side web search. Returns the final text
 * plus the URLs the search actually returned (so callers can keep only sourced facts).
 */
export async function llmWebResearch(opts: {
  system: string;
  prompt: string;
  maxUses?: number;
  model?: string;
  timeoutMs?: number;
  purpose?: string;
}): Promise<{ text: string; sources: { url: string; title: string }[] }> {
  const anthropic = getAnthropic();
  const model = opts.model ?? MODEL_QUALITY;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: wellFormed(opts.prompt) }];
  const sources = new Map<string, string>();
  const texts: string[] = [];
  try {
    for (let turn = 0; turn < 3; turn++) {
      const t0 = Date.now();
      const response = await anthropic.beta.messages.create(
        {
          model,
          max_tokens: 8000,
          output_config: { effort: "low" },
          ...(FALLBACK_MODELS.has(model) ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
          system: wellFormed(opts.system),
          tools: [{ type: "web_search_20260209", name: "web_search", max_uses: opts.maxUses ?? 5 }],
          messages,
        },
        { timeout: opts.timeoutMs ?? 55_000 },
      );
      recordUsage(response.model ?? model, response.usage, t0, opts.purpose ?? "web_research");
      for (const block of response.content) {
        if (block.type === "text") texts.push(block.text);
        if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
          for (const r of block.content) {
            if (r.type === "web_search_result") sources.set(r.url, r.title ?? "");
          }
        }
      }
      if (response.stop_reason === "refusal") throw new LlmError("AI declined this request", 422);
      if (response.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: response.content });
    }
  } catch (err) {
    throw describeError(err);
  }
  return {
    text: texts.join("\n").trim(),
    sources: [...sources.entries()].map(([url, title]) => ({ url, title })),
  };
}
