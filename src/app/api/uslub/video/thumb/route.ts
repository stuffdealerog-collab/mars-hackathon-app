import { getBot } from "@/lib/bot";
import { telegramPhoto } from "@/lib/uslub/botflow/photos";
import { assertDraftAccess, handle, HttpError, loadBrandFor, rateLimit, telegramUserId } from "@/lib/uslub/http";
import { getPost } from "@/lib/uslub/store";

export const maxDuration = 20;

/**
 * GET ?postId= -> the thumbnail of the owner's video for a post (image/jpeg or png), read from Telegram by the bot.
 * Same access as the post's draft (the owner, or the id holder of an unowned brand). The Telegram file URL carries the
 * bot token: it is built server-side (botflow/photos.ts), used once, never sent to the browser. The Studio reads this
 * with its Authorization header and shows a blob URL; anything that fails shows an icon and the length instead.
 */
export const GET = handle(async (req) => {
  rateLimit(req, "video-thumb", 60);
  const postId = new URL(req.url).searchParams.get("postId") ?? "";
  const userId = telegramUserId(req);
  const post = await getPost(postId);
  if (!post) throw new HttpError(404, "Post not found", "post_not_found");
  const brand = await loadBrandFor(post.brandId, userId);
  await assertDraftAccess(brand, userId);
  const thumb = post.video?.thumbFileId;
  if (!thumb) throw new HttpError(404, "no thumbnail", "not_found");
  const dataUrl = await telegramPhoto(getBot().api, thumb);
  const m = dataUrl ? /^data:(image\/[a-z]+);base64,(.+)$/.exec(dataUrl) : null;
  if (!m) throw new HttpError(404, "thumbnail not readable", "not_found");
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
});
