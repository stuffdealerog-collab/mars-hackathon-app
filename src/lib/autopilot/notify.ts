import "server-only";
import { GrammyError, InlineKeyboard, type Api } from "grammy";
import { type Locale, pickLocale } from "../i18n";
import { safeLogEvent } from "../track";
import { say, whenLabel } from "./copy";
import type { OwnerEvent } from "./publish-due";
import { markNotified, pauseAutopilot, type QueueRow, userLanguage } from "./repo";
import { LATE_LIMIT_HOURS } from "./time";

/**
 * Messages the autopilot sends an owner nobody asked it to (a post went out, a post could not go out, the Monday
 * report). In the owner's Telegram language (app_users.language_code). An owner who blocked the bot is not
 * messaged again: their autopilot is paused until they turn it on again.
 */

export type SendResult = "sent" | "blocked" | "failed";

/** Telegram's answers for a chat we can no longer write to. */
export const isUnreachable = (err: unknown) =>
  err instanceof GrammyError && (err.error_code === 403 || (err.error_code === 400 && /chat not found|user is deactivated/i.test(err.description)));

export async function ownerLocale(telegramId: number): Promise<Locale> {
  return pickLocale(await userLanguage(telegramId));
}

export async function sendToOwner(
  api: Pick<Api, "sendMessage">,
  ownerId: number,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<SendResult> {
  try {
    await api.sendMessage(ownerId, text, { link_preview_options: { is_disabled: true }, ...(keyboard ? { reply_markup: keyboard } : {}) });
    return "sent";
  } catch (err) {
    if (isUnreachable(err)) return "blocked";
    console.warn("[autopilot] owner message failed:", err instanceof Error ? err.message : err);
    return "failed";
  }
}

/** The queue's message for one post (publish-due OwnerEvent), with its buttons. */
export function queueMessage(locale: Locale, row: Pick<QueueRow, "chat" | "dueAt">, event: OwnerEvent, addAdminUrl: string): { text: string; keyboard?: InlineKeyboard } {
  const vars = { when: whenLabel(row.dueAt, locale), channel: row.chat, hours: LATE_LIMIT_HOURS };
  switch (event.kind) {
    case "post_out":
      return { text: say(locale, "post_out", vars), keyboard: new InlineKeyboard().url(say(locale, "open_post"), event.url) };
    case "bot_not_admin":
      return { text: say(locale, "bot_not_admin", vars), keyboard: new InlineKeyboard().url(addAdminLabel(locale), addAdminUrl) };
    case "blank":
      return { text: say(locale, "blank", { ...vars, tokens: event.tokens.slice(0, 5).map((t) => `«${t}»`).join(", ") }) };
    case "past_date":
      return { text: say(locale, "past_date", { ...vars, dates: event.dates.slice(0, 5).map((d) => `«${d}»`).join(", ") }) };
    default:
      return { text: say(locale, event.kind, vars) };
  }
}

const addAdminLabel = (locale: Locale) => (locale === "ru" ? "➕ Добавить бота в канал" : locale === "en" ? "➕ Add the bot to the channel" : "➕ Botni kanalga qo‘shish");

/** Sends the queue's message for a post; a blocked owner pauses every brand of theirs in this row. */
export async function notifyQueueEvent(api: Pick<Api, "sendMessage">, row: QueueRow, event: OwnerEvent, addAdminUrl: string): Promise<SendResult> {
  const locale = await ownerLocale(row.ownerTelegramId);
  const { text, keyboard } = queueMessage(locale, row, event, addAdminUrl);
  const r = await sendToOwner(api, row.ownerTelegramId, text, keyboard);
  if (r === "sent") await markNotified(row.postId).catch(() => undefined);
  if (r === "blocked") await pauseAutopilot(row.brandId).catch(() => undefined);
  await safeLogEvent(row.ownerTelegramId, event.kind === "post_out" ? "auto_published" : "auto_failed", {
    brand_id: row.brandId,
    post_id: row.postId,
    ...(event.kind === "post_out" ? {} : { reason: event.kind }),
    delivered: r,
  });
  return r;
}
