import "server-only";
import { InlineKeyboard, type Api } from "grammy";
import { getPublicUrl } from "@/lib/env";
import { safeLogEvent } from "@/lib/track";
import { buildBrand } from "./brand";
import type { BrandProfile } from "./contract";
import { generatePosts } from "./copywriter";
import { LlmError } from "./llm";
import { parseChannelUsername, ScrapeError } from "./scrape";
import { savePosts } from "./store";

const STUDIO_URL = "https://mars-hackathon-app.vercel.app/studio";

export const ONBOARD_PROMPT =
  "Kanalingiz havolasini yuboring (masalan, @kanal_nomi yoki https://t.me/kanal_nomi) " +
  "yoki biznesingizni 2-3 gapda yozing: nima sotasiz, kimga, qayerda.\n\n" +
  "Bir daqiqada brendingiz DNK-si va tayyor postlarni yuboraman.";

export type OnboardInput = { channel: string } | { knowledge: string } | null;

/** Decides whether a private message is a channel link, a business description, or neither. */
export function classifyOnboardText(text: string): OnboardInput {
  const s = text.trim();
  if (/^@[A-Za-z]/.test(s) || /(t|telegram)\.me\//i.test(s)) {
    const username = parseChannelUsername(s.split(/\s+/).find((w) => /^@|t\.me|telegram\.me/i.test(w)) ?? s);
    return username ? { channel: username } : null;
  }
  return s.length >= 40 ? { knowledge: s } : null;
}

function dnaSummary(brand: BrandProfile, postsRead: number): string {
  const d = brand.dna;
  const lines = [
    `🧬 ${d.name} — brend DNK`,
    "",
    d.oneLiner,
    "",
    `👥 Auditoriya: ${d.audience}`,
    `🗣 Ohang: ${d.tone}`,
    `💬 Murojaat: ${d.address === "siz" ? "«siz»" : d.address === "sen" ? "«sen»" : "aralash"}, emoji: ${d.emojiDensity}`,
    d.products.length ? `🛍 Mahsulotlar: ${d.products.slice(0, 5).join(", ")}` : "",
    postsRead ? `\n📊 ${postsRead} ta post o‘qildi.` : "",
  ];
  return lines.filter((l) => l !== "").join("\n").slice(0, 3500);
}

/** Slow part of the onboarding: run after replying "Ishlayapman…" so the webhook answers fast. */
export async function runOnboarding(api: Api, chatId: number, userId: number, input: Exclude<OnboardInput, null>): Promise<void> {
  const started = Date.now();
  try {
    const { brand, channel } = await buildBrand({ ...input, ownerTelegramId: userId });
    await api.sendMessage(chatId, dnaSummary(brand, channel?.posts.length ?? brand.samplePosts.length));

    const posts = await generatePosts(brand, "Kanal uchun ikkita yangi post: biri mahsulot yoki xizmat haqida, biri mijozlar bilan suhbat (savol yoki foydali maslahat).", 2);
    await savePosts(posts, userId);
    for (const [i, p] of posts.entries()) {
      await api.sendMessage(chatId, `✍️ Post ${i + 1}  ·  insoniylik: ${p.humanScore}/100\n\n${p.variants.uz_latn}`.slice(0, 4000));
    }

    const app = getPublicUrl();
    const kb = new InlineKeyboard();
    if (app?.startsWith("https://")) kb.webApp("📱 Ilovada ochish", `${app}/tg?brand=${brand.id}`).row();
    kb.url("🧩 Studio: kirill, rus, ingliz va video", `${STUDIO_URL}?brand=${brand.id}`);
    await api.sendMessage(
      chatId,
      "Tayyor! Postlarning kirill, rus va ingliz variantlari, Reels ssenariysi va mijozlar radari Studio’da. " +
        "Hech narsa sizning tasdig‘ingizsiz e’lon qilinmaydi.",
      { reply_markup: kb },
    );
    await safeLogEvent(userId, "bot_onboarded", { brand_id: brand.id, ms: Date.now() - started });
  } catch (err) {
    const msg =
      err instanceof ScrapeError || err instanceof LlmError
        ? err.message
        : "Kechirasiz, xatolik yuz berdi. Birozdan keyin qayta urinib ko‘ring.";
    if (!(err instanceof ScrapeError)) console.error("[uslub/onboard]", err instanceof Error ? err.message : err);
    await api.sendMessage(chatId, `⚠️ ${msg}\n\n${err instanceof ScrapeError ? "Yoki biznesingizni 2-3 gapda yozing." : ""}`.trim()).catch(() => undefined);
  }
}
