/**
 * The channel's own posts as facts for the strategist (pure): every collected post, price posts first, each dated, so
 * a 4-month-old price card is a fact and an old promotion is history. Prices older than 90 days are asked to confirm.
 */
import { factPostedAt } from "./plan-checks";
import { features } from "./stats";
import type { ChannelData } from "./types";
import { clip } from "../text";

/** Each post in the facts text is clipped to this many characters (price lists come first, so they survive). */
const POST_KB_CHARS = 900;

/**
 * The channel's own posts as knowledge-base text: ALL collected posts (not forwards, not ads), at any age, each with
 * its date "[YYYY-MM-DD]" so the planner can tell a standing fact (price, address) from an old event. Posts with a
 * price come first, then posts with a contact, address or hours, then the rest newest first: the facts step reads the
 * first 12,000 characters, and a 118-day-old price card must not fall off the end.
 */
export function channelFactsKb(data: ChannelData, now: number): string {
  const own = data.posts.filter((p) => !p.isForward && p.text.trim().length > 40 && Date.parse(p.postedAt) <= now && !features(p).isAd);
  const rank = (p: (typeof own)[number]) => {
    const f = features(p);
    return f.hasPrice ? 0 : f.phone || f.hasAddress || f.hasHours || f.mention ? 1 : 2;
  };
  const ordered = [...own].sort((a, b) => rank(a) - rank(b) || Date.parse(b.postedAt) - Date.parse(a.postedAt));
  return ordered.length
    ? `Kanal postlari (@${data.channel}):\n${ordered.map((p) => `[${p.postedAt.slice(0, 10)}] ${clip(p.text.trim(), POST_KB_CHARS)}`).join("\n\n")}`
    : "";
}

/** What the facts step reads at most (extractFacts clips its input here). */
export const FACTS_INPUT_CHARS = 12_000;
/** The channel's posts always get at least this share of it (or all they need, when shorter). */
export const CHANNEL_FACTS_MIN = 6_000;

/**
 * The facts step's input: the owner's text (answers first, then documents and price lists, as loadKnowledge orders
 * them) and the channel's posts, each with its own budget inside FACTS_INPUT_CHARS. The channel keeps at least
 * CHANNEL_FACTS_MIN characters (its price posts come first), more when the owner's text is short; the owner's text gets
 * the rest, cut from its end, so their answers stay. A 20k-character document never pushes the channel's price card out.
 */
export function factsInput(ownerText: string, channelKb: string, cap = FACTS_INPUT_CHARS, channelMin = CHANNEL_FACTS_MIN): string {
  const owner = ownerText.trim();
  const channel = channelKb.trim();
  if (!channel) return clip(owner, cap);
  if (!owner) return clip(channel, cap);
  const sep = 2;
  const channelBudget = Math.min(channel.length, Math.max(channelMin, cap - sep - owner.length));
  const ownerBudget = Math.max(0, cap - sep - channelBudget);
  return [clip(owner, ownerBudget).trimEnd(), clip(channel, channelBudget).trimEnd()].filter(Boolean).join("\n\n");
}

/** Price facts quoted from channel posts older than 90 days: still used, but the owner is asked to confirm them. */
export function stalePriceLines(facts: { type: string; quote: string; text: string }[], kb: string, now: number): string[] {
  return facts
    .filter((f) => f.type === "price")
    .filter((f) => {
      const at = factPostedAt(f.quote, kb);
      return at != null && now - Date.parse(at) > 90 * 86_400_000;
    })
    .map((f) => f.text || f.quote)
    .slice(0, 5);
}
