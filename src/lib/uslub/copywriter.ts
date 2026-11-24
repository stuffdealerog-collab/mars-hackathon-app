import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { BrandProfile, NeuroHit, PostDraft, Script } from "./contract";
import { rewriteNeuroBatch, type EditJob } from "./editor";
import { llmJson, MODEL_QUALITY, type Effort } from "./llm";
import { analyzeNeuro } from "./neuro";
import { latinToCyrillic, polishUzLatin } from "./translit";

const PostsSchema = z.object({
  posts: z.array(
    z.object({
      angle: z.string(),
      uz_latn: z.string(),
      ru: z.string(),
      en: z.string(),
    }),
  ),
});

const SYSTEM = `You are the "Copywriter" (Kopirayter) of an AI marketing department for a small business in Uzbekistan.
You write Telegram channel posts that sound like the brand's own admin wrote them, not like an AI.

Hard rules:
1. FACTS: use only facts present in the brand knowledge or the brand's own posts (prices, addresses, phone numbers, dates, branches, product names, discounts). Never invent them. If the brief needs a fact you don't have, write around it or leave a placeholder in square brackets, e.g. [narx], [manzil], [sana].
2. VOICE: copy the brand's real posts: their length, line breaks, emoji density, address form (siz/sen), call-to-action style and hashtags. Each post must be a ready-to-publish Telegram post (plain text, no Markdown asterisks).
3. LANGUAGE: uz_latn is the main version: natural, modern Uzbek in Latin script as people in Tashkent write, with o‘ and g‘ written with the ‘ sign and the tutuq belgisi as ’. Respect suffix assimilation: after k / q the dative is -ka / -qa (keshbekka, qishloqqa), never "keshbekga". Avoid word-for-word calques from Russian and bureaucratic style. ru and en are natural adaptations of the same post (not literal translations), with the same facts.
4. NO "NEURO-WORDS": never use AI clichés such as "zamonaviy dunyoda", "noyob imkoniyat", "qo‘ldan boy bermang", "o‘z ichiga oladi", "kashf eting", "unutilmas taassurotlar", "betakror", "sizni kutmoqda", "nafaqat ..., balki ...", "в современном мире", "уникальная возможность", "не упустите шанс", "откройте для себя", "погрузитесь в", "незабываемые впечатления", "unlock", "elevate", "seamless", "dive into", "game-changer", "look no further". Be concrete: name the product, the price if known, the time, the place.
5. ALL THREE FIELDS ARE REQUIRED full posts (uz_latn, ru, en), even if the brand never posts in that language.
   ONE LANGUAGE PER VARIANT: even if the brand's posts mix Uzbek and Russian (e.g. separated by ***), uz_latn must contain only the Uzbek text and ru only the Russian text; the system combines them itself.
6. NEW CONTENT: never re-tell or translate one of the example posts; write new posts in the same voice.
7. Make each post a different angle (product, behind the scenes, customer question, offer, useful tip…) unless the brief asks otherwise.`;

function brandContext(brand: BrandProfile): string {
  const { dna } = brand;
  const examples = brand.samplePosts
    .slice(-8)
    .map((p, i) => `--- example ${i + 1} ---\n${p.slice(0, 700)}`)
    .join("\n");
  return [
    `BRAND DNA:\n${JSON.stringify(dna, null, 1)}`,
    brand.knowledge ? `BRAND KNOWLEDGE (the only source of facts):\n${brand.knowledge.slice(0, 6000)}` : "BRAND KNOWLEDGE: none beyond the posts.",
    examples ? `THE BRAND'S REAL POSTS (match this voice):\n${examples}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

const TranslateSchema = z.object({ items: z.array(z.object({ id: z.string(), text: z.string() })) });
const LANG_NAME = { ru: "Russian", en: "English" } as const;

async function fillMissingVariants(drafts: { id: string; variants: Record<Script, string> }[]): Promise<void> {
  const missing = drafts.flatMap((d) =>
    (["ru", "en"] as const)
      .filter((s) => d.variants[s].length < Math.min(40, d.variants.uz_latn.length / 3))
      .map((s) => ({ d, s })),
  );
  if (!missing.length) return;
  try {
    const res = await llmJson({
      schema: TranslateSchema,
      system:
        "You adapt Uzbek Telegram posts into natural Russian or English for the same brand. Keep facts, numbers, " +
        "emoji, line breaks and links. No AI clichés. Return every id.",
      prompt: missing
        .map(({ d, s }) => `### id: ${d.id}:${s}\nTarget language: ${LANG_NAME[s]}\nUzbek post:\n${d.variants.uz_latn}`)
        .join("\n\n"),
      model: MODEL_QUALITY,
      effort: "low",
      maxTokens: 8000,
    });
    const byId = new Map(res.items.map((i) => [i.id, i.text.trim()] as const));
    for (const { d, s } of missing) {
      const text = byId.get(`${d.id}:${s}`);
      if (text && text.length > 20) d.variants[s] = text;
    }
  } catch (err) {
    console.warn("[uslub/copywriter] variant fill skipped:", err instanceof Error ? err.message : err);
  }
}

