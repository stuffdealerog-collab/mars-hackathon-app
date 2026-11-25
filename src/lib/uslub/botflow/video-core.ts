/**
 * The bot's video wait, pure parts (unit-tested): the deep link, the buttons' callback data and the limits a video
 * must meet. Flow: botflow/video.ts.
 *
 * The owner opens t.me/<bot>?start=video_<postId> from the Video tab; the bot waits for that user's next video
 * (a video message, or a video sent as a file) for 24 hours, stores Telegram's file_id on the post and confirms with
 * [Approve] and [Open in the app].
 */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** The start payload of the Video tab's link (Telegram payloads: A-Z a-z 0-9 _ -, ≤ 64 characters; this is 42). */
export const videoStartPayload = (postId: string) => `video_${postId.toLowerCase()}`;

export function parseVideoPayload(payload: string): string | null {
  const m = new RegExp(`^video_(${UUID})$`, "i").exec(payload.trim());
  return m ? m[1].toLowerCase() : null;
}

/** [Approve] under a received video, bound to the text and video the owner saw: "vda:<postId>:<hash16>" (57 bytes). */
export const videoApproveData = (postId: string, hash: string) => `vda:${postId}:${hash}`;
export const VIDEO_APPROVE_RE = new RegExp(`^vda:(${UUID}):([A-Za-z0-9_-]{16})$`);

/** [Cancel] while the bot waits: "vdx:<postId>". */
export const videoCancelData = (postId: string) => `vdx:${postId}`;
export const VIDEO_CANCEL_RE = new RegExp(`^vdx:(${UUID})$`);

/** [Send the video] from the publish flow (a video post without its video): "vdw:<postId>" (botpublish.ts). */
export const VIDEO_WAIT_RE = new RegExp(`^vdw:(${UUID})$`);

/** Longest video the bot takes (seconds): Reels-length posts, with room. */
export const MAX_VIDEO_SECONDS = 180;
export const MIN_VIDEO_SECONDS = 2;
/** Largest file (bytes). Mercat never downloads it (the file_id goes to the channel as is); this keeps posts sane. */
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

/** One video from the owner's message, as the dispatcher hands it over (flows.ts VideoInput). */
export interface IncomingVideo {
  fileId: string;
  fileUniqueId?: string;
  duration?: number;
  width?: number;
  height?: number;
  size?: number;
  mime?: string;
  thumbFileId?: string;
  as?: "video" | "document";
}

export type VideoProblem = "too_long" | "too_short" | "too_big" | "not_video";

/** Why this video cannot go on the post, or null. A file must be a video file; an unknown length or size passes. */
export function videoProblem(v: IncomingVideo): VideoProblem | null {
  if (!v.fileId?.trim()) return "not_video";
  if (v.as === "document" && !/^video\//i.test(v.mime ?? "")) return "not_video";
  if (v.size != null && v.size > MAX_VIDEO_BYTES) return "too_big";
  if (v.duration != null && v.duration > MAX_VIDEO_SECONDS) return "too_long";
  if (v.duration != null && v.duration > 0 && v.duration < MIN_VIDEO_SECONDS) return "too_short";
  return null;
}

/** A channel link or a business description while the bot waits for a video: a new run, not an answer. */
export const isNewRunText = (text: string) => {
  const s = text.trim();
  return /^@[A-Za-z]\w{3,31}$/.test(s) || /(?:^|\s|\/\/)(?:t|telegram)\.me\//i.test(s) || s.length >= 40;
};
