import "server-only";
import { z } from "zod";
import type { NeuroHit, Script } from "./contract";
import { llmJson, MODEL_QUALITY } from "./llm";
import { analyzeNeuro, deletionEdit, inventedFacts } from "./neuro";

const LANG: Record<Script, string> = {
  uz_latn: "Uzbek (Latin script, use o‘ g‘ with ‘ and the tutuq ’)",
  uz_cyrl: "Uzbek (Cyrillic script)",
  ru: "Russian",
  en: "English",
};

const SYSTEM = `You are the "Editor" (Muharrir) of an AI marketing department in Uzbekistan.
You remove phrases that make copy sound machine-written ("neuro-words") and keep everything else.
Rules:
- Change ONLY the flagged phrases (plus the minimum around them so the sentence stays grammatical). Every other word stays exactly as it is.
- NEVER add anything that is not already in the text: no facts, numbers, prices, dates, weekdays, deadlines, discounts, promos, gifts, urgency ("hurry", "shoshiling", "спешите"), guarantees or claims.
- If there is no honest, plain replacement made only of information already in the text, DELETE the phrase (or the whole sentence if nothing meaningful is left).
- Keep facts, prices, numbers, links, @handles, hashtags, emoji and line breaks that are already there.
- Keep the same language and script as the input. A shorter text is fine.
- Uzbek: after k / q the dative suffix is -ka / -qa (keshbekka, qishloqqa), not -ga.`;

const RewriteSchema = z.object({ items: z.array(z.object({ id: z.string(), text: z.string() })) });

export interface EditJob {
  id: string;
  script: Script;
  text: string;
  hits: NeuroHit[];
}

export type EditOutcome = { text: string; mode: "unchanged" | "rewrite" | "deletion" };

/**
 * One LLM call that cleans several texts. A rewrite that introduces new
 * numbers, dates, weekdays, %, promo or urgency words is discarded and replaced
 * by a deletion-only edit (deletionEdit), so the editor can never invent facts.
 */
export async function rewriteNeuroBatch(jobs: EditJob[], opts: { skipLlm?: boolean; timeoutMs?: number } = {}): Promise<Map<string, EditOutcome>> {
  const out = new Map<string, EditOutcome>(jobs.map((j) => [j.id, { text: j.text, mode: "unchanged" }] as const));
  const todo = jobs.filter((j) => j.hits.length > 0);
  if (!todo.length) return out;
  if (opts.skipLlm) {
    for (const job of todo) out.set(job.id, { text: deletionEdit(job.text, job.hits), mode: "deletion" });
    return out;
  }
  const prompt = todo
    .map(
      (j) =>
        `### id: ${j.id}\nLanguage: ${LANG[j.script]}\nFlagged phrases: ${j.hits
          .map((h) => `"${h.phrase}"${h.suggestion ? ` (hint: ${h.suggestion})` : ""}`)
          .join("; ")}\nText:\n${j.text}`,
    )
    .join("\n\n");
  let rewrites = new Map<string, string>();
  try {
    const res = await llmJson({
      schema: RewriteSchema,
      system: SYSTEM,
      prompt: `Clean these texts. Return every id.\n\n${prompt}`,
      model: MODEL_QUALITY,
      effort: "low",
      maxTokens: 8000,
      timeoutMs: opts.timeoutMs,
      purpose: "editor",
    });
    rewrites = new Map(res.items.map((i) => [i.id, i.text.trim()] as const));
  } catch (err) {
    console.warn("[uslub/editor] rewrite failed, using deletion edit:", err instanceof Error ? err.message : err);
  }
  for (const job of todo) {
    const candidate = rewrites.get(job.id);
    const invented = candidate ? inventedFacts(job.text, candidate) : [];
    if (candidate && candidate.length > 10 && invented.length === 0) {
      out.set(job.id, { text: candidate, mode: "rewrite" });
    } else {
      if (invented.length) console.warn(`[uslub/editor] rewrite discarded, invented: ${invented.slice(0, 5).join(", ")}`);
      out.set(job.id, { text: deletionEdit(job.text, job.hits), mode: "deletion" });
    }
  }
  return out;
}

/** Single-text helper used by /api/uslub/neuro: before/after hits and scores. */
export async function cleanText(text: string, script: Script) {
  const before = analyzeNeuro(text, script);
  if (!before.hits.length) {
    return {
      text,
      hits: before.hits,
      removed: [] as NeuroHit[],
      remaining: [] as NeuroHit[],
      humanScoreBefore: before.humanScore,
      humanScore: before.humanScore,
      mode: "unchanged" as const,
    };
  }
  const outcome = (await rewriteNeuroBatch([{ id: "t", script, text, hits: before.hits }])).get("t") ?? {
    text,
    mode: "unchanged" as const,
  };
  const after = analyzeNeuro(outcome.text, script);
  const stillThere = (h: NeuroHit) => after.hits.some((a) => a.phrase.toLowerCase() === h.phrase.toLowerCase());
  return {
    text: outcome.text,
    hits: before.hits, // found in the ORIGINAL text
    removed: before.hits.filter((h) => !stillThere(h)),
    remaining: after.hits, // found in the cleaned text
    humanScoreBefore: before.humanScore,
    humanScore: after.humanScore,
    mode: outcome.mode,
  };
}
