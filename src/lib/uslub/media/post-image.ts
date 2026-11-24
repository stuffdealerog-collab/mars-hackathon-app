import type { PlanSlot, PostImage, Script, VisualStyle } from "../contract";
import type { Actor, MediaJobs } from "./jobs";
import { NEGATIVE_PROMPT } from "./presets";
import { isTerminal, type Aspect, type MediaJob, type MediaProviderId } from "./types";

/**
 * A picture for every post, in the brand's own style:
 *   post text + plan slot -> an English scene line (cheap Claude call, optional)
 *   + the brand's VisualStyle (prompt paragraph, palette, light, avoid)
 *   + reference images (the owner's product photo first, then the channel's own photos)
 *   -> one image job -> PostImage saved on the post, polled until ready.
 * Pure orchestration over injected dependencies (see post-image.test.ts).
 */

/**
 * What we keep in posts.image: the contract's PostImage plus bookkeeping the browser never sees.
 *
 * `url` is THE post's picture: the newest finished one. It stays set while another version renders
 * (status queued/running) and after that version fails (status failed), so the Studio, the bot's
 * preview and publishing all show and send the same picture. `status` describes the latest attempt.
 */
export type StoredPostImage = PostImage & {
  attempts?: number; // jobs started for this post (regenerations are capped)
  productUrl?: string; // the owner's product photo for this post, re-hosted
  scene?: string; // what the picture shows, reused by "another variant"
  model?: string;
  updatedAt?: string;
};

export interface PostForImage {
  id: string;
  brandId: string;
  brief: string;
  variants: Partial<Record<Script, string>>;
  slot?: PlanSlot;
  image?: StoredPostImage;
}

export interface BrandForImage {
  id: string;
  name: string;
  oneLiner: string;
  products: string[];
  visual?: VisualStyle;
}

export interface SceneInput {
  text: string;
  brief: string;
  hook?: string;
  brandName: string;
  oneLiner: string;
  products: string[];
}

export interface PostImageDeps {
  jobs: Pick<MediaJobs, "create" | "refresh" | "assertRoom">;
  save(postId: string, image: StoredPostImage): Promise<void>;
  /** English description of what the picture should show; undefined = fall back to the brief. */
  describeScene?(input: SceneInput): Promise<string | undefined>;
  provider?: MediaProviderId; // "fal" when configured: it takes several references
  now?: () => number;
}

export const POST_IMAGE_ASPECT: Aspect = "4:5"; // tallest frame Telegram shows uncropped in the feed
export const MAX_ATTEMPTS_PER_POST = 6;
export const MAX_POST_REFS = 6;

export const FAILED_COPY = "Rasm chiqmadi, qayta urinib ko‘ring. / Картинка не получилась, попробуйте ещё раз.";
export const LIMIT_COPY = "Bu post uchun variantlar tugadi. / Для этого поста варианты закончились.";

export class PostImageLimitError extends Error {
  constructor() {
    super(LIMIT_COPY);
    this.name = "PostImageLimitError";
  }
}

/** The post's text the picture is about: Uzbek Latin first, then Russian, then anything. */
export function postText(post: Pick<PostForImage, "variants" | "brief">): string {
  const v = post.variants;
  return (v.uz_latn || v.ru || v.en || v.uz_cyrl || post.brief || "").trim();
}

