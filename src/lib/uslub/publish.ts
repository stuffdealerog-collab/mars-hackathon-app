import "server-only";
import { GrammyError, InputFile } from "grammy";
import { getBot } from "@/lib/bot";
import { getEnv } from "@/lib/env";
import { checkChatRights, checkPublishAccess, type MemberInfo } from "./access";
import type { Script } from "./contract";
import { publishImageUrl } from "./media/post-image-service";
import { changedSincePreview, planPostMessages, type PlannedMessage } from "./media/telegram-post";
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

/** sendPhoto by URL; if Telegram cannot fetch the URL itself, we download and upload the file. */
async function sendPhoto(chat: string, photo: string, caption?: string) {
  const opts = caption ? { caption } : {};
  try {
    return await getBot().api.sendPhoto(chat, photo, opts);
  } catch (err) {
    if (!(err instanceof GrammyError) || err.error_code !== 400 || !/url|file|image|photo|webpage/i.test(err.description)) throw err;
    console.warn("[uslub/publish] photo by URL refused, uploading it:", err.description);
    return getBot().api.sendPhoto(chat, new InputFile(new URL(photo)), opts);
  }
}

/**
 * Sends the planned messages in order and returns the first one's id (the post link).
 * If a later message fails, the earlier ones are deleted so the channel never shows half a post.
 */
async function sendPlanned(chat: string, plan: PlannedMessage[]): Promise<number> {
  const sent: number[] = [];
  try {
    for (const m of plan) {
      const msg =
        m.kind === "photo"
          ? await sendPhoto(chat, m.photo, m.caption)
          : await getBot().api.sendMessage(chat, m.text, { link_preview_options: { is_disabled: true } });
      sent.push(msg.message_id);
    }
  } catch (err) {
    for (const id of sent) await getBot().api.deleteMessage(chat, id).catch(() => undefined);
    throw err;
  }
  return sent[0];
}

/**
 * Publishes a post to the brand's channel, with its picture when the picture is ready
 * (see media/telegram-post.ts for how text and picture are combined). `userId` must come from a trusted
 * source only: the bot's ctx.from or validated Mini App initData.
 * Checks: caller owns the brand, chat is the brand's channel, caller administers
 * the channel, and the bot can post there.
 * `expectedText` / `expectedImageUrl` (optional, from the bot's preview): checked right before sending
 * against the post's current text and picture (`posts.image.url`); a change refuses with 409 so the
 * owner sees the new version first. expectedImageUrl null or "" = the preview had no picture.
 */
export async function publishPost(args: {
  postId: string;
  script: Script;
  chat: string;
  userId: number | null;
  expectedText?: string;
  expectedImageUrl?: string | null;
}): Promise<PublishResult> {
  const chat = normalizeChat(args.chat);
  const post = await getPost(args.postId);
  const brand = post ? await getBrand(post.brandId) : null;

  const access = checkPublishAccess({ userId: args.userId, brand, chat });
  if (!access.ok) return { ok: false, status: access.status, error: access.error };
  const userId = args.userId as number;
  const target = chat as string;

  // The same text the bot's preview shows (botpublish-core shownText): the variant, else Uzbek Latin.
  const textOf = (p: { variants: Partial<Record<Script, string>> }) => p.variants[args.script]?.trim() || p.variants.uz_latn?.trim() || "";
  const text = textOf(post!);
  if (!text) return { ok: false, status: 400, error: `Postda ${args.script} varianti yo‘q` };

  const addAdminUrl = addBotAsAdminLink();
  try {
    const me = await getBot().api.getMe();
    const [userMember, botMember] = await Promise.all([memberInfo(target, userId), memberInfo(target, me.id)]);
    const rights = checkChatRights(userMember, botMember, addAdminUrl);
    if (!rights.ok) {
      return { ok: false, status: rights.status, error: rights.error, ...(botMember ? {} : { addAdminUrl }) };
    }
    // Re-read right before sending: the text and picture that go out are the ones checked here.
    const latest = (await getPost(post!.id)) ?? post!;
    const sendText = textOf(latest) || text;
    const imageUrl = await publishImageUrl(post!.id);
    const changed = changedSincePreview({ text: sendText, imageUrl }, args);
    if (changed) {
      return {
        ok: false,
        status: 409,
        error:
          changed === "text"
            ? "Post matni o‘zgargan. Yangi variantni ko‘rib, qayta tasdiqlang. / Текст поста изменился — проверьте и подтвердите снова."
            : "Post rasmi o‘zgargan. Yangi rasmni ko‘rib, qayta tasdiqlang. / Картинка поста изменилась — проверьте и подтвердите снова.",
      };
    }
    const messageId = await sendPlanned(target, planPostMessages(sendText, imageUrl));
    if (access.linkChannel) await linkBrandChannel(brand!.id, target);
    const url = `https://t.me/${target.slice(1)}/${messageId}`;
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
