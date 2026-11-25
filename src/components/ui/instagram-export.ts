/**
 * «Instagram uchun» in the browser: the caption goes to the clipboard first (inside the owner's tap, where browsers
 * allow it), then the post's picture is read through this site's own proxy (/api/uslub/export/image?postId=, so the
 * canvas may be read back), cropped to 4:5 at 1080×1350 and handed over: the share sheet on a phone, a download
 * elsewhere, the picture in a new tab when nothing else works.
 *
 * Outcomes, each said as it is: done (the 4:5 picture downloaded), shared (the share sheet took it), saved (the
 * picture saved as it is, not cropped: Telegram's own download), copied (the caption only: the owner closed the
 * download), opened (the picture opened to save by hand), noImage, failed (not even the caption).
 */
import { coverCrop } from "./instagram";

export type ExportOutcome = "done" | "shared" | "saved" | "copied" | "opened" | "noImage" | "failed";

const W = 1080;
const H = 1350;

/** The proxy reads one post's own picture (whoever may read that post's drafts), never a URL the page names. */
export const exportImagePath = (postId: string) => `/api/uslub/export/image?postId=${encodeURIComponent(postId)}`;

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older webviews: a hidden textarea and the old copy command.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

async function crop45(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const { sx, sy, sw, sh } = coverCrop(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, W, H);
  bitmap.close?.();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", 0.92));
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const touch = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

/** The caption on the clipboard (also inside a webview that has no clipboard API). */
export const copyCaption = copy;

/** The post's picture cropped to 4:5 (a 1080×1350 JPEG), read through the proxy; null when the proxy or the canvas refuses. */
export async function instagramPicture(o: { postId: string; fileName: string; authorization?: string }): Promise<File | null> {
  try {
    const res = await fetch(exportImagePath(o.postId), { headers: o.authorization ? { authorization: o.authorization } : undefined, cache: "no-store" });
    if (!res.ok) return null;
    const jpg = await crop45(await res.blob());
    return new File([jpg], o.fileName, { type: "image/jpeg" });
  } catch {
    return null;
  }
}

/** Can this browser hand a picture to the share sheet at all (Web Share with files)? */
export const canShareFiles = () => typeof navigator !== "undefined" && typeof navigator.canShare === "function";

/**
 * The share sheet with the picture (and the caption, where the app takes it): "shared" (or closed by the owner), null
 * when this browser cannot share this file or refused (the caller hands the picture over another way).
 */
export async function shareFile(file: File, caption: string): Promise<"shared" | null> {
  if (!canShareFiles() || !navigator.canShare({ files: [file] })) return null;
  try {
    await navigator.share({ files: [file], text: caption });
    return "shared";
  } catch (err) {
    return (err as Error)?.name === "AbortError" ? "shared" : null;
  }
}

export async function exportForInstagram(o: {
  postId?: string | null;
  imageUrl?: string | null;
  caption: string;
  fileName: string;
  /** The owner's credentials for the proxy (the Mini App's initData or the bot's link key). */
  authorization?: string;
  share?: boolean;
  /** How the picture itself opens when nothing else works (Telegram's own opener inside the Mini App). */
  open?: (url: string) => void;
}): Promise<ExportOutcome> {
  const copied = await copy(o.caption);
  if (!o.imageUrl || !o.postId) return copied ? "noImage" : "failed";
  const file = await instagramPicture({ postId: o.postId, fileName: o.fileName, authorization: o.authorization });
  if (file) {
    // Phones: the share sheet goes straight to Instagram with the picture (and the caption where the app takes it).
    if (o.share ?? touch()) {
      const shared = await shareFile(file, o.caption);
      if (shared) return shared;
    }
    download(file, o.fileName);
    return "done";
  }
  // The proxy or the canvas refused: the picture itself, to save by hand.
  if (o.open) o.open(o.imageUrl);
  else window.open(o.imageUrl, "_blank", "noopener");
  return "opened";
}
