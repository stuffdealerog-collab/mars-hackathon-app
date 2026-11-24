import "server-only";
import { brandSourceFor, isReusableBrand } from "./access";
import { extractBrandDNA } from "./dna";
import { scrapeChannel, ScrapeError, type ScrapedChannel } from "./scrape";
import { findChannelOnlyBrand, saveBrand, type StoredBrand } from "./store";

export interface BuildBrandInput {
  channel?: string;
  knowledge?: string;
  samplePosts?: string[];
  /** Verified Telegram user (bot ctx.from or validated Mini App initData); null for anonymous web. */
  ownerTelegramId?: number | null;
}

/**
 * Channel link and/or owner notes -> Brand DNA -> saved brand.
 * Cache: only pure channel scrapes are reused (never rows with owner-supplied text),
 * and every caller gets their own row, so ownership is never shared.
 */
export async function buildBrand(input: BuildBrandInput): Promise<{ brand: StoredBrand; cached: boolean; channel?: ScrapedChannel }> {
  const knowledge = (input.knowledge ?? "").trim();
  const given = (input.samplePosts ?? []).map((p) => p.trim()).filter((p) => p.length > 1);
  const owner = input.ownerTelegramId ?? null;
  const source = brandSourceFor({ channel: input.channel, knowledge, samplePosts: given });

  let scraped: ScrapedChannel | undefined;
  if (input.channel?.trim()) {
    scraped = await scrapeChannel(input.channel);
    const cached = source === "channel_only" ? await findChannelOnlyBrand(scraped.username) : null;
    if (cached && isReusableBrand(cached, { channel: scraped.username })) {
      if (cached.ownerTelegramId === owner) return { brand: cached, cached: true, channel: scraped };
      // Same public DNA, but a separate row owned by this caller.
      const copy = await saveBrand(
        { channel: scraped.username, knowledge: "", samplePosts: cached.samplePosts, dna: cached.dna },
        owner,
        "channel_only",
      );
      return { brand: copy, cached: true, channel: scraped };
    }
  }

  const samplePosts = [...given, ...(scraped?.posts.map((p) => p.text) ?? [])].slice(-30);
  if (!samplePosts.length && knowledge.length < 20) {
    throw new ScrapeError("Kanal havolasini yoki biznesingiz haqida kamida 1-2 gap yozing.", 400);
  }

  const dna = await extractBrandDNA({
    samplePosts,
    knowledge,
    channelTitle: scraped?.title,
    channelDescription: scraped?.description,
  });

  const brand = await saveBrand({ channel: scraped?.username, knowledge, samplePosts, dna }, owner, source);
  return { brand, cached: false, channel: scraped };
}
