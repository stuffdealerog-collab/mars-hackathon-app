/**
 * The hash that binds «Approve the week» to the batch the owner was shown: each post that can go out, in order, with
 * the text and picture it goes out with. Any change (a new Monday batch, a picture that finished, an edit, a slot
 * that passed) gives another hash, and the server then approves nothing (POST /api/uslub/posts/approve-week answers
 * 409 batch_changed; the bot shows the week again).
 *
 * Pure and client-safe: the Studio and the Mini App compute it with `weekHashForClient` from the same posts and
 * selectWeekBatch result they render, and send it as `hash`. The server and the bot's [Approve all] button use the
 * synchronous node:crypto version (week-message.ts weekHash); both give the same 16 characters.
 */
import { type Shown, shownSource } from "../uslub/botpublish-shown";
import type { Script } from "../uslub/contract";
import type { WeekBatch } from "./week";

/** `hash` in POST /api/uslub/posts/approve-week (16 base64url characters). */
export const WEEK_HASH_RE = /^[A-Za-z0-9_-]{16}$/;

type Ready = Pick<WeekBatch, "ready">;

/** The text the week hash is taken of, given the hash of one post's shown text and picture. */
export function weekHashText(batch: Ready, postHash: (postId: string, script: Script) => string): string {
  return batch.ready.map((r) => `${r.postId}:${postHash(r.postId, r.script)}`).join("|") || "empty";
}

/** SHA-256 of the trimmed text, first 16 base64url characters (the same as botpublish-core textHash), via WebCrypto. */
async function sha16(text: string): Promise<string> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text.trim())));
  let bin = "";
  for (const b of digest) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 16);
}

/**
 * The week hash in the browser (or anywhere with WebCrypto). `batch` is selectWeekBatch's answer for the posts on
 * screen, `posts` those posts (with their current text and `image.url`).
 */
export async function weekHashForClient(batch: Ready, posts: readonly (Shown & { id: string })[]): Promise<string> {
  const byId = new Map(posts.map((p) => [p.id, p]));
  const hashes = new Map<string, string>();
  for (const r of batch.ready) {
    const p = byId.get(r.postId);
    hashes.set(`${r.postId}:${r.script}`, p ? await sha16(shownSource(p, r.script)) : "");
  }
  return sha16(weekHashText(batch, (id, script) => hashes.get(`${id}:${script}`) ?? ""));
}
