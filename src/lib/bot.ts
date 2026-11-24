import "server-only";
import { after } from "next/server";
import { Bot, InlineKeyboard } from "grammy";
import { isAiConfigured } from "./ai";
import { getEnv, getPublicUrl } from "./env";
import { pickLocale, t } from "./i18n";
import { parseSource, safeLogEvent, track } from "./track";
import { learnFor } from "./uslub/brain/learn-run";
import { latestPlanForOwner, ORDER_BUCKETS, planByTag, recordOutcome } from "./uslub/brain/memory";
import { scrapeChannelData } from "./uslub/brain/scrape";
import {
  classifyOnboardText,
  gateMessage,
  ONBOARD_PROMPT,
  onboardGate,
  publishFromBot,
  runOnboarding,
} from "./uslub/onboard";

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

const PLAN_LINK_RE = /^src_([a-z0-9]{6})_(\d{1,2})$/;

const escapeHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Customer tapped a plan post's link: ask before passing their contact to the business owner. */
async function customerFromPlanLink(ctx: { reply: (text: string, other?: object) => Promise<unknown> }, tag: string, slot: number) {
  const plan = await planByTag(tag);
  if (!plan?.ownerTelegramId) {
    await ctx.reply("Rahmat! Bu havola hozir faol emas. Kanaldagi telefon yoki manzil orqali bog‘laning.");
    return;
  }
  const where = plan.channel ? `@${plan.channel}` : "kanal";
  await ctx.reply(`Siz ${where} postidagi havola orqali keldingiz. Egasi sizga o‘zi javob berishi uchun ismingiz va Telegram profilingizni unga yuboraymi?`, {
    reply_markup: new InlineKeyboard().text("✅ Ha, yuboring", `lead:${tag}:${slot}`),
  });
}

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

    // A customer who tapped a tracked link in a plan post (src_<planTag>_<slot>): not an owner, no onboarding.
    const planLink = PLAN_LINK_RE.exec(payload);
    if (planLink) {
      await customerFromPlanLink(ctx, planLink[1], Number(planLink[2]));
      return;
    }

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

  // /natija — the owner's weekly results for their latest plan + one-tap order count.
  pm.command("natija", async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    const plan = await latestPlanForOwner(from.id);
    if (!plan) {
      await ctx.reply("Hali reja yo‘q. Studioda «Strategiya»ni ishga tushiring — reja postlaridagi havolalar natijani o‘lchaydi.");
      return;
    }
    await ctx.replyWithChatAction("typing").catch(() => undefined);
    let lines: string[] = [];
    if (plan.channel) {
      try {
        const data = await scrapeChannelData(plan.channel);
        const r = await learnFor(data.channel, data.posts, Date.now(), "uz", { ownerReports: true });
        const mine = r.outcomes.filter((o) => o.planTag === plan.tag);
        const measured = mine.filter((o) => o.status === "final" || o.status === "early");
        const starts = mine.reduce((a, o) => a + o.starts, 0);
        lines = [
          `Reja ${plan.weekOf}: ${plan.items.length} ta post, kanalda topildi: ${mine.filter((o) => o.status !== "not_found").length}, o‘lchandi: ${measured.length}.`,
          `Botga o‘tganlar (reja havolalari): ${starts}.`,
          ...r.changes.slice(0, 4).map((c) => `• ${c.replace(/\s*\[[^\]]*\]\s*$/, "")}`),
        ];
      } catch {
        lines = [`Reja ${plan.weekOf}: kanalni hozir o‘qib bo‘lmadi, keyinroq qayta urinib ko‘ring.`];
      }
    }
    await ctx.reply([...lines, "", "Bu hafta reja postlaridan nechta buyurtma bo‘ldi?"].join("\n"), {
      reply_markup: new InlineKeyboard()
        .text("0", `ord:${plan.tag}:0`)
        .text("1–3", `ord:${plan.tag}:1`)
        .text("4–10", `ord:${plan.tag}:4`)
        .text("10+", `ord:${plan.tag}:10`),
    });
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
    // LLM spend guard: one onboarding in flight per user, at most 5 per hour.
    const gate = onboardGate.enter(from.id);
    if (!gate.ok) {
      await ctx.reply(gateMessage(gate, locale));
      return;
    }
    try {
      await ctx.reply(
        "channel" in input
          ? `Ishlayapman… @${input.channel} kanalini o‘qiyapman va brendingiz DNK-sini tuzyapman (taxminan 40 soniya).`
          : "Ishlayapman… brendingiz DNK-sini tuzyapman va postlar yozyapman (taxminan 40 soniya).",
      );
      await ctx.replyWithChatAction("typing").catch(() => undefined);
    } catch (err) {
      onboardGate.leave(from.id);
      throw err;
    }
    const api = ctx.api;
    const chatId = ctx.chat.id;
    await runLater(async () => {
      try {
        await runOnboarding(api, chatId, from.id, input);
      } finally {
        onboardGate.leave(from.id);
      }
    });
  });

  // "📢 Publish" under a generated post. ctx.from is trusted (comes from Telegram).
  b.callbackQuery(/^pub:([0-9a-f-]{36})$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: "E’lon qilinyapti…" }).catch(() => undefined);
    const message = await publishFromBot(ctx.match[1], ctx.from.id);
    await ctx.reply(message, { link_preview_options: { is_disabled: true } });
  });

  // Customer agreed to share their contact: tell the owner (one lead), with a "Sotildi" button for them.
  b.callbackQuery(/^lead:([a-z0-9]{6}):(\d{1,2})$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const plan = await planByTag(ctx.match[1]);
    const slot = Number(ctx.match[2]);
    if (!plan?.ownerTelegramId) {
      await ctx.reply("Kechirasiz, bu havola eskirgan.");
      return;
    }
    const u = ctx.from;
    const item = plan.items.find((i) => i.slot === slot);
    const who = `${escapeHtml([u.first_name, u.last_name].filter(Boolean).join(" ") || "Mijoz")}${u.username ? ` (@${u.username})` : ""}`;
    const post = item?.hook ? `«${escapeHtml(item.hook.slice(0, 80))}»` : `${slot}-post`;
    try {
      await ctx.api.sendMessage(
        plan.ownerTelegramId,
        `🔔 Yangi so‘rov: <a href="tg://user?id=${u.id}">${who}</a>\n${post} (${item?.day ?? plan.weekOf}) havolasi orqali.\nUnga o‘zingiz yozing. Sotuv bo‘lsa — tugmani bosing, reja shundan o‘rganadi.`,
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("✅ Sotildi", `sold:${plan.tag}:${slot}`) },
      );
      await safeLogEvent(u.id, "lead", { src: `src_${plan.tag}_${slot}` });
      await ctx.editMessageText("Rahmat! Kontaktingiz yuborildi — tez orada sizga o‘zlari yozishadi.").catch(() => undefined);
    } catch {
      await ctx.reply("Hozir yuborib bo‘lmadi. Kanaldagi telefon yoki manzil orqali bog‘laning.");
    }
  });

  // Owner taps "Sotildi" under a lead, or answers the weekly order question. Only the plan's owner may.
  b.callbackQuery(/^(sold|ord):([a-z0-9]{6}):(\d{1,2})$/, async (ctx) => {
    const [, kind, tag, n] = ctx.match;
    const plan = await planByTag(tag);
    if (!plan || plan.ownerTelegramId !== ctx.from.id) {
      await ctx.answerCallbackQuery({ text: "Bu reja sizniki emas." }).catch(() => undefined);
      return;
    }
    if (kind === "sold") {
      await recordOutcome(plan.id, Number(n), "sold", 1, ctx.from.id);
      await ctx.answerCallbackQuery({ text: "Yozib qo‘ydim: +1 sotuv" }).catch(() => undefined);
      await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard().text("✅ Sotildi (yana +1)", `sold:${tag}:${n}`) }).catch(() => undefined);
      return;
    }
    const bucket = ORDER_BUCKETS[n];
    if (!bucket) return;
    await recordOutcome(plan.id, null, "orders_week", bucket.value, ctx.from.id);
    await ctx.answerCallbackQuery({ text: `Yozib qo‘ydim: ${bucket.label}` }).catch(() => undefined);
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
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
