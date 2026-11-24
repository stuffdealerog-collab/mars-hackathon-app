import type { ImageBytes } from "./images";

/**
 * Re-hosting on fal storage (same FAL_KEY as generation, no new account). Telegram CDN links
 * (cdn*.telesco.pe) can expire and owner uploads arrive as data: URLs, so every reference we
 * keep is copied here once and image models read it from fal's CDN.
 *
 *   POST https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3   Authorization: Key $FAL_KEY
 *        { content_type, file_name } -> { upload_url, file_url }
 *   PUT  upload_url  (raw bytes, Content-Type)
 * (Same two calls as @fal-ai/client storage.upload, checked 2026-11-24.)
 */

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const INITIATE = "https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3";

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

/** URLs on fal's own media CDN: already re-hosted, never copied twice. */
export function isFalMedia(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /(^|\.)fal\.media$/i.test(u.hostname);
  } catch {
    return false;
  }
}

const EXT: Record<ImageBytes["type"], string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

export async function falUpload(
  img: ImageBytes,
  opts: { key: string | undefined; name: string; fetch?: FetchLike; timeoutMs?: number },
): Promise<string> {
  if (!opts.key) throw new StorageError("FAL_KEY is not set");
  const doFetch: FetchLike = opts.fetch ?? ((u, i) => fetch(u, i));
  const fileName = `${opts.name.replace(/[^a-z0-9_-]/gi, "-").slice(0, 60)}.${EXT[img.type]}`;
  let init: Response;
  try {
    init = await doFetch(INITIATE, {
      method: "POST",
      headers: { Authorization: `Key ${opts.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content_type: img.type, file_name: fileName }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
      cache: "no-store",
    });
  } catch {
    throw new StorageError("fal storage is unreachable");
  }
  if (!init.ok) throw new StorageError(`fal storage initiate ${init.status}`);
  const data = (await init.json().catch(() => null)) as { upload_url?: unknown; file_url?: unknown } | null;
  const uploadUrl = typeof data?.upload_url === "string" ? data.upload_url : "";
  const fileUrl = typeof data?.file_url === "string" ? data.file_url : "";
  if (!uploadUrl.startsWith("https://") || !isFalMedia(fileUrl)) throw new StorageError("fal storage returned no upload URL");
  let put: Response;
  try {
    put = await doFetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": img.type },
      body: Buffer.from(img.bytes),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
      cache: "no-store",
    });
  } catch {
    throw new StorageError("fal storage upload failed");
  }
  if (!put.ok) throw new StorageError(`fal storage upload ${put.status}`);
  return fileUrl;
}
