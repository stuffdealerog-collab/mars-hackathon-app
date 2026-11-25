/**
 * Telegram links the UI opens. Pure: the browser, the Mini App and tests share it.
 *
 * Add a bot to a channel (https://core.telegram.org/api/links#bot-links):
 *
 *   t.me/<bot_username>?startchannel&admin=<permissions>
 *
 * Telegram shows the channels where the user can add admins, with the rights in `admin`
 * already switched on. `admin` is required for channel links: chatAdminRights flag names joined
 * with "+". A bot that is already an admin there keeps its rights, plus these.
 */

/** chatAdminRights flags a channel link can ask for (the subset Mercat could ever need). */
export type ChannelRight = "post_messages" | "edit_messages" | "delete_messages" | "invite_users" | "post_stories" | "edit_stories" | "delete_stories";

/**
 * «Post messages» to publish, «Invite users» for the per-source invite links that count who came
 * from which post. The server's link (addBotAsAdminLink in lib/uslub/publish.ts) must ask for the
 * same pair; it still asks for post_messages alone until the AP stream adds invite_users (plan §1,
 * "Admin rights").
 */
export const BOT_CHANNEL_RIGHTS: readonly ChannelRight[] = ["post_messages", "invite_users"];

/** The add-the-bot-to-a-channel link; `bot` with or without the @. */
export function addBotToChannelUrl(bot: string, rights: readonly ChannelRight[] = BOT_CHANNEL_RIGHTS): string {
  const name = bot.trim().replace(/^@/, "");
  const asked = rights.length ? [...new Set(rights)] : BOT_CHANNEL_RIGHTS;
  return `https://t.me/${name}?startchannel&admin=${asked.join("+")}`;
}
