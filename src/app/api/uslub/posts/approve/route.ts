import { z } from "zod";
import { handle, HttpError, json, loadBrandFor, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { approvePost, getPost } from "@/lib/uslub/store";

export const maxDuration = 15;

const Body = z.object({
  postId: z.string().trim().min(1).max(64),
  initData: z.string().max(8192).optional(),
  lang: z.enum(["uz", "ru", "en"]).optional(),
});

/**
 * POST { postId } -> { post }   persists the owner's approval (status "approved" + approvedAt).
 * Idempotent; a published post is returned unchanged. Same access rule as reading the brand.
 */
export const POST = handle(async (req) => {
  rateLimit(req, "posts_approve", 60);
  const body = await readJson(req, Body);
  const userId = telegramUserId(req, body.initData);
  const post = await getPost(body.postId);
  if (!post) throw new HttpError(404, "Post not found", "post_not_found");
  const brand = await loadBrandFor(post.brandId, userId);
  if (brand.ownerTelegramId != null && brand.ownerTelegramId !== userId) throw new HttpError(403, "post of another owner", "brand_forbidden");
  const approved = await approvePost(post.id, userId);
  if (!approved) throw new HttpError(404, "Post not found", "post_not_found");
  return json({ post: approved });
});
