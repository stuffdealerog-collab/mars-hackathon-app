/**
 * The add-the-bot card at the first publish: when a publish fails because the bot is not an admin
 * of the owner's channel, the Studio and the Mini App open one card that names that channel, with
 * one link (ui/tme.ts), and try the publish once more when the owner comes back. Pure.
 */

/** Why a publish did not go out, for the screen: the bot needs adding, a blank to fill, or a plain error. */
export type PublishFailKind = "admin" | "blank" | "bad";

/** `code` as the server sent it; `adminUrl` comes with every bot_not_admin (publish/route.ts). */
export function publishFailKind(r: { code?: string; adminUrl?: string }): PublishFailKind {
  if (r.code === "placeholder_left") return "blank";
  if (r.code === "bot_not_admin" || !!r.adminUrl) return "admin";
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

/** The one automatic retry: only after the owner opened the link and came back, never twice at once. */
export function retryOnReturn(state: AskState | null | undefined): boolean {
  return state === "added";
}
