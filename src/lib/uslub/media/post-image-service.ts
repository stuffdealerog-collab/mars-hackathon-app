import "server-only";
import { z } from "zod";
import { isLlmConfigured, llmJson, MODEL_FAST } from "../llm";
import type { VisualStyle } from "../contract";
import type { StoredBrand } from "../store";
import { getBrandVisualInfo } from "../visual/repo";
import { learnAndSaveVisual } from "../visual/service";
import { imageUrlForPublish, type PostImageDeps, type SceneInput } from "./post-image";
import { getPostForImage, savePostImage } from "./post-repo";
import { PictureError } from "./route-errors";
import { media } from "./service";
import { publishableImageUrl } from "./telegram-post";

const Scene = z.object({
  scene: z.string().describe("The subject of the photo in English, 8-30 words: which product, dish or moment, and what is happening to it"),
});

const SCENE_SYSTEM = `You pick the picture for a Telegram post of a small business in Uzbekistan.
Read the post (Uzbek or Russian) and say in plain English what ONE real photo next to it should show: the product, dish or moment the post is about and what is happening to it.
Describe only the subject. Do not describe the room, table, surface, background, light or camera: the channel's own photo style decides those.
Prefer the business's real products. No text, signs, prices or logos. No people's faces unless the post is about people. One concrete subject, no marketing words.`;

/** One cheap Haiku call; undefined when AI is off or fails (the brief is used instead). */
export async function describeScene(input: SceneInput): Promise<string | undefined> {
  if (!isLlmConfigured()) return undefined;
  const r = await llmJson({
    schema: Scene,
    system: SCENE_SYSTEM,
    model: MODEL_FAST,
    effort: "low",
    maxTokens: 600,
    timeoutMs: 20_000,
    prompt: [
      `Business: ${input.brandName}${input.oneLiner ? ` - ${input.oneLiner}` : ""}`,
      input.products.length ? `Products: ${input.products.join(", ")}` : "",
      input.hook ? `Plan hook: ${input.hook}` : "",
      `Brief: ${input.brief}`,
      `Post:\n${input.text}`,
    ]
      .filter(Boolean)
      .join("\n"),
  });
  return r.scene.trim() || undefined;
}

/**
 * Post pictures need fal: it is the provider that reads several references (the prompt numbers
 * them). Without FAL_KEY the route answers 503 before any quota slot or AI call is used.
 */
export function postImageDeps(): PostImageDeps {
  const { jobs, providers } = media();
  const fal = providers.find((p) => p.id === "fal" && p.isConfigured());
  if (!fal) throw new PictureError(503, "not_configured");
  return { jobs, save: savePostImage, describeScene, provider: "fal" };
}

/** One style analysis per brand at a time on this instance; across instances the DB slot dedupes. */
const learning = new Map<string, Promise<VisualStyle | undefined>>();
/** A failed analysis is not retried by every picture request for a while (it costs money each time). */
const failedAt = new Map<string, number>();
const RETRY_AFTER_FAILURE_MS = 5 * 60_000;

/**
 * The brand's style; learned on the fly the first time a post needs a picture. A failed or capped
 * analysis is not fatal: the picture is then made from the business description alone.
 */
export async function ensureVisual(brand: StoredBrand, actor: string): Promise<VisualStyle | undefined> {
  const { visual } = await getBrandVisualInfo(brand.id);
  if (visual) return visual;
  if (Date.now() - (failedAt.get(brand.id) ?? 0) < RETRY_AFTER_FAILURE_MS) return undefined;
  let p = learning.get(brand.id);
  if (!p) {
    p = learnAndSaveVisual(brand, { actor })
      .then((r) => r.visual)
      .catch((err) => {
        failedAt.set(brand.id, Date.now());
        console.warn("[media/post-image] style analysis skipped:", err instanceof Error ? err.message : err);
        return undefined;
      })
      .finally(() => learning.delete(brand.id));
    learning.set(brand.id, p);
  }
  return p;
}

/**
 * The picture publishPost sends: ready, refreshed if still rendering, else the last finished one.
 * Only our own CDN's pictures are ever sent. Never throws: a picture problem must not block a post.
 */
export async function publishImageUrl(postId: string): Promise<string | undefined> {
  try {
    const post = await getPostForImage(postId);
    if (!post?.image) return undefined;
    const url = await imageUrlForPublish(post, postImageDeps());
    return publishableImageUrl({ status: "ready", url });
  } catch (err) {
    console.warn("[media/post-image] no picture for publish:", err instanceof Error ? err.message : err);
    return undefined;
  }
}
