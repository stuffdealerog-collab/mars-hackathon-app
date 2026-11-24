import "server-only";
import { z } from "zod";
import type { NeuroHit, Script } from "./contract";
import { llmJson, MODEL_QUALITY } from "./llm";
import { analyzeNeuro } from "./neuro";

const LANG: Record<Script, string> = {
  uz_latn: "Uzbek (Latin script, use o‘ g‘ with ‘ and the tutuq ’)",
  uz_cyrl: "Uzbek (Cyrillic script)",
  ru: "Russian",
  en: "English",
};

const SYSTEM = `You are the "Editor" (Muharrir) of an AI marketing department in Uzbekistan.
You remove phrases that make copy sound machine-written ("neuro-words") and keep everything else.
Rules:
- Replace or delete ONLY the flagged phrases (and the minimum around them so the sentence stays grammatical).
- Keep the meaning, facts, prices, numbers, links, @handles, hashtags, emoji and line breaks.
- Never add new facts, prices, promises or superlatives. Prefer concrete, plain words.
- Keep the same language and script as the input.`;

const RewriteSchema = z.object({ items: z.array(z.object({ id: z.string(), text: z.string() })) });

export interface EditJob {
  id: string;
  script: Script;
  text: string;
  hits: NeuroHit[];
}

/** One LLM call that cleans several texts. Returns id -> cleaned text (falls back to the input). */
export async function rewriteNeuroBatch(jobs: EditJob[]): Promise<Map<string, string>> {
  const out = new Map(jobs.map((j) => [j.id, j.text] as const));
  const todo = jobs.filter((j) => j.hits.length > 0);
  if (!todo.length) return out;
  const prompt = todo
    .map(
      (j) =>
        `### id: ${j.id}\nLanguage: ${LANG[j.script]}\nFlagged phrases: ${j.hits
          .map((h) => `"${h.phrase}"${h.suggestion ? ` (hint: ${h.suggestion})` : ""}`)
          .join("; ")}\nText:\n${j.text}`,
    )
    .join("\n\n");
  try {
    const res = await llmJson({
      schema: RewriteSchema,
      system: SYSTEM,
      prompt: `Clean these texts. Return every id.\n\n${prompt}`,
      model: MODEL_QUALITY,
      effort: "low",
      maxTokens: 8000,
    });
    for (const item of res.items) {
      if (out.has(item.id) && item.text.trim().length > 10) out.set(item.id, item.text.trim());
    }
  } catch (err) {
    console.warn("[uslub/editor] rewrite skipped:", err instanceof Error ? err.message : err);
  }
  return out;
}

/** Single-text helper used by /api/uslub/neuro. */
export async function cleanText(text: string, script: Script) {
  const before = analyzeNeuro(text, script);
  if (!before.hits.length) return { text, ...before };
  const cleaned = (await rewriteNeuroBatch([{ id: "t", script, text, hits: before.hits }])).get("t") ?? text;
  return { text: cleaned, ...analyzeNeuro(cleaned, script) };
}
