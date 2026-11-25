import "server-only";
import { getSql, isDbConfigured } from "../db";
import { getEnv } from "../env";
import { type Locale, pickLocale } from "../i18n";
import { safeLogEvent } from "../track";
import { accountLabel, connectText, emptyReason, PLATFORM } from "./copy";
import { type ConnectorId, EXPIRED_KEEP_DAYS, familyOf } from "./types";

/**
 * Messages to the owner about a connection (the bot's DM is how an owner who connected in an external browser finds
 * their way back) and the funnel events. Best effort: a blocked bot or a missing token never breaks a flow.
 */

async function ownerLocale(telegramId: number): Promise<Locale> {
  if (!isDbConfigured()) return "uz";
  try {
    const rows = (await getSql()`SELECT language_code FROM app_users WHERE telegram_id = ${telegramId}`) as { language_code: string | null }[];
    return pickLocale(rows[0]?.language_code ?? null);
  } catch {
    return "uz";
  }
}

/** The Mini App opened on the brand (startapp), or the bot chat. */
export function appLink(brandId: string | null): string {
  const bot = getEnv().BOT_USERNAME ?? "mercatai";
  return brandId ? `https://t.me/${bot}?startapp=${encodeURIComponent(`brand_${brandId}`)}` : `https://t.me/${bot}`;
}

async function send(ownerId: number, text: string, button?: { text: string; url: string }): Promise<void> {
  if (!getEnv().TELEGRAM_BOT_TOKEN) return;
  try {
    // Loaded on demand: the bot module is large, and most connector code paths never message anyone.
    const { getBot } = await import("../bot");
    await getBot().api.sendMessage(ownerId, text, {
      link_preview_options: { is_disabled: true },
      ...(button ? { reply_markup: { inline_keyboard: [[{ text: button.text, url: button.url }]] } } : {}),
    });
  } catch (err) {
    console.warn("[connectors] owner message failed:", err instanceof Error ? err.name : "error");
  }
}

export async function notifyConnected(
  ownerId: number,
  provider: ConnectorId,
  account: { name: string; handle?: string },
  brandId: string | null,
  empty?: string,
): Promise<void> {
  const locale = await ownerLocale(ownerId);
  const platform = PLATFORM[provider][locale];
  const text = empty
    ? connectText(locale, "done_empty", { platform, reason: emptyReason(locale, empty) })
    : connectText(locale, "done", { platform, account: accountLabel(account) });
  await send(ownerId, text, { text: connectText(locale, "open_app"), url: appLink(brandId) });
}

export async function notifyExpired(ownerId: number, provider: ConnectorId, account: { name: string; handle?: string }, brandId: string | null): Promise<void> {
  const locale = await ownerLocale(ownerId);
  const text = connectText(locale, "expired", {
    platform: PLATFORM[provider][locale],
    account: accountLabel(account),
    days: String(EXPIRED_KEEP_DAYS[familyOf(provider)]),
  });
  await send(ownerId, text, { text: connectText(locale, "open_app"), url: appLink(brandId) });
}

/** Funnel events: connect_started, connect_done, connect_failed, connect_revoked, connect_expired, connect_sync_failed. */
export async function connectEvent(ownerId: number | null, type: string, props: Record<string, unknown>): Promise<void> {
  await safeLogEvent(ownerId, type, props);
}
