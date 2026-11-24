/**
 * How a post goes out to a Telegram channel (pure, unit-tested; publish.ts sends it).
 *
 * - No ready picture: one text message, as before.
 * - Picture + text up to 1024 characters (Telegram's caption limit): ONE photo message with
 *   the text as its caption. This is how channel posts normally look, and the common case:
 *   Mercat's posts are a few short paragraphs.
 * - Picture + longer text: the photo first, then the full text right under it as a second
 *   message. Both are plain Bot API sends that Telegram accepts every time. The one-message
 *   alternative (text with a large link preview of the image above it) depends on Telegram
 *   fetching our image URL for a preview at send time; when that fetch is slow or fails the
 *   post silently goes out without its picture, and it shows a link card, not a channel photo.
 *   We never cut the owner's text to make it fit a caption.
 */

export const CAPTION_LIMIT = 1024;
export const MESSAGE_LIMIT = 4096;

export type PlannedMessage = { kind: "photo"; photo: string; caption?: string } | { kind: "text"; text: string };

/** Telegram counts UTF-16 code units, like String.length. */
export function planPostMessages(text: string, imageUrl?: string): PlannedMessage[] {
  const body = text.trim().slice(0, MESSAGE_LIMIT);
  if (!imageUrl) return [{ kind: "text", text: body }];
  if (body.length <= CAPTION_LIMIT) return [{ kind: "photo", photo: imageUrl, caption: body || undefined }];
  return [
    { kind: "photo", photo: imageUrl },
    { kind: "text", text: body },
  ];
}

/**
 * The owner approved what the bot's preview showed. Right before sending, the post's current text and
 * picture must still be exactly that: an edit or a new version in between means "show it again".
 * `expectedImageUrl`: undefined = not checked; null or "" = the preview had no picture.
 * Returns a refusal reason, or null when everything still matches.
 */
export function changedSincePreview(
  now: { text: string; imageUrl?: string },
  expected: { expectedText?: string; expectedImageUrl?: string | null },
): "text" | "image" | null {
  if (expected.expectedText !== undefined && expected.expectedText.trim() !== now.text.trim()) return "text";
  if (expected.expectedImageUrl !== undefined && (expected.expectedImageUrl || undefined) !== (now.imageUrl || undefined)) return "image";
  return null;
}

/** Only pictures we made (fal's CDN) are sent; anything else in posts.image is ignored. */
export function publishableImageUrl(image: { status?: string; url?: string } | undefined | null): string | undefined {
  if (!image || image.status !== "ready" || !image.url) return undefined;
  try {
    const u = new URL(image.url);
    return u.protocol === "https:" && /(^|\.)fal\.media$/i.test(u.hostname) ? image.url : undefined;
  } catch {
    return undefined;
  }
}
