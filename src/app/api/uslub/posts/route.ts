import { z } from "zod";
import type { PostDraft } from "@/lib/uslub/contract";
import { generatePosts } from "@/lib/uslub/copywriter";
import { errorBody, handle, HttpError, json, loadBrandFor, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { classifySensitivity } from "@/lib/uslub/sensitivity";
import { slotBrief, slotSummary, toPlanSlot } from "@/lib/uslub/slots";
import { countPublished, listPosts, savePosts } from "@/lib/uslub/store";

// Up to 7 posts are written in parallel (one Claude call per slot + editor pass); Vercel allows up to 300 s.
export const maxDuration = 120;
const BUDGET_MS = 100_000;

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
 * POST { brandId, slots: (PlanSlot & { brief })[] }   (≤7) -> { posts, failed? }   one post per plan slot, slot kept
 * POST { brandId, brief, count? }                     (≤5) -> { posts }
 * Every post: PostDraft (+ sensitivity). `failed` lists slots that could not be written ({ index, day, time, error, code }).
 */
export const POST = handle(async (req) => {
  rateLimit(req, "posts", 10);
  const started = Date.now();
  const body = await readJson(req, Body);
  const brand = await loadBrandFor(body.brandId, telegramUserId(req));
  const published = await countPublished(brand.id);

  if ("brief" in body) {
    const posts = await generatePosts(brand, body.brief, body.count ?? 3, { deadline: started + BUDGET_MS });
    await savePosts(posts);
    return json({ posts: posts.map((p) => withSensitivity(p, body.brief, published)) });
  }

  const deadline = started + BUDGET_MS;
  const settled = await Promise.allSettled(
    body.slots.map((s) => generatePosts(brand, slotBrief(s), 1, { slot: toPlanSlot(s), storedBrief: slotSummary(s), deadline })),
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
  // One batch, one timestamp: GET lists the batch in plan order (day, time).
  const batchAt = new Date().toISOString();
  for (const p of posts) p.createdAt = batchAt;
  await savePosts(posts);
  return json({
    posts: posts.map((p) => withSensitivity(p, p.brief, published)),
    ...(failed.length ? { failed } : {}),
  });
});

/** GET ?brandId= -> { posts }  newest first (draft, approved, published), with slot, image and approvedAt. */
export const GET = handle(async (req) => {
  rateLimit(req, "posts_get", 60);
  const url = new URL(req.url);
  const brandId = url.searchParams.get("brandId") ?? "";
  const brand = await loadBrandFor(brandId, telegramUserId(req));
  const limit = Number(url.searchParams.get("limit") ?? 50);
  return json({ posts: await listPosts(brand.id, Number.isFinite(limit) ? limit : 50) });
});
