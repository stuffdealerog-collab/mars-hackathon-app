import { assertDraftAccess, handle, HttpError, loadBrandFor, rateLimit, telegramUserId } from "@/lib/uslub/http";
import { getPost } from "@/lib/uslub/store";
import { exportImageUrl } from "./allow";

export const maxDuration = 20;

const MAX_BYTES = 15 * 1024 * 1024;
const TYPES = /^image\/(jpeg|png|webp)$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The picture's bytes, read as they come: a host that sends more than `max` (with or without content-length) stops. */
async function readCapped(res: Response, max: number): Promise<ArrayBuffer> {
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > max) {
    await res.body?.cancel().catch(() => undefined);
    throw new HttpError(400, "the picture is too large", "bad_request");
  }
  const reader = res.body?.getReader();
  if (!reader) throw new HttpError(404, "the picture host sent nothing", "not_found");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      throw new HttpError(400, "the picture is too large", "bad_request");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out.buffer;
}

/**
 * GET ?postId=<uuid> -> the post's picture, from this site's own origin.
 *
 * «Instagram uchun» crops the post's picture to 4:5 on a canvas in the browser, and a canvas can only be read back
 * (toBlob) when the picture comes from the page's own origin or with CORS, which fal.media does not promise. This
 * route passes one post's own picture through unchanged, to whoever may read that post's drafts (the same rule as
 * the drafts themselves: the owner, or the id holder of a brand nobody has claimed): never a URL the caller names.
 * The picture must be on fal.media over https (allow.ts), no redirects, images only, 15 MB at most (counted while
 * reading). Nothing is stored and no budget unit is spent.
 */
export const GET = handle(async (req) => {
  rateLimit(req, "export_image", 30);
  const postId = new URL(req.url).searchParams.get("postId")?.trim().toLowerCase() ?? "";
  if (!UUID.test(postId)) throw new HttpError(400, "postId must be a post id", "invalid_input");
  const userId = telegramUserId(req);
  const post = await getPost(postId);
  if (!post) throw new HttpError(404, "Post not found", "post_not_found");
  await assertDraftAccess(await loadBrandFor(post.brandId, userId), userId);
  const url = exportImageUrl(post.image?.url);
  if (!url) throw new HttpError(404, "the post has no picture", "not_found");
  let res: Response;
  try {
    res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000), cache: "no-store" });
  } catch {
    throw new HttpError(404, "the picture host did not answer", "not_found");
  }
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!res.ok || !TYPES.test(type)) {
    await res.body?.cancel().catch(() => undefined);
    throw new HttpError(404, "the picture host refused", "not_found");
  }
  const body = await readCapped(res, MAX_BYTES);
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
