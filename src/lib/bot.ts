import "server-only";
import { after } from "next/server";
import { Bot, InlineKeyboard } from "grammy";
import { isAiConfigured } from "./ai";
import { getEnv, getPublicUrl } from "./env";
import { pickLocale, t } from "./i18n";
import { parseSource, safeLogEvent, track } from "./track";
import { classifyOnboardText, ONBOARD_PROMPT, runOnboarding } from "./uslub/onboard";

/**
 * Runs slow work after the webhook has answered Telegram (no retries on slow
 * AI calls). Outside a Next request scope, falls back to awaiting it.
 */
async function runLater(task: () => Promise<void>): Promise<void> {
  try {
    after(task);
  } catch {
    await task();
  }
}

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
    await ctx.reply(ONBOARD_PROMPT);
  });

  pm.command("help", async (ctx) => {
    await ctx.reply(t(pickLocale(ctx.from?.language_code), "bot.help"));
  });

  // Any other private text: Uslub onboarding (channel link or business description).
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
    const input = classifyOnboardText(text.slice(0, 4000));
    if (!input) {
      await ctx.reply(ONBOARD_PROMPT);
      return;
    }
    if (!isAiConfigured()) {
      await ctx.reply(t(locale, "bot.ai_unavailable"));
      return;
    }
    await ctx.reply(
      "channel" in input
        ? `Ishlayapman… @${input.channel} kanalini o‘qiyapman va brendingiz DNK-sini tuzyapman (taxminan 40 soniya).`
        : "Ishlayapman… brendingiz DNK-sini tuzyapman va postlar yozyapman (taxminan 40 soniya).",
    );
    await ctx.replyWithChatAction("typing").catch(() => undefined);
    const api = ctx.api;
    const chatId = ctx.chat.id;
    await runLater(() => runOnboarding(api, chatId, from.id, input));
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
