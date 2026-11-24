import "server-only";
import { z } from "zod";
import type { BrandDNA, BrandMode, Script } from "./contract";
import type { ApiLang } from "./errors";
import { llmJson, MODEL_QUALITY } from "./llm";
import { clip } from "./text";

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

const PROSE_LANG: Record<ApiLang, string> = {
  uz: "natural Uzbek (Latin script, o‘ g‘ with the ‘ sign)",
  ru: "natural Russian",
  en: "plain English",
};

const FRESH = `
THIS BRAND HAS NO POSTS YET (a new or empty channel). Build the DNA from the owner's description only:
- name, oneLiner, audience, products: only what the description says (products: names it mentions, max 12).
- tone, address, emojiDensity, ctaStyle, recurringFormats, doList, dontList: your RECOMMENDATION for a new Telegram channel of this kind of business in Uzbekistan (simple, warm, concrete; "siz" unless the description suggests otherwise; low emoji).
- Never invent prices, addresses, phone numbers, branches, years, awards or customer counts. hashtags: only ones written in the description, else [].
- languages: the script(s) of the description plus the scripts its customers likely read (usually uz_latn and ru).`;

const SYSTEM = `You are the "Brand memory" employee of an AI marketing department for small businesses in Uzbekistan.
From a business's own Telegram posts and the owner's notes, extract its Brand DNA: how this brand actually writes.
Rules:
- Describe what you SEE in the posts. Never invent products, prices, branches or facts that are not in the input.
- Write the descriptive fields (oneLiner, audience, tone, ctaStyle, recurringFormats, doList, dontList) in {PROSE_LANG}, short and concrete, like a colleague's notes. No clichés, no marketing jargon (CTA, engagement, target, kontent): the owner reads these.
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
  /** Language of the descriptive prose fields (default uz). */
  lang?: ApiLang;
  /** "fresh": no posts, the DNA comes from the owner's description only. */
  mode?: BrandMode;
}): Promise<BrandDNA & { proseLang: ApiLang }> {
  const lang = input.lang ?? "uz";
  const fresh = input.mode === "fresh";
  const samples = input.samplePosts.slice(-20).map((p) => clip(p, 900));
  const prompt = [
    input.channelTitle ? `Channel title: ${input.channelTitle}` : "",
    input.channelDescription ? `Channel description: ${input.channelDescription}` : "",
    input.knowledge ? `Owner's notes about the business:\n${clip(input.knowledge, 6000)}` : "",
    samples.length
      ? `Recent posts (${samples.length}):\n${samples.map((p, i) => `--- post ${i + 1} ---\n${p}`).join("\n")}`
      : "No posts yet: build the DNA from the owner's description; keep it modest and practical.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const system = SYSTEM.replace("{PROSE_LANG}", PROSE_LANG[lang]) + (fresh || !samples.length ? FRESH : "");
  const dna = await llmJson({ schema: DnaSchema, system, prompt, model: MODEL_QUALITY, effort: "low", maxTokens: 4000, purpose: "dna" });

  const languages = dna.languages.length ? dna.languages : detectScripts(samples);
  return {
    ...dna,
    name: dna.name || input.channelTitle || "Brend",
    hashtags: dna.hashtags.slice(0, 8),
    products: dna.products.slice(0, 12),
    avgPostLength: samples.length ? averageLength(samples) : 450,
    languages: [...new Set<Script>(languages)],
    // Hidden from the contract type: lets the channel cache serve only DNA written in the requested language.
    proseLang: lang,
  };
}
