import { z } from "zod";
import { buildBrand } from "@/lib/uslub/brand";
import { handle, HttpError, json, rateLimit, readJson } from "@/lib/uslub/http";
import { getBrand } from "@/lib/uslub/store";

export const maxDuration = 60;

const Body = z.object({
  channel: z.string().trim().max(200).optional(),
  knowledge: z.string().max(8000).optional(),
  samplePosts: z.array(z.string().max(4000)).max(30).optional(),
});

/** POST { channel?, knowledge?, samplePosts? } -> { brand, cached } */
export const POST = handle(async (req) => {
  rateLimit(req, "brand", 6);
  const body = await readJson(req, Body);
  if (!body.channel && !body.knowledge?.trim() && !body.samplePosts?.length) {
    throw new HttpError(400, "Send a channel, knowledge or samplePosts");
  }
  const { brand, cached, channel } = await buildBrand(body);
  return json({
    brand,
    cached,
    channelInfo: channel ? { title: channel.title, subscribers: channel.subscribers, postsRead: channel.posts.length } : undefined,
  });
});

/** GET ?id= -> { brand } */
export const GET = handle(async (req) => {
  rateLimit(req, "brand_get", 60);
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const brand = await getBrand(id);
  if (!brand) throw new HttpError(404, "Brand not found");
  return json({ brand });
});