function brandWords(brand: BrandProfile): string[] {
  const words = `${brand.dna.name} ${brand.channel ?? ""}`.match(/[A-Za-z][A-Za-z0-9]{2,}/g) ?? [];
  return [...new Set(words.filter((w) => /^[A-Z]/.test(w) || w === brand.channel))];
}

const SCRIPTS: Script[] =["uz_latn", "uz_cyrl", "ru", "en"];

/** Generates `count` posts in 4 scripts, then runs the editor (neuro-word) pass. */
export async function generatePosts(
  brand: BrandProfile,
  brief: string,
  count = 3,
  opts: { effort?: Effort; uzOnly?: boolean } = {},
): Promise<PostDraft[]> {
  const n = Math.max(1, Math.min(5, Math.round(count)));
  const result = await llmJson({
    schema: PostsSchema,
    system: SYSTEM,
    prompt: `${brandContext(brand)}\n\nBRIEF FROM THE OWNER:\n${brief.slice(0, 2000)}\n\nWrite exactly ${n} post${n > 1 ? "s" : ""}.`,
    model: MODEL_QUALITY,
    effort: opts.effort ?? "low",
    maxTokens: 12000,
  });

  const createdAt = new Date().toISOString();
  const keep = brandWords(brand); // brand names stay in Latin inside the Cyrillic version
  const drafts = result.posts.slice(0, n).map((p) => {
    const uz = polishUzLatin(p.uz_latn.trim());
    return {
      id: randomUUID(),
      variants: { uz_latn: uz, uz_cyrl: latinToCyrillic(uz, keep), ru: p.ru.trim(), en: p.en.trim() } as Record<Script, string>,
    };
  });

  // Safety net: the model sometimes skips a language the brand does not use ("x"). Adapt it from uz_latn.
  await fillMissingVariants(drafts);

  // Editor pass: one batched rewrite for every text that still has neuro-words.
  const jobs: EditJob[] = [];
  for (const d of drafts) {
    for (const script of ["uz_latn", "ru", "en"] as Script[]) {
      const { hits } = analyzeNeuro(d.variants[script], script);
      if (hits.length) jobs.push({ id: `${d.id}:${script}`, script, text: d.variants[script], hits });
    }
  }
  if (jobs.length) {
    const cleaned = await rewriteNeuroBatch(jobs);
    for (const d of drafts) {
      for (const script of ["uz_latn", "ru", "en"] as Script[]) {
        const text = cleaned.get(`${d.id}:${script}`)?.text;
        if (text) d.variants[script] = script === "uz_latn" ? polishUzLatin(text) : text;
      }
      d.variants.uz_cyrl = latinToCyrillic(d.variants.uz_latn, keep);
    }
  }

  return drafts.map((d) => {
    const neuroHits: Partial<Record<Script, NeuroHit[]>> = {};
    let scoreSum = 0;
    for (const script of SCRIPTS) {
      const a = analyzeNeuro(d.variants[script], script);
      if (a.hits.length) neuroHits[script] = a.hits;
      scoreSum += a.humanScore;
    }
    return {
      id: d.id,
      brandId: brand.id,
      brief,
      variants: d.variants,
      neuroHits,
      humanScore: Math.round(scoreSum / SCRIPTS.length),
      status: "draft" as const,
      createdAt,
    };
  });
}
