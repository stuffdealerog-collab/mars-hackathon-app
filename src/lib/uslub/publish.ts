import "server-only";
import { GrammyError } from "grammy";
import { getBot } from "@/lib/bot";
import { getEnv } from "@/lib/env";
import { checkChatRights, checkPublishAccess, type MemberInfo } from "./access";
import type { Script } from "./contract";
import { getBrand, getPost, linkBrandChannel, markPublished } from "./store";

const BOT_USERNAME_FALLBACK = "hackathonproj1_bot";

export function addBotAsAdminLink(): string {
  const bot = getEnv().BOT_USERNAME ?? BOT_USERNAME_FALLBACK;
  return `https://t.me/${bot}?startchannel&admin=post_messages`;
}

export type PublishResult = { ok: boolean; status: number; url?: string; error?: string; addAdminUrl?: string };

/** Normalizes "@name", "name", "https://t.me/name" to "@name". Only public usernames are accepted. */
export function normalizeChat(chat: string): string | null {
  const s = chat.trim().replace(/^https?:\/\/(t|telegram)\.me\//i, "").replace(/^@/, "").split(/[/?#]/)[0];
  return /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(s) ? `@${s}` : null;
}

async function memberInfo(chat: string, userId: number): Promise<MemberInfo> {
  try {
    const m = await getBot().api.getChatMember(chat, userId);
    return { status: m.status, can_post_messages: m.status === "administrator" ? m.can_post_messages : undefined };
  } catch (err) {
    if (err instanceof GrammyError) return null; // chat not found / bot not in the channel
    throw err;
  }
}

/**
 * Publishes a post to the brand's channel. `userId` must come from a trusted
 * source only: the bot's ctx.from or validated Mini App initData.
 * Checks: caller owns the brand, chat is the brand's channel, caller administers
 * the channel, and the bot can post there.
 */
export async function publishPost(args: {
  postId: string;
  script: Script;
  chat: string;
  userId: number | null;
}): Promise<PublishResult> {
  const chat = normalizeChat(args.chat);
  const post = await getPost(args.postId);
  const brand = post ? await getBrand(post.brandId) : null;

  const access = checkPublishAccess({ userId: args.userId, brand, chat });
  if (!access.ok) return { ok: false, status: access.status, error: access.error };
  const userId = args.userId as number;
  const target = chat as string;

  const text = post!.variants[args.script]?.trim();
  if (!text) return { ok: false, status: 400, error: `Postda ${args.script} varianti yo‘q` };

  const addAdminUrl = addBotAsAdminLink();
  try {
    const me = await getBot().api.getMe();
    const [userMember, botMember] = await Promise.all([memberInfo(target, userId), memberInfo(target, me.id)]);
    const rights = checkChatRights(userMember, botMember, addAdminUrl);
    if (!rights.ok) {
      return { ok: false, status: rights.status, error: rights.error, ...(botMember ? {} : { addAdminUrl }) };
    }
    const msg = await getBot().api.sendMessage(target, text.slice(0, 4096), { link_preview_options: { is_disabled: true } });
    if (access.linkChannel) await linkBrandChannel(brand!.id, target);
    const url = `https://t.me/${target.slice(1)}/${msg.message_id}`;
    await markPublished(post!.id, url, target, userId);
    return { ok: true, status: 200, url };
  } catch (err) {
    if (err instanceof GrammyError) {
      return { ok: false, status: 502, error: `Telegram xatosi: ${err.description}`, addAdminUrl };
    }
    console.error("[uslub/publish]", err instanceof Error ? err.message : err);
    return { ok: false, status: 502, error: "Telegramga yuborib bo‘lmadi" };
  }
}
