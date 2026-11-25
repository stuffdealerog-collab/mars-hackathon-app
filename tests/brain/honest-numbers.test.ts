import { describe, expect, it } from "vitest";
import { bestTimeLabel, forecastSlot } from "../../src/lib/uslub/brain/forecast";
import { KIND_BRIEF, launchSufficiency } from "../../src/lib/uslub/brain/launch-plan";
import { evidenceText } from "../../src/lib/uslub/brain/plain";
import { statsLedger } from "../../src/lib/uslub/brain/rules";
import { buildKpis, metricText } from "../../src/lib/uslub/brain/skeleton";
import { computeStats } from "../../src/lib/uslub/brain/stats";
import type { ChannelData, RawPost } from "../../src/lib/uslub/brain/types";

// QA 2026-11-25 (cake shop): reach 194%, a 72 h forecast of 1 729–3 591 views against 546 real ones, "measure in
// 2 weeks" with nothing that measures, and a first post the plan called "Pinned" that nobody pins.
const NOW = Date.parse("2026-11-25T08:00:00Z");
const DAY = 86_400_000;

const post = (id: number, daysAgo: number, views: number): RawPost => ({
  id,
  channel: "tortuyi",
  url: `https://t.me/tortuyi/${id}`,
  text: `Napoleon torti tayyor, buyurtma qiling. Post ${id}`,
  postedAt: new Date(NOW - daysAgo * DAY).toISOString(),
  views,
  approx: false,
  media: "photo",
  isForward: false,
  links: [],
});

/** Old summer posts with many lifetime views, then recent posts with few. */
function channel(subscribers: number): ChannelData {
  const old = Array.from({ length: 6 }, (_, i) => post(100 + i, 60 + i * 4, 3000 + i * 100));
  const recent = Array.from({ length: 6 }, (_, i) => post(200 + i, 4 + i * 3, 500 + i * 20));
  return { channel: "tortuyi", title: "Tort uyi", subscribers, posts: [...recent, ...old], complete: true, pages: 1 };
}

describe("reach is a share of subscribers: never above 100%", () => {
  it("caps the share and keeps the raw ratio", () => {
    const s = computeStats(channel(800), NOW);
    expect(s.viewsPerSubscriber).toBeGreaterThan(1);
    expect(s.reachRate).toBe(1);
    expect(s.viewsAboveSubs).toBe(true);
    const ledger = statsLedger(s, []);
    expect(ledger.find((e) => e.id === "S.reachRate")?.display).toBe("100%");
    expect(ledger.find((e) => e.id === "S.viewsAboveSubs")?.display).toMatch(/×$/);
  });

  // Review of PR #50: the Uzbek note inside the reach display was printed in every language.
  it("the owner reads why in their own language", () => {
    const s = computeStats(channel(800), NOW);
    const ledger = new Map(statsLedger(s, []).map((e) => [e.id, e]));
    const ru = evidenceText(["S.reachRate", "S.viewsAboveSubs"], ledger, "ru");
    const en = evidenceText(["S.reachRate", "S.viewsAboveSubs"], ledger, "en");
    expect(ru).toMatch(/^доля подписчиков, видящих пост: 100% · просмотров больше, чем подписчиков: \+\d+%$/);
    expect(en).toMatch(/^subscribers who see a post: 100% · views exceed subscribers: \+\d+%$/);
    for (const t of [ru, en]) expect(t).not.toMatch(/ko.rishlar/);
    expect(statsLedger(computeStats(channel(20_000), NOW), []).some((e) => e.id === "S.viewsAboveSubs")).toBe(false);
  });

  it("drops the reach KPI when views exceed subscribers", () => {
    const s = computeStats(channel(800), NOW);
    for (const lang of ["uz", "ru", "en"] as const)
      expect(buildKpis(s, [], 3, [], lang).some((k) => /obunachilar ulushi|Доля подписчиков|Share of subscribers/.test(k.metric))).toBe(false);
    expect(buildKpis(computeStats(channel(20_000), NOW), [], 3, [], "en").some((k) => k.metric.startsWith("Share of subscribers"))).toBe(true);
  });

  it("a normal channel keeps its reach share", () => {
    const s = computeStats(channel(20_000), NOW);
    expect(s.viewsAboveSubs).toBe(false);
    expect(s.reachRate).toBeCloseTo((s.medianViews as number) / 20_000, 6);
  });
});

