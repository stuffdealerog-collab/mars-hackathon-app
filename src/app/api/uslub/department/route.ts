import { z } from "zod";
import { safeLogEvent } from "@/lib/track";
import { buildBrand } from "@/lib/uslub/brand";
import { spendClaude } from "@/lib/uslub/budget";
import { generatePosts } from "@/lib/uslub/copywriter";
import { errorBody, handle, HttpError, json, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import type { RadarLead } from "@/lib/uslub/contract";
import { findLeads } from "@/lib/uslub/radar";
import { classifySensitivity } from "@/lib/uslub/sensitivity";
import { countPublished, publicBrand, savePosts } from "@/lib/uslub/store";
import { planVideo } from "@/lib/uslub/video";
import { videoLang, videoMode } from "@/lib/uslub/video-core";
import { labsGate } from "@/lib/ops/labs";

export const maxDuration = 90;

const Body = z.object({
  channel: z.string().trim().max(200).optional(),
  knowledge: z.string().max(8000).optional(),
  brief: z.string().max(1000).optional(),
  count: z.number().int().min(1).max(5).optional(),
  include: z.array(z.enum(["posts", "radar", "video"])).optional(),
  initData: z.string().max(8192).optional(),
});

class DeadlineError extends Error {
  constructor() {
    super("timeout");
  }
}

/** Resolves with the task, or rejects with DeadlineError at `deadline` (epoch ms). */
function withDeadline<T>(task: Promise<T>, deadline: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError()), Math.max(1000, deadline - Date.now()));
  });
  task.catch(() => undefined); // a late failure must not become an unhandled rejection
  return Promise.race([task, timeout]).finally(() => clearTimeout(timer));
}

const isTimeout = (r: PromiseSettledResult<unknown>) => r.status === "rejected" && r.reason instanceof DeadlineError;

/** Owner-safe sentence (request language) for a part that failed; never a raw SDK message. */
const errMsg = (r: PromiseSettledResult<unknown>) => (r.status === "rejected" ? errorBody(r.reason).body.error : undefined);

/**
 * "One link -> whole department": POST { channel? | knowledge?, brief? }
 * -> { brand, posts, leads, video, errors }. Posts, radar and video run in parallel
 * after the Brand DNA; each part fails independently. (Extra route, not in the contract.)
 */
export const POST = handle(async (req) => {
  const closed = labsGate("department"); // no screen calls this route: 404 unless LABS_ROUTES names it
  if (closed) return closed;
  rateLimit(req, "department", 4);
  const body = await readJson(req, Body);
  if (!body.channel && !body.knowledge?.trim()) throw new HttpError(400, "Send a channel or knowledge", "knowledge_needed");
  const include = new Set(body.include ?? ["posts", "radar", "video"]);
  const started = Date.now();

  const ownerTelegramId = telegramUserId(req, body.initData);
  // The whole department (brand, posts, radar, video) is one run of several calls.
  await spendClaude(req, ownerTelegramId, "department", { weight: 2 });
  const { brand, cached } = await buildBrand({ channel: body.channel, knowledge: body.knowledge, ownerTelegramId });
  const brief = body.brief?.trim() || "Kanal uchun bu haftaning eng foydali postlari: mahsulot, mijozlar savoli va taklif";

  // Everything must answer within ~55 s of the request; slow parts (usually radar) are
  // reported as pending so the UI can fetch them from their own route.
  const deadline = started + 55_000;
  const [postsR, leadsR, videoR, publishedR] = await Promise.allSettled([
    include.has("posts") ? withDeadline(generatePosts(brand, brief, body.count ?? 3), deadline) : Promise.resolve([]),
    include.has("radar") ? withDeadline(findLeads(brand), deadline) : Promise.resolve({ leads: [] }),
    include.has("video") ? withDeadline(
          planVideo(brand, {
            brief: `${brief}. 20 soniyalik Reels`,
            lang: videoLang({ languages: brand.dna.languages }),
            mode: videoMode({ channelType: brand.channelType, brandGoal: brand.goal }),
          }),
          deadline,
        ) : Promise.resolve(null),
    countPublished(brand.id),
  ]);
  const pending = {
    posts: isTimeout(postsR) ? "/api/uslub/posts" : undefined,
    radar: isTimeout(leadsR) ? "/api/uslub/radar" : undefined,
    video: isTimeout(videoR) ? "/api/uslub/video" : undefined,
  };

  const posts = postsR.status === "fulfilled" ? postsR.value : [];
  if (posts.length) await savePosts(posts);
  const published = publishedR.status === "fulfilled" ? publishedR.value : 0;
  const radar: { leads: RadarLead[]; reason?: string } = leadsR.status === "fulfilled" ? leadsR.value : { leads: [] };
  const leads = radar.leads;
  if (include.has("radar") && leadsR.status === "fulfilled") await safeLogEvent(null, "radar_run", { brand_id: brand.id, leads: leads.length });
  const video = videoR.status === "fulfilled" ? videoR.value : null;
  if (video) await safeLogEvent(null, "video_planned", { brand_id: brand.id, scenes: video.scenes.length });

  return json({
    brand: publicBrand(brand),
    cached,
    posts: posts.map((p) => ({ ...p, sensitivity: classifySensitivity(p.variants.uz_latn, brief, { publishedCount: published }) })),
    leads,
    ...(radar.reason ? { leadsReason: radar.reason } : {}), // why leads is empty (shown in the UI)
    video,
    errors: { posts: errMsg(postsR), radar: errMsg(leadsR), video: errMsg(videoR) },
    pending, // parts that missed the deadline: call that route with { brandId } to get them
    ms: Date.now() - started,
  });
});
