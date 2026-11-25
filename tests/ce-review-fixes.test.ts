import { describe, expect, it } from "vitest";
import { channelFactsKb, factsInput, FACTS_INPUT_CHARS } from "../src/lib/uslub/brain/channel-facts";
import { lintItem } from "../src/lib/uslub/brain/lint";
import { runQuestions } from "../src/lib/uslub/brain/questions";
import type { ChannelData, LedgerEntry } from "../src/lib/uslub/brain/types";
import { dropTrackedLinks, ensureTrackedLink, ownContactKeys } from "../src/lib/uslub/ending";

// Review of PR #54 (content engine): pure fixes, no I/O.

const NOW = Date.parse("2026-11-25T09:00:00Z");
const DAY = 86_400_000;

describe("facts input: the channel's posts always get their share", () => {
  const channel: ChannelData = {
    channel: "safiabakery",
    title: "Safia",
    subscribers: 3000,
    complete: false,
    pages: 3,
    posts: [
      ...Array.from({ length: 30 }, (_, i) => ({
        id: 300 - i,
        channel: "safiabakery",
        url: `https://t.me/safiabakery/${300 - i}`,
        text: `Bugun pishirdik: ${i + 1}-partiya non va somsa. Issiq-issiq, kelib oling! Yangi retseptlar haqida keyingi postda yozamiz.`,
        postedAt: new Date(NOW - (i + 1) * DAY).toISOString(),
        views: 900,
        approx: false,
        media: "photo" as const,
        isForward: false,
        links: [],
      })),
      {
        id: 100,
        channel: "safiabakery",
        url: "https://t.me/safiabakery/100",
        text: "Narxlar: Medovik — 180 000 so'm, Napoleon — 150 000 so'm. Buyurtma: +998 90 123 45 67",
        postedAt: new Date(NOW - 118 * DAY).toISOString(),
        views: 1200,
        approx: false,
        media: "photo" as const,
        isForward: false,
        links: [],
      },
    ],
  };

  it("with 20k characters of the owner's documents, a 118-day-old price post is still in what the facts step reads", () => {
    const owner = `[answers]\nNarxlar:\nSomsa — 9 000 so'm\n\n[gdoc: Menyu]\n${"Bizning menyumiz haqida batafsil ma'lumot. ".repeat(480)}`;
    expect(owner.length).toBeGreaterThan(20_000);
    const input = factsInput(owner, channelFactsKb(channel, NOW));
    expect(input.length).toBeLessThanOrEqual(FACTS_INPUT_CHARS);
    expect(input).toContain("Medovik — 180 000 so'm");
    // The owner's answers come first and are never cut.
    expect(input.startsWith("[answers]\nNarxlar:\nSomsa — 9 000 so'm")).toBe(true);
  });

  it("a short owner text leaves the channel more room; no channel = the owner's text alone", () => {
    const kb = channelFactsKb(channel, NOW);
    expect(factsInput("Manzil: Chilonzor 5", kb).length).toBe(Math.min(FACTS_INPUT_CHARS, "Manzil: Chilonzor 5".length + 2 + kb.length));
    expect(factsInput("Manzil: Chilonzor 5", "")).toBe("Manzil: Chilonzor 5");
  });
});

describe("ONE_CTA: the channel's own two-contact ending is one route", () => {
  const ledger = new Map<string, LedgerEntry>([["F1", { id: "F1", label: "price", value: "Medovik 180 000 so'm", display: "Medovik — 180 000 so'm", quote: "Medovik — 180 000 so'm", source: "kb" }]]);
  const ctx = { ledger, priceFacts: [ledger.get("F1") as LedgerEntry], deadlineFacts: 0, recentHooks: [], competitorTexts: [], emojiCap: 3, address: "siz" as const };
  const item = (cta: string) => ({ slot: 1, goal: "sale" as const, hook: "Medovik — 180 000 so'm [F1]", cta, brief: "Medovik [F1]", factIds: ["F1"] });
  const ending = { pattern: "contact" as const, contact: "☎️ +998 90 123 45 67 | @safia_admin", examples: [] };
  const oneCta = (fails: { check: string }[]) => fails.filter((f) => f.check === "ONE_CTA");

  it("a CTA ending with the channel's line as written passes", () => {
    const keys = ownContactKeys(ending, [], { channel: "safiabakery" });
    expect(oneCta(lintItem(item("Buyurtma bering: ☎️ +998 90 123 45 67 | @safia_admin"), { ...ctx, endingContactKeys: keys }))).toEqual([]);
  });

  it("another contact next to them still fails, and without the ending two contacts fail as before", () => {
    const keys = ownContactKeys(ending, [], { channel: "safiabakery" });
    expect(oneCta(lintItem(item("☎️ +998 90 123 45 67 | @safia_admin yoki @boshqa_admin"), { ...ctx, endingContactKeys: keys })).length).toBe(1);
    expect(oneCta(lintItem(item("☎️ +998 90 123 45 67 | @safia_admin"), ctx)).length).toBe(1);
  });
});

describe("the order question names only the contact", () => {
  it("'📞 Buyurtma uchun: +998 90 123 45 67' asks about +998 90 123 45 67, not the whole line", () => {
    const [, order] = runQuestions({ lang: "uz", channelType: "business", contact: "📞 Buyurtma uchun: +998 90 123 45 67", priceFacts: 3, channel: "safiabakery" });
    expect(order.text).toBe("Buyurtmalarni +998 90 123 45 67 orqali qabul qilasizmi?");
    expect(order.prefill).toBe("phone");
    const ru = runQuestions({ lang: "ru", channelType: "business", contact: "Заказ: @safia_admin · @safiabakery", priceFacts: 3, channel: "safiabakery" })[1];
    expect(ru.text).toBe("Заказы принимаете по @safia_admin?");
    expect(ru.prefill).toBe("manager");
  });
});

describe("tracked links", () => {
  const LINK = "https://t.me/mercatai?start=src_ab12cd_2";

  it("a dropped link takes its call to action with it, back to the sentence before", () => {
    expect(dropTrackedLinks(`Medovik — 180 000 so'm. Buyurtma bering: ${LINK}\n\n📞 +998 90 123 45 67`, "mercatai")).toBe("Medovik — 180 000 so'm.\n\n📞 +998 90 123 45 67");
    expect(dropTrackedLinks(`Medovik tayyor!\nПишите: ${LINK}`, "mercatai")).toBe("Medovik tayyor!");
    // A sentence that is not a call to action stays.
    expect(dropTrackedLinks(`Bugun 20 ta medovik pishirdik ${LINK}`, "mercatai")).toBe("Bugun 20 ta medovik pishirdik");
  });

  it("a channel link that starts with the bot's name is not a mangled tracked link", () => {
    expect(ensureTrackedLink("Kanalimiz: t.me/mercatai_uz", LINK, "uz_latn")).toBe(`Kanalimiz: t.me/mercatai_uz\n\nYozish uchun: ${LINK}`);
    expect(ensureTrackedLink("Yozing: t.me/mercatai", LINK, "uz_latn")).toBe(`Yozing: ${LINK}`);
  });
});
