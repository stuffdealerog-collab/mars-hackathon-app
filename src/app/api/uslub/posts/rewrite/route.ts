import { z } from "zod";
import { spendClaude } from "@/lib/uslub/budget";
import type { Script } from "@/lib/uslub/contract";
import { currentContext } from "@/lib/uslub/context";
import { rewritePost } from "@/lib/uslub/copywriter";
import { assertDraftAccess, handle, HttpError, json, loadBrandFor, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { placeholderNote, placeholdersIn } from "@/lib/uslub/placeholders";
import { getPost, updatePostText } from "@/lib/uslub/store";

// One fast-model call (≤30 s) plus the code post-pass.
export const maxDuration = 60;

const Body = z.object({
  postId: z.string().trim().min(1).max(100),
  /** The owner's phrase: "qisqaroq", "короче", "без ссылки", "narxi 210 000". */
  instruction: z.string().trim().min(2).max(300),
  lang: z.enum(["uz", "ru", "en"]).optional(),
  initData: z.string().max(8192).optional(),
});

const ALL: Script[] = ["uz_latn", "uz_cyrl", "ru", "en"];

/**
 * POST { postId, instruction, lang?, initData? } -> { post: PostDraft, kept: Script[] }
 * Rewrites a draft or approved post from one phrase of the owner (one fast Claude pass over the three versions, then
 * the same code post-pass as a new post: one price format, the DNA's product names, sentence-safe blanks). A version
 * that would gain a number, price or date neither the post nor the phrase had stays as it was (listed in `kept`).
 * A published post is never rewritten (409 conflict). Takes one daily Claude budget unit.
 */
export const POST = handle(async (req) => {
  rateLimit(req, "posts-rewrite", 10);
  const body = await readJson(req, Body);
  const userId = telegramUserId(req, body.initData);
  const post = await getPost(body.postId);
  if (!post) throw new HttpError(404, "Post not found", "post_not_found");
  const brand = await loadBrandFor(post.brandId, userId);
  // Drafts are private: only the owner (or the browser holding an unowned brand) may change them.
  await assertDraftAccess(brand, userId);
  if (post.status === "published") throw new HttpError(409, "a published post is not rewritten", "conflict");
  await spendClaude(req, userId, "rewrite");
  const r = await rewritePost(brand, post, body.instruction);
  const updated = await updatePostText(post.id, { variants: r.variants, neuroHits: r.neuroHits, humanScore: r.humanScore });
  if (!updated) throw new HttpError(409, "the post was published meanwhile", "conflict");
  // A blank still in the text ("Narxi: [narx]") keeps the post from going out until the owner fills it.
  const left = placeholdersIn(updated.variants, ALL);
  const lang = body.lang ?? currentContext()?.lang ?? "uz";
  return json({
    post: left.length ? { ...updated, needsApproval: true, placeholders: left, note: placeholderNote(left.flatMap((l) => l.tokens), lang) } : updated,
    kept: r.kept,
  });
});
