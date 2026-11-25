import "server-only";
import { z } from "zod";
import { isLlmConfigured, llmJson, MODEL_FAST } from "../llm";
import type { VisualStyle } from "../contract";
import type { StoredBrand } from "../store";
import { getBrandVisualInfo } from "../visual/repo";
import { learnAndSaveVisual } from "../visual/service";
import { safeLogEvent } from "@/lib/track";
import { NEVER_SUBMITTED, sweepAllowed, TIMED_OUT, type MediaSweepReport } from "./jobs";
import {
  needsRelearn,
  pollPostImage,
  publicPostImage,
  publishedImageUrl,
  sceneSystem,
  sweepPostImages,
  type PostImageDeps,
  type PublicPostImage,
  type SceneInput,
} from "./post-image";
import { getPostForImage, listStalePostImageIds, savePostImage } from "./post-repo";
import { PictureError } from "./route-errors";
import { media } from "./service";
import { publishableImageUrl } from "./telegram-post";

const Scene = z.object({
  scene: z.string().describe("The subject of the photo in English, 8-30 words: which product, dish or moment, and what is happening to it"),
});

/** One cheap Haiku call; undefined when AI is off or fails (the brief is used instead). */
export async function describeScene(input: SceneInput): Promise<string | undefined> {
  if (!isLlmConfigured()) return undefined;
  const r = await llmJson({
    schema: Scene,
    system: sceneSystem(input.people),
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
 * The brand's style; learned on the fly the first time a post needs a picture, and learned again
 * (within the analysis caps) when a channel brand's style has no references. A failed or capped
 * analysis is not fatal: the picture is made with the style we have, or from the description alone.
 */
export async function ensureVisual(brand: StoredBrand, actor: string): Promise<VisualStyle | undefined> {
  const info = await getBrandVisualInfo(brand.id);
  if (!needsRelearn(info.visual, info.mode, brand.channel)) return info.visual;
  if (Date.now() - (failedAt.get(brand.id) ?? 0) < RETRY_AFTER_FAILURE_MS) return info.visual;
  let p = learning.get(brand.id);
  if (!p) {
    p = learnAndSaveVisual(brand, { actor, refresh: Boolean(info.visual) })
      .then((r) => r.visual)
      .catch((err) => {
        failedAt.set(brand.id, Date.now());
        console.warn("[media/post-image] style analysis skipped:", err instanceof Error ? err.message : err);
        return info.visual;
      })
      .finally(() => learning.delete(brand.id));
    learning.set(brand.id, p);
  }
  return p;
}

/**
 * The picture publishPost sends: exactly `posts.image.url`, the one the owner sees in the Studio and
 * in the bot's preview (never a newer version nobody has seen). Only our own CDN's pictures are sent.
 * Never throws: a picture problem must not block a post.
 */
export async function publishImageUrl(postId: string): Promise<string | undefined> {
  try {
    const post = await getPostForImage(postId);
    return publishableImageUrl({ status: "ready", url: publishedImageUrl(post?.image) });
  } catch (err) {
    console.warn("[media/post-image] no picture for publish:", err instanceof Error ? err.message : err);
    return undefined;
  }
}

/**
 * For the bot's publish preview: brings a picture that is still rendering up to date (the Studio may
 * have stopped polling when the phone switched to Telegram), then returns it. Show `image.url` if set:
 * that is exactly what publishPost will send. Never throws; null = no picture.
 */
export async function refreshPostImage(postId: string): Promise<PublicPostImage | null> {
  try {
    const post = await getPostForImage(postId);
    if (!post?.image) return null;
    const image = await pollPostImage({ post, actor: { telegramId: null } }, postImageDeps()).catch(() => post.image);
    return image ? publicPostImage(image) : null;
  } catch (err) {
    console.warn("[media/post-image] preview refresh:", err instanceof Error ? err.message : err);
    return null;
  }
}

/* ------------------------------------------------------------ stuck jobs */

/** A post picture not updated for this long is looked at by the sweep (a live Studio polls every 4 s). */
const STALE_POST_IMAGE_MS = 2 * 60_000;
/** Open jobs younger than this are left to their own client's polling. */
const SWEEP_JOB_MIN_AGE_MS = 60_000;

export interface StuckMediaSweep {
  jobs: MediaSweepReport;
  posts: { checked: number; updated: number; stoppedEarly: boolean };
  ms: number;
}

/**
 * Ends stuck pictures and videos without anyone polling (for the cron tick; the lead registers it).
 * 1) open media jobs older than a minute are polled once: finished ones are delivered, jobs past their
 *    timeout (5 min pictures, 20 min videos) or that never reached the provider fail with a reason;
 * 2) posts whose picture still says queued/running pick up their job's state, so the post unlocks.
 * Each ended job is logged as `media_job_expired`. Stops starting new work after `budgetMs`
 * (a provider call already running can add up to its own 15 s limit). Never throws.
 *
 * Production only: local and preview instances share the production database, and a sweep there
 * would end real owners' jobs. MEDIA_SWEEP=1 turns it on elsewhere (with a copy of the database).
 */
export async function sweepStuckMediaJobs(budgetMs = 10_000): Promise<StuckMediaSweep> {
  const started = Date.now();
  const deadline = started + Math.max(0, budgetMs);
  const report: StuckMediaSweep = {
    jobs: { checked: 0, delivered: 0, ended: [], stoppedEarly: false },
    posts: { checked: 0, updated: 0, stoppedEarly: false },
    ms: 0,
  };
  if (!sweepAllowed(process.env)) return report;
  try {
    const { jobs } = media();
    report.jobs = await jobs.sweep({ olderThanMs: SWEEP_JOB_MIN_AGE_MS, limit: 20, deadline });
    for (const e of report.jobs.ended) {
      const reason = e.error === TIMED_OUT ? "timeout" : e.error === NEVER_SUBMITTED ? "not_submitted" : "provider";
      await safeLogEvent(null, "media_job_expired", { job_id: e.id, kind: e.kind, brand_id: e.brandId ?? null, age_s: e.ageS, reason });
    }
    if (Date.now() < deadline) {
      const ids = await listStalePostImageIds(new Date(Date.now() - STALE_POST_IMAGE_MS).toISOString(), 10);
      report.posts = await sweepPostImages({ ids, load: getPostForImage, deadline }, { jobs, save: savePostImage });
    } else {
      report.posts.stoppedEarly = true;
    }
  } catch (err) {
    console.warn("[media] stuck-job sweep failed:", err instanceof Error ? err.message : err);
  }
  report.ms = Date.now() - started;
  return report;
}

let lastSweepAt = 0;
/** At most one sweep per instance every two minutes: picture requests call this in after(). */
export async function maybeSweepStuckMediaJobs(): Promise<StuckMediaSweep | null> {
  const now = Date.now();
  if (now - lastSweepAt < 2 * 60_000) return null;
  lastSweepAt = now;
  return sweepStuckMediaJobs(8_000);
}
