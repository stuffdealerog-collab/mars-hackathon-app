import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { BrandProfile, NeuroHit, PlanSlot, PostDraft, Script } from "./contract";
import { rewriteNeuroBatch, type EditJob } from "./editor";
import { llmJson, MODEL_QUALITY, type Effort } from "./llm";
import { analyzeNeuro, inventedFacts } from "./neuro";
import { findPlaceholders } from "./placeholders";
import { dropVideoMentions } from "./postguard";
import { latinToCyrillic, polishUzLatin } from "./translit";
import { clip } from "./text";

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
1. FACTS: use only facts present in the brand knowledge or the brand's own posts (prices, addresses, phone numbers, dates, codes, branches, product names, discounts). Never invent them. If the brief needs a fact you don't have, write the post without it, or with a natural line that sends the reader to the admin ("narxini adminga yozing", "manzilni lichkada aytamiz", "уточните цену у администратора"). NEVER write a template slot or placeholder of any kind: no [narx], [kod], {phone}, <address>, ___, XXX. The post must be ready to publish exactly as written.
2. VOICE: copy the brand's real posts: their length, line breaks, emoji density, address form (siz/sen), call-to-action style and hashtags. Each post must be a ready-to-publish Telegram post (plain text, no Markdown asterisks).
3. LANGUAGE: uz_latn is the main version: natural, modern Uzbek in Latin script as people in Tashkent write, with o‘ and g‘ written with the ‘ sign and the tutuq belgisi as ’. Respect suffix assimilation: after k / q the dative is -ka / -qa (keshbekka, qishloqqa), never "keshbekga". Avoid word-for-word calques from Russian and bureaucratic style. ru and en are natural adaptations of the same post (not literal translations), with the same facts.
4. NO "NEURO-WORDS": never use AI clichés such as "zamonaviy dunyoda", "noyob imkoniyat", "qo‘ldan boy bermang", "o‘z ichiga oladi", "kashf eting", "unutilmas taassurotlar", "betakror", "sizni kutmoqda", "nafaqat ..., balki ...", "в современном мире", "уникальная возможность", "не упустите шанс", "откройте для себя", "погрузитесь в", "незабываемые впечатления", "unlock", "elevate", "seamless", "dive into", "game-changer", "look no further". Be concrete: name the product, the price if known, the time, the place.
5. ALL THREE FIELDS ARE REQUIRED full posts (uz_latn, ru, en), even if the brand never posts in that language.
   ONE LANGUAGE PER VARIANT: even if the brand's posts mix Uzbek and Russian (e.g. separated by ***), uz_latn must contain only the Uzbek text and ru only the Russian text; the system combines them itself.
6. NEW CONTENT: never re-tell or translate one of the example posts; write new posts in the same voice.
7. Make each post a different angle (product, behind the scenes, customer question, offer, useful tip…) unless the brief asks otherwise.
8. LENGTH: keep every version under 950 characters, even if the brand's older posts are longer — the post goes out as a photo caption (Telegram's limit is 1024).
9. PHOTOS ARE NOT IN THE TEXT: a brief may say which photo or video to shoot — that note is for the owner, never write it into the post. Never describe a picture ("on the photo you can see…") and never claim the business did, tested or showed something unless the knowledge says so.`;

function brandContext(brand: BrandProfile): string {
  const { dna } = brand;
  const examples = brand.samplePosts
    .slice(-8)
    .map((p, i) => `--- example ${i + 1} ---\n${p.slice(0, 700)}`)
    .join("\n");
  return [
    `BRAND DNA:\n${JSON.stringify(dna, null, 1)}`,
    brand.knowledge ? `BRAND KNOWLEDGE (the only source of facts):\n${clip(brand.knowledge, 6000)}` : "BRAND KNOWLEDGE: none beyond the posts.",
    examples ? `THE BRAND'S REAL POSTS (match this voice):\n${examples}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

