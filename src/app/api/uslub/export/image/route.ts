import { handle, HttpError, rateLimit } from "@/lib/uslub/http";
import { exportImageUrl } from "./allow";

export const maxDuration = 20;

const MAX_BYTES = 15 * 1024 * 1024;
const TYPES = /^image\/(jpeg|png|webp)$/i;

/**
 * GET ?url=<a post picture on fal.media> -> the picture, from this site's own origin.
 *
 * «Instagram uchun» crops the post's picture to 4:5 on a canvas in the browser, and a canvas can only be read back
 * (toBlob) when the picture comes from the page's own origin or with CORS, which fal.media does not promise. This
 * route passes the picture through unchanged. Only https pictures on fal.media (allow.ts), no redirects, images
 * only, 15 MB at most. Nothing is stored and no budget unit is spent.
 */
export const GET = handle(async (req) => {
  rateLimit(req, "export_image", 30);
  const url = exportImageUrl(new URL(req.url).searchParams.get("url"));
  if (!url) throw new HttpError(400, "not a post picture", "invalid_input");
  let res: Response;
  try {
    res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000), cache: "no-store" });
  } catch {
    throw new HttpError(404, "the picture host did not answer", "not_found");
  }
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!res.ok || !TYPES.test(type)) throw new HttpError(404, "the picture host refused", "not_found");
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) throw new HttpError(400, "the picture is too large", "bad_request");
  const body = await res.arrayBuffer();
  if (body.byteLength > MAX_BYTES) throw new HttpError(400, "the picture is too large", "bad_request");
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": type,
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
      "content-disposition": "inline",
    },
  });
});
