import "server-only";
import { getEnv } from "../env";
import { safeLogEvent } from "@/lib/track";
import { brandSourceFor, canReuseBrandRow, isDnaStale, isReusableBrand, mayRewriteBrandRow } from "./access";
import { defaultGoalFor, detectChannelType } from "./brain/channel-type";
import type { BrandDNA, BrandMode, ChannelType, Goal } from "./contract";
import { extractBrandDNA } from "./dna";
import { extractPostEnding } from "./ending";
import type { ApiLang } from "./errors";
import { MIN_CHANNEL_POSTS, parseChannelUsername, scrapeChannel, ScrapeError, type ScrapedChannel } from "./scrape";
import { dnaProseLang, findChannelOnlyBrand, findOwnBrand, getBrand, isUuid, saveBrand, setBrandTypeGoal, updateBrandProfile, wasClaimed, type StoredBrand } from "./store";

/** A DNA just written, with the time it was written: kept inside the dna jsonb (no schema change), read by isDnaStale. */
const stamped = <T extends object>(dna: T): T & { builtAt: string } => ({ ...dna, builtAt: new Date().toISOString() });

/**
 * What the channel's own posts say without an LLM: how its posts end (owner correction 1) and what kind of channel
 * it is, with the goal that type starts with (owner correction 2). `samplePosts` are oldest first (as stored).
 */
export function channelProfile(input: { samplePosts: string[]; channel?: string; scraped?: Pick<ScrapedChannel, "username" | "title" | "description" | "posts"> }): {
  postEnding: BrandDNA["postEnding"];
  channelType: ChannelType;
  goal: Goal;
} {
  const posts = input.scraped?.posts.map((p) => p.text) ?? input.samplePosts;
  const newestFirst = [...posts].reverse();
  const bot = getEnv().BOT_USERNAME?.replace(/^@/, "");
  const postEnding = extractPostEnding(newestFirst, { channel: input.scraped?.username ?? input.channel, bot });
  const channelType = detectChannelType({ posts: newestFirst.map((text) => ({ text })), title: input.scraped?.title, description: input.scraped?.description }).type;
  return { postEnding, channelType, goal: defaultGoalFor(channelType) };
}

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
  /** The brand id this browser already holds for the channel (the Studio's remembered brand): reused, not copied. */
  brandId?: string;
  /** Runs right before a paid DNA call, never when a brand is reused as is: the route takes its budget unit here. */
  beforeLlm?: () => Promise<void>;
}

