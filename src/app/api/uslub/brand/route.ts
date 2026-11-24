import { z } from "zod";
import { buildBrand } from "@/lib/uslub/brand";
import { handle, HttpError, json, loadBrandFor, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { publicBrand } from "@/lib/uslub/store";

export const maxDuration = 60;

const Body = z.object({
  channel: z.string().trim().max(200).optional(),
  knowledge: z.string().max(8000).optional(),
  samplePosts: z.array(z.string().max(4000)).max(30).optional(),
  initData: z.string().max(8192).optional(),
});

/**
 * POST { channel?, knowledge?, samplePosts? } -> { brand, cached }
 * With Telegram auth (Mini App initData) the brand is owned by that user and can be published.
 */
export const POST = handle(async (req) => {
  rateLimit(req, "brand", 6);
  const body = await readJson(req, Body);
  if (!body.channel && !body.knowledge?.trim() && !body.samplePosts?.length) {
    throw new HttpError(400, "Send a channel, knowledge or samplePosts");
  }
  const ownerTelegramId = telegramUserId(req, body.initData);
  const { brand, cached, channel } = await buildBrand({ ...body, ownerTelegramId });
  return json({
    brand: publicBrand(brand),
    cached,
    owned: ownerTelegramId != null,
    channelInfo: channel ? { title: channel.title, subscribers: channel.subscribers, postsRead: channel.posts.length } : undefined,
  });
});

/** GET ?id= -> { brand } */
export const GET = handle(async (req) => {
  rateLimit(req, "brand_get", 60);
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const brand = await loadBrandFor(id, telegramUserId(req));
  return json({ brand: publicBrand(brand) });
});