const TranslateSchema = z.object({ items: z.array(z.object({ id: z.string(), text: z.string() })) });
const LANG_NAME = { ru: "Russian", en: "English" } as const;

async function fillMissingVariants(drafts: { id: string; variants: Record<Script, string> }[], timeoutMs = 55_000): Promise<void> {
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
      timeoutMs,
      purpose: "translate",
      maxRetries: 0,
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

const PLACEHOLDER_SYSTEM = `You fix Telegram posts that still contain unfilled template slots such as [kod], [narx], {phone}, <address>, ___ or XXX.
Rules:
- Rewrite ONLY the sentences that contain a slot. Every other word stays exactly as it is.
- The value is unknown: never invent it. Either drop the slot (and the words that only make sense with it), or replace the sentence with a natural line that sends the reader to the admin ("narxini adminga yozing", "kodni adminga yozing", "уточните у администратора", "message us for details").
- Do not add numbers, prices, dates, discounts, promises or urgency. Same language and script as the input. Keep emoji, links and line breaks.`;

/**
 * After the editor: any variant that still has an unfilled slot gets one batched rewrite of just those sentences.
 * A rewrite is accepted only if the slot is gone and it adds no new facts; otherwise the text is left as is and
 * the post is held back later (placeholder_left). uz_cyrl always follows uz_latn.
 */
async function fixPlaceholders(
  drafts: { id: string; variants: Record<Script, string> }[],
  ctx: { left: () => number; keep: string[]; deadline?: number },
): Promise<void> {
  const jobs = drafts.flatMap((d) =>
    (["uz_latn", "ru", "en"] as Script[]).filter((s) => findPlaceholders(d.variants[s]).length).map((s) => ({ d, s, text: d.variants[s] })),
  );
  if (!jobs.length) return;
  if (ctx.left() > 12_000) {
    try {
      const res = await llmJson({
        schema: TranslateSchema,
        system: PLACEHOLDER_SYSTEM,
        prompt: jobs
          .map(({ d, s, text }) => `### id: ${d.id}:${s}\nLanguage: ${LANG_NAME_ALL[s]}\nSlots: ${findPlaceholders(text).join(", ")}\nText:\n${text}`)
          .join("\n\n"),
        model: MODEL_QUALITY,
        effort: "low",
        maxTokens: 6000,
        timeoutMs: Math.max(8_000, Math.min(25_000, ctx.left() - 5_000)),
        purpose: "placeholder_fix",
        ...(ctx.deadline ? { maxRetries: 0 } : {}),
      });
      const byId = new Map(res.items.map((i) => [i.id, i.text.trim()] as const));
      for (const { d, s, text } of jobs) {
        const fixed = byId.get(`${d.id}:${s}`);
        if (fixed && fixed.length > 20 && !findPlaceholders(fixed).length && !inventedFacts(text, fixed).length) {
          d.variants[s] = s === "uz_latn" ? polishUzLatin(fixed) : fixed;
        }
      }
    } catch (err) {
      console.warn("[uslub/copywriter] placeholder fix skipped:", err instanceof Error ? err.message : err);
    }
  }
  for (const d of drafts) d.variants.uz_cyrl = latinToCyrillic(d.variants.uz_latn, ctx.keep);
}

const LANG_NAME_ALL: Record<Script, string> = {
  uz_latn: "Uzbek (Latin script, o‘ g‘ with ‘)",
  uz_cyrl: "Uzbek (Cyrillic script)",
  ru: "Russian",
  en: "English",
};

function brandWords(brand: BrandProfile): string[] {
  const words = `${brand.dna.name} ${brand.channel ?? ""}`.match(/[A-Za-z][A-Za-z0-9]{2,}/g) ?? [];
  return [...new Set(words.filter((w) => /^[A-Z]/.test(w) || w === brand.channel))];
}

const SCRIPTS: Script[] =["uz_latn", "uz_cyrl", "ru", "en"];

export interface GenerateOptions {
  effort?: Effort;
  uzOnly?: boolean;
  /** The plan slot this post fills: kept on the post (PostDraft.slot). */
  slot?: PlanSlot;
  /** What to store as the post's brief (defaults to `brief`). */
  storedBrief?: string;
  /** Wall-clock deadline (ms epoch): the optional translation and editor calls are skipped near it. */
  deadline?: number;
  /** The plan slot's format. Anything but "video" goes out with a picture: no sentence may mention a video. */
  format?: string;
}

/** Generates `count` posts in 4 scripts, then runs the editor (neuro-word) pass. */
export async function generatePosts(brand: BrandProfile, brief: string, count = 3, opts: GenerateOptions = {}): Promise<PostDraft[]> {
  const n = Math.max(1, Math.min(5, Math.round(count)));
  const left = () => (opts.deadline ? opts.deadline - Date.now() : 120_000);
  const result = await llmJson({
    schema: PostsSchema,
    system: SYSTEM,
    prompt: `${brandContext(brand)}\n\n${opts.slot ? "PLAN SLOT" : "BRIEF FROM THE OWNER"}:\n${clip(brief, 2400)}\n\nWrite exactly ${n} post${n > 1 ? "s" : ""}.`,
    model: MODEL_QUALITY,
    effort: opts.effort ?? "low",
    maxTokens: 12000,
    // ≤45 s, and 15 s before the deadline: what is left goes to the translation fill and the editor (both skippable).
    timeoutMs: Math.max(20_000, Math.min(opts.deadline ? 45_000 : 75_000, left() - 15_000)),
    purpose: "copywriter",
    // With a deadline there is no time for an SDK retry after a timeout.
    ...(opts.deadline ? { maxRetries: 0 } : {}),
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
  if (left() > 25_000) await fillMissingVariants(drafts, Math.min(40_000, left() - 15_000));

  // Editor pass: one batched rewrite for every text that still has neuro-words.
  const jobs: EditJob[] = [];
  for (const d of drafts) {
    for (const script of ["uz_latn", "ru", "en"] as Script[]) {
      const { hits } = analyzeNeuro(d.variants[script], script);
      if (hits.length) jobs.push({ id: `${d.id}:${script}`, script, text: d.variants[script], hits });
    }
  }
  if (jobs.length) {
    // Near the deadline the editor falls back to deletion-only edits (no LLM call).
    const cleaned = await rewriteNeuroBatch(jobs, { skipLlm: left() < 20_000, timeoutMs: Math.max(10_000, Math.min(40_000, left() - 8_000)), maxRetries: opts.deadline ? 0 : undefined });
    for (const d of drafts) {
      for (const script of ["uz_latn", "ru", "en"] as Script[]) {
        const text = cleaned.get(`${d.id}:${script}`)?.text;
        if (text) d.variants[script] = script === "uz_latn" ? polishUzLatin(text) : text;
      }
      d.variants.uz_cyrl = latinToCyrillic(d.variants.uz_latn, keep);
    }
  }

  // A plan post that is not a video ("Videoni saqlab qo‘ying" under a photo): the sentence goes.
  if (opts.slot && opts.format !== "video") {
    for (const d of drafts) {
      for (const script of ["uz_latn", "ru", "en"] as Script[]) d.variants[script] = dropVideoMentions(d.variants[script]);
      d.variants.uz_cyrl = latinToCyrillic(d.variants.uz_latn, keep);
    }
  }

  // Template slots that slipped through ("Kod: [kod]"): one rewrite of just those sentences, checked again.
  // Whatever is still left keeps the post out of the channel (approve / publish refuse it, the Studio shows a note).
  await fixPlaceholders(drafts, { left, keep, deadline: opts.deadline });

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
      brief: opts.storedBrief ?? brief,
      variants: d.variants,
      neuroHits,
      humanScore: Math.round(scoreSum / SCRIPTS.length),
      status: "draft" as const,
      ...(opts.slot ? { slot: opts.slot } : {}),
      createdAt,
    };
  });
}
