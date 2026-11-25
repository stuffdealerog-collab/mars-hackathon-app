import "server-only";
import { z } from "zod";
import { getEnv } from "../env";
import { answeredContact, type OwnerAnswers } from "./brain/answers";
import type { BrandProfile, NeuroHit, PostDraft, PostEnding, Script, VideoPlan } from "./contract";
import { brandEnding } from "./copywriter";
import { ownContactKeys } from "./ending";
import { llmJson, MODEL_FAST, MODEL_QUALITY } from "./llm";
import { analyzeNeuro } from "./neuro";
import { clip } from "./text";
import { CAPTION_SYSTEM, captionPrompt, finishCaption, finishPlan, type VideoMode, videoPrompt, videoSystem } from "./video-core";

/**
 * The Videographer (Videograf): a phone-shot script for a video post, and the copywriter's short caption for it. The
 * rules (language, growth or sales, the channel's ending, facts only from the brand) live in video-core.ts, pure and
 * tested; this file makes the two Claude calls.
 */

const PlanSchema = z.object({
  hook: z.string(),
  scenes: z.array(z.object({ seconds: z.number(), visual: z.string(), voiceover: z.string(), caption: z.string() })),
  musicMood: z.string(),
});

const CaptionSchema = z.object({ uz_latn: z.string(), ru: z.string(), en: z.string() });

export interface PlanVideoOptions {
  brief: string;
  /** The brand's post language (video-core videoLang). */
  lang: Script;
  mode: VideoMode;
  /** Facts the script may use: the owner's answers and documents plus the brand's knowledge. Defaults to brand.knowledge. */
  knowledge?: string;
  /** The plan slot's idea and call to action, and the post already written for it. */
  hook?: string;
  cta?: string;
  postText?: string;
}

/** How the brand's posts end (dna.postEnding, else read from its posts); undefined for a new channel. */
export const videoEnding = (brand: BrandProfile): PostEnding | undefined => brandEnding(brand);

export async function planVideo(brand: BrandProfile, o: PlanVideoOptions): Promise<VideoPlan> {
  const knowledge = o.knowledge ?? brand.knowledge;
  const raw = await llmJson({
    schema: PlanSchema,
    system: videoSystem(o.lang, o.mode),
    prompt: videoPrompt({
      dna: brand.dna as unknown as Record<string, unknown>,
      knowledge,
      samplePost: brand.samplePosts.at(-1),
      ending: videoEnding(brand),
      hook: o.hook,
      cta: o.cta,
      brief: o.brief,
      postText: o.postText,
    }),
    model: MODEL_QUALITY,
    effort: "low",
    maxTokens: 4000,
    timeoutMs: 40_000,
    purpose: "video",
    maxRetries: 0,
  });
  // Facts the script may repeat: the brand's, the post's and the owner's own brief.
  const facts = [knowledge, brand.samplePosts.join("\n"), o.postText ?? "", o.brief, o.hook ?? "", o.cta ?? "", brand.dna.products.join(", ")].join("\n");
  return finishPlan(raw, o.lang, facts);
}

export interface CaptionResult {
  variants: Record<Script, string>;
  neuroHits: Partial<Record<Script, NeuroHit[]>>;
  humanScore: number;
}

/**
 * The copywriter's caption for a video post: short, in the channel's voice, ending the way its posts end, under the
 * 1024-character caption limit, then the same code pass as a post (video-core finishCaption).
 */
export async function writeVideoCaption(
  brand: BrandProfile,
  o: { plan: VideoPlan; post?: Pick<PostDraft, "variants"> | null; knowledge?: string; answers?: OwnerAnswers | null },
): Promise<CaptionResult> {
  const ending = videoEnding(brand);
  const knowledge = o.knowledge ?? brand.knowledge;
  const postText = o.post ? [o.post.variants.uz_latn, o.post.variants.ru].filter(Boolean).join("\n\n") : "";
  const raw = await llmJson({
    schema: CaptionSchema,
    system: CAPTION_SYSTEM,
    prompt: captionPrompt({ postText, plan: o.plan, knowledge, ending, products: brand.dna.products }),
    model: MODEL_FAST,
    effort: "low",
    maxTokens: 3000,
    timeoutMs: 25_000,
    purpose: "video_caption",
    maxRetries: 0,
  });
  const bot = getEnv().BOT_USERNAME?.replace(/^@/, "");
  const answered = answeredContact(o.answers);
  const endingOptions = { channel: brand.channel, bot };
  const variants = finishCaption(raw, {
    facts: [knowledge, postText, o.post?.variants.en ?? "", brand.samplePosts.join("\n"), o.plan.hook, ...o.plan.scenes.map((s) => s.voiceover)].join("\n"),
    products: brand.dna.products,
    // No habit to follow (a new channel): the owner's answered contact only.
    ending: ending ?? (answered ? { pattern: "mixed", contact: answered, examples: [] } : undefined),
    endingOptions,
    keepKeys: ownContactKeys(ending, [answered], endingOptions),
    keep: brandWords(brand),
    fallback: o.post?.variants ?? {},
  });
  const neuroHits: Partial<Record<Script, NeuroHit[]>> = {};
  let sum = 0;
  const scripts: Script[] = ["uz_latn", "uz_cyrl", "ru", "en"];
  for (const s of scripts) {
    const a = analyzeNeuro(variants[s], s);
    if (a.hits.length) neuroHits[s] = a.hits;
    sum += a.humanScore;
  }
  return { variants, neuroHits, humanScore: Math.round(sum / scripts.length) };
}

/** Brand words kept in Latin inside the Cyrillic version (the copywriter's rule). */
function brandWords(brand: BrandProfile): string[] {
  const words = `${brand.dna.name} ${brand.channel ?? ""}`.match(/[A-Za-z][A-Za-z0-9]{2,}/g) ?? [];
  return [...new Set(words.filter((w) => /^[A-Z]/.test(w) || w === brand.channel))];
}

/** A short owner-readable brief for a slot's video (the slot's brief without its internal notes). */
export const slotVideoBrief = (post: Pick<PostDraft, "brief" | "slot">): string => clip(post.slot?.hook ? `${post.slot.hook}. ${post.brief}` : post.brief, 1000);
