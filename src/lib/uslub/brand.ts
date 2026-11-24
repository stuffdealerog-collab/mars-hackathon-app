import "server-only";
import type { BrandProfile } from "./contract";
import { extractBrandDNA } from "./dna";
import { scrapeChannel, ScrapeError, type ScrapedChannel } from "./scrape";
import { findRecentBrandByChannel, saveBrand } from "./store";

export interface BuildBrandInput {
  channel?: string;
  knowledge?: string;
  samplePosts?: string[];
  ownerTelegramId?: number | null;
  /** Reuse a brand built from the same channel in the last 24 h (default true when only a channel is given). */
  useCache?: boolean;
}

/** Channel link and/or owner notes -> Brand DNA -> saved BrandProfile. */
export async function buildBrand(input: BuildBrandInput): Promise<{ brand: BrandProfile; cached: boolean; channel?: ScrapedChannel }> {
  const knowledge = (input.knowledge ?? "").trim();
  const given = (input.samplePosts ?? []).map((p) => p.trim()).filter((p) => p.length > 1);

  let scraped: ScrapedChannel | undefined;
  if (input.channel?.trim()) {
    scraped = await scrapeChannel(input.channel);
    const onlyChannel = !knowledge && !given.length;
    if ((input.useCache ?? onlyChannel) && onlyChannel) {
      const cached = await findRecentBrandByChannel(scraped.username);
      if (cached) return { brand: cached, cached: true, channel: scraped };
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

  const brand = await saveBrand(
    { channel: scraped?.username, knowledge, samplePosts, dna },
    input.ownerTelegramId ?? null,
  );
  return { brand, cached: false, channel: scraped };
}
