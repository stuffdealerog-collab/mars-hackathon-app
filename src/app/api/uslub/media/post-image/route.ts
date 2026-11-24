import { connection } from "next/server";
import { z } from "zod";
import { safeLogEvent } from "@/lib/track";
import { handle, HttpError, json, loadBrandFor, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { readMediaConfig } from "@/lib/uslub/media/config";
import { PostImageLimitError, pollPostImage, publicPostImage, startPostImage } from "@/lib/uslub/media/post-image";
import { ensureVisual, postImageDeps } from "@/lib/uslub/media/post-image-service";
import { getPostForImage } from "@/lib/uslub/media/post-repo";
import { canChangeBrandPictures, NOT_YOUR_BRAND } from "@/lib/uslub/visual/access";
import { downloadImage, ImageInputError, parseDataUrl } from "@/lib/uslub/visual/images";
import { falUpload, isFalMedia, StorageError } from "@/lib/uslub/visual/storage";
import { mediaCall } from "../errors";

export const maxDuration = 90;

const Body = z.object({
  postId: z.string().trim().min(1).max(64),
  /** "Boshqa variant": start a new picture even when one exists. */
  regenerate: z.boolean().optional(),
  /** The owner's product photo for this post (data:image URL resized by the Studio, or https). */
  photo: z
    .string()
    .trim()
    .max(2_000_000)
    .refine((s) => s.startsWith("data:image/") || s.startsWith("https://"), "must be a data:image URL or an https link")
    .optional(),
  initData: z.string().max(8192).optional(),
});

async function loadPost(postId: string, telegramId: number | null) {
  const post = await getPostForImage(postId);
  if (!post) throw new HttpError(404, "Post topilmadi / Пост не найден");
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
    if (err instanceof ImageInputError) throw new HttpError(400, "Rasmni o‘qib bo‘lmadi. JPG yoki PNG yuboring. / Не удалось прочитать фото — пришлите JPG или PNG.");
    if (err instanceof StorageError) {
      console.error("[media/post-image] product photo upload:", err.message);
      throw new HttpError(502, "Rasmni saqlab bo‘lmadi, qayta urinib ko‘ring. / Не удалось сохранить фото.");
    }
    throw err;
  }
}

/**
 * POST { postId, regenerate?, photo? } -> { image: PostImage }
 * Starts the post's picture in the brand's style (learning the style first if the brand has none),
 * or returns the picture already made / in progress. 429 when a daily cap or the per-post cap is hit.
 */
export const POST = handle(async (req) => {
  rateLimit(req, "post_image", 12);
  const body = await readJson(req, Body);
  const telegramId = telegramUserId(req, body.initData);
  const { post, brand } = await loadPost(body.postId, telegramId);
  if (!canChangeBrandPictures(brand, telegramId)) throw new HttpError(403, NOT_YOUR_BRAND);
  const productUrl = body.photo ? await hostProductPhoto(body.photo, post.id) : undefined;
  const visual = await ensureVisual(brand);
  try {
    const image = await mediaCall(() =>
      startPostImage(
        {
          post,
          brand: { id: brand.id, name: brand.dna.name, oneLiner: brand.dna.oneLiner, products: brand.dna.products ?? [], visual },
          actor: { telegramId },
          regenerate: body.regenerate,
          productUrl,
        },
        postImageDeps(),
      ),
    );
    if (image.jobId && image.jobId !== post.image?.jobId) {
      await safeLogEvent(telegramId, "post_image_started", {
        post_id: post.id,
        brand_id: brand.id,
        refs: image.refsUsed,
        attempt: image.attempts ?? 1,
        status: image.status,
      });
    }
    return json({ image: publicPostImage(image) }, image.status === "failed" ? 502 : 200);
  } catch (err) {
    if (err instanceof PostImageLimitError) throw new HttpError(429, err.message);
    throw err;
  }
});

const poll = handle(async (req) => {
  rateLimit(req, "post_image_poll", 120);
  const postId = new URL(req.url).searchParams.get("postId")?.trim() ?? "";
  if (!postId) throw new HttpError(400, "postId is required");
  const telegramId = telegramUserId(req);
  const { post } = await loadPost(postId, telegramId);
  const image = await mediaCall(() => pollPostImage({ post, actor: { telegramId } }, postImageDeps()));
  return json({ image: image ? publicPostImage(image) : null });
});

/** GET ?postId= -> { image: PostImage | null }   poll every ~4 s while queued/running. */
export async function GET(req: Request) {
  await connection(); // outside handle(): its try/catch must not swallow Next's prerender signal
  return poll(req);
}
