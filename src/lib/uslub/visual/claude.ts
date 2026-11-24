import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { getAnthropic, LlmError, MODEL_QUALITY } from "../llm";

/**
 * Structured-output call with image blocks (llm.ts's llmJson takes text only).
 * Same model, refusal fallback and error mapping as the rest of the engine.
 */
export async function claudeVisionJson<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  model?: string;
  timeoutMs?: number;
}): Promise<z.infer<S>> {
  const anthropic = getAnthropic();
  const model = opts.model ?? MODEL_QUALITY;
  try {
    const response = await anthropic.beta.messages.parse(
      {
        model,
        max_tokens: 4000,
        output_config: { effort: "low", format: betaZodOutputFormat(opts.schema) },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: opts.system,
        messages: [{ role: "user", content: opts.content }],
      },
      { timeout: opts.timeoutMs ?? 55_000 },
    );
    if (response.stop_reason === "refusal") throw new LlmError("AI declined this request", 422);
    if (response.stop_reason === "max_tokens") throw new LlmError("AI answer was cut off", 502);
    if (response.parsed_output == null) throw new LlmError("AI returned an unexpected format", 502);
    return response.parsed_output as z.infer<S>;
  } catch (err) {
    if (err instanceof LlmError) throw err;
    if (err instanceof Anthropic.RateLimitError) throw new LlmError("AI is busy, try again in a minute", 429);
    if (err instanceof Anthropic.APIError) {
      console.error(`[uslub/visual] Claude API error ${err.status}: ${err.message}`);
      throw new LlmError("AI request failed", 502);
    }
    console.error("[uslub/visual] Claude request failed:", err instanceof Error ? err.message : err);
    throw new LlmError("AI request failed", 502);
  }
}
