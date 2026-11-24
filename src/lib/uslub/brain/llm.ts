import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { recordUsage } from "@/lib/uslub/context";
import { getAnthropic, LlmError } from "@/lib/uslub/llm";

/** Drops lone UTF-16 surrogates (e.g. an emoji cut in half), which make the request body invalid JSON. */
export const wellFormed = (s: string) => s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");

export const SONNET = "claude-sonnet-5-5";
export const HAIKU = "claude-haiku-5-5";

/**
 * One structured-output call (output_config.format = json_schema; no forced tool_choice).
 * Static system prompt first with cache_control; stop_reason checked before parsing.
 * Sonnet calls opt into the server-side refusal fallback.
 */
export async function brainJson<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  prompt: string;
  model: string;
  effort: "low" | "medium" | "high";
  maxTokens?: number;
  timeoutMs?: number;
  purpose?: string;
}): Promise<z.infer<S>> {
  const anthropic = getAnthropic();
  const sonnet = opts.model === SONNET;
  const t0 = Date.now();
  const response = await anthropic.beta.messages
    .parse(
      {
        model: opts.model,
        max_tokens: opts.maxTokens ?? 12000,
        output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
        ...(sonnet ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: wellFormed(opts.prompt) }],
      },
      { timeout: opts.timeoutMs ?? 50_000 },
    )
    .catch((err: unknown) => {
      console.error("[brain/llm]", opts.model, err instanceof Error ? err.message : err);
      throw new LlmError("AI request failed", 502);
    });
  recordUsage(response.model ?? opts.model, response.usage, t0, opts.purpose ?? "brain");
  if (response.stop_reason === "refusal") throw new LlmError("AI declined this request", 422);
  if (response.stop_reason === "max_tokens") throw new LlmError("AI answer was cut off", 502);
  if (response.parsed_output == null) throw new LlmError("AI returned an unexpected format", 502);
  return response.parsed_output as z.infer<S>;
}

export const GROUNDING = (lang: string, apostrophe: string, lexicon: string[]) => `GROUNDING CONTRACT — applies to every word you write.
You receive a LEDGER. Ids: S.* = statistics computed by code, F# = owner's knowledge base, W# = web sources (with URL), P.* = real Telegram posts, R.* = decision rules that fired in code.
1. Every claim ends with the ids that support it in square brackets: "... [S.reachRate, R.LOW_REACH]". A claim with no id will be deleted.
2. Numbers, prices, dates, percentages, years, counts, names, addresses: copy the ledger entry's \`display\` exactly. Do not calculate new numbers, re-round, convert, combine ("2x", "half as many") or estimate. If the number you want is not in the ledger, write the sentence without a number.
3. Never invent customers, reviews, awards, discounts, deadlines, guarantees, delivery terms, places, channels or competitor facts.
4. Entries with prior=true are rules of thumb: say "taxminiy me'yor" / "ориентир" / "rule of thumb", never "the norm".
5. If data is insufficient, say so plainly. "Not enough data yet (n=2)" is a useful answer; a guess is not.
6. Write in ${lang}: uz = Uzbek Latin in the owner's apostrophe style (${apostrophe}); ru = Russian; en = English. Use the words a shop owner uses ("ko'rishlar", "botga yozganlar", "buyurtma"), not marketing jargon ("engagement", "awareness", "funnel", "kontent-strategiya").
7. Never use these phrases or their paraphrases: ${lexicon.join("; ")}.`;
