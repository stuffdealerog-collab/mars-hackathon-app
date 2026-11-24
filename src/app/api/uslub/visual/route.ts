import { connection } from "next/server";
import { z } from "zod";
import { safeLogEvent } from "@/lib/track";
import { handle, HttpError, json, loadBrandFor, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { ImageInputError } from "@/lib/uslub/visual/images";
import { MAX_OWNER_IMAGES } from "@/lib/uslub/visual/learn";
import { getBrandVisualInfo } from "@/lib/uslub/visual/repo";
import { learnAndSaveVisual } from "@/lib/uslub/visual/service";

export const maxDuration = 90;

// The Studio resizes photos to ~1280 px JPEG before sending (StyleRefs), so 5 of them stay under
// Vercel's 4.5 MB request limit. https links are accepted too (fal.media refs from an earlier run).
const Image = z
  .string()
  .trim()
  .max(1_400_000)
  .refine((s) => s.startsWith("data:image/") || s.startsWith("https://"), "must be a data:image URL or an https link");

const Body = z.object({
  brandId: z.string().trim().min(1).max(64),
  ownerImages: z.array(Image).max(MAX_OWNER_IMAGES).optional(),
  refresh: z.boolean().optional(),
  initData: z.string().max(8192).optional(),
});

/**
 * POST { brandId, ownerImages?, refresh? } -> { visual, cached }
 * Learns the brand's picture style from its channel's recent photos plus the owner's photos
 * (Claude vision), re-hosts the kept references on fal storage and saves it on the brand.
 * Without new photos a style learned in the last 12 h is returned as is (no AI call).
 * ownerImages is the full list the owner wants: earlier owner refs (their https links) + new uploads.
 */
export const POST = handle(async (req) => {
  rateLimit(req, "visual_learn", 6);
  const body = await readJson(req, Body);
  const telegramId = telegramUserId(req, body.initData);
  const brand = await loadBrandFor(body.brandId, telegramId);
  const total = (body.ownerImages ?? []).reduce((n, s) => n + s.length, 0);
  if (total > 4_200_000) throw new HttpError(413, "Rasmlar juda katta. Kichikroq rasm yuboring. / Фото слишком большие.");
  try {
    const { visual, cached } = await learnAndSaveVisual(brand, { ownerImages: body.ownerImages, refresh: body.refresh });
    if (!cached) {
      await safeLogEvent(telegramId, "visual_learned", {
        brand_id: brand.id,
        refs: visual.refs.length,
        owner_refs: visual.refs.filter((r) => r.source === "owner").length,
      });
    }
    return json({ visual, cached });
  } catch (err) {
    if (err instanceof ImageInputError) {
      throw new HttpError(400, `Rasmni o‘qib bo‘lmadi (${err.message}). JPG yoki PNG yuboring. / Не удалось прочитать фото — пришлите JPG или PNG.`);
    }
    throw err;
  }
});

const read = handle(async (req) => {
  rateLimit(req, "visual_read", 60);
  const brandId = new URL(req.url).searchParams.get("brandId")?.trim() ?? "";
  if (!brandId) throw new HttpError(400, "brandId is required");
  await loadBrandFor(brandId, telegramUserId(req));
  const { visual } = await getBrandVisualInfo(brandId);
  return json({ visual: visual ?? null });
});

/** GET ?brandId= -> { visual: VisualStyle | null } */
export async function GET(req: Request) {
  await connection(); // outside handle(): its try/catch must not swallow Next's prerender signal
  return read(req);
}
