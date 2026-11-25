import { describe, expect, it } from "vitest";
import { addDays, daysBetween, syncWindow, tashkentDay, tashkentMidnightUnix } from "../src/lib/connectors/days";
import { weekSummary } from "../src/lib/connectors/summary";

const TODAY = "2026-11-25";
const row = (day: string, metrics: Record<string, unknown>) => ({ day, metrics });

describe("days on the Tashkent clock", () => {
  it("rolls over at 19:00 UTC and counts inclusive ranges", () => {
    expect(tashkentDay(new Date("2026-11-24T18:59:00Z"))).toBe("2026-11-24");
    expect(tashkentDay(new Date("2026-11-24T19:00:00Z"))).toBe("2026-11-25");
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(daysBetween("2026-11-29", "2026-12-01")).toEqual(["2026-11-29", "2026-11-30", "2026-12-01"]);
    expect(daysBetween("2026-11-30", "2026-11-29")).toEqual([]);
    expect(tashkentMidnightUnix("2026-11-25")).toBe(Date.parse("2026-11-24T19:00:00Z") / 1000);
  });

  it("first sync backfills 28 days; later syncs re-read the settle days and what was missed", () => {
    expect(syncWindow(TODAY, null, 2)).toEqual({ since: "2026-10-28", until: "2026-11-24" });
    expect(syncWindow(TODAY, "2026-11-24", 2)).toEqual({ since: "2026-11-22", until: "2026-11-24" });
    expect(syncWindow(TODAY, "2026-11-25", 7)).toEqual({ since: "2026-11-18", until: "2026-11-24" });
    // Away for two months: capped at the backfill window.
    expect(syncWindow(TODAY, "2026-09-01", 2)).toEqual({ since: "2026-10-28", until: "2026-11-24" });
  });
});

describe("weekSummary", () => {
  it("Instagram: 7-day views and the follower change from daily snapshots", () => {
    const rows = [
      row("2026-11-17", { views: 999 }), // outside the 7 full days
      row("2026-11-18", { views: 100, followers: 2300 }),
      row("2026-11-24", { views: 50 }),
      row("2026-11-25", { followers: 2338 }), // today's snapshot closes the week
    ];
    expect(weekSummary("instagram", rows, TODAY)).toEqual([
      { metric: "views", value: 150 },
      { metric: "followers", value: 38, delta: true },
    ]);
  });

  it("unknown numbers stay null (the card prints —), never 0", () => {
    expect(weekSummary("instagram", [row("2026-11-20", { views: null, followers: 10 })], TODAY)).toEqual([
      { metric: "views", value: null },
      { metric: "followers", value: null, delta: true },
    ]);
    expect(weekSummary("youtube", [], TODAY)).toEqual([
      { metric: "views", value: null },
      { metric: "subscribers", value: null, delta: true },
    ]);
    expect(weekSummary("google_ads", [], TODAY)).toEqual([
      { metric: "cost", value: null },
      { metric: "clicks", value: null },
    ]);
  });

  it("YouTube: views and subscribers gained minus lost", () => {
    const rows = [row("2026-11-20", { views: 1520, subs_gained: 14, subs_lost: 2 }), row("2026-11-21", { views: 1830, subs_gained: 21, subs_lost: 3 })];
    expect(weekSummary("youtube", rows, TODAY)).toEqual([
      { metric: "views", value: 3350 },
      { metric: "subscribers", value: 30, delta: true },
    ]);
  });

  it("Meta ads: spend in the account currency, then messages (or link clicks when there are none)", () => {
    const rows = [row("2026-11-18", { spend: 4.21, currency: "USD", messages_started: 6, link_clicks: 38 }), row("2026-11-19", { spend: 3.1, currency: "USD", link_clicks: 15 })];
    expect(weekSummary("meta_ads", rows, TODAY)).toEqual([
      { metric: "spend", value: 7.31, currency: "USD" },
      { metric: "messages", value: 6 },
    ]);
    const clicks = [row("2026-11-19", { spend: 3.1, currency: "USD", link_clicks: 15, messages_started: null })];
    expect(weekSummary("meta_ads", clicks, TODAY)[1]).toEqual({ metric: "clicks", value: 15 });
  });

  it("Google Ads: cost and clicks", () => {
    expect(weekSummary("google_ads", [row("2026-11-20", { cost: 4.45, currency: "USD", clicks: 60 })], TODAY)).toEqual([
      { metric: "cost", value: 4.45, currency: "USD" },
      { metric: "clicks", value: 60 },
    ]);
  });
});
