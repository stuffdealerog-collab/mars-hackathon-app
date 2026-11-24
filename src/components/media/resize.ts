/**
 * Shrinks a photo in the browser before upload: longest side <= maxSide, JPEG, under maxBytes.
 * Phone photos are 3-12 MB; Vercel stops request bodies at 4.5 MB, and the image models do not
 * need more than ~1500 px. Returns a data:image/jpeg;base64 URL.
 */
export async function resizeImageFile(
  file: File,
  opts: { maxSide?: number; maxBytes?: number; quality?: number } = {},
): Promise<string> {
  const maxSide = opts.maxSide ?? 1280;
  const maxBytes = opts.maxBytes ?? 700_000;
  if (!file.type.startsWith("image/")) throw new Error("not an image");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    let side = maxSide;
    let quality = opts.quality ?? 0.85;
    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas is not available");
      ctx.fillStyle = "#fff"; // transparent PNGs get a white background, not black
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bitmap, 0, 0, w, h);
      const url = canvas.toDataURL("image/jpeg", quality);
      if (dataUrlBytes(url) <= maxBytes) return url;
      if (quality > 0.65) quality -= 0.1;
      else side = Math.round(side * 0.8);
    }
    throw new Error("image is too large");
  } finally {
    bitmap.close();
  }
}

/** Decoded size of a base64 data URL. */
export function dataUrlBytes(url: string): number {
  const b64 = url.slice(url.indexOf(",") + 1);
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}
