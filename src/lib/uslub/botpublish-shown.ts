/**
 * What the owner sees of a post before it goes out: the text of a variant and its picture. Pure and client-safe
 * (no node:crypto), so the Studio and the Mini App can bind a button to exactly what they show
 * (src/lib/autopilot/week-hash.ts). botpublish-core.ts hashes the same string for the bot's buttons.
 */
import type { Script } from "./contract";

export type Shown = { variants: Partial<Record<Script, string>> & { uz_latn: string }; image?: { url?: string }; video?: { fileId?: string } };

/** The text of a variant as the bot shows and publishes it. */
export const shownText = (post: Shown, script: Script) => post.variants[script]?.trim() || post.variants.uz_latn;

/**
 * The post's visible picture (policy shared with the images session): `image.url`, and only when publishPost would
 * send it — https on *.fal.media, the same filter as publishableImageUrl in media/telegram-post.ts. While a new
 * variant renders or fails, images keeps `url` = the last ready picture. Anything else is shown and published as
 * text only, so preview, hash and channel always agree (no 409 loop).
 */
export function shownPhoto(post: Shown): string | null {
  // A post with the owner's video goes out as that video: its picture is neither shown nor sent.
  if (shownVideo(post)) return null;
  const url = post.image?.url;
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /(^|\.)fal\.media$/i.test(u.hostname) ? url : null;
  } catch {
    return null;
  }
}

/** The owner's video (Telegram file_id) that goes out with the post, or null. */
export function shownVideo(post: Shown): string | null {
  const id = post.video?.fileId;
  return typeof id === "string" && id.trim() ? id : null;
}

/**
 * The string the "what the owner saw" hash is taken of: the text and the picture, and the video's file id when the
 * post has one (a post without a video hashes exactly as before, so queued posts keep their hashes).
 */
export function shownSource(post: Shown, script: Script): string {
  const video = shownVideo(post);
  return `${shownText(post, script)}\n--picture--\n${shownPhoto(post) ?? ""}${video ? `\n--video--\n${video}` : ""}`;
}
