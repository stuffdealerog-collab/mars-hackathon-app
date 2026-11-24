import { z } from "zod";
import { brandWords, MAX_VARIANT, mergeVariants } from "@/lib/uslub/edits";
import { assertDraftAccess, handle, HttpError, json, loadBrandFor, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { pickScript } from "@/lib/uslub/botpublish-core";
import type { Script } from "@/lib/uslub/contract";
import { placeholdersIn } from "@/lib/uslub/placeholders";
import { approvePost, getPost } from "@/lib/uslub/store";

export const maxDuration = 15;

const Text = z.string().max(MAX_VARIANT + 512); // cleaned and re-checked against MAX_VARIANT in mergeVariants

const Body = z.object({
  postId: z.string().trim().min(1).max(64),
  /** Only the texts the owner edited (partial). Unknown scripts are refused. */
  variants: z.object({ uz_latn: Text.optional(), uz_cyrl: Text.optional(), ru: Text.optional(), en: Text.optional() }).strict().optional(),
  initData: z.string().max(8192).optional(),
  lang: z.enum(["uz", "ru", "en"]).optional(),
});

/**
 * POST { postId, variants?, lang? } -> { post }   persists the owner's approval (status "approved" + approvedAt).
 * `variants` (partial Record<Script, string>, only the edited texts) is cleaned (control characters stripped,
 * ≤ 4096 chars, not empty) and stored with the approval, so the bot publishes exactly what the owner approved.
 * An edited uz_latn without uz_cyrl regenerates uz_cyrl from it (deterministic transliteration).
 * Idempotent without edits; edits to a published post are refused (409). Same access rule as reading the brand.
 */
export const POST = handle(async (req) => {
  rateLimit(req, "posts_approve", 60);
  const body = await readJson(req, Body);
  const userId = telegramUserId(req, body.initData);
  const post = await getPost(body.postId);
  if (!post) throw new HttpError(404, "Post not found", "post_not_found");
  const brand = await loadBrandFor(post.brandId, userId);
  await assertDraftAccess(brand, userId);

  let edited: Parameters<typeof approvePost>[2];
  if (body.variants && Object.keys(body.variants).length) {
    if (post.status === "published") throw new HttpError(409, "post already published", "conflict");
    const merged = mergeVariants(post.variants, body.variants, brandWords(brand.dna?.name ?? "", brand.channel));
    if (!merged.ok) throw new HttpError(400, `bad edit: ${merged.field}`, "invalid_input", { field: merged.field });
    if (merged.changed.length) edited = { variants: merged.variants, neuroHits: merged.neuroHits, humanScore: merged.humanScore, changed: merged.changed };
  }
  // Never approve a text with an unfilled slot ("Kod: [kod]"): the version that will go out (the brand's main
  // script) and every version the owner just edited must be complete.
  if (post.status !== "published") {
    const variants = edited?.variants ?? post.variants;
    const scripts = [...new Set([pickScript(variants, undefined, brand.dna?.languages), ...((edited?.changed ?? []) as Script[])])];
    const left = placeholdersIn(variants, scripts);
    if (left.length) {
      const tokens = left.flatMap((l) => l.tokens);
      throw new HttpError(422, `placeholder left: ${tokens.join(" ")}`, "placeholder_left", { facts: tokens.map((t) => `«${t}»`).join(", ") }, { missing: left });
    }
  }
  const approved = await approvePost(post.id, userId, edited);
  if (!approved) throw new HttpError(404, "Post not found", "post_not_found");
  return json({ post: approved, ...(edited ? { edited: edited.changed } : {}) });
});
