import "server-only";
import { z } from "zod";
import type { BrandDNA, Script } from "./contract";
import { llmJson, MODEL_QUALITY } from "./llm";

const ScriptEnum = z.enum(["uz_latn", "uz_cyrl", "ru", "en"]);

const DnaSchema = z.object({
  name: z.string(),
  oneLiner: z.string(),
  audience: z.string(),
  tone: z.string(),
  address: z.enum(["siz", "sen", "mixed", "n/a"]),
  emojiDensity: z.enum(["none", "low", "medium", "high"]),
  ctaStyle: z.string(),
  hashtags: z.array(z.string()),
  recurringFormats: z.array(z.string()),
  products: z.array(z.string()),
  doList: z.array(z.string()),
  dontList: z.array(z.string()),
  languages: z.array(ScriptEnum),
});

const SYSTEM = `You are the "Brand memory" employee of an AI marketing department for small businesses in Uzbekistan.
From a business's own Telegram posts and the owner's notes, extract its Brand DNA: how this brand actually writes.
Rules:
- Describe what you SEE in the posts. Never invent products, prices, branches or facts that are not in the input.
- Write the descriptive fields (oneLiner, audience, tone, ctaStyle, recurringFormats, doList, dontList) in natural Uzbek (Latin script, o‘ g‘ with the ‘ sign), short and concrete, like a colleague's notes. No clichés.
- "products": concrete product or service names that appear in the input (max 12), in the language they appear in.
- "hashtags": only hashtags the brand really uses (with #), max 8.
- "address": "siz" if the brand addresses readers formally (siz / вы), "sen" if informally, "mixed" or "n/a".
- "languages": scripts the brand posts in: uz_latn, uz_cyrl, ru, en.
- doList / dontList: 3-6 practical writing rules each, derived from the examples (e.g. "narxni so‘mda yozing", "postni savol bilan tugating").`;

/** Share of Cyrillic vs Latin letters, to sanity-check the model's language guess. */
export function detectScripts(posts: string[]): Script[] {
  const text = posts.join("\n");
  const cyr = (text.match(/[А-Яа-яЁё]/g) ?? []).length;
  const uzCyr = (text.match(/[ЎўҚқҒғҲҳ]/g) ?? []).length;
  const lat = (text.match(/[A-Za-z]/g) ?? []).length;
  const uzLat = (text.match(/[OoGg][‘'ʻ’`]|\b(va|uchun|bilan|bo‘lgan|qiling|sizga|bizning|endi|yangi)\b/gi) ?? []).length;
  const out: Script[] = [];
  if (lat > 0 && uzLat > 0) out.push("uz_latn");
  if (uzCyr > 2) out.push("uz_cyrl");
  if (cyr - uzCyr * 3 > 50) out.push("ru");
  if (lat > 50 && uzLat === 0) out.push("en");
  return out.length ? out : ["uz_latn"];
}

export function averageLength(posts: string[]): number {
  if (!posts.length) return 0;
  return Math.round(posts.reduce((n, p) => n + p.length, 0) / posts.length);
}

/** Builds the Brand DNA from sample posts and/or the owner's notes. */
export async function extractBrandDNA(input: {
  samplePosts: string[];
  knowledge: string;
  channelTitle?: string;
  channelDescription?: string;
}): Promise<BrandDNA> {
  const samples = input.samplePosts.slice(-20).map((p) => p.slice(0, 900));
  const prompt = [
    input.channelTitle ? `Channel title: ${input.channelTitle}` : "",
    input.channelDescription ? `Channel description: ${input.channelDescription}` : "",
    input.knowledge ? `Owner's notes about the business:\n${input.knowledge.slice(0, 6000)}` : "",
    samples.length
      ? `Recent posts (${samples.length}):\n${samples.map((p, i) => `--- post ${i + 1} ---\n${p}`).join("\n")}`
      : "No posts yet: infer the DNA from the owner's notes; keep it modest and practical.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const dna = await llmJson({ schema: DnaSchema, system: SYSTEM, prompt, model: MODEL_QUALITY, effort: "low", maxTokens: 4000 });

  const languages = dna.languages.length ? dna.languages : detectScripts(samples);
  return {
    ...dna,
    name: dna.name || input.channelTitle || "Brend",
    hashtags: dna.hashtags.slice(0, 8),
    products: dna.products.slice(0, 12),
    avgPostLength: samples.length ? averageLength(samples) : 400,
    languages: [...new Set<Script>(languages)],
  };
}
