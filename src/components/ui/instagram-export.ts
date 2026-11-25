/**
 * «Instagram uchun» in the browser: the caption goes to the clipboard first (inside the owner's tap, where browsers
 * allow it), then the picture is read through this site's own proxy (/api/uslub/export/image, so the canvas may be
 * read back), cropped to 4:5 at 1080×1350 and handed over: the share sheet on a phone, a download elsewhere, the
 * picture in a new tab when nothing else works.
 */
import { coverCrop } from "./instagram";

export type ExportOutcome = "done" | "shared" | "opened" | "noImage" | "failed";

const W = 1080;
const H = 1350;

export const exportImagePath = (url: string) => `/api/uslub/export/image?url=${encodeURIComponent(url)}`;

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

export async function exportForInstagram(o: {
  imageUrl?: string | null;
  caption: string;
  fileName: string;
  share?: boolean;
  /** How the picture itself opens when nothing else works (Telegram's own opener inside the Mini App). */
  open?: (url: string) => void;
}): Promise<ExportOutcome> {
  const copied = await copy(o.caption);
  if (!o.imageUrl) return copied ? "noImage" : "failed";
  try {
    const res = await fetch(exportImagePath(o.imageUrl));
    if (!res.ok) throw new Error(String(res.status));
    const jpg = await crop45(await res.blob());
    const file = new File([jpg], o.fileName, { type: "image/jpeg" });
    // Phones: the share sheet goes straight to Instagram with the picture (and the caption where the app takes it).
    if ((o.share ?? touch()) && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: o.caption });
        return "shared";
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return "shared";
      }
    }
    download(jpg, o.fileName);
    return "done";
  } catch {
    // The proxy or the canvas refused: the picture itself, to save by hand.
    if (o.open) o.open(o.imageUrl);
    else window.open(o.imageUrl, "_blank", "noopener");
    return "opened";
  }
}
