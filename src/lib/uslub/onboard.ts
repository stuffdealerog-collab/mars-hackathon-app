import "server-only";
import { InlineKeyboard, type Api } from "grammy";
import { getPublicUrl } from "@/lib/env";
import { type Locale, type MessageKey, t } from "@/lib/i18n";
import { safeLogEvent } from "@/lib/track";
import { addAdminUrlFor, publishError } from "./botpublish";
import { pickScript } from "./botpublish-core";
import { findPlaceholders, placeholderNote } from "./placeholders";
import { buildBrand } from "./brand";
import type { BrandProfile } from "./contract";
import { generatePosts } from "./copywriter";
import { createOnboardGate, type GateResult } from "./limit";
import { errorBody } from "./http";
import { publishOnce } from "./publish-once";
import { parseChannelUsername, ScrapeError } from "./scrape";
import { getBrand, getPost, savePosts } from "./store";
import { studioLink } from "./handoff";
import { clip } from "./text";

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
 * Publishes at most once (publish-once.ts). null = say nothing: the first press of the button is still sending
 * the post and will report it.
 */
export async function publishFromBot(postId: string, userId: number, locale: Locale = "uz"): Promise<{ text: string; addAdminUrl?: string } | null> {
  const post = await getPost(postId);
  const brand = post ? await getBrand(post.brandId) : null;
  if (!post || !brand?.channel) return { text: t(locale, "bot.need_channel") };
  if (brand.ownerTelegramId === userId && post.status === "published") return { text: t(locale, "pub.already", { url: post.publishedUrl ?? "" }) };
  const script = pickScript(post.variants, undefined, brand.dna?.languages);
  const blanks = findPlaceholders(post.variants[script] ?? "");
  if (blanks.length) return { text: placeholderNote(blanks, locale) };
  const res = await publishOnce({ postId, script, chat: brand.channel, userId });
  if (res.ok) return { text: t(locale, res.already ? "pub.already" : "pub.done", { url: res.url ?? "" }) };
  if (res.inProgress) return null;
  // Same localized reasons as the publish link; a missing bot admin comes with the "add the bot" button.
  return {
    text: t(locale, "pub.failed", { error: publishError(locale, res.status, res.error, res.addAdminUrl, brand.channel) }),
    addAdminUrl: addAdminUrlFor(res.status, res.error, res.addAdminUrl),
  };
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

/**
 * Time budget of one bot onboarding. It runs in after() inside the Telegram webhook (maxDuration 120 s): the work
 * gets this long, the owner hears back before the function can be killed, never silence.
 */
export const ONBOARD_BUDGET_MS = 95_000;

export interface OnboardRun {
  /** Wall-clock deadline (ms epoch) for the posts step: it skips its optional passes near it. */
  deadline?: number;
  /** True once the owner was told "took too long": nothing more is sent for this run. */
  cancelled?: () => boolean;
}

/** Slow part of the onboarding: run after replying "Ishlayapman…" so the webhook answers fast. */
export async function runOnboarding(
  api: Api,
  chatId: number,
  userId: number,
  input: Exclude<OnboardInput, null>,
  locale: Locale = "uz",
  run: OnboardRun = {},
): Promise<void> {
  const started = Date.now();
  const live = () => !run.cancelled?.();
  try {
    // The DNA's prose follows the user's Telegram language; the posts keep all four variants.
    const { brand, channel } = await buildBrand({ ...input, ownerTelegramId: userId, lang: locale });
    if (!live()) return;
    await api.sendMessage(chatId, dnaSummary(brand, channel?.totalMessages ?? brand.samplePosts.length, locale));

    const posts = await generatePosts(
      brand,
      "Kanal uchun ikkita yangi post: biri mahsulot yoki xizmat haqida, biri mijozlar bilan suhbat (savol yoki foydali maslahat).",
      2,
      { deadline: run.deadline },
    );
    await savePosts(posts, userId);
    if (!live()) return;
    for (const [i, p] of posts.entries()) {
      // Publishing goes through publishFromBot (owner + own channel + admin checks); only for linked channels.
      const kb = brand.channel ? new InlineKeyboard().text(t(locale, "bot.publish_to", { channel: brand.channel }), `pub:${p.id}`) : undefined;
      const text = p.variants[pickScript(p.variants, undefined, brand.dna?.languages)];
      await api.sendMessage(chatId, clip(`${t(locale, "bot.post_header", { i: i + 1, score: p.humanScore })}\n\n${text}`, 4000), {
        ...(kb ? { reply_markup: kb } : {}),
      });
    }

    const app = getPublicUrl();
    const kb = new InlineKeyboard();
    if (app?.startsWith("https://")) kb.webApp(t(locale, "bot.open_in_app"), `${app}/tg?brand=${brand.id}`).row();
    // The desktop Studio has no Telegram identity: the link carries this owner's signed handoff key (handoff.ts).
    kb.url(t(locale, "bot.open_studio"), studioLink(brand.id, userId));
    await api.sendMessage(chatId, t(locale, "bot.done"), { reply_markup: kb });
    await safeLogEvent(userId, "bot_onboarded", { brand_id: brand.id, ms: Date.now() - started });
  } catch (err) {
    if (!live()) return;
    // Same owner-safe sentence as the API, in the user's language (never a stack trace or an English SDK error).
    const { body } = errorBody(err, locale);
    if (!(err instanceof ScrapeError)) console.error("[uslub/onboard]", err instanceof Error ? err.message : err);
    const hint = err instanceof ScrapeError && body.code !== "channel_empty" ? `\n\n${t(locale, "bot.or_describe")}` : "";
    await api.sendMessage(chatId, `⚠️ ${body.error}${hint}`).catch(() => undefined);
  }
}

/** Callback data of the "try again" button after a slow channel onboarding (≤ 64 bytes). */
export const retryOnboardData = (channel: string) => `ob:${channel}`;
export const RETRY_ONBOARD_RE = /^ob:([A-Za-z][A-Za-z0-9_]{3,31})$/;

/**
 * runOnboarding within ONBOARD_BUDGET_MS. If it is not done by then, the owner gets a localized "this is taking
 * long" message right away (with a "try again" button for a channel link, or a request to resend the description)
 * instead of silence. The slow run is NOT abandoned: `settled` resolves when it really ends (it still delivers its
 * result if it finishes in time). Callers keep the spend gate — and the function alive — until `settled`, so a
 * retry tap can never start a second paid run next to the first one.
 */
export async function runOnboardingInTime(
  api: Api,
  chatId: number,
  userId: number,
  input: Exclude<OnboardInput, null>,
  locale: Locale = "uz",
  budgetMs = ONBOARD_BUDGET_MS,
): Promise<{ result: "done" | "timeout"; settled: Promise<void> }> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const settled = runOnboarding(api, chatId, userId, input, locale, { deadline: started + budgetMs - 10_000 });
  const late = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), budgetMs);
  });
  const result = await Promise.race([settled.then(() => "done" as const), late]);
  clearTimeout(timer);
  if (result === "done") return { result, settled };
  await safeLogEvent(userId, "bot_onboard_timeout", { ms: Date.now() - started, kind: "channel" in input ? "channel" : "text" });
  if ("channel" in input) {
    await api
      .sendMessage(chatId, t(locale, "bot.too_slow_channel"), {
        reply_markup: new InlineKeyboard().text(t(locale, "pub.button_retry"), retryOnboardData(input.channel)),
      })
      .catch(() => undefined);
  } else {
    await api.sendMessage(chatId, t(locale, "bot.too_slow_text")).catch(() => undefined);
  }
  return { result: "timeout", settled };
}
