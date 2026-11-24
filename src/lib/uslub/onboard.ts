import "server-only";
import { InlineKeyboard, type Api } from "grammy";
import { getPublicUrl } from "@/lib/env";
import { type Locale, type MessageKey, t } from "@/lib/i18n";
import { safeLogEvent } from "@/lib/track";
import { pickScript } from "./botpublish-core";
import { buildBrand } from "./brand";
import type { BrandProfile } from "./contract";
import { generatePosts } from "./copywriter";
import { createOnboardGate, type GateResult } from "./limit";
import { errorBody } from "./http";
import { publishPost } from "./publish";
import { parseChannelUsername, ScrapeError } from "./scrape";
import { getBrand, getPost, savePosts } from "./store";

/** Studio link in the bot (PUBLIC_URL first; production domain renamed to Mercat on 24 Nov). */
const studioUrl = () => `${getPublicUrl() ?? "https://mercat-ai.vercel.app"}/studio`;

/** "Send your channel link or describe your business" in the user's language. */
export const onboardPrompt = (locale: Locale) => t(locale, "bot.onboard_prompt");

export type OnboardInput = { channel: string } | { knowledge: string } | null;

/** Per-user limiter for the bot onboarding (LLM spend): 1 in flight, 5 per hour. */
export const onboardGate = createOnboardGate(5);

export function gateMessage(result: Exclude<GateResult, { ok: true }>, locale: Locale): string {
  if (result.reason === "busy") {
    return { uz: "Bir daqiqa, hozir ishlayapman… Natijani shu yerga yuboraman.", ru: "Минутку, я ещё работаю… Пришлю результат сюда.", en: "One moment, I'm still working… I'll send the result here." }[locale];
  }
  const min = Math.max(1, Math.ceil(result.retryAfterMs / 60_000));
  return {
    uz: `Limit: soatiga 5 ta tahlil. ${min} daqiqadan keyin qayta urinib ko‘ring.`,
    ru: `Лимит: 5 разборов в час. Попробуйте через ${min} мин.`,
    en: `Limit: 5 analyses per hour. Try again in ${min} min.`,
  }[locale];
}

/**
 * "📢 Publish" button in the bot. `userId` is the trusted ctx.from.id; the same
 * authorization path as /api/uslub/publish (owner + own channel + admin checks).
 */
export async function publishFromBot(postId: string, userId: number, locale: Locale = "uz"): Promise<string> {
  const post = await getPost(postId);
  const brand = post ? await getBrand(post.brandId) : null;
  if (!post || !brand?.channel) return t(locale, "bot.need_channel");
  const script = pickScript(post.variants, undefined, brand.dna?.languages);
  const res = await publishPost({ postId, script, chat: brand.channel, userId });
  return res.ok ? t(locale, "pub.done", { url: res.url ?? "" }) : t(locale, "pub.failed", { error: res.error ?? "" });
}

/** Decides whether a private message is a channel link, a business description, or neither. */
export function classifyOnboardText(text: string): OnboardInput {
  const s = text.trim();
  if (/^@[A-Za-z]/.test(s) || /(t|telegram)\.me\//i.test(s)) {
    const username = parseChannelUsername(s.split(/\s+/).find((w) => /^@|t\.me|telegram\.me/i.test(w)) ?? s);
    return username ? { channel: username } : null;
  }
  return s.length >= 40 ? { knowledge: s } : null;
}

function dnaSummary(brand: BrandProfile, postsRead: number, locale: Locale): string {
  const d = brand.dna;
  const address = (["siz", "sen", "mixed"] as const).includes(d.address as "siz") ? t(locale, `bot.addr.${d.address}` as MessageKey) : "—";
  const lines = [
    t(locale, "bot.dna_title", { name: d.name }),
    "",
    d.oneLiner,
    "",
    t(locale, "bot.dna_audience", { value: d.audience }),
    t(locale, "bot.dna_tone", { value: d.tone }),
    t(locale, "bot.dna_voice", { address, emoji: t(locale, `bot.emoji.${d.emojiDensity}` as MessageKey) }),
    d.products.length ? t(locale, "bot.dna_products", { value: d.products.slice(0, 5).join(", ") }) : "",
    postsRead ? `\n${t(locale, "bot.posts_read", { n: postsRead })}` : "",
  ];
  return lines.filter((l) => l !== "").join("\n").slice(0, 3500);
}

/** Slow part of the onboarding: run after replying "Ishlayapman…" so the webhook answers fast. */
export async function runOnboarding(api: Api, chatId: number, userId: number, input: Exclude<OnboardInput, null>, locale: Locale = "uz"): Promise<void> {
  const started = Date.now();
  try {
    // The DNA's prose follows the user's Telegram language; the posts keep all four variants.
    const { brand, channel } = await buildBrand({ ...input, ownerTelegramId: userId, lang: locale });
    await api.sendMessage(chatId, dnaSummary(brand, channel?.posts.length ?? brand.samplePosts.length, locale));

    const posts = await generatePosts(brand, "Kanal uchun ikkita yangi post: biri mahsulot yoki xizmat haqida, biri mijozlar bilan suhbat (savol yoki foydali maslahat).", 2);
    await savePosts(posts, userId);
    for (const [i, p] of posts.entries()) {
      // Publishing goes through publishFromBot (owner + own channel + admin checks); only for linked channels.
      const kb = brand.channel ? new InlineKeyboard().text(t(locale, "bot.publish_to", { channel: brand.channel }), `pub:${p.id}`) : undefined;
      const text = p.variants[pickScript(p.variants, undefined, brand.dna?.languages)];
      await api.sendMessage(chatId, `${t(locale, "bot.post_header", { i: i + 1, score: p.humanScore })}\n\n${text}`.slice(0, 4000), {
        ...(kb ? { reply_markup: kb } : {}),
      });
    }

    const app = getPublicUrl();
    const kb = new InlineKeyboard();
    if (app?.startsWith("https://")) kb.webApp(t(locale, "bot.open_in_app"), `${app}/tg?brand=${brand.id}`).row();
    kb.url(t(locale, "bot.open_studio"), `${studioUrl()}?brand=${brand.id}`);
    await api.sendMessage(chatId, t(locale, "bot.done"), { reply_markup: kb });
    await safeLogEvent(userId, "bot_onboarded", { brand_id: brand.id, ms: Date.now() - started });
  } catch (err) {
    // Same owner-safe sentence as the API, in the user's language (never a stack trace or an English SDK error).
    const { body } = errorBody(err, locale);
    if (!(err instanceof ScrapeError)) console.error("[uslub/onboard]", err instanceof Error ? err.message : err);
    const hint = err instanceof ScrapeError && body.code !== "channel_empty" ? `\n\n${t(locale, "bot.or_describe")}` : "";
    await api.sendMessage(chatId, `⚠️ ${body.error}${hint}`).catch(() => undefined);
  }
}
