import { connection } from "next/server";
import { z } from "zod";
import { safeLogEvent } from "@/lib/track";
import { assertDraftAccess, clientIp, json, loadBrandFor, rateLimit, telegramUserId } from "@/lib/uslub/http";
import { langOf, parseLang, PictureError, pictureErrorResponse, type Lang } from "@/lib/uslub/media/route-errors";
import { ImageInputError } from "@/lib/uslub/visual/images";
import { MAX_OWNER_IMAGES, VisualFetchError } from "@/lib/uslub/visual/learn";
import { getBrandVisualInfo } from "@/lib/uslub/visual/repo";
import { actorKey, learnAndSaveVisual, VisualBusyError, VisualLimitError } from "@/lib/uslub/visual/service";

// Two preview pages, downloads, one Claude vision call and re-hosting: ~20-60 s, bounded by inner timeouts.
export const maxDuration = 120;

// The Studio resizes photos to ~1280 px JPEG (<= 450 KB) before sending (StyleRefs), so 5 of them stay
// under Vercel's 4.5 MB request limit. Links are accepted only from fal.media (earlier refs) or Telegram.
const Image = z
  .string()
  .trim()
  .max(1_400_000)
  .refine((s) => s.startsWith("data:image/") || s.startsWith("https://"), "must be a data:image URL or an https link");

const Body = z.object({
  brandId: z.string().trim().min(1).max(64),
  ownerImages: z.array(Image).max(MAX_OWNER_IMAGES).optional(),
  refresh: z.boolean().optional(),
  lang: z.enum(["uz", "ru", "en"]).optional(),
  initData: z.string().max(8192).optional(),
});

/**
 * POST { brandId, ownerImages?, refresh?, lang? } -> { visual, cached }
 * Learns the brand's picture style from its channel's recent photos plus the owner's photos
 * (Claude vision), re-hosts the kept references on fal storage and saves it on the brand.
 * Without new photos a style learned in the last 12 h is returned as is (no AI call).
 * ownerImages is the full list the owner wants: earlier owner refs (their fal.media links) + new uploads;
 * an empty list removes all owner photos. Errors: { error, code } in `lang` (uz | ru | en, default uz).
 */
export async function POST(req: Request): Promise<Response> {
  let lang: Lang = langOf(req);
  try {
    rateLimit(req, "visual_learn", 10);
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
    const total = (body.ownerImages ?? []).reduce((n, s) => n + s.length, 0);
    if (total > 4_200_000) throw new PictureError(413, "too_large");

    const telegramId = telegramUserId(req, body.initData);
    const brand = await loadBrandFor(body.brandId, telegramId);
    // Owner, an unowned brand, or a web brand claimed in the bot (the id holder keeps making pictures).
    await assertDraftAccess(brand, telegramId);

    const { visual, cached } = await learnAndSaveVisual(brand, {
      ownerImages: body.ownerImages,
      refresh: body.refresh,
      actor: actorKey(telegramId, clientIp(req)),
    });
    if (!cached) {
      await safeLogEvent(telegramId, "visual_learned", {
        brand_id: brand.id,
        refs: visual.refs.length,
        owner_refs: visual.refs.filter((r) => r.source === "owner").length,
      });
    }
    return json({ visual, cached });
  } catch (err) {
    if (err instanceof VisualLimitError) return pictureErrorResponse(new PictureError(429, "style_limit"), lang);
    if (err instanceof VisualBusyError) return pictureErrorResponse(new PictureError(503, "ai_failed"), lang);
    if (err instanceof VisualFetchError) {
      return pictureErrorResponse(new PictureError(502, err.stage === "channel" ? "fetch_failed" : "storage_failed"), lang);
    }
    if (err instanceof ImageInputError) return pictureErrorResponse(new PictureError(400, "bad_image", err.message), lang);
    return pictureErrorResponse(err, lang);
  }
}

async function read(req: Request): Promise<Response> {
  const lang = parseLang(new URL(req.url).searchParams.get("lang")) ?? "uz";
  try {
    rateLimit(req, "visual_read", 60);
    const brandId = new URL(req.url).searchParams.get("brandId")?.trim() ?? "";
    if (!brandId) throw new PictureError(400, "bad_input");
    await loadBrandFor(brandId, telegramUserId(req));
    const { visual } = await getBrandVisualInfo(brandId);
    return json({ visual: visual ?? null });
  } catch (err) {
    return pictureErrorResponse(err, lang);
  }
}

/** GET ?brandId=&lang= -> { visual: VisualStyle | null } */
export async function GET(req: Request) {
  await connection(); // before the try/catch: it must not swallow Next's prerender signal
  return read(req);
}
