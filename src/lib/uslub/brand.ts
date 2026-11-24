import "server-only";
import { brandSourceFor, isReusableBrand } from "./access";
import type { BrandMode } from "./contract";
import { extractBrandDNA } from "./dna";
import type { ApiLang } from "./errors";
import { MIN_CHANNEL_POSTS, parseChannelUsername, scrapeChannel, ScrapeError, type ScrapedChannel } from "./scrape";
import { findChannelOnlyBrand, saveBrand, type StoredBrand } from "./store";

export interface BuildBrandInput {
  channel?: string;
  knowledge?: string;
  samplePosts?: string[];
  /** Verified Telegram user (bot ctx.from or validated Mini App initData); null for anonymous web. */
  ownerTelegramId?: number | null;
  /** "fresh" = empty or new channel: the DNA comes from the owner's description only (no scraping). */
  mode?: BrandMode;
  /** Language of the DNA's descriptive fields. */
  lang?: ApiLang;
}

export interface BuildBrandResult {
  brand: StoredBrand;
  cached: boolean;
  channel?: ScrapedChannel;
  /** The pasted channel was empty or private, and the owner's description was enough: built in fresh mode. */
  switchedToFresh?: boolean;
}

/** An owner's description must say at least what they sell (a sentence or two). */
export const MIN_DESCRIPTION = 30;
/** A pictures-only channel's title + description must say at least this much to build a brand from it alone. */
export const MIN_ABOUT = 80;

const emptyChannel = (username: string, posts: number) =>
  new ScrapeError(`@${username} has ${posts} posts`, 422, "channel_empty", { channel: username, reason: posts ? "few_posts" : "no_preview", postsFound: posts });

/**
 * Channel link and/or owner notes -> Brand DNA -> saved brand.
 * Cache: only pure channel scrapes are reused (never rows with owner-supplied text),
 * and every caller gets their own row, so ownership is never shared.
 * Empty channels (no public preview or fewer than MIN_CHANNEL_POSTS posts) throw ScrapeError "channel_empty"
 * unless the owner also described the business: then the brand is built in fresh mode.
 */
export async function buildBrand(input: BuildBrandInput): Promise<BuildBrandResult> {
  const knowledge = (input.knowledge ?? "").trim();
  const given = (input.samplePosts ?? []).map((p) => p.trim()).filter((p) => p.length > 1);
  const owner = input.ownerTelegramId ?? null;
  const lang = input.lang ?? "uz";

  if (input.mode === "fresh") return { brand: await buildFresh(input.channel, knowledge, owner, lang), cached: false };

  const source = brandSourceFor({ channel: input.channel, knowledge, samplePosts: given });
  let scraped: ScrapedChannel | undefined;
  if (input.channel?.trim()) {
    try {
      scraped = await scrapeChannel(input.channel);
    } catch (err) {
      // An invite link names no public channel: the fresh brand is built without one (linked when the owner publishes).
      if (err instanceof ScrapeError && err.code === "channel_empty" && knowledge.length >= MIN_DESCRIPTION && given.length < MIN_CHANNEL_POSTS)
        return { brand: await buildFresh(err.reason === "private" ? undefined : input.channel, knowledge, owner, lang), cached: false, switchedToFresh: true };
      throw err;
    }
    // Empty = few messages of ANY kind (albums and reels without captions count). The voice is then learned from
    // the captioned subset; a channel of pictures only is described from its title and description.
    if (scraped.totalMessages + given.length < MIN_CHANNEL_POSTS) {
      if (knowledge.length >= MIN_DESCRIPTION) return { brand: await buildFresh(scraped.username, knowledge, owner, lang), cached: false, channel: scraped, switchedToFresh: true };
      throw emptyChannel(scraped.username, scraped.totalMessages);
    }
    // Pictures only (no captioned post): there is no voice to learn. With the owner's description it is a fresh
    // brand; with only a short title/description there is nothing to build from, so the owner is asked to describe it.
    if (!scraped.posts.length && !given.length) {
      if (knowledge.length >= MIN_DESCRIPTION) return { brand: await buildFresh(scraped.username, knowledge, owner, lang), cached: false, channel: scraped, switchedToFresh: true };
      const about = `${scraped.title ?? ""} ${scraped.description ?? ""}`.trim();
      if (about.length < MIN_ABOUT)
        throw new ScrapeError(`@${scraped.username} has pictures only`, 422, "channel_empty", { channel: scraped.username, reason: "no_text", postsFound: scraped.totalMessages });
    }
    const cached = source === "channel_only" ? await findChannelOnlyBrand(scraped.username) : null;
    const cachedLang = (cached?.dna as { proseLang?: string } | undefined)?.proseLang ?? "uz";
    if (cached && cachedLang === lang && isReusableBrand(cached, { channel: scraped.username })) {
      // Only the same Telegram user gets the same row back. Anonymous callers never share a row: the brand id is
      // their capability for its posts (GET /posts), so a competitor pasting the same channel can't see drafts.
      if (owner != null && cached.ownerTelegramId === owner) return { brand: cached, cached: true, channel: scraped };
      // Same public DNA (no new Claude call), but a separate row for this caller.
      const copy = await saveBrand(
        { channel: scraped.username, knowledge: "", samplePosts: cached.samplePosts, dna: cached.dna, mode: "channel" },
        owner,
        "channel_only",
      );
      return { brand: copy, cached: true, channel: scraped };
    }
  }

  const samplePosts = [...given, ...(scraped?.posts.map((p) => p.text) ?? [])].slice(-30);
  if (!samplePosts.length && !scraped) {
    // No channel and no samples: a business description alone is a fresh brand.
    if (knowledge.length >= MIN_DESCRIPTION) return { brand: await buildFresh(undefined, knowledge, owner, lang), cached: false };
    throw new ScrapeError("knowledge needed", 400, "knowledge_needed");
  }

  const dna = await extractBrandDNA({ samplePosts, knowledge, channelTitle: scraped?.title, channelDescription: scraped?.description, lang });
  const brand = await saveBrand({ channel: scraped?.username, knowledge, samplePosts, dna, mode: "channel" }, owner, source);
  return { brand, cached: false, channel: scraped };
}

/** Fresh mode: DNA from the owner's description only; the (optional) channel is just where posts will go. */
async function buildFresh(channelInput: string | undefined, knowledge: string, owner: number | null, lang: ApiLang): Promise<StoredBrand> {
  if (knowledge.length < MIN_DESCRIPTION) throw new ScrapeError("knowledge needed", 400, "knowledge_needed");
  let channel: string | undefined;
  if (channelInput?.trim()) {
    channel = parseChannelUsername(channelInput) ?? undefined;
    if (!channel) throw new ScrapeError("bad channel", 400, "channel_invalid");
  }
  const dna = await extractBrandDNA({ samplePosts: [], knowledge, lang, mode: "fresh" });
  return saveBrand({ channel, knowledge, samplePosts: [], dna, mode: "fresh" }, owner, "custom");
}
