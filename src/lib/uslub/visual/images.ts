/**
 * Image bytes for the style analysis and re-hosting: owner uploads (data: URLs), owner links
 * (https) and channel photos (Telegram CDN). Pure helpers + one guarded download; no secrets.
 */

export type ImageType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export interface ImageBytes {
  bytes: Uint8Array;
  type: ImageType;
}

/** Claude's per-image limit is 5 MB; owner uploads arrive resized well below it. */
export const MAX_IMAGE_BYTES = 5_000_000;

export class ImageInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageInputError";
  }
}

/** The real type from the first bytes (never trust a header or an extension). */
export function sniffImageType(b: Uint8Array): ImageType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return "image/webp";
  }
  if (b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
  return null;
}

const DATA_URL_RE = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/;

/** Decodes a base64 PNG/JPEG/WebP data URL and checks that the bytes really are an image. */
export function parseDataUrl(url: string): ImageBytes {
  const m = DATA_URL_RE.exec(url);
  if (!m) throw new ImageInputError("not a PNG/JPEG/WebP data URL");
  const bytes = Uint8Array.from(Buffer.from(m[2], "base64"));
  if (bytes.length > MAX_IMAGE_BYTES) throw new ImageInputError("image is too large");
  const type = sniffImageType(bytes);
  if (!type || type === "image/gif") throw new ImageInputError("not a PNG/JPEG/WebP image");
  return { bytes, type };
}

/** Public https only: no localhost, private ranges or link-local hosts (server-side fetch). */
export function isPublicHttps(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (u.protocol !== "https:" || u.username || u.password) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(host)) return false;
  if (host.includes(":")) return false; // IPv6 literals: none of our sources use them
  return /\.[a-z]{2,}$/.test(host);
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Downloads an image with a size cap. Redirects are refused for links an owner typed
 * (they could point inside our network); Telegram's CDN may redirect between its own hosts.
 */
export async function downloadImage(
  url: string,
  opts: { fetch?: FetchLike; timeoutMs?: number; followRedirects?: boolean; maxBytes?: number } = {},
): Promise<ImageBytes> {
  if (!isPublicHttps(url)) throw new ImageInputError("image link must be public https");
  const doFetch: FetchLike = opts.fetch ?? ((u, i) => fetch(u, i));
  const max = opts.maxBytes ?? MAX_IMAGE_BYTES;
  const res = await doFetch(url, {
    redirect: opts.followRedirects ? "follow" : "error",
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new ImageInputError(`image download failed (${res.status})`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > max) throw new ImageInputError("image is too large");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > max) throw new ImageInputError("image is too large");
  const type = sniffImageType(bytes);
  if (!type) throw new ImageInputError("the link is not an image");
  return { bytes, type };
}

/** For Claude's image block. */
export const toBase64 = (img: ImageBytes) => Buffer.from(img.bytes).toString("base64");
