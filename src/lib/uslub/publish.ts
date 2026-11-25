import "server-only";
import { GrammyError, InputFile } from "grammy";
import { recordPublication } from "@/lib/autopilot/repo";
import { getBot } from "@/lib/bot";
import { getEnv } from "@/lib/env";
import { checkChatRights, checkPublishAccess, type MemberInfo } from "./access";
import type { PostDraft, Script } from "./contract";
import { publishImageUrl } from "./media/post-image-service";
import { changedSincePreview, planPostMessages, type PlannedMessage } from "./media/telegram-post";
import { getBrand, getPost, linkBrandChannel, markPublished } from "./store";

const BOT_USERNAME_FALLBACK = "mercatai";

type PostDraftSlot = PostDraft["slot"];

/**
 * Adds the bot to one of the owner's channels as an admin with the rights it needs: post the approved posts, and
 * make invite links per source (QR code, Instagram bio) so the Monday report can count joins per source. The same
 * rights as the UI's link (src/components/ui/tme.ts BOT_CHANNEL_RIGHTS).
 */
export function addBotAsAdminLink(): string {
  const bot = getEnv().BOT_USERNAME ?? BOT_USERNAME_FALLBACK;
  return `https://t.me/${bot}?startchannel&admin=post_messages+invite_users`;
}

/**
 * `sent` is set on failures only: false = nothing reached the channel (a check refused, Telegram answered with an
 * error, or a step before the send failed), so trying again cannot post twice. A failure without `sent` is a send
 * that may have reached the channel (a network error or timeout while sending): never resend it on its own.
 */
export type PublishResult = { ok: boolean; status: number; url?: string; error?: string; addAdminUrl?: string; sent?: false };

/** Some messages of a post reached the channel and could not all be taken back: never resend on its own. */
class PartialSendError extends Error {}

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
    let left = 0;
    for (const id of sent) await getBot().api.deleteMessage(chat, id).catch(() => void left++);
    if (left) throw new PartialSendError(`${left} message(s) of the post stayed in the channel`);
    throw err;
  }
  return sent[0];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A database write after the post is already in the channel: tried twice, logged, never fails the publish. */
async function afterSend(what: string, write: () => Promise<unknown>): Promise<void> {
  try {
    await write();
  } catch {
    await sleep(400);
    await write().catch((err) => console.error(`[uslub/publish] sent, but ${what} was not stored:`, err instanceof Error ? err.message : err));
  }
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
 * Once Telegram has the post, the answer is always { ok: true, url }: a database write that fails after the send is
 * logged, never reported as a failed send (that would make the owner or the autopilot send it again).
 */
export async function publishPost(args: {
  postId: string;
  script: Script;
  chat: string;
  userId: number | null;
  expectedText?: string;
  expectedImageUrl?: string | null;
  /** Send the text alone even when the post has a picture now (the autopilot: approved before any picture). */
  textOnly?: boolean;
}): Promise<PublishResult> {
  const chat = normalizeChat(args.chat);
  // Before the send nothing can reach the channel: any failure here is safe to try again (`sent: false`).
  let messageId: number;
  let linkChannel = false;
  let postId: string;
  let brandId: string;
  let slot: PostDraftSlot;
  let target: string;
  let userId: number;
  const addAdminUrl = addBotAsAdminLink();
  try {
    const post = await getPost(args.postId);
    const brand = post ? await getBrand(post.brandId) : null;

    const access = checkPublishAccess({ userId: args.userId, brand, chat });
    if (!access.ok) return { ok: false, status: access.status, error: access.error, sent: false };
    userId = args.userId as number;
    target = chat as string;
    postId = post!.id;
    brandId = brand!.id;
    linkChannel = Boolean(access.linkChannel);

    // The same text the bot's preview shows (botpublish-core shownText): the variant, else Uzbek Latin.
    const textOf = (p: { variants: Partial<Record<Script, string>> }) => p.variants[args.script]?.trim() || p.variants.uz_latn?.trim() || "";
    const text = textOf(post!);
    if (!text) return { ok: false, status: 400, error: `Postda ${args.script} varianti yo‘q`, sent: false };

    const me = await getBot().api.getMe();
    const [userMember, botMember] = await Promise.all([memberInfo(target, userId), memberInfo(target, me.id)]);
    const rights = checkChatRights(userMember, botMember, addAdminUrl);
    if (!rights.ok) {
      return { ok: false, status: rights.status, error: rights.error, sent: false, ...(botMember ? {} : { addAdminUrl }) };
    }
    // Re-read right before sending: the text and picture that go out are the ones checked here.
    const latest = (await getPost(post!.id)) ?? post!;
    slot = latest.slot ?? post!.slot;
    const sendText = textOf(latest) || text;
    // `textOnly`: the owner approved this post without a picture; one drawn later is not sent.
    const imageUrl = args.textOnly ? undefined : await publishImageUrl(post!.id);
    const changed = changedSincePreview({ text: sendText, imageUrl }, args);
    if (changed) {
      return {
        ok: false,
        status: 409,
        sent: false,
        error:
          changed === "text"
            ? "Post matni o‘zgargan. Yangi variantni ko‘rib, qayta tasdiqlang. / Текст поста изменился — проверьте и подтвердите снова."
            : "Post rasmi o‘zgargan. Yangi rasmni ko‘rib, qayta tasdiqlang. / Картинка поста изменилась — проверьте и подтвердите снова.",
      };
    }
    try {
      messageId = await sendPlanned(target, planPostMessages(sendText, imageUrl));
    } catch (err) {
      if (err instanceof GrammyError) {
        // Telegram answered with an error: this post is not in the channel (sendPlanned took back any earlier part).
        return { ok: false, status: 502, error: `Telegram xatosi: ${err.description}`, addAdminUrl, sent: false };
      }
      // A network error or timeout while sending, or part of the post left behind: it may be in the channel.
      console.error("[uslub/publish] send interrupted:", err instanceof Error ? err.message : err);
      return { ok: false, status: 502, error: "Telegramga yuborib bo‘lmadi" };
    }
  } catch (err) {
    if (err instanceof GrammyError) {
      return { ok: false, status: 502, error: `Telegram xatosi: ${err.description}`, addAdminUrl, sent: false };
    }
    console.error("[uslub/publish]", err instanceof Error ? err.message : err);
    return { ok: false, status: 502, error: "Telegramga yuborib bo‘lmadi", sent: false };
  }

  // The post is in the channel from here on: whatever happens to the bookkeeping below, the answer is "published",
  // so nobody (the owner's next tap, the autopilot's retry) sends it a second time.
  const url = `https://t.me/${target.slice(1)}/${messageId}`;
  if (linkChannel) await afterSend("the channel link", () => linkBrandChannel(brandId, target));
  await afterSend("the published state", () => markPublished(postId, url, target, userId));
  // Message id, chat, time and plan item on the post, and a metrics row for its 24 h / 72 h views.
  await afterSend("the publication details", () => recordPublication({ postId, brandId, chat: target, messageId, slot }));
  return { ok: true, status: 200, url };
}
