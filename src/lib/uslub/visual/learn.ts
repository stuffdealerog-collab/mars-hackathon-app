import type { VisualStyle } from "../contract";
import { normalizeAnalysis, type AnalysisImage, type AnalyzeFn, type BrandBrief } from "./analyze";
import { pickCandidates, type ChannelPhoto } from "./channel";
import { ImageInputError, parseDataUrl, type ImageBytes } from "./images";
import { isFalMedia } from "./storage";

/**
 * Learns a brand's picture style: channel photos (newest first) + photos the owner added
 * -> Claude picks the representative ones and describes the style -> the kept ones are
 * re-hosted on fal storage -> VisualStyle (saved on the brand by the route).
 * Every side effect is injected, so the whole flow is unit-tested offline.
 */

export const MAX_OWNER_IMAGES = 5;
export const MAX_REFS = 6; // what an image job gets; more makes generations slower without looking more "theirs"
export const CHANNEL_CANDIDATES = 10;

export interface LearnDeps {
  channelPhotos(channel: string): Promise<ChannelPhoto[]>;
  download(url: string, from: "channel" | "owner"): Promise<ImageBytes>;
  rehost(img: ImageBytes, name: string): Promise<string>;
  analyze: AnalyzeFn;
  now?: () => number;
}

export interface LearnInput {
  brand: BrandBrief & { id: string; channel?: string };
  /** data: URLs (owner uploads) or https links; fal.media links are earlier re-hosted refs and are not copied again. */
  ownerImages?: string[];
}

interface Candidate {
  item: AnalysisImage;
  hostedUrl?: string; // already on our storage
}

export async function learnVisualStyle(input: LearnInput, deps: LearnDeps): Promise<VisualStyle> {
  const owner = input.ownerImages ?? [];
  if (owner.length > MAX_OWNER_IMAGES) throw new ImageInputError(`at most ${MAX_OWNER_IMAGES} photos`);

  const ownerCands: Candidate[] = [];
  for (const [i, url] of owner.entries()) {
    try {
      const img = url.startsWith("data:") ? parseDataUrl(url) : await deps.download(url, "owner");
      ownerCands.push({ item: { img, source: "owner", label: "photo the owner added" }, hostedUrl: isFalMedia(url) ? url : undefined });
    } catch (err) {
      throw new ImageInputError(`photo ${i + 1}: ${err instanceof Error ? err.message : "unreadable"}`);
    }
  }

  const channelCands: Candidate[] = [];
  if (input.brand.mode !== "fresh" && input.brand.channel) {
    const photos = await deps.channelPhotos(input.brand.channel).catch(() => [] as ChannelPhoto[]);
    const picked = pickCandidates(photos, CHANNEL_CANDIDATES);
    const loaded = await Promise.allSettled(picked.map((p) => deps.download(p.url, "channel")));
    loaded.forEach((r, i) => {
      if (r.status !== "fulfilled") return;
      const p = picked[i];
      const when = p.date ? p.date.slice(0, 10) : `post ${p.postId}`;
      channelCands.push({ item: { img: r.value, source: "channel", label: `channel ${p.kind === "photo" ? "photo" : "video cover"}, ${when}` } });
    });
  }

  const all = [...ownerCands, ...channelCands];
  const analysis = await deps.analyze(
    all.map((c) => c.item),
    input.brand,
  );
  const { keep, style } = normalizeAnalysis(analysis, all.length);

  // Owner photos first (they chose them for this), then the channel's, newest first.
  const kept = all.filter((_, i) => keep.has(i)).slice(0, MAX_REFS);
  const hosted = await Promise.allSettled(
    kept.map((c, i) => (c.hostedUrl ? Promise.resolve(c.hostedUrl) : deps.rehost(c.item.img, `${input.brand.id.slice(0, 8)}-ref-${i + 1}`))),
  );
  const refs: VisualStyle["refs"] = [];
  hosted.forEach((r, i) => {
    if (r.status === "fulfilled") refs.push({ url: r.value, source: kept[i].item.source });
  });

  return { refs, ...style, learnedAt: new Date((deps.now ?? Date.now)()).toISOString() };
}
