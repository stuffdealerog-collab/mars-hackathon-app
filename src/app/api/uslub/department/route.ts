import { z } from "zod";
import { safeLogEvent } from "@/lib/track";
import { buildBrand } from "@/lib/uslub/brand";
import { generatePosts } from "@/lib/uslub/copywriter";
import { handle, HttpError, json, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { findLeads } from "@/lib/uslub/radar";
import { classifySensitivity } from "@/lib/uslub/sensitivity";
import { countPublished, publicBrand, savePosts } from "@/lib/uslub/store";
import { planVideo } from "@/lib/uslub/video";

export const maxDuration = 120;

const Body = z.object({
  channel: z.string().trim().max(200).optional(),
  knowledge: z.string().max(8000).optional(),
  brief: z.string().max(1000).optional(),
  count: z.number().int().min(1).max(5).optional(),
  include: z.array(z.enum(["posts", "radar", "video"])).optional(),
  initData: z.string().max(8192).optional(),
});

const errMsg = (r: PromiseSettledResult<unknown>) =>
  r.status === "rejected" ? (r.reason instanceof Error ? r.reason.message : "failed") : undefined;

/**
 * "One link -> whole department": POST { channel? | knowledge?, brief? }
 * -> { brand, posts, leads, video, errors }. Posts, radar and video run in parallel
 * after the Brand DNA; each part fails independently. (Extra route, not in the contract.)
 */
export const POST = handle(async (req) => {
  rateLimit(req, "department", 4);
  const body = await readJson(req, Body);
  if (!body.channel && !body.knowledge?.trim()) throw new HttpError(400, "Send a channel or knowledge");
  const include = new Set(body.include ?? ["posts", "radar", "video"]);
  const started = Date.now();

  const { brand, cached } = await buildBrand({ channel: body.channel, knowledge: body.knowledge, ownerTelegramId: telegramUserId(req, body.initData) });
  const brief = body.brief?.trim() || "Kanal uchun bu haftaning eng foydali postlari: mahsulot, mijozlar savoli va taklif";

  const [postsR, leadsR, videoR, publishedR] = await Promise.allSettled([
    include.has("posts") ? generatePosts(brand, brief, body.count ?? 3) : Promise.resolve([]),
    include.has("radar") ? findLeads(brand) : Promise.resolve([]),
    include.has("video") ? planVideo(brand, `${brief}. 20 soniyalik Reels`) : Promise.resolve(null),
    countPublished(brand.id),
  ]);

  const posts = postsR.status === "fulfilled" ? postsR.value : [];
  if (posts.length) await savePosts(posts);
  const published = publishedR.status === "fulfilled" ? publishedR.value : 0;
  const leads = leadsR.status === "fulfilled" ? leadsR.value : [];
  if (include.has("radar") && leadsR.status === "fulfilled") await safeLogEvent(null, "radar_run", { brand_id: brand.id, leads: leads.length });
  const video = videoR.status === "fulfilled" ? videoR.value : null;
  if (video) await safeLogEvent(null, "video_planned", { brand_id: brand.id, scenes: video.scenes.length });

  return json({
    brand: publicBrand(brand),
    cached,
    posts: posts.map((p) => ({ ...p, sensitivity: classifySensitivity(p.variants.uz_latn, brief, { publishedCount: published }) })),
    leads,
    video,
    errors: { posts: errMsg(postsR), radar: errMsg(leadsR), video: errMsg(videoR) },
    ms: Date.now() - started,
  });
});
