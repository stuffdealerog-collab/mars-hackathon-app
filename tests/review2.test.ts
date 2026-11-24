import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ isDbConfigured: () => false, getSql: () => { throw new Error("no db in tests"); } }));
vi.mock("@/lib/track", () => ({ safeLogEvent: async () => {} }));

const store = await import("../src/lib/uslub/store");
import { accessErrorCode, checkChatRights, checkPublishAccess } from "../src/lib/uslub/access";
import { descriptionSignals, launchKpis } from "../src/lib/uslub/brain/launch-plan";
import { templateFinding } from "../src/lib/uslub/brain/plain";
import type { ChannelStats, RuleResult } from "../src/lib/uslub/brain/types";
import type { BrandDNA, PostDraft } from "../src/lib/uslub/contract";
import { publishErrorText } from "../src/lib/uslub/publish-errors";
import { parseChannelHtml } from "../src/lib/uslub/scrape";

describe("retried /posts requests reuse the slot's post (no duplicates, no second bill)", () => {
  it("finds a post written for the same day and time in the last 10 minutes only", async () => {
    const brand = await store.saveBrand({ knowledge: "x", samplePosts: [], dna: {} as BrandDNA, mode: "fresh" }, null, "custom");
    const mk = (time: string, minutesAgo: number): PostDraft => ({
      id: crypto.randomUUID(),
      brandId: brand.id,
      brief: "b",
      variants: { uz_latn: "a", uz_cyrl: "а", ru: "a", en: "a" },
      neuroHits: {},
      humanScore: 90,
      status: "draft",
      slot: { day: "2026-11-26", time, goal: "sale", hook: "h", cta: "c" },
      createdAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    });
    const fresh = mk("20:40", 2);
    await store.savePosts([fresh, mk("12:40", 30)]);
    const slot = (time: string, hook = "h") => ({ day: "2026-11-26", time, goal: "sale" as const, hook, cta: "c" });
    expect((await store.findRecentSlotPost(brand.id, slot("20:40"), "b"))?.id).toBe(fresh.id);
    expect(await store.findRecentSlotPost(brand.id, slot("12:40"), "b")).toBeNull(); // older than 10 min
    expect(await store.findRecentSlotPost(brand.id, { ...slot("20:40"), day: "2026-11-27" }, "b")).toBeNull();
    // A NEW plan on the same day and time (other hook or brief) never gets the previous run's post.
    expect(await store.findRecentSlotPost(brand.id, slot("20:40", "Boshqa hook"), "b")).toBeNull();
    expect(await store.findRecentSlotPost(brand.id, slot("20:40"), "another brief")).toBeNull();
  });
});

describe("empty channel = few messages of any kind, not few captions", () => {
  const msg = (id: number, body: string, extraClass = "") =>
    `<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap js-widget_message${extraClass}" data-post="shop/${id}">${body}</div></div>`;
  const text = (s: string) => `<div class="tgme_widget_message_text js-message_text" dir="auto">${s}</div>`;
  const html = [
    msg(1, text("Yangi kolleksiya keldi, narxi 250 000 so‘m")),
    msg(2, '<a class="tgme_widget_message_photo_wrap"></a>'),
    msg(3, '<div class="tgme_widget_message_grouped_wrap"></div>'),
    msg(4, '<video class="tgme_widget_message_video"></video>'),
    msg(5, '<a class="tgme_widget_message_photo_wrap"></a>'),
    msg(6, text("Channel created"), " service_message"),
  ].join("");

  it("counts albums, reels and photos without a caption; skips service messages", () => {
    const c = parseChannelHtml("shop", html);
    expect(c.posts).toHaveLength(1); // the voice is learned from the captioned subset
    expect(c.totalMessages).toBe(5);
  });
});

