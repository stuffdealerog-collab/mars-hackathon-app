import { describe, expect, it } from "vitest";
import { buildWeeklyReport, reportKind, type WeeklyReportInput } from "../src/lib/autopilot/report";
import { detectNeuro } from "../src/lib/uslub/neuro";

const base: WeeklyReportInput = { locale: "uz", kind: "sales", from: "2026-11-23", to: "2026-11-29", planned: 3, published: 3 };

describe("which Monday report a channel gets (owner correction 2)", () => {
  it("follows the goal first, else the channel type; neither = unknown (never the orders question)", () => {
    expect(reportKind("business", undefined)).toBe("sales");
    expect(reportKind(undefined, undefined)).toBe("unknown");
    expect(reportKind(null, null)).toBe("unknown");
    // A goal that says neither orders nor subscribers falls back to the type, and with no type to "unknown".
    expect(reportKind(undefined, "reach")).toBe("unknown");
    expect(reportKind("blog", "trust")).toBe("growth");
    expect(reportKind(undefined, "sale")).toBe("sales");
    expect(reportKind(undefined, "grow")).toBe("growth");
    for (const t of ["blog", "expert", "media", "community"] as const) expect(reportKind(t, undefined)).toBe("growth");
    expect(reportKind("blog", "sale")).toBe("sales");
    expect(reportKind("business", "grow")).toBe("growth");
    expect(reportKind("business", "engage")).toBe("growth");
  });
});

describe("Monday report for a business channel", () => {
  it("published X of Y, views at 72 h vs the channel median, starts on tracked links, then the orders question", () => {
    const r = buildWeeklyReport({ ...base, published: 2, views72: { avg: 540, n: 2 }, medianViews: 480, starts: 4 });
    expect(r.askOrders).toBe(true);
    expect(r.text).toContain("Rejadagi 3 ta postdan 2 tasi chiqdi.");
    expect(r.text).toContain("540");
    expect(r.text).toContain("480");
    expect(r.text).toContain("+13%");
    expect(r.text).toContain("Post havolalari orqali botga o‘tganlar: 4.");
    expect(r.text).toContain("O‘tgan hafta nechta buyurtma bo‘ldi?");
    expect(r.text).not.toMatch(/obunachi/i);
  });

  it("lines without data are left out, never shown as 0", () => {
    const r = buildWeeklyReport({ ...base, published: 1, planned: 0 });
    expect(r.text).toContain("Chiqqan postlar: 1.");
    expect(r.text).not.toMatch(/ko‘rildi|havolalari/);
  });

  it("nothing went out: says so, and still asks about orders", () => {
    const r = buildWeeklyReport({ ...base, published: 0, planned: 0 });
    expect(r.text).toContain("O‘tgan hafta kanalda Mercat postlari chiqmadi.");
    expect(r.askOrders).toBe(true);
  });

  it("Russian and English", () => {
    const ru = buildWeeklyReport({ ...base, locale: "ru", published: 2, views72: { avg: 400, n: 2 }, medianViews: 500, starts: 0 });
    expect(ru.text).toContain("Вышло 2 из 3 постов по плану.");
    expect(ru.text).toContain("-20%");
    expect(ru.text).toContain("Сколько заказов было за прошлую неделю?");
    const en = buildWeeklyReport({ ...base, locale: "en", published: 3, views72: { avg: 1240, n: 3 } });
    expect(en.text).toContain("3 of 3 planned posts went out.");
    expect(en.text).toContain("1,240");
  });
});

describe("Monday report for a blog, expert, media or community channel", () => {
  const growth: WeeklyReportInput = { ...base, kind: "growth", locale: "uz" };

  it("subscribers, views/reactions vs the median and the best post; never orders or prices", () => {
    const r = buildWeeklyReport({
      ...growth,
      published: 3,
      subscribers: { now: 1520, delta: 18 },
      views72: { avg: 900, n: 3 },
      medianViews: 750,
      reactions: 42,
      best: { hook: "Nega ertalab yozaman", views: 1300, url: "https://t.me/blog/77" },
      starts: 5,
    });
    expect(r.askOrders).toBe(false);
    expect(r.text).toContain("Obunachilar: +18 (hozir 1 520).");
    expect(r.text).toContain("+20%");
    expect(r.text).toContain("Reaksiyalar: 42.");
    expect(r.text).toContain("«Nega ertalab yozaman»");
    expect(r.text).toContain("https://t.me/blog/77");
    expect(r.text).not.toMatch(/buyurtma|narx|havolalari orqali/i);
  });

  it("a subscriber drop is shown as it is", () => {
    expect(buildWeeklyReport({ ...growth, subscribers: { now: 990, delta: -10 } }).text).toContain("Obunachilar: -10 (hozir 990).");
  });

  it("Russian growth report", () => {
    const r = buildWeeklyReport({ ...growth, locale: "ru", subscribers: { now: 300, delta: 0 }, reactions: 3 });
    expect(r.text).toContain("Подписчики: 0 (сейчас 300).");
    expect(r.text).not.toMatch(/заказ/);
  });
});

describe("Monday report when neither the channel type nor the goal is known yet", () => {
  const unknown: WeeklyReportInput = { ...base, kind: "unknown" };

  it("no orders question and no sales lines: the growth numbers, then the one-time goal question", () => {
    const r = buildWeeklyReport({ ...unknown, published: 2, subscribers: { now: 400, delta: 12 }, views72: { avg: 300, n: 2 }, starts: 4, reactions: 9 });
    expect(r.askOrders).toBe(false);
    expect(r.askGoal).toBe(true);
    expect(r.text).not.toMatch(/buyurtma|havolalari orqali/i);
    expect(r.text).toContain("Obunachilar: +12 (hozir 400).");
    expect(r.text).toContain("Kanal sizga asosan nima uchun kerak?");
    expect(buildWeeklyReport({ ...unknown, locale: "ru" }).text).not.toMatch(/заказ/);
  });

  it("a sales or growth report never asks for the goal", () => {
    expect(buildWeeklyReport(base).askGoal).toBe(false);
    expect(buildWeeklyReport({ ...base, kind: "growth" }).askGoal).toBe(false);
  });
});

describe("report wording", () => {
  it("has no machine-sounding words", () => {
    for (const locale of ["uz", "ru", "en"] as const) {
      for (const kind of ["sales", "growth", "unknown"] as const) {
        const r = buildWeeklyReport({ ...base, locale, kind, published: 2, views72: { avg: 500, n: 2 }, medianViews: 400, starts: 3, subscribers: { now: 100, delta: 5 }, reactions: 7, best: { hook: "x", views: 600 } });
        const script = locale === "uz" ? "uz_latn" : locale;
        expect(detectNeuro(r.text, script), `${locale} ${kind}`).toEqual([]);
      }
    }
  });
});
