import "server-only";
import { readMediaConfig } from "../media/config";
import type { VisualStyle } from "../contract";
import type { StoredBrand } from "../store";
import { analyzeStyle } from "./analyze";
import { fetchChannelPhotos, isTelegramCdn } from "./channel";
import { downloadImage } from "./images";
import { learnVisualStyle, type LearnDeps } from "./learn";
import { getBrandVisualInfo, saveBrandVisual } from "./repo";
import { falUpload } from "./storage";

/** Server wiring for the style learner: real network, Claude and fal storage. */
export function visualDeps(): LearnDeps {
  const falKey = readMediaConfig(process.env).fal?.key;
  return {
    channelPhotos: (channel) => fetchChannelPhotos(channel, { want: 10, pages: 2 }),
    // Telegram's CDN may redirect between its own hosts; an owner's link may not redirect at all.
    download: (url, from) => downloadImage(url, { followRedirects: from === "channel" && isTelegramCdn(url) }),
    rehost: (img, name) => falUpload(img, { key: falKey, name }),
    analyze: analyzeStyle,
  };
}

/** A learned style is reused for this long unless the owner adds photos or asks to refresh. */
export const VISUAL_TTL_MS = 12 * 3600_000;

export async function learnAndSaveVisual(
  brand: StoredBrand,
  opts: { ownerImages?: string[]; refresh?: boolean; deps?: LearnDeps } = {},
): Promise<{ visual: VisualStyle; cached: boolean }> {
  const info = await getBrandVisualInfo(brand.id);
  const fresh = info.visual && Date.now() - Date.parse(info.visual.learnedAt) < VISUAL_TTL_MS;
  if (info.visual && fresh && !opts.refresh && !opts.ownerImages?.length) return { visual: info.visual, cached: true };

  const visual = await learnVisualStyle(
    {
      brand: {
        id: brand.id,
        channel: brand.channel,
        mode: info.mode,
        name: brand.dna.name,
        oneLiner: brand.dna.oneLiner,
        products: brand.dna.products ?? [],
        knowledge: brand.knowledge ?? "",
      },
      ownerImages: opts.ownerImages,
    },
    opts.deps ?? visualDeps(),
  );
  await saveBrandVisual(brand.id, visual);
  return { visual, cached: false };
}
