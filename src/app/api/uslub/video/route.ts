import { randomUUID } from "node:crypto";
import { z } from "zod";
import { safeLogEvent } from "@/lib/track";
import type { OwnerAnswers } from "@/lib/uslub/brain/answers";
import { loadAnswers } from "@/lib/uslub/brain/answers-store";
import { loadKnowledge } from "@/lib/uslub/brain/kbstore";
import { spendClaude } from "@/lib/uslub/budget";
import { currentContext } from "@/lib/uslub/context";
import type { PostDraft, Script } from "@/lib/uslub/contract";
import { assertDraftAccess, handle, HttpError, json, loadBrandFor, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { placeholderNote, placeholdersIn } from "@/lib/uslub/placeholders";
import { claimVideoWriting, getPost, releaseVideoWriting, savePosts, saveVideoPlan, updatePostText, type StoredBrand } from "@/lib/uslub/store";
import { latinToCyrillic } from "@/lib/uslub/translit";
import { type CaptionResult, planVideo, slotVideoBrief, writeVideoCaption } from "@/lib/uslub/video";
import { isVideoPost, videoLang, videoMode } from "@/lib/uslub/video-core";

// Two Claude calls: the script (≤35 s), stored at once, then the caption in whatever time is left (≤25 s).
export const maxDuration = 60;

/** The request's own budget, under maxDuration: what the caption may use is what is left of it. */
const REQUEST_BUDGET_MS = 55_000;
/** Less than this left after the script: no caption (the post keeps its text, the script is already stored). */
const CAPTION_MIN_MS = 8_000;

const Body = z.object({
  brandId: z.string().trim().min(1).max(100),
  /** The video post (a plan slot with format "video") the script is for; missing = a new video idea. */
  postId: z.string().trim().min(1).max(100).optional(),
  /** The owner's words for a new idea (optional). */
  brief: z.string().trim().max(1000).optional(),
  lang: z.enum(["uz", "ru", "en"]).optional(),
  initData: z.string().max(8192).optional(),
});

const ALL: Script[] = ["uz_latn", "uz_cyrl", "ru", "en"];

/** The facts the Videographer and the caption may use: the owner's answers and documents plus the brand's knowledge. */
async function writerFacts(brand: StoredBrand): Promise<{ knowledge: string; answers: OwnerAnswers | null }> {
  const [answers, kb] = await Promise.all([loadAnswers(brand.id).catch(() => null), loadKnowledge(brand.id).catch(() => ({ text: "" }))]);
  return { answers, knowledge: [kb.text, brand.knowledge].filter((t) => t.trim()).join("\n\n") };
}

/**
 * The caption, only when there is time left for it under the function's limit (the script is paid for and must be
 * stored first). A failure or a timeout is null: the script stays, the post keeps its text.
 */
async function captionInTime(started: number, write: (timeoutMs: number) => Promise<CaptionResult>): Promise<CaptionResult | null> {
  const left = REQUEST_BUDGET_MS - (Date.now() - started);
  if (left < CAPTION_MIN_MS) {
    console.warn("[uslub/video] caption skipped: no time left");
    return null;
  }
  return write(Math.min(25_000, left)).catch((err) => {
    console.warn("[uslub/video] caption skipped:", err instanceof Error ? err.message : err);
    return null;
  });
}

/** A video idea's text when no caption came: the script's hook, in the script's own language (no translation). */
function hookText(hook: string, lang: Script): Record<Script, string> {
  const v: Record<Script, string> = { uz_latn: "", uz_cyrl: "", ru: "", en: "" };
  v[lang] = hook;
  if (lang === "uz_latn") v.uz_cyrl = latinToCyrillic(hook);
  return v;
}

/** A blank left in the caption ("[narx]") keeps the post from going out until the owner fills it (as posts do). */
function withNote(post: PostDraft, lang: "uz" | "ru" | "en"): PostDraft {
  const left = placeholdersIn(post.variants, ALL);
  return left.length ? { ...post, needsApproval: true, placeholders: left, note: placeholderNote(left.flatMap((l) => l.tokens), lang) } : post;
}

/**
 * POST { brandId, postId?, brief?, lang?, initData? } -> { plan: VideoPlan, post: PostDraft, reused?: true }
 *
 * The Videographer's script, on the owner's request from the Video tab:
 * - postId: for that video post. A post that already has a script gets it back (`reused`), nothing is paid twice; two
 *   taps at once find a claim on the row (409 video_busy). The script goes on post.video.plan as soon as it is written
 *   (so a slow caption can never lose a paid script), then the copywriter's short caption, in the time left, becomes
 *   the post's text (an approved post is a draft again: the owner approves the caption).
 * - no postId: a new video idea from the owner's optional brief, saved as a draft post without a slot (with the
 *   script's hook as its text when the caption did not come).
 * The script is in the brand's post language (UI language as fallback), fits the channel type (a growth channel gets
 * hooks for reach and engagement, no sales pitch) and ends the way the channel's posts end. Owner or the id holder of
 * an unowned brand, like drafts; 6 a minute per IP; two daily Claude budget units, taken after the checks.
 */
export const POST = handle(async (req) => {
  const started = Date.now();
  rateLimit(req, "video", 6);
  const body = await readJson(req, Body);
  const userId = telegramUserId(req, body.initData);
  const brand = await loadBrandFor(body.brandId, userId);
  // Drafts are private: only the owner (or the browser holding an unowned brand) may write a script for them.
  await assertDraftAccess(brand, userId);
  const uiLang = body.lang ?? currentContext()?.lang ?? "uz";

  if (body.postId) {
    const post = await getPost(body.postId);
    if (!post || post.brandId !== brand.id) throw new HttpError(404, "Post not found", "post_not_found");
    if (!isVideoPost(post)) throw new HttpError(400, "not a video post", "not_video_post");
    if (post.video?.plan) return json({ plan: post.video.plan, post: withNote(post, uiLang), reused: true });
    const claim = await claimVideoWriting(post.id);
    if (claim === "missing") throw new HttpError(404, "Post not found", "post_not_found");
    if (claim === "published") throw new HttpError(409, "the post is already in the channel", "conflict");
    if (claim === "busy") throw new HttpError(409, "the script is being written", "video_busy");
    if (claim === "has_plan") {
      const done = await getPost(post.id);
      if (done?.video?.plan) return json({ plan: done.video.plan, post: withNote(done, uiLang), reused: true });
      throw new HttpError(409, "the script is being written", "video_busy");
    }
    try {
      await spendClaude(req, userId, "video", { weight: 2 });
      const facts = await writerFacts(brand);
      const lang = videoLang({ languages: brand.dna.languages, variants: post.variants, uiLang });
      const mode = videoMode({ channelType: brand.channelType, brandGoal: brand.goal, slotGoal: post.slot?.goal });
      const postText = post.variants[lang === "uz_cyrl" ? "uz_latn" : lang] || post.variants.uz_latn;
      const plan = await planVideo(brand, { brief: slotVideoBrief(post), lang, mode, knowledge: facts.knowledge, hook: post.slot?.hook, cta: post.slot?.cta, postText });
      // Paid for: stored at once (the claim goes with it), before the caption can run out of time.
      const withPlan = await saveVideoPlan(post.id, plan);
      if (!withPlan) throw new HttpError(409, "the post was published meanwhile", "conflict");
      // The caption is a plus: when it fails or there is no time left, the script is kept and the post keeps its text.
      const caption = await captionInTime(started, (timeoutMs) => writeVideoCaption(brand, { plan, post, mode, knowledge: facts.knowledge, answers: facts.answers, timeoutMs }));
      // The script is stored already: a caption that cannot be saved leaves the post as it was, never a failed request.
      const captioned = caption ? await updatePostText(post.id, caption).catch(() => null) : null;
      const saved = captioned ?? withPlan;
      await safeLogEvent(userId, "video_planned", { brand_id: brand.id, post_id: post.id, scenes: plan.scenes.length, lang, mode, caption: Boolean(captioned) });
      return json({ plan, post: withNote(saved, uiLang) });
    } catch (err) {
      await releaseVideoWriting(post.id).catch(() => undefined);
      throw err;
    }
  }

  // A new idea: the script and its caption, saved as a draft video post (no slot, so no week's batch takes it).
  await spendClaude(req, userId, "video", { weight: 2 });
  const facts = await writerFacts(brand);
  const lang = videoLang({ languages: brand.dna.languages, uiLang });
  const mode = videoMode({ channelType: brand.channelType, brandGoal: brand.goal });
  const plan = await planVideo(brand, { brief: body.brief ?? "", lang, mode, knowledge: facts.knowledge });
  // A caption that fails or has no time left never loses the paid script: the idea is saved with the script's hook.
  const caption = await captionInTime(started, (timeoutMs) => writeVideoCaption(brand, { plan, mode, knowledge: facts.knowledge, answers: facts.answers, timeoutMs }));
  const now = new Date().toISOString();
  const post: PostDraft = {
    id: randomUUID(),
    brandId: brand.id,
    brief: body.brief || plan.hook,
    variants: caption?.variants ?? hookText(plan.hook, lang),
    neuroHits: caption?.neuroHits ?? {},
    humanScore: caption?.humanScore ?? 0,
    status: "draft",
    video: { plan, plannedAt: now },
    createdAt: now,
  };
  await savePosts([post], userId);
  await safeLogEvent(userId, "video_planned", { brand_id: brand.id, post_id: post.id, scenes: plan.scenes.length, lang, mode, idea: true, caption: Boolean(caption) });
  return json({ plan, post: withNote(post, uiLang) });
});
