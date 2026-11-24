import { z } from "zod";
import { generatePosts } from "@/lib/uslub/copywriter";
import { handle, json, loadBrandFor, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { classifySensitivity } from "@/lib/uslub/sensitivity";
import { countPublished, savePosts } from "@/lib/uslub/store";

export const maxDuration = 60;

const Body = z.object({
  brandId: z.string().trim().min(1),
  brief: z.string().trim().min(2).max(2000),
  count: z.number().int().min(1).max(5).optional(),
});

/** POST { brandId, brief, count? } -> { posts: (PostDraft & { sensitivity })[] } */
export const POST = handle(async (req) => {
  rateLimit(req, "posts", 10);
  const body = await readJson(req, Body);
  const brand = await loadBrandFor(body.brandId, telegramUserId(req));

  const [posts, published] = await Promise.all([
    generatePosts(brand, body.brief, body.count ?? 3),
    countPublished(brand.id),
  ]);
  await savePosts(posts);
  return json({
    posts: posts.map((p) => ({
      ...p,
      sensitivity: classifySensitivity(p.variants.uz_latn, body.brief, { publishedCount: published }),
    })),
  });
});
