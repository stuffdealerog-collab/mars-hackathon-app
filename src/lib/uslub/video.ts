import "server-only";
import { z } from "zod";
import type { BrandProfile, VideoPlan } from "./contract";
import { llmJson, MODEL_QUALITY } from "./llm";
import { normalizeUzLatin } from "./translit";

const PlanSchema = z.object({
  hook: z.string(),
  scenes: z.array(z.object({ seconds: z.number(), visual: z.string(), voiceover: z.string(), caption: z.string() })),
  musicMood: z.string(),
});

const SYSTEM = `You are the "Videograf" of an AI marketing department for a small business in Uzbekistan.
Write a vertical Reels/TikTok plan (15-30 s total) that the owner can shoot on a phone.
Rules:
- hook: what is seen and said in the first 2 seconds; it must stop the scroll (a question, a surprising close-up, a number).
- 4-6 scenes; seconds = duration of each scene (2-6 s). visual = concrete shot description in Uzbek (Latin).
- voiceover: natural spoken Uzbek (Latin, o‘ g‘ with ‘), short sentences, like a real person, no AI clichés.
- caption: on-screen text, max 5 words, Uzbek (Latin).
- Use only facts from the brand data (no invented prices or addresses). Last scene = clear call to action.
- musicMood: one short phrase.`;

export async function planVideo(brand: BrandProfile, brief: string): Promise<VideoPlan> {
  const plan = await llmJson({
    schema: PlanSchema,
    system: SYSTEM,
    prompt: `BRAND DNA:\n${JSON.stringify(brand.dna)}\n\nKNOWLEDGE:\n${brand.knowledge.slice(0, 3000) || "(only the channel posts)"}\n\nRecent post example:\n${(
      brand.samplePosts.at(-1) ?? ""
    ).slice(0, 600)}\n\nVIDEO BRIEF: ${brief.slice(0, 1000)}`,
    model: MODEL_QUALITY,
    effort: "low",
    maxTokens: 4000,
  });
  return {
    hook: normalizeUzLatin(plan.hook),
    scenes: plan.scenes.slice(0, 6).map((s) => ({
      seconds: Math.max(1, Math.min(10, Math.round(s.seconds))),
      visual: normalizeUzLatin(s.visual),
      voiceover: normalizeUzLatin(s.voiceover),
      caption: normalizeUzLatin(s.caption),
    })),
    musicMood: plan.musicMood,
  };
}
