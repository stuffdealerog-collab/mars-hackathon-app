/**
 * «Instagram uchun»: a Telegram post as an Instagram post (pure). The picture is cropped to 4:5 (coverCrop) and the
 * caption keeps the post's own words with three changes (plan §1, Instagram export):
 * - Mercat's tracked link (t.me/<bot>?start=src_…) goes, with the line it sat on when nothing else is on it;
 * - a Telegram @handle becomes t.me/<handle> (in Instagram an @ points at an Instagram account);
 * - hashtags only from the channel's own (its DNA, its post endings), 5 at most; none when the channel uses none.
 * Instagram caps a caption at 2 200 characters and 30 hashtags.
 */
import type { BrandDNA } from "@/lib/uslub/contract";

export const CAPTION_MAX = 2200;
const TAGS_MAX = 5;
const TAGS_TOTAL_MAX = 30;

const TRACKED = /(?:https?:\/\/)?t\.me\/\w+\?start=src_[\w-]+/gi;
// A Telegram username (5–32 characters) not inside an e-mail or a link.
const HANDLE = /(^|[^\w@./:])@([A-Za-z][A-Za-z0-9_]{3,31})(?![\w@])/g;
const TAG_RE = /^#[\p{L}\p{N}_]+$/u;

const normTag = (t: string) => {
  const s = t.trim().replace(/^#*/, "#");
  return TAG_RE.test(s) ? s : null;
};

/** The channel's own hashtags (its DNA and the tags its posts end with), "#" added, each once. */
export function ownHashtags(dna?: Pick<BrandDNA, "hashtags" | "postEnding"> | null): string[] {
  const out: string[] = [];
  for (const raw of [...(dna?.hashtags ?? []), ...(dna?.postEnding?.hashtags ?? [])]) {
    const t = normTag(raw);
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}

/** A line left with only a label ("👉 Buyurtma:") once the tracked link is gone. */
function emptyAfterLink(line: string): boolean {
  const rest = line.replace(/[\s:—–\-|•·👉➡️→]+$/u, "").trim();
  if (!/\p{L}/u.test(rest)) return true;
  return /[:—–-]\s*$/.test(line.trim()) && rest.split(/\s+/).length <= 3;
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, Math.max(0, max - 1));
  const at = cut.search(/\s\S*$/);
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

export function instagramCaption(text: string, o: { hashtags?: readonly string[] } = {}): string {
  const lines: string[] = [];
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (TRACKED.test(line)) {
      TRACKED.lastIndex = 0;
      const without = line.replace(TRACKED, "").replace(/\s{2,}/g, " ");
      if (emptyAfterLink(without)) continue;
      lines.push(without.trimEnd());
      continue;
    }
    lines.push(line.replace(HANDLE, (_, pre: string, name: string) => `${pre}t.me/${name}`));
  }
  const body = lines
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const present = new Set((body.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.toLowerCase()));
  const room = Math.max(0, TAGS_TOTAL_MAX - present.size);
  const tags: string[] = [];
  for (const raw of o.hashtags ?? []) {
    const t = normTag(raw);
    if (!t || present.has(t.toLowerCase()) || tags.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
    tags.push(t);
    if (tags.length >= Math.min(TAGS_MAX, room)) break;
  }
  const tail = tags.length ? `\n\n${tags.join(" ")}` : "";
  return `${clip(body, CAPTION_MAX - tail.length)}${tail}`;
}

/** The part of a w×h picture that fills a 4:5 frame (cover, centred). */
export function coverCrop(w: number, h: number, ratio = 4 / 5): { sx: number; sy: number; sw: number; sh: number } {
  if (w <= 0 || h <= 0) return { sx: 0, sy: 0, sw: Math.max(0, w), sh: Math.max(0, h) };
  if (Math.abs(w / h - ratio) < 0.005) return { sx: 0, sy: 0, sw: w, sh: h };
  if (w / h > ratio) {
    const sw = Math.round(h * ratio);
    return { sx: Math.round((w - sw) / 2), sy: 0, sw, sh: h };
  }
  const sh = Math.round(w / ratio);
  return { sx: 0, sy: Math.round((h - sh) / 2), sw: w, sh };
}

/** The picture's own file type, from its address (fal.media names the file): jpg when it does not say. */
export function pictureExt(url: string): "jpg" | "png" | "webp" {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    /* a bare path */
  }
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase();
  return ext === "png" ? "png" : ext === "webp" ? "webp" : "jpg";
}

/** The same file name with another extension ("…-instagram.jpg" -> "…-instagram.png"). */
export const withExt = (fileName: string, ext: string) => `${fileName.replace(/\.[a-z0-9]+$/i, "")}.${ext}`;

/** "non_voy-2026-11-27-instagram.jpg": the channel and the post's day. */
export function instagramFileName(channel: string, day?: string, today = new Date().toISOString().slice(0, 10)): string {
  const slug =
    channel
      .replace(/^@/, "")
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "mercat";
  return `${slug}-${(day ?? today).slice(0, 10)}-instagram.jpg`;
}
