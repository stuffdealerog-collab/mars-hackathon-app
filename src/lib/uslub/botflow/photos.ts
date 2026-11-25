import "server-only";
import type { Api } from "grammy";
import { getEnv } from "@/lib/env";
import type { VisualStyle } from "../contract";
import { MAX_IMAGE_BYTES, sniffImageType } from "../visual/images";
import { MAX_OWNER_IMAGES } from "../visual/learn";
import { actorKey, learnAndSaveVisual } from "../visual/service";
import type { StoredBrand } from "../store";

/**
 * The owner's photos from the chat become style references for the designer through the Studio's own path
 * (visual/service.ts learnAndSaveVisual, the same call POST /api/uslub/visual makes): the photos are read from
 * Telegram and passed as data: URLs, next to the owner photos the brand already has.
 * The Telegram file URL carries the bot token: it is built here, used once, and never logged or stored.
 */

const DOWNLOAD_MS = 10_000;

/** A photo the owner sent, as a data: URL; null when it cannot be read (too big, not an image, Telegram failed). */
export async function telegramPhoto(api: Api, fileId: string): Promise<string | null> {
  const token = getEnv().TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const file = await api.getFile(fileId);
    if (!file.file_path || (file.file_size ?? 0) > MAX_IMAGE_BYTES) return null;
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`, { signal: AbortSignal.timeout(DOWNLOAD_MS), redirect: "error" });
    if (!res.ok) return null;
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_IMAGE_BYTES) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return null;
    const type = sniffImageType(bytes);
    if (!type) return null;
    return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    // Never the error itself: a fetch error message may carry the URL, and the URL carries the token.
    console.warn("[botflow/photos] a photo could not be read from Telegram");
    return null;
  }
}

/**
 * The owner images to learn from: the new photos first, then the owner photos the brand already has (their re-hosted
 * links), at most MAX_OWNER_IMAGES in all.
 */
export function ownerImagesWith(visual: VisualStyle | undefined, fresh: string[]): string[] {
  const earlier = (visual?.refs ?? []).filter((r) => r.source === "owner").map((r) => r.url);
  return [...fresh, ...earlier.filter((u) => !fresh.includes(u))].slice(0, MAX_OWNER_IMAGES);
}

/** The brand's picture style learned again with these photos; the saved style. Errors are the service's own. */
export async function learnFromOwnerPhotos(brand: StoredBrand, images: string[], telegramId: number): Promise<VisualStyle> {
  const { visual } = await learnAndSaveVisual(brand, { ownerImages: ownerImagesWith(brand.visual, images), actor: actorKey(telegramId, "") });
  return visual;
}
