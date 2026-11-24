import { describe, expect, it } from "vitest";
import { descriptionSignals, launchKpis, launchQuestions, launchSkeleton, launchSufficiency, tashkentDay } from "../../src/lib/uslub/brain/launch-plan";

const NOW = Date.parse("2026-11-24T20:00:00Z"); // 01:00 on 25 Nov in Tashkent

describe("fresh-channel launch skeleton", () => {
  const slots = launchSkeleton(NOW);

  it("is 9 posts over two weeks, starting tomorrow (Tashkent)", () => {
    expect(slots).toHaveLength(9);
    expect(tashkentDay(NOW, 0)).toBe("2026-11-26");
    expect(slots[0].day).toBe("2026-11-26");
    expect(slots.at(-1)?.day).toBe("2026-12-09");
    expect(new Set(slots.map((s) => s.day)).size).toBe(9);
  });

  it("opens with the pinned 'who we are / how to order' post and has exactly one offer", () => {
    expect(slots[0]).toMatchObject({ kind: "intro", pinned: true, goal: "trust", needsApproval: true });
    expect(slots.filter((s) => s.pinned)).toHaveLength(1);
    expect(slots.filter((s) => s.kind === "offer")).toHaveLength(1);
    expect(slots.filter((s) => s.kind === "product").length).toBeGreaterThanOrEqual(3);
    expect(slots.filter((s) => s.goal === "trust").length).toBeGreaterThanOrEqual(3);
  });
});

describe("what the description gives us", () => {
  it("detects prices, places and contacts; never assumes them", () => {
    const bakery = "Uyda tort va pishiriqlar pishiraman, Chilonzor 9-kvartal. Napoleon torti 180 000 so‘m. Buyurtma: +998 90 123 45 67";
    expect(descriptionSignals(bakery)).toEqual({ hasPrice: true, hasAddress: true, hasContact: true });
    expect(descriptionSignals("Uyda tort pishiraman, buyurtma bilan ishlayman.")).toEqual({ hasPrice: false, hasAddress: false, hasContact: false });
    // Seen live: a Russian description naming districts must not be asked "where are you?".
    expect(descriptionSignals("Ремонт холодильников на дому в Юнусабаде и Мирзо-Улугбеке. Диагностика 50 000 сум. +998 93 555 12 34")).toEqual({
      hasPrice: true,
      hasAddress: true,
      hasContact: true,
    });
  });

  it("asks the owner for what is missing, in their language", () => {
    const qs = launchQuestions({ hasPrice: false, hasAddress: true, hasContact: false }, "ru");
    expect(qs[0]).toMatch(/цены|стоят/i);
    expect(qs.some((q) => /заказ/i.test(q))).toBe(true);
    expect(qs.some((q) => /адрес|находитесь/i.test(q))).toBe(false);
  });

  it("is honest about having no channel data", () => {
    const s = launchSufficiency({ hasPrice: true, hasAddress: false, hasContact: false }, "uz");
    expect(s[0]).toMatchObject({ key: "channel", status: "insufficient" });
    expect(s[0].text).toMatch(/hali yo‘q/);
    expect(launchKpis(9, "en")[0]).toMatchObject({ baseline: 0, target: 9 });
  });
});
