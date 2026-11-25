import "server-only";
import { GrammyError, type Api } from "grammy";
import { findInviteLink, saveInviteLink } from "./repo";

/**
 * An invite link per source (a QR code at the counter, the Instagram bio, an ad post), so joins are counted per
 * source: chat_member updates carry the link a person joined through (bot-handlers.ts stores it with the join).
 * The bot makes the link (createChatInviteLink needs it to be an admin with «Invite users»), named after the source.
 */

export const INVITE_SOURCE_RE = /^[a-z0-9][a-z0-9_-]{0,23}$/;

export type InviteResult = { ok: true; link: string; created: boolean } | { ok: false; reason: "bad_source" | "bot_cannot_invite" | "telegram" };

export async function ensureInviteLink(api: Pick<Api, "createChatInviteLink">, brand: { id: string; channel: string }, source: string): Promise<InviteResult> {
  const src = source.trim().toLowerCase();
  if (!INVITE_SOURCE_RE.test(src)) return { ok: false, reason: "bad_source" };
  const existing = await findInviteLink(brand.id, src);
  if (existing) return { ok: true, link: existing, created: false };
  const channel = brand.channel.replace(/^@/, "");
  const name = `mercat:${src}`.slice(0, 32);
  try {
    const invite = await api.createChatInviteLink(`@${channel}`, { name });
    await saveInviteLink({ link: invite.invite_link, brandId: brand.id, channel, name, source: src });
    return { ok: true, link: invite.invite_link, created: true };
  } catch (err) {
    if (err instanceof GrammyError && (err.error_code === 400 || err.error_code === 403)) return { ok: false, reason: "bot_cannot_invite" };
    console.warn("[autopilot] invite link failed:", err instanceof Error ? err.message : err);
    return { ok: false, reason: "telegram" };
  }
}
