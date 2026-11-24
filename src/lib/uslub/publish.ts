import "server-only";
import { GrammyError } from "grammy";
import { getBot } from "@/lib/bot";
import { getEnv } from "@/lib/env";
import type { Script } from "./contract";
import { getPost, markPublished } from "./store";

const BOT_USERNAME_FALLBACK = "hackathonproj1_bot";

export function addBotAsAdminLink(): string {
  const bot = getEnv().BOT_USERNAME ?? BOT_USERNAME_FALLBACK;
  return `https://t.me/${bot}?startchannel&admin=post_messages`;
}

export type PublishResult = { ok: boolean; url?: string; error?: string; addAdminUrl?: string };

/** Normalizes "@name", "name", "https://t.me/name" to "@name"; numeric ids pass through. */
export function normalizeChat(chat: string): string | null {
  const s = chat.trim().replace(/^https?:\/\/(t|telegram)\.me\//i, "").replace(/^@/, "").split(/[/?#]/)[0];
  if (/^-100\d{5,}$/.test(s)) return s;
  return /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(s) ? `@${s}` : null;
}

/** Sends an approved post to a channel via the bot, after checking it can post there. */
export async function publishPost(postId: string, script: Script, chatInput: string): Promise<PublishResult> {
  const chat = normalizeChat(chatInput);
  if (!chat) return { ok: false, error: "Kanal nomi noto‘g‘ri. Misol: @kanal_nomi" };
  const post = await getPost(postId);
  if (!post) return { ok: false, error: "Post topilmadi" };
  const text = post.variants[script]?.trim();
  if (!text) return { ok: false, error: `Postda ${script} varianti yo‘q` };

  const bot = getBot();
  const addAdminUrl = addBotAsAdminLink();
  const botName = `@${getEnv().BOT_USERNAME ?? BOT_USERNAME_FALLBACK}`;
  try {
    const me = await bot.api.getMe();
    const member = await bot.api.getChatMember(chat, me.id);
    const canPost =
      member.status === "creator" ||
      (member.status === "administrator" && (member.can_post_messages ?? true));
    if (!canPost) {
      return {
        ok: false,
        error: `${botName} kanalga admin sifatida qo‘shilmagan yoki post yozish huquqi yo‘q. Botni admin qiling: ${addAdminUrl}`,
        addAdminUrl,
      };
    }
    const msg = await bot.api.sendMessage(chat, text.slice(0, 4096), { link_preview_options: { is_disabled: true } });
    const url = chat.startsWith("@") ? `https://t.me/${chat.slice(1)}/${msg.message_id}` : undefined;
    await markPublished(post.id, url ?? null, chat);
    return { ok: true, url };
  } catch (err) {
    if (err instanceof GrammyError) {
      const notFound = /chat not found|member list is inaccessible|not enough rights|bot is not a member|CHAT_ADMIN_REQUIRED/i.test(err.description);
      return {
        ok: false,
        error: notFound
          ? `${botName} ${chat} kanaliga kira olmadi. Botni kanalga admin qiling: ${addAdminUrl}`
          : `Telegram xatosi: ${err.description}`,
        addAdminUrl,
      };
    }
    console.error("[uslub/publish]", err instanceof Error ? err.message : err);
    return { ok: false, error: "Telegramga yuborib bo‘lmadi" };
  }
}
