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
