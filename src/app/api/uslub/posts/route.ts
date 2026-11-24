import { z } from "zod";
import type { PostDraft } from "@/lib/uslub/contract";
import { generatePosts } from "@/lib/uslub/copywriter";
import { spendClaude } from "@/lib/uslub/budget";
import { assertDraftAccess, errorBody, handle, HttpError, json, loadBrandFor, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { classifySensitivity } from "@/lib/uslub/sensitivity";
import { slotBrief, slotSummary, toPlanSlot } from "@/lib/uslub/slots";
import { countPublished, findRecentSlotPost, listPosts, savePosts } from "@/lib/uslub/store";
import { currentContext } from "@/lib/uslub/context";
import { placeholderNote, placeholdersIn } from "@/lib/uslub/placeholders";
import { pastDateNote } from "@/lib/uslub/postguard";

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
  /** The plan item's format (text | photo | album | video): a post that is not a video never mentions one. */
  format: z.string().trim().max(20).optional(),
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

const ALL_SCRIPTS = ["uz_latn", "uz_cyrl", "ru", "en"] as const;

/**
 * A post that still has an unfilled slot ("Kod: [kod]") after the fix pass: needsApproval + an owner-readable note
 * naming the blank, in the request's language. Approve and publish refuse it until the owner fills or deletes it.
 * A plan post that names a date before its own day (an opening that already happened) also needs the owner's look.
 */
function withBlanks<P extends PostDraft>(p: P) {
  const lang = currentContext()?.lang ?? "uz";
  const left = placeholdersIn(p.variants, ALL_SCRIPTS);
  const past = p.slot?.day && p.status !== "published" ? pastDateNote(p.variants, p.slot.day, lang) : null;
  if (!left.length && !past) return p;
  const note = [left.length ? placeholderNote(left.flatMap((l) => l.tokens), lang) : "", past ?? ""].filter(Boolean).join(" ");
  return { ...p, needsApproval: true, ...(left.length ? { placeholders: left } : {}), note };
}

const withSensitivity = (p: PostDraft, brief: string, published: number) =>
  withBlanks({
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
  // An owned brand's queue takes drafts only from someone who may read them: a public channel_only id is not enough.
  if (brand.ownerTelegramId != null) await assertDraftAccess(brand, userId);
  const published = await countPublished(brand.id);

  if ("brief" in body) {
    await spendClaude(req, userId, "posts");
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
  // The same slot twice in one request is written once (and listed once): no duplicate posts, no duplicate ids.
  const seen = new Set<string>();
  const slots = body.slots
    .map((s, index) => ({ s, index }))
    .filter(({ s }) => {
      const key = JSON.stringify([toPlanSlot(s), slotSummary(s)]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  // Reuse only the exact same slot (day, time, goal, hook, CTA, brief): a new plan always gets new posts.
  const existing = await Promise.all(slots.map(({ s }) => (mayReuse ? findRecentSlotPost(brand.id, toPlanSlot(s), slotSummary(s), REUSE_MINUTES) : null)));
  // A retry that only hands back posts already written costs nothing; anything new takes today's budget
  // (an anonymous "write them all again" counts double).
  if (existing.some((e) => !e)) await spendClaude(req, userId, "posts", { weight: body.regenerate && userId == null ? 2 : 1 });
  const settled = await Promise.allSettled(
    slots.map(async ({ s }, i) => {
      const planSlot = toPlanSlot(s);
      const storedBrief = slotSummary(s);
      const found = existing[i];
      if (found) {
        reused.push(found.id);
        return [found];
      }
      const [post] = await generatePosts(brand, slotBrief(s), 1, { slot: planSlot, storedBrief, deadline, format: s.format });
      if (!post) return [];
      post.createdAt = batchAt;
      await savePosts([post]);
      return [post];
    }),
  );
  const posts: PostDraft[] = [];
  const failed: { index: number; day: string; time: string; error: string; code: string }[] = [];
  settled.forEach((r, i) => {
    const { s, index } = slots[i]; // index = the slot's position in the request
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
  return json({ posts: (await listPosts(brand.id, Number.isFinite(limit) ? limit : 50)).map(withBlanks) });
});