export interface BuildBrandResult {
  brand: StoredBrand;
  cached: boolean;
  /** The caller's existing row for this channel came back (no new row; plans and answers stay on it). */
  reused?: boolean;
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

type EarlierBrand = { brand: StoredBrand; via: "brand_id" | "owner" };

/**
 * The caller's own earlier brand for this channel with its DNA in `lang`: the id their browser holds, or (Telegram
 * user) their newest row for the channel in that language, at any age. Null when there is none or it is not theirs
 * (canReuseBrandRow); the caller then gets a new row, as before reuse existed.
 * A row in another language comes back only to the browser holding an unowned row: nobody else reads it, so its DNA
 * is rewritten in place. A Telegram-owned row is shared by the bot, the Mini App and a browser that held it before
 * the claim, so it is never rewritten into another language: each language keeps its own row.
 */
async function ownEarlierBrand(channel: string, owner: number | null, brandId: string | undefined, lang: ApiLang): Promise<EarlierBrand | null> {
  if (brandId && isUuid(brandId)) {
    const row = await getBrand(brandId);
    const claimed = row && owner == null && row.ownerTelegramId != null ? await wasClaimed(row.id) : false;
    if (row && canReuseBrandRow(row, { channel, ownerTelegramId: owner, claimed }) && (dnaProseLang(row.dna) === lang || row.ownerTelegramId == null))
      return { brand: row, via: "brand_id" };
  }
  if (owner != null) {
    const row = await findOwnBrand(owner, channel, lang);
    if (row && canReuseBrandRow(row, { channel, ownerTelegramId: owner })) return { brand: row, via: "owner" };
  }
  return null;
}

/**
 * Reuses the caller's row (same id: plans and answers stay on it). Its DNA is built again, in place and for one
 * Claude call, when it is older than the cache window (counted from the DNA's builtAt) or in another language, as a
 * new row would have been before reuse existed. A row built from the channel alone takes the channel's newest posts;
 * one with the owner's own samples keeps them. Only a caller who may change the row does this (mayRewriteBrandRow):
 * a browser using a web brand later claimed in the bot gets the row as it is and never writes to it.
 */
async function reuseBrand(found: EarlierBrand, scraped: ScrapedChannel, input: { owner: number | null; lang: ApiLang; beforeLlm?: () => Promise<void> }): Promise<BuildBrandResult> {
  let brand = found.brand;
  const rebuild = mayRewriteBrandRow(brand, input.owner) && (dnaProseLang(brand.dna) !== input.lang || isDnaStale(brand));
  if (rebuild) {
    await input.beforeLlm?.();
    const fresh = brand.source === "channel_only" ? scraped.posts.map((p) => p.text).slice(-30) : [];
    const samplePosts = fresh.length ? fresh : brand.samplePosts;
    const profile = channelProfile({ samplePosts, channel: brand.channel, scraped: fresh.length ? scraped : undefined });
    const dna = stamped({
      ...(await extractBrandDNA({ samplePosts, knowledge: brand.knowledge, channelTitle: scraped.title, channelDescription: scraped.description, lang: input.lang })),
      postEnding: profile.postEnding,
    });
    brand = (await updateBrandProfile(brand.id, { dna, samplePosts })) ?? { ...brand, dna, samplePosts };
    brand = await withTypeGoal(brand, profile);
  } else if (!brand.dna.postEnding || !brand.channelType) {
    // A row made before 2026-11-25: its ending and type come from its posts, no LLM call.
    const profile = channelProfile({ samplePosts: brand.samplePosts, channel: brand.channel, scraped: brand.source === "channel_only" ? scraped : undefined });
    if (!brand.dna.postEnding && mayRewriteBrandRow(brand, input.owner)) {
      const dna = { ...brand.dna, postEnding: profile.postEnding };
      brand = (await updateBrandProfile(brand.id, { dna })) ?? { ...brand, dna };
    }
    if (mayRewriteBrandRow(brand, input.owner)) brand = await withTypeGoal(brand, profile);
  }
  // brand_created no longer fires for a re-run, so the funnel counts the reuse instead of seeing a drop.
  await safeLogEvent(input.owner, "brand_reused", { brand_id: brand.id, channel: brand.channel ?? null, via: found.via, dna_rewritten: rebuild });
  return { brand, cached: !rebuild, reused: true, channel: scraped };
}

/** Stores the detected type and its default goal on a row that has none yet (a stored type or goal is kept). */
async function withTypeGoal(brand: StoredBrand, profile: { channelType: ChannelType; goal: Goal }): Promise<StoredBrand> {
  const patch = { ...(brand.channelType ? {} : { channelType: profile.channelType }), ...(brand.goal ? {} : { goal: profile.goal }) };
  if (!patch.channelType && !patch.goal) return brand;
  await setBrandTypeGoal(brand.id, patch).catch((err) => console.warn("[uslub/brand] type not saved", err instanceof Error ? err.message : err));
  return { ...brand, ...patch };
}

/**
 * Channel link and/or owner notes -> Brand DNA -> saved brand.
 * Running the same channel again returns the caller's own row (the id their browser holds, or a Telegram user's
 * newest row for the channel in the requested language): no duplicate rows, plans and answers stay attached; its DNA
 * is rebuilt in place once it is older than 24 h (see reuseBrand). Otherwise only pure channel
 * scrapes are reused as a cache (never rows with owner-supplied text), and every caller gets their own row, so
 * ownership is never shared.
 * Empty channels (no public preview or fewer than MIN_CHANNEL_POSTS posts) throw ScrapeError "channel_empty"
 * unless the owner also described the business: then the brand is built in fresh mode.
 */
export async function buildBrand(input: BuildBrandInput): Promise<BuildBrandResult> {
  const knowledge = (input.knowledge ?? "").trim();
  const given = (input.samplePosts ?? []).map((p) => p.trim()).filter((p) => p.length > 1);
  const owner = input.ownerTelegramId ?? null;
  const lang = input.lang ?? "uz";

  if (input.mode === "fresh") return { brand: await buildFresh(input.channel, knowledge, owner, lang, input.beforeLlm), cached: false };

  const source = brandSourceFor({ channel: input.channel, knowledge, samplePosts: given });
  let scraped: ScrapedChannel | undefined;
  if (input.channel?.trim()) {
    try {
      scraped = await scrapeChannel(input.channel);
    } catch (err) {
      // An invite link names no public channel: the fresh brand is built without one (linked when the owner publishes).
      if (err instanceof ScrapeError && err.code === "channel_empty" && knowledge.length >= MIN_DESCRIPTION && given.length < MIN_CHANNEL_POSTS)
        return { brand: await buildFresh(err.reason === "private" ? undefined : input.channel, knowledge, owner, lang, input.beforeLlm), cached: false, switchedToFresh: true };
      throw err;
    }
    // Empty = few messages of ANY kind (albums and reels without captions count). The voice is then learned from
    // the captioned subset; a channel of pictures only is described from its title and description.
    if (scraped.totalMessages + given.length < MIN_CHANNEL_POSTS) {
      if (knowledge.length >= MIN_DESCRIPTION) return { brand: await buildFresh(scraped.username, knowledge, owner, lang, input.beforeLlm), cached: false, channel: scraped, switchedToFresh: true };
      throw emptyChannel(scraped.username, scraped.totalMessages);
    }
    // Pictures only (no captioned post): there is no voice to learn. With the owner's description it is a fresh
    // brand; with only a short title/description there is nothing to build from, so the owner is asked to describe it.
    if (!scraped.posts.length && !given.length) {
      if (knowledge.length >= MIN_DESCRIPTION) return { brand: await buildFresh(scraped.username, knowledge, owner, lang, input.beforeLlm), cached: false, channel: scraped, switchedToFresh: true };
      const about = `${scraped.title ?? ""} ${scraped.description ?? ""}`.trim();
      if (about.length < MIN_ABOUT)
        throw new ScrapeError(`@${scraped.username} has pictures only`, 422, "channel_empty", { channel: scraped.username, reason: "no_text", postsFound: scraped.totalMessages });
    }
    // The same caller running the same channel again (no new text of their own): their row comes back.
    if (source === "channel_only") {
      const own = await ownEarlierBrand(scraped.username, owner, input.brandId, lang);
      if (own) return reuseBrand(own, scraped, { owner, lang, beforeLlm: input.beforeLlm });
    }
    const cached = source === "channel_only" ? await findChannelOnlyBrand(scraped.username) : null;
    if (cached && dnaProseLang(cached.dna) === lang && isReusableBrand(cached, { channel: scraped.username })) {
      // Only the same Telegram user gets the same row back. Anonymous callers never share a row: the brand id is
      // their capability for its posts (GET /posts), so a competitor pasting the same channel can't see drafts.
      if (owner != null && cached.ownerTelegramId === owner) return { brand: cached, cached: true, channel: scraped };
      // Same public DNA (no new Claude call), but a separate row for this caller.
      const profile = cached.dna.postEnding && cached.channelType ? null : channelProfile({ samplePosts: cached.samplePosts, scraped });
      const copy = await saveBrand(
        {
          channel: scraped.username,
          knowledge: "",
          samplePosts: cached.samplePosts,
          dna: profile && !cached.dna.postEnding ? { ...cached.dna, postEnding: profile.postEnding } : cached.dna,
          mode: "channel",
          channelType: cached.channelType ?? profile?.channelType,
          goal: defaultGoalFor(cached.channelType ?? profile?.channelType),
        },
        owner,
        "channel_only",
      );
      return { brand: copy, cached: true, channel: scraped };
    }
  }

  const samplePosts = [...given, ...(scraped?.posts.map((p) => p.text) ?? [])].slice(-30);
  if (!samplePosts.length && !scraped) {
    // No channel and no samples: a business description alone is a fresh brand.
    if (knowledge.length >= MIN_DESCRIPTION) return { brand: await buildFresh(undefined, knowledge, owner, lang, input.beforeLlm), cached: false };
    throw new ScrapeError("knowledge needed", 400, "knowledge_needed");
  }

  await input.beforeLlm?.();
  // How the channel's posts end and what kind of channel it is come from the posts themselves (owner samples
  // included), never from the LLM.
  const profile = channelProfile({ samplePosts, channel: scraped?.username, scraped: given.length ? undefined : scraped });
  const dna = stamped({
    ...(await extractBrandDNA({ samplePosts, knowledge, channelTitle: scraped?.title, channelDescription: scraped?.description, lang })),
    postEnding: profile.postEnding,
  });
  const brand = await saveBrand({ channel: scraped?.username, knowledge, samplePosts, dna, mode: "channel", channelType: profile.channelType, goal: profile.goal }, owner, source);
  return { brand, cached: false, channel: scraped };
}

/** Fresh mode: DNA from the owner's description only; the (optional) channel is just where posts will go. */
async function buildFresh(channelInput: string | undefined, knowledge: string, owner: number | null, lang: ApiLang, beforeLlm?: () => Promise<void>): Promise<StoredBrand> {
  if (knowledge.length < MIN_DESCRIPTION) throw new ScrapeError("knowledge needed", 400, "knowledge_needed");
  let channel: string | undefined;
  if (channelInput?.trim()) {
    channel = parseChannelUsername(channelInput) ?? undefined;
    if (!channel) throw new ScrapeError("bad channel", 400, "channel_invalid");
  }
  await beforeLlm?.();
  const dna = stamped(await extractBrandDNA({ samplePosts: [], knowledge, lang, mode: "fresh" }));
  return saveBrand({ channel, knowledge, samplePosts: [], dna, mode: "fresh" }, owner, "custom");
}
