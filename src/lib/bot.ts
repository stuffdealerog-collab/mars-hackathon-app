import "server-only";
import { Bot, InlineKeyboard } from "grammy";
import { askClaude, isAiConfigured } from "./ai";
import { getEnv, getPublicUrl } from "./env";
import { pickLocale, t } from "./i18n";
import { parseSource, safeLogEvent, track } from "./track";

/**
 * The bot is built lazily on the first webhook request, so `next build`
 * works without TELEGRAM_BOT_TOKEN.
 */
let bot: Bot | null = null;

export function getBot(): Bot {
  if (bot) return bot;
  const token = getEnv().TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  const instance = new Bot(token);
  registerHandlers(instance);
  bot = instance;
  return instance;
}

function registerHandlers(b: Bot) {
  const pm = b.chatType("private");

  // /start <payload> — deep links like https://t.me/<bot>?start=src_booth1
  pm.command("start", async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    const locale = pickLocale(from.language_code);
    const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
    await track(from, "start", { payload: payload.slice(0, 64) || null }, { source: parseSource(payload) });

    const name = from.first_name || "👋";
    const appUrl = getPublicUrl();
    if (appUrl?.startsWith("https://")) {
      await ctx.reply(t(locale, "bot.greeting", { name }), {
        reply_markup: new InlineKeyboard().webApp(t(locale, "bot.open_app"), `${appUrl}/tg`),
      });
    } else {
      await ctx.reply(t(locale, "bot.greeting_no_app", { name }));
    }
  });

  pm.command("help", async (ctx) => {
    await ctx.reply(t(pickLocale(ctx.from?.language_code), "bot.help"));
  });

  // Any other private text: answer with Claude (or a friendly fallback).
  pm.on("message:text", async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    const locale = pickLocale(from.language_code);
    const text = ctx.message.text;
    if (text.startsWith("/")) {
      await ctx.reply(t(locale, "bot.help"));
      return;
    }
    await track(from, "message", { length: text.length });
    if (!isAiConfigured()) {
      await ctx.reply(t(locale, "bot.ai_unavailable"));
      return;
    }
    await ctx.replyWithChatAction("typing").catch(() => undefined);
    const answer = await askClaude(text.slice(0, 2000), { fallbackText: t(locale, "bot.error") });
    await ctx.reply(answer.text.slice(0, 4000));
    if (answer.ok) await safeLogEvent(from.id, "ai_reply");
  });

  // Telegram Business: log connections (the bot was added to a business account).
  b.on("business_connection", async (ctx) => {
    const connection = ctx.businessConnection;
    await track(connection.user, "business_connection", { is_enabled: connection.is_enabled });
  });

  b.on("business_message", async (ctx) => {
    await safeLogEvent(ctx.businessMessage.from?.id ?? null, "business_message");
  });
}