describe("publish errors in the owner's language", () => {
  it("checks the bot first: without it the owner would wrongly read 'you are not an admin'", () => {
    const r = checkChatRights(null, null, "https://t.me/bot?startchannel");
    expect(r).toMatchObject({ ok: false, code: "bot_not_admin" });
  });

  it("maps publishPost's Uzbek messages back to codes and localized sentences", () => {
    const unowned = checkPublishAccess({ userId: 7, brand: { ownerTelegramId: null, channel: "shop" }, chat: "@shop" });
    expect(unowned.ok).toBe(false);
    if (unowned.ok) return;
    expect(accessErrorCode(unowned.error)).toBe("brand_unowned");
    const bot = checkChatRights({ status: "creator" }, null, "https://t.me/bot?startchannel");
    if (bot.ok) throw new Error("expected refusal");
    const ru = publishErrorText("ru", 403, bot.error, "https://t.me/bot?startchannel");
    expect(ru.code).toBe("bot_not_admin");
    expect(ru.text).toMatch(/Сделайте бота админом/);
    expect(publishErrorText("en", 502, "Telegram xatosi: Bad Request: chat not found").code).toBe("telegram_unavailable");
  });
});

describe("owner text fixes", () => {
  it("never shows the 'unknown' language bucket", () => {
    const rule = { id: "R.LANGUAGE_WINNER", kind: "strength", status: "fired", ids: ["S.langLift.unknown", "S.langLift.ru"] } as unknown as RuleResult;
    expect(templateFinding(rule, {} as ChannelStats, "uz", { value: () => 1.5 })).toBeNull();
  });

  it("drops the 'unknown' language at the source: no rule trigger, effect or ledger entry mentions it", async () => {
    const { loadFixtures } = await import("./brain/eval/fixtures");
    const { runRules, statsLedger } = await import("../src/lib/uslub/brain/rules");
    const { computeStats } = await import("../src/lib/uslub/brain/stats");
    for (const f of loadFixtures()) {
      const s = computeStats(f.data, Date.parse(f.capturedAt));
      for (const r of runRules(s, { category: f.niche, competitors: [] })) expect(`${r.trigger} ${r.effects}`, `${f.handle} ${r.id}`).not.toMatch(/lang:unknown|langLift\.unknown|unknown is the primary/);
      expect(statsLedger(s, []).some((e) => e.id === "S.langLift.unknown")).toBe(false);
    }
  });

  it("names the real window size in the views-falling finding", () => {
    const rule = { id: "R.DECLINING", kind: "problem", status: "fired", ids: [], data: {} } as unknown as RuleResult;
    const s = { viewTrend: 0.7, maturePosts: 24 } as ChannelStats;
    expect(templateFinding(rule, s, "uz")).toMatch(/^Oxirgi 12 ta post oldingi 12 tadan 30% kam/);
    expect(templateFinding(rule, { ...s, maturePosts: 40 }, "en")).toMatch(/^The last 15 posts got 30% fewer views than the 15 before/);
  });

  it("does not take years or customer counts for prices", () => {
    for (const text of [
      "2010 yildan beri ishlaymiz, 1000 dan ortiq mijoz, 500 000 obunachi",
      "5 ming obunachi va 300 ta mijoz",
      "100 sumka bor",
      "Сумки 100 шт. в наличии",
      "Работаем с 2015 года, 2000 клиентов",
    ])
      expect(descriptionSignals(text).hasPrice, text).toBe(false);
  });

  it("recognises prices in the forms owners actually write (suffixes, thousands words, currencies)", () => {
    for (const text of [
      "Napoleon torti 180 ming so‘m",
      "Bento-tort 250 000 so'mdan",
      "Kurs 150 000 so‘mga tushdi",
      "50 ming so'mlik sovg'a to'plami",
      "Narxi 120 000 сўмдан",
      "Диагностика 50 000 сум",
      "Стоимость 500 тысяч сумов",
      "Кофе 25 000 сумов",
      "Napoleon 180 ming",
      "Narxi 150 000 UZS",
      "Торт 150 тыс.",
      "Torti 150k",
      "Narxi 20$ dan",
      "Курс 30 долларов",
    ])
      expect(descriptionSignals(text).hasPrice, text).toBe(true);
  });

  it("the fresh launch plan only points at things that work today", () => {
    for (const lang of ["uz", "ru", "en"] as const) for (const k of launchKpis(9, lang)) expect(k.how).not.toMatch(/Sotildi|\/natija/);
  });
});
