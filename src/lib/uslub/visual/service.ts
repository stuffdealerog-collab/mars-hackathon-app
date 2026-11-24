import "server-only";
import { createHash } from "node:crypto";
import { readMediaConfig } from "../media/config";
import type { VisualStyle } from "../contract";
import type { StoredBrand } from "../store";
import { analyzeStyle } from "./analyze";
import { fetchChannelPhotos, isTelegramCdn } from "./channel";
import { downloadImage, ImageInputError } from "./images";
import { learnVisualStyle, type LearnDeps } from "./learn";
import { getBrandVisualInfo, releaseVisualAnalysis, reserveVisualAnalysis, saveBrandVisual } from "./repo";
import { falUpload } from "./storage";

export class VisualLimitError extends Error {
  constructor() {
    super("style analysis limit reached");
    this.name = "VisualLimitError";
  }
}

/** Another analysis of this brand is running and did not finish in time. */
export class VisualBusyError extends Error {
  constructor() {
    super("style analysis already running");
    this.name = "VisualBusyError";
  }
}

/**
 * Server wiring for the style learner: real network, Claude and fal storage. Timeouts are sized so
 * the whole chain (two preview pages, downloads, Claude, re-hosting) stays well inside maxDuration.
 */
export function visualDeps(): LearnDeps {
  const falKey = readMediaConfig(process.env).fal?.key;
  return {
    channelPhotos: (channel) => fetchChannelPhotos(channel, { want: 10, pages: 2, timeoutMs: 8_000 }),
    // Telegram's CDN may redirect between its own hosts; a re-hosted fal ref never needs to.
    download: (url, from) => downloadImage(url, { followRedirects: from === "channel" && isTelegramCdn(url), timeoutMs: 10_000 }),
    rehost: (img, name) => falUpload(img, { key: falKey, name, timeoutMs: 12_000 }),
    analyze: analyzeStyle,
  };
}

/** A learned style is reused for this long unless the owner adds photos or asks to refresh. */
export const VISUAL_TTL_MS = 12 * 3600_000;

/** Who asked, for the per-caller cap: the Telegram user, else a hash of the IP (no raw IPs stored). */
export function actorKey(telegramId: number | null, ip: string): string {
  if (telegramId != null) return `tg:${telegramId}`;
  return `ip:${createHash("sha256").update(ip).digest("hex").slice(0, 16)}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits for a style another request is learning right now (first loads start several at once). */
async function waitForVisual(brandId: string, maxMs = 50_000): Promise<VisualStyle | undefined> {
  const until = Date.now() + maxMs;
  while (Date.now() < until) {
    await sleep(2_500);
    const { visual } = await getBrandVisualInfo(brandId);
    if (visual) return visual;
  }
  return undefined;
}

export async function learnAndSaveVisual(
  brand: StoredBrand,
  opts: { ownerImages?: string[]; refresh?: boolean; actor: string; deps?: LearnDeps },
): Promise<{ visual: VisualStyle; cached: boolean }> {
  const info = await getBrandVisualInfo(brand.id);
  const ownerChange = opts.ownerImages !== undefined; // an explicit owner list, even an empty one
  const fresh = info.visual && Date.now() - Date.parse(info.visual.learnedAt) < VISUAL_TTL_MS;
  if (info.visual && fresh && !opts.refresh && !ownerChange) return { visual: info.visual, cached: true };

  // Every analysis is a paid Claude vision call: reserve a slot first (fails closed), then check caps.
  const config = readMediaConfig(process.env);
  const slot = await reserveVisualAnalysis(brand.id, opts.actor, opts.ownerImages?.length ?? 0);
  const over =
    slot.totalPos > config.visualDailyLimit || slot.brandPos > config.visualBrandDailyLimit || slot.actorPos > config.visualActorDailyLimit;
  if (over) {
    await releaseVisualAnalysis(slot).catch(() => undefined);
    // Never drop the owner's new photos silently; an automatic re-learn may keep the style it has.
    if (info.visual && !ownerChange) return { visual: info.visual, cached: true };
    throw new VisualLimitError();
  }
  if (slot.earlierInFlight && !ownerChange) {
    // Seven pictures and the style panel ask at once on a first load: one analysis, the rest wait for it.
    await releaseVisualAnalysis(slot).catch(() => undefined);
    const learned = await waitForVisual(brand.id);
    if (learned) return { visual: learned, cached: true };
    if (info.visual) return { visual: info.visual, cached: true };
    throw new VisualBusyError();
  }

  let visual: VisualStyle;
  try {
    visual = await learnVisualStyle(
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
  } catch (err) {
    // An unreadable owner photo fails before Claude is called: give the slot back.
    if (err instanceof ImageInputError) await releaseVisualAnalysis(slot).catch(() => undefined);
    throw err;
  }
  await saveBrandVisual(brand.id, visual);
  return { visual, cached: false };
}
