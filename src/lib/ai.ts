import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "./env";

/** Default model; override with ANTHROPIC_MODEL. */
export const DEFAULT_MODEL = "claude-sonnet-5-5";

// Models that accept the server-side refusal fallback (`fallbacks: "default"`).
const FALLBACK_MODELS = new Set([
  "claude-sonnet-5-5",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-fable-5-1",
  "claude-fable-5-2",
]);

const DEFAULT_SYSTEM =
  "You are a friendly assistant inside a Telegram bot. Reply in the language the user writes in " +
  "(Uzbek in Latin script, Russian, or English). Keep answers short (under 120 words) and use " +
  "plain text without Markdown.";

let client: Anthropic | null = null;

export function isAiConfigured(): boolean {
  return Boolean(getEnv().ANTHROPIC_API_KEY);
}

function getClient(): Anthropic | null {
  const apiKey = getEnv().ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  client ??= new Anthropic({ apiKey, timeout: 45_000, maxRetries: 1 });
  return client;
}

export type AskResult = { ok: boolean; text: string };

/**
 * One-shot question to Claude. Never throws: returns `fallbackText` when the
 * key is missing, the request fails, or the model declines.
 */
export async function askClaude(
  prompt: string,
  options: { system?: string; maxTokens?: number; fallbackText?: string } = {},
): Promise<AskResult> {
  const fallback = options.fallbackText ?? "AI is not available right now. Please try again later.";
  const anthropic = getClient();
  if (!anthropic) return { ok: false, text: fallback };

  const model = getEnv().ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  try {
    const response = await anthropic.beta.messages.create({
      model,
      max_tokens: options.maxTokens ?? 4096,
      output_config: { effort: "low" }, // chat replies: fast and cheap
      ...(FALLBACK_MODELS.has(model)
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
      system: options.system ?? DEFAULT_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });

    if (response.stop_reason === "refusal") return { ok: false, text: fallback };

    const text = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n")
      .trim();
    return text ? { ok: true, text } : { ok: false, text: fallback };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      console.warn("[ai] rate limited");
    } else if (err instanceof Anthropic.APIError) {
      console.error(`[ai] API error ${err.status}: ${err.message}`);
    } else {
      console.error("[ai] request failed:", err instanceof Error ? err.message : err);
    }
    return { ok: false, text: fallback };
  }
}
