/**
 * The add-the-bot card at the first publish: when a publish fails because the bot is not an admin
 * of the owner's channel, the Studio and the Mini App open one card that names that channel, with
 * one link (ui/tme.ts), and try the publish once more when the owner comes back. Pure.
 */
import type { Script } from "@/lib/uslub/contract";

/** Why a publish did not go out, for the screen: the bot needs adding, a blank to fill, or a plain error. */
export type PublishFailKind = "admin" | "blank" | "bad";

/**
 * `code` as the server sent it. Only bot_not_admin opens the card: the server also sends `adminUrl`
 * with Telegram errors that have nothing to do with rights (an outage, a rate limit, a mistyped
 * channel), and those are said on the post. A reply with no code and a link is an older server's
 * bot_not_admin.
 */
export function publishFailKind(r: { code?: string; adminUrl?: string }): PublishFailKind {
  if (r.code === "placeholder_left") return "blank";
  if (r.code === "bot_not_admin" || (!r.code && !!r.adminUrl)) return "admin";
  return "bad";
}

/** The channel the card shows: the brand's name and @handle, or nothing (the card says «your channel»). */
export type AskChannel = { name: string; handle?: string };

export function askChannel(o: { name?: string | null; channel?: string | null; typed?: string | null }): AskChannel | null {
  const raw = (o.channel || (o.typed ? `@${o.typed.replace(/^@/, "")}` : "") || "").trim();
  const handle = raw ? `@${raw.replace(/^@/, "").replace(/^https?:\/\/t\.me\//i, "").replace(/^t\.me\//i, "")}` : undefined;
  const name = (o.name ?? "").trim() || handle;
  if (!name) return null;
  return handle && handle !== name ? { name, handle } : { name };
}

/**
 * Where the card stands: "ask" (just opened), "added" (the link was opened; publish again on the
 * way back), "checking" (that publish is out), "notYet" (it came back: the bot is still not an admin).
 */
export type AskState = "ask" | "added" | "checking" | "notYet";

/**
 * The card as the store keeps it: which post and script, `chat` (the channel that publish went to,
 * so the retry goes to the same one, also when the owner typed it), the channel shown, the state.
 */
export type AdminAsk = { postId: string; script: Script; chat: string; channel: AskChannel | null; state: AskState };

/** The one automatic retry: only after the owner opened the link and came back, never twice at once. */
export function retryOnReturn(state: AskState | null | undefined): boolean {
  return state === "added";
}

/**
 * The card after a publish of `postId` came back. `open` (the bot is not an admin) opens it for
 * that post: "notYet" when it was this card's own retry, "ask" otherwise. Null (published, or any
 * other failure, said in the post's note) closes this post's card and leaves another post's alone.
 */
export function nextAsk(prev: AdminAsk | null, postId: string, open: Omit<AdminAsk, "postId" | "state"> | null): AdminAsk | null {
  if (open) return { postId, ...open, state: prev?.postId === postId && prev.state === "checking" ? "notYet" : "ask" };
  return prev?.postId === postId ? null : prev;
}

/**
 * After a retry settles: a publish that returned before it reached the server (no channel, an old
 * link key, an approval undone) never touched the card, and must not leave it on "checking", where
 * it cannot be closed. It closes; the post's note says why.
 */
export function settleRetry(now: AdminAsk | null, postId: string): AdminAsk | null {
  return now?.postId === postId && now.state === "checking" ? null : now;
}

/** What a retry needs from the store. `publish` updates the card itself through nextAsk. */
export type AskStore<R> = {
  ask: () => AdminAsk | null;
  setAsk: (a: AdminAsk | null) => void;
  busy: (postId: string) => boolean;
  publish: (postId: string, script: Script, chat: string) => Promise<R>;
};

/** One retry from the card: the same post, script and channel as the publish that opened it. */
export async function retryAsk<R>(s: AskStore<R>): Promise<R | null> {
  const a = s.ask();
  if (!a || a.state === "checking" || s.busy(a.postId)) return null;
  s.setAsk({ ...a, state: "checking" });
  try {
    return await s.publish(a.postId, a.script, a.chat);
  } finally {
    const now = s.ask();
    const next = settleRetry(now, a.postId);
    if (next !== now) s.setAsk(next);
  }
}
