import { connection } from "next/server";
import { z } from "zod";
import { safeLogEvent } from "@/lib/track";
import { assertDraftAccess, clientIp, HttpError, json, loadBrandFor, rateLimit, telegramUserId } from "@/lib/uslub/http";
import { readMediaConfig } from "@/lib/uslub/media/config";
import { planPostImageStart, pollPostImage, PostImageLimitError, publicPostImage, startPostImage } from "@/lib/uslub/media/post-image";
import { ensureVisual, postImageDeps } from "@/lib/uslub/media/post-image-service";
import { getPostForImage } from "@/lib/uslub/media/post-repo";
import { langOf, parseLang, PictureError, pictureErrorResponse, pictureErrorText, type Lang } from "@/lib/uslub/media/route-errors";
import { downloadImage, ImageInputError, parseDataUrl } from "@/lib/uslub/visual/images";
import { actorKey } from "@/lib/uslub/visual/service";
import { falUpload, isFalMedia, StorageError } from "@/lib/uslub/visual/storage";

// Worst case on a brand's first picture: style analysis (~60 s) + subject line + photo upload + submit.
export const maxDuration = 150;

const Body = z.object({
  postId: z.string().trim().min(1).max(64),
  /** "Boshqa variant": a new picture even when one is ready (never while one is rendering). */
  regenerate: z.boolean().optional(),
  /** The owner's product photo for this post: a data:image URL resized by the Studio (or a Mercat/Telegram link). */
  photo: z
    .string()
    .trim()
    .max(2_000_000)
    .refine((s) => s.startsWith("data:image/") || s.startsWith("https://"), "must be a data:image URL or an https link")
    .optional(),
  lang: z.enum(["uz", "ru", "en"]).optional(),
  initData: z.string().max(8192).optional(),
});

async function loadPost(postId: string, telegramId: number | null) {
  const post = await getPostForImage(postId);
  if (!post) throw new PictureError(404, "not_found");
  const brand = await loadBrandFor(post.brandId, telegramId);
  return { post, brand };
}

/** The owner's product photo goes to our storage once, so "another variant" can reuse it. */
async function hostProductPhoto(photo: string, postId: string): Promise<string> {
  if (isFalMedia(photo)) return photo;
  try {
    const img = photo.startsWith("data:") ? parseDataUrl(photo) : await downloadImage(photo);
    return await falUpload(img, { key: readMediaConfig(process.env).fal?.key, name: `${postId.slice(0, 8)}-product` });
  } catch (err) {
    if (err instanceof ImageInputError) throw new PictureError(400, "bad_image", err.message);
    if (err instanceof StorageError) {
      console.error("[media/post-image] product photo upload:", err.message);
      throw new PictureError(502, "storage_failed");
    }
    throw err;
  }
}

/**
 * POST { postId, regenerate?, photo?, lang? } -> { image }   (PostImage + `model`)
 * Starts the post's picture in the brand's style, or returns the one already made / rendering.
 * Every cheap check (access, per-post cap, daily quota) runs before anything paid (style analysis,
 * AI subject line, photo upload). Errors: { error, code } in `lang` (uz | ru | en, default uz).
 */
export async function POST(req: Request): Promise<Response> {
  let lang: Lang = langOf(req);
  try {
    rateLimit(req, "post_image", 30);
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      throw new PictureError(400, "bad_input");
    }
    lang = langOf(req, raw as { lang?: unknown });
    const parsed = Body.safeParse(raw);
    if (!parsed.success) throw new PictureError(400, "bad_input");
    const body = parsed.data;

    const telegramId = telegramUserId(req, body.initData);
    const { post, brand } = await loadPost(body.postId, telegramId);
    // Owner, an unowned brand, or a web brand claimed in the bot (the id holder keeps making pictures).
    await assertDraftAccess(brand, telegramId);
    const deps = postImageDeps(); // 503 without fal, before anything else

    const plan = planPostImageStart(post.image, Boolean(body.regenerate || body.photo));
    if (plan === "existing") return json({ image: publicPostImage(post.image!) });
    if (plan === "limit") throw new PictureError(429, "post_limit");
    await deps.jobs.assertRoom({ telegramId }, "image", brand.id); // daily picture caps, before paying for the preparation

    const productUrl = body.photo ? await hostProductPhoto(body.photo, post.id) : undefined;
    const visual = await ensureVisual(brand, actorKey(telegramId, clientIp(req)));
    const image = await startPostImage(
      {
        post,
        brand: { id: brand.id, name: brand.dna.name, oneLiner: brand.dna.oneLiner, products: brand.dna.products ?? [], visual },
        actor: { telegramId },
        regenerate: body.regenerate,
        productUrl,
      },
      deps,
    );
    await safeLogEvent(telegramId, "post_image_started", {
      post_id: post.id,
      brand_id: brand.id,
      refs: image.refsUsed,
      attempt: image.attempts ?? 1,
      status: image.status,
    });
    if (image.status === "failed") {
      return json({ image: publicPostImage(image), error: pictureErrorText("generation_failed", lang), code: "generation_failed" }, 502);
    }
    return json({ image: publicPostImage(image) });
  } catch (err) {
    if (err instanceof PostImageLimitError) return pictureErrorResponse(new PictureError(429, "post_limit"), lang);
    return pictureErrorResponse(err, lang);
  }
}

async function poll(req: Request): Promise<Response> {
  const lang = parseLang(new URL(req.url).searchParams.get("lang")) ?? "uz";
  try {
    rateLimit(req, "post_image_poll", 400);
    const postId = new URL(req.url).searchParams.get("postId")?.trim() ?? "";
    if (!postId) throw new PictureError(400, "bad_input");
    const telegramId = telegramUserId(req);
    const { post } = await loadPost(postId, telegramId);
    if (!post.image) return json({ image: null });
    const image = await pollPostImage({ post, actor: { telegramId } }, postImageDeps());
    return json({ image: image ? publicPostImage(image) : null });
  } catch (err) {
    return pictureErrorResponse(err instanceof HttpError && err.status === 400 ? new PictureError(400, "bad_input") : err, lang);
  }
}

/** GET ?postId=&lang= -> { image | null }   poll every ~4 s while queued/running. */
export async function GET(req: Request) {
  await connection(); // before the try/catch: it must not swallow Next's prerender signal
  return poll(req);
}