const clean = (s: string | undefined, max: number) =>
  (s ?? "")
    .replace(/[\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** The image prompt. English on purpose: image models follow English photo language best. */
export function buildPostImagePrompt(a: {
  scene: string;
  brandName: string;
  oneLiner: string;
  visual?: Pick<VisualStyle, "prompt" | "light" | "composition" | "palette" | "avoid">;
  product: boolean; // image 1 is the owner's product photo
  channelRefs: number;
  ownerRefs: number;
  aspect?: Aspect;
}): string {
  const lines: string[] = [];
  // The one-liner is the owner's language and can run long: its first clause is enough context.
  const about = clean(a.oneLiner.split(/[;:.!?\n]/)[0], 90);
  lines.push(`A new photo for a post in the Telegram channel of ${clean(a.brandName, 80) || "a small local business"}${about ? ` (${about})` : ""}.`);
  let next = 1;
  if (a.product) {
    lines.push(
      "Image 1 is the owner's photo of the product: keep this product exactly as it is, with the same shape, colours, label and details; change only the scene around it.",
    );
    next = 2;
  }
  const refs = a.channelRefs + a.ownerRefs;
  if (refs > 0) {
    const range = refs === 1 ? `Image ${next} is` : `Images ${next}-${next + refs - 1} are`;
    const whose =
      a.channelRefs && a.ownerRefs
        ? "photos from this business's own channel and photos the owner added"
        : a.channelRefs
          ? "photos from this business's own channel"
          : "photos the owner added";
    lines.push(
      `${range} ${whose}. Make the new photo look like it belongs next to them: the same kind of light, colours, backgrounds, surfaces, props, camera angle and photo quality. Do not copy any of them; take a new shot.`,
    );
  }
  if (a.ownerRefs > 0) {
    lines.push("The owner's photos show their real products and place: if those appear, keep them exactly as they look there, and do not invent other products, packaging or labels.");
  }
  lines.push(`The photo shows: ${clean(a.scene, 500).replace(/[.\s]+$/, "")}.`);
  const v = a.visual;
  if (v) {
    const style = [
      clean(v.prompt, 900),
      v.light && `Light: ${clean(v.light, 160)}.`,
      v.composition && `Framing: ${clean(v.composition, 200)}.`,
      v.palette.length ? `Colours: ${v.palette.slice(0, 6).join(", ")}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    if (style) lines.push(`Style: ${style}`);
  } else {
    lines.push("Style: an honest, natural photo a good local photographer would take with daylight; real textures, believable setting in Uzbekistan.");
  }
  lines.push(
    "It must look like a real photograph, natural and believable: not a 3D render, illustration, collage or glossy AI art.",
    "No text, letters, numbers, prices, captions, watermarks, logos or brand names anywhere in the picture; keep signs, packaging and screens blank or out of focus. Do not invent a logo.",
  );
  const avoid = (v?.avoid ?? []).map((s) => clean(s, 80)).filter(Boolean).slice(0, 8);
  if (avoid.length) lines.push(`Avoid: ${avoid.join("; ")}.`);
  const aspect = a.aspect ?? POST_IMAGE_ASPECT;
  lines.push(aspect === "4:5" ? "Vertical 4:5 frame for a Telegram post." : `Frame: ${aspect}.`);
  return lines.join("\n").slice(0, 3500);
}

/** What the browser gets: the contract's PostImage plus the model (shown in the Studio's pro mode). */
export type PublicPostImage = PostImage & { model?: string };

export function publicPostImage(s: StoredPostImage): PublicPostImage {
  const out: PublicPostImage = { status: s.status, refsUsed: s.refsUsed };
  if (s.url) out.url = s.url;
  if (s.jobId && (s.status === "queued" || s.status === "running")) out.jobId = s.jobId;
  if (s.prompt) out.prompt = s.prompt;
  if (s.error) out.error = s.error;
  if (s.model) out.model = s.model;
  return out;
}

const isPending = (s: StoredPostImage | undefined) => s?.status === "queued" || s?.status === "running";

/**
 * What a POST would do, decided BEFORE any paid preparation (style analysis, AI subject line,
 * photo upload): "existing" = return the picture already made or in progress; "limit" = the
 * per-post cap is used up; "start" = a new job will be created.
 * A picture still rendering is never replaced: "another variant" waits until it is done.
 */
export function planPostImageStart(prev: StoredPostImage | undefined, wantNew: boolean): "existing" | "limit" | "start" {
  if (isPending(prev)) return "existing";
  if (prev?.status === "ready" && !wantNew) return "existing";
  if ((prev?.attempts ?? 0) >= MAX_ATTEMPTS_PER_POST) return "limit";
  return "start";
}

/** Media job -> post image. Provider details never reach the owner; they stay in media_jobs. */
export function imageFromJob(job: MediaJob, prev: StoredPostImage): StoredPostImage {
  const base = { ...prev, jobId: job.id, model: job.model, updatedAt: job.updatedAt };
  if (job.status === "succeeded" && job.result?.url) return { ...base, status: "ready", url: job.result.url, error: undefined };
  if (job.status === "failed" || job.status === "canceled" || (job.status === "succeeded" && !job.result?.url)) {
    return { ...base, status: "failed", error: FAILED_COPY }; // the previous finished picture (url) stays
  }
  return { ...base, status: job.status === "running" ? "running" : "queued" };
}

/**
 * Starts the post's picture, or returns the one in progress / already made.
 * `regenerate` (the owner's "another variant") always starts a new job, up to MAX_ATTEMPTS_PER_POST.
 * Throws MediaError for quota / configuration problems (the route maps them to HTTP).
 */
export async function startPostImage(
  args: { post: PostForImage; brand: BrandForImage; actor: Actor; regenerate?: boolean; productUrl?: string },
  deps: PostImageDeps,
): Promise<StoredPostImage> {
  const { post, brand } = args;
  const prev = post.image;
  const productUrl = args.productUrl ?? prev?.productUrl;
  const plan = planPostImageStart(prev, Boolean(args.regenerate || args.productUrl));
  if (plan === "existing") return prev!;
  if (plan === "limit") throw new PostImageLimitError();
  const attempts = prev?.attempts ?? 0;

  let scene = !args.productUrl && prev?.scene ? prev.scene : undefined;
  if (!scene && deps.describeScene) {
    scene = await deps
      .describeScene({
        text: postText(post).slice(0, 1200),
        brief: post.brief.slice(0, 400),
        hook: post.slot?.hook,
        brandName: brand.name,
        oneLiner: brand.oneLiner,
        products: brand.products.slice(0, 12),
      })
      .catch(() => undefined);
  }
  scene ||= clean(post.brief || postText(post), 300);

  const allRefs = (brand.visual?.refs ?? []).filter((r) => r.url !== productUrl).slice(0, MAX_POST_REFS);
  const prompt = buildPostImagePrompt({
    scene,
    brandName: brand.name,
    oneLiner: brand.oneLiner,
    visual: brand.visual,
    product: Boolean(productUrl),
    channelRefs: allRefs.filter((r) => r.source === "channel").length,
    ownerRefs: allRefs.filter((r) => r.source === "owner").length,
  });
  // The prompt numbers images in this order: product, owner refs, channel refs.
  const ordered = [...allRefs.filter((r) => r.source === "owner"), ...allRefs.filter((r) => r.source === "channel")];

  const job = await deps.jobs.create(
    {
      kind: "image",
      imageUrl: productUrl,
      referenceUrls: ordered.map((r) => r.url),
      customPrompt: { prompt, negativePrompt: NEGATIVE_PROMPT },
      presetId: "paper-studio", // recorded on the job only; the custom prompt replaces the preset
      aspect: POST_IMAGE_ASPECT,
      seconds: 0,
      brandId: brand.id,
      provider: deps.provider,
    },
    args.actor,
  );
  if (job.status === "failed" && job.error) console.warn(`[media/post-image] job ${job.id} failed at submit: ${job.error}`);
  const image: StoredPostImage = imageFromJob(job, {
    status: "queued",
    refsUsed: job.refCount ?? ordered.length + (productUrl ? 1 : 0),
    prompt,
    scene,
    productUrl,
    attempts: attempts + 1,
    url: prev?.url, // the picture the owner sees stays until a new one is finished
  });
  await deps.save(post.id, image);
  return image;
}

/**
 * Refreshes a picture in progress (the job layer throttles provider polls). The caller has
 * already authorised access to the post, so a job started from another device (Mini App vs web)
 * is refreshed too.
 */
export async function pollPostImage(args: { post: PostForImage; actor: Actor }, deps: PostImageDeps): Promise<StoredPostImage | undefined> {
  const prev = args.post.image;
  if (!prev || !prev.jobId || (prev.status !== "queued" && prev.status !== "running")) return prev;
  const job = await deps.jobs.refresh(prev.jobId, args.actor, { authorized: true });
  if (!isTerminal(job.status) && job.status === (prev.status === "running" ? "running" : "queued")) return prev;
  if (job.status === "failed" && job.error) console.warn(`[media/post-image] job ${job.id} failed: ${job.error}`);
  const next = imageFromJob(job, prev);
  await deps.save(args.post.id, next);
  return next;
}

/**
 * The picture publishing sends: exactly the one the owner sees (`url`, the newest finished picture),
 * whatever the latest attempt's status. Publishing never refreshes to a newer version the owner has
 * not seen; the bot's preview refreshes first (refreshPostImage) and then shows this same url.
 * Undefined = publish text only.
 */
export const publishedImageUrl = (image: StoredPostImage | undefined): string | undefined => image?.url;

/** A channel brand whose saved style has no references is looked at again after this long. */
const EMPTY_REFS_RELEARN_MS = 30 * 60_000;

/** A saved style worth learning again: a channel brand with no references (the channel may have photos now). */
export function needsRelearn(visual: VisualStyle | undefined, mode: string, channel: string | undefined, now = Date.now()): boolean {
  if (!visual) return true;
  return visual.refs.length === 0 && mode !== "fresh" && Boolean(channel) && now - Date.parse(visual.learnedAt) > EMPTY_REFS_RELEARN_MS;
}
