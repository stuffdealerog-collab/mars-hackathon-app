import { z } from "zod";
import type { PostDraft } from "@/lib/uslub/contract";
import { generatePosts } from "@/lib/uslub/copywriter";
import { assertDraftAccess, errorBody, handle, HttpError, json, loadBrandFor, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { classifySensitivity } from "@/lib/uslub/sensitivity";
import { slotBrief, slotSummary, toPlanSlot } from "@/lib/uslub/slots";
import { countPublished, findRecentSlotPost, listPosts, savePosts } from "@/lib/uslub/store";

// Up to 7 posts are written in parallel (one Claude call per slot, ≤45 s, + an editor pass that is skipped late).
// The work is budgeted to ~60 s so the Studio's client timeout is never the first to fire; maxDuration is headroom.
export const maxDuration = 120;
const BUDGET_MS = 60_000;
/** A retried request within this window returns the slot's existing post instead of writing it again. */
const REUSE_MINUTES = 10;

const Slot = z.object({
  day: z.string().trim().min(4).max(40),
  time: z.string().trim().max(10).default(""),
  goal: z.enum(["reach", "trust", "sale"]),
  hook: z.string().max(400).default(""),
  cta: z.string().max(600).default(""),
  brief: z.string().max(2000).default(""),
});

const Body = z.union([
  z.object({
    brandId: z.string().trim().min(1),
    slots: z.array(Slot).min(1).max(7),
    /** true = write every slot again even if it was written in the last 10 minutes ("another version"). */
    regenerate: z.boolean().optional(),
    lang: z.enum(["uz", "ru", "en"]).optional(),
  }),
  z.object({
    brandId: z.string().trim().min(1),
    brief: z.string().trim().min(2).max(2000),
    count: z.number().int().min(1).max(5).optional(),
    lang: z.enum(["uz", "ru", "en"]).optional(),
  }),
]);

const withSensitivity = (p: PostDraft, brief: string, published: number) => ({
  ...p,
  sensitivity: classifySensitivity(p.variants.uz_latn, brief, { publishedCount: published }),
});

/**
 * POST { brandId, slots: (PlanSlot & { brief })[], regenerate? } (≤7) -> { posts, failed?, reused? }  one post per slot
 * POST { brandId, brief, count? }                                (≤5) -> { posts }
 * Every post: PostDraft (+ sensitivity). `failed` lists slots that could not be written ({ index, day, time, error, code }).
 * Idempotent: a slot (same day and time) written for this brand in the last 10 minutes is returned as is (`reused`
 * lists those ids), so a client retry after a timeout never writes or bills the same posts twice.
 */
export const POST = handle(async (req) => {
  rateLimit(req, "posts", 10);
  const started = Date.now();
  const body = await readJson(req, Body);
  const userId = telegramUserId(req);
  const brand = await loadBrandFor(body.brandId, userId);
  const published = await countPublished(brand.id);

  if ("brief" in body) {
    const posts = await generatePosts(brand, body.brief, body.count ?? 3, { deadline: started + BUDGET_MS });
    await savePosts(posts);
    return json({ posts: posts.map((p) => withSensitivity(p, body.brief, published)) });
  }

  const deadline = started + BUDGET_MS;
  // One batch, one timestamp: GET lists the batch in plan order (day, time). Each post is saved as soon as it is
  // written, so a slow slot (or a killed function) never loses the ones that finished.
  const batchAt = new Date(started).toISOString();
  // Existing drafts are only handed back to someone allowed to read them (never across owners).
  const mayReuse = !body.regenerate && (await assertDraftAccess(brand, userId).then(() => true, () => false));
  const reused: string[] = [];
  const settled = await Promise.allSettled(
    body.slots.map(async (s) => {
      const existing = mayReuse ? await findRecentSlotPost(brand.id, s.day, s.time, REUSE_MINUTES) : null;
      if (existing) {
        reused.push(existing.id);
        return [existing];
      }
      const [post] = await generatePosts(brand, slotBrief(s), 1, { slot: toPlanSlot(s), storedBrief: slotSummary(s), deadline });
      if (!post) return [];
      post.createdAt = batchAt;
      await savePosts([post]);
      return [post];
    }),
  );
  const posts: PostDraft[] = [];
  const failed: { index: number; day: string; time: string; error: string; code: string }[] = [];
  settled.forEach((r, index) => {
    const s = body.slots[index];
    if (r.status === "fulfilled" && r.value[0]) posts.push(r.value[0]);
    else {
      const { body: e } = errorBody(r.status === "rejected" ? r.reason : new Error("empty result"));
      failed.push({ index, day: s.day, time: s.time, error: e.error, code: e.code });
    }
  });
  if (!posts.length) {
    const first = settled.find((r) => r.status === "rejected");
    throw first?.status === "rejected" ? first.reason : new HttpError(502, "no posts written", "ai_failed");
  }
  return json({
    posts: posts.map((p) => withSensitivity(p, p.brief, published)),
    ...(failed.length ? { failed } : {}),
    ...(reused.length ? { reused } : {}),
  });
});

/** GET ?brandId= -> { posts }  newest first (draft, approved, published), with slot, image and approvedAt. */
export const GET = handle(async (req) => {
  rateLimit(req, "posts_get", 60);
  const url = new URL(req.url);
  const brandId = url.searchParams.get("brandId") ?? "";
  const userId = telegramUserId(req);
  const brand = await loadBrandFor(brandId, userId);
  await assertDraftAccess(brand, userId);
  const limit = Number(url.searchParams.get("limit") ?? 50);
  return json({ posts: await listPosts(brand.id, Number.isFinite(limit) ? limit : 50) });
});
