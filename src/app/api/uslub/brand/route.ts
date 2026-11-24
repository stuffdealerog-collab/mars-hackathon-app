import { z } from "zod";
import { spendClaude } from "@/lib/uslub/budget";
import { buildBrand } from "@/lib/uslub/brand";
import { handle, HttpError, json, loadBrandFor, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { publicBrand } from "@/lib/uslub/store";

export const maxDuration = 90;

const Body = z.object({
  channel: z.string().trim().max(200).optional(),
  knowledge: z.string().max(8000).optional(),
  samplePosts: z.array(z.string().max(4000)).max(30).optional(),
  mode: z.enum(["channel", "fresh"]).optional(),
  lang: z.enum(["uz", "ru", "en"]).optional(),
  initData: z.string().max(8192).optional(),
});

/**
 * POST { channel?, knowledge?, samplePosts?, mode?, lang? } -> { brand, cached, owned, mode, switchedToFresh?, channelInfo? }
 * mode "fresh": knowledge (the owner's description, a few sentences) is required; channel is optional (the empty
 *   channel to publish to later). The DNA is built from the description only.
 * A pasted channel with no public preview or fewer than 5 posts answers 422 { code: "channel_empty", reason, postsFound }
 *   unless knowledge was sent too — then the brand is built in fresh mode (switchedToFresh: true).
 * lang (uz | ru | en) is the language of the DNA's descriptive fields and of errors.
 * With Telegram auth (Mini App initData) the brand is owned by that user and can be published.
 */
export const POST = handle(async (req) => {
  rateLimit(req, "brand", 6);
  const body = await readJson(req, Body);
  if (!body.channel && !body.knowledge?.trim() && !body.samplePosts?.length) {
    throw new HttpError(400, "Send a channel, knowledge or samplePosts", "knowledge_needed");
  }
  const ownerTelegramId = telegramUserId(req, body.initData);
  await spendClaude(req, ownerTelegramId, "brand");
  const { brand, cached, channel, switchedToFresh } = await buildBrand({ ...body, ownerTelegramId });
  return json({
    brand: publicBrand(brand),
    cached,
    owned: ownerTelegramId != null,
    mode: brand.mode ?? "channel",
    ...(switchedToFresh ? { switchedToFresh: true } : {}),
    // postsRead = every message read on the channel page (albums and reels without captions included).
    channelInfo: channel ? { title: channel.title, subscribers: channel.subscribers, postsRead: channel.totalMessages } : undefined,
  });
});

/** GET ?id= -> { brand } */
export const GET = handle(async (req) => {
  rateLimit(req, "brand_get", 60);
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const brand = await loadBrandFor(id, telegramUserId(req));
  return json({ brand: publicBrand(brand) });
});