describe("72 h targets and forecasts come from what new posts get", () => {
  const s = computeStats(channel(20_000), NOW);

  it("the recent median is far below the 90-day median here", () => {
    expect(s.recentMedianViews).toBe(550);
    expect(s.recentMedianN).toBe(6);
    expect(s.medianViews as number).toBeGreaterThan(1500);
  });

  it("the forecast is built on the recent median", () => {
    const f = forecastSlot({ goal: "trust", format: "photo", time: "12:40", weekday: 2 }, s, undefined, { lang: "ru" });
    expect(f.basis[0]).toBe("S.recentMedianViews");
    expect(f.confidence).toBe("data");
    expect(f.display.startsWith("≈")).toBe(true);
    // The channel's lifts move it at most 2× either way; the 90-day median would start it at ~3 000.
    expect(f.views?.mid).toBeGreaterThanOrEqual(275);
    expect(f.views?.mid).toBeLessThanOrEqual(1100);
  });

  // A cold start: the 6 recent posts only.
  const cold = computeStats({ ...channel(20_000), posts: channel(20_000).posts.slice(0, 6) }, NOW);

  it("without enough history the forecast is a guide and says so", () => {
    expect(cold.coldStart).toBe(true);
    const f = forecastSlot({ goal: "trust", format: "photo", time: "12:40", weekday: 2 }, cold, undefined, { lang: "ru" });
    expect(f.confidence).toBe("baseline");
    expect(f.views?.mid).toBe(550);
    expect(f.display.startsWith("ориентир: ≈550")).toBe(true);
  });

  it("no +20% reach target on a cold start or a handful of posts", () => {
    expect(metricText("reach", 550, "en", { steady: true })).toBe("≥550 views in 72 h");
    expect(metricText("reach", 1000, "uz")).toBe("72 soatda ≥1200 ko‘rish");
    const views = buildKpis(cold, [], 3, [], "en").find((k) => k.metric.startsWith("Typical views"));
    expect(views).toMatchObject({ baseline: 550, target: 550, metric: "Typical views per post (after 3 days)" });
    const grown = buildKpis(s, [], 3, [], "en").find((k) => k.metric.startsWith("Typical views"));
    expect(grown).toMatchObject({ baseline: 550, target: 633 });
  });

  it("KPIs never promise a daily count nobody runs", () => {
    for (const lang of ["uz", "ru", "en"] as const) for (const k of buildKpis(s, [], 3, [], lang)) expect(k.how).not.toMatch(/har kuni|каждый день|every day/i);
  });
});

describe("best time is labelled for what it is", () => {
  it("measured times say 'best', rules of thumb say 'suggested'", () => {
    expect(bestTimeLabel({ weekday: 3, time: "12:40", timeSource: "data" }, "ru")).toBe("Лучшее время по вашему каналу: чт 12:40");
    expect(bestTimeLabel({ weekday: 3, time: "12:40", timeSource: "prior" }, "ru")).toBe("Ориентир по времени: чт 12:40");
    expect(bestTimeLabel({ weekday: 0, time: "20:40", timeSource: "benchmark" }, "en")).toBe("Suggested time: Mon 20:40");
    expect(bestTimeLabel({ weekday: 4, time: "19:00", timeSource: "learned" }, "uz")).toBe("Kanalingiz bo‘yicha eng yaxshi vaqt: ju 19:00");
  });
});

describe("no promise without a mechanism", () => {
  it("the launch plan never says 'we measure in 2 weeks'", () => {
    for (const lang of ["uz", "ru", "en"] as const)
      for (const hasPrice of [true, false])
        for (const s of launchSufficiency({ hasPrice, hasAddress: true, hasContact: true }, lang)) {
          expect(s.text).not.toMatch(/2 hafta|2 недел|2 weeks/i);
          // Nothing recounts a fresh brand's channel or collects proof by itself (review of PR #50).
          expect(s.text).not.toMatch(/ochganingizda|откроете Mercat|open Mercat|birinchi haftada|первую неделю|first week/i);
        }
  });

  it("the intro post is pinned by the owner and never calls itself pinned", () => {
    expect(KIND_BRIEF.intro).toMatch(/owner pins it/);
    expect(KIND_BRIEF.intro).toMatch(/never says/);
    expect(KIND_BRIEF.intro).not.toMatch(/^Pinned/);
  });
});
