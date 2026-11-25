import { describe, expect, it } from "vitest";
import { reportInputFrom } from "../src/lib/autopilot/report";
import { pickWeekSlots, runWeekly, type WeeklyBrand, type WeeklyDeps, weeklyEligibility, withinCap, withSpend } from "../src/lib/autopilot/weekly";
import { tashkentClock } from "../src/lib/cron/clock";

const MONDAY_10 = Date.parse("2026-11-30T05:00:00Z"); // Monday 10:00 Tashkent
const DAY = 86_400_000;

const brand = (over: Partial<WeeklyBrand> = {}): WeeklyBrand => ({
  id: `b${Math.random().toString(36).slice(2, 8)}`,
  ownerTelegramId: 7,
  channel: "nonvoy",
  autopilot: { on: true, since: "2026-11-20T00:00:00.000Z", trialEndsAt: "2026-11-27T00:00:00.000Z" },
  lastSeenAt: MONDAY_10 - 2 * DAY,
  locale: "uz",
  ...over,
});

function harness(brands: WeeklyBrand[], over: Partial<WeeklyDeps> = {}) {
  const claims = new Map<string, number>();
  const log: string[] = [];
  const deps: WeeklyDeps = {
    now: () => MONDAY_10,
    limits: { capUsd: 4, weekUsd: 0.4, activeDays: 14 },
    brands: async () => brands,
    claim: async (key) => {
      const n = claims.get(key);
      if (n === -1) return 0; // done
      const next = (n ?? 0) + 1;
      claims.set(key, next);
      return next;
    },
    finish: async (key, status) => {
      log.push(`finish ${key.split(":")[0]} ${status}`);
      if (status !== "failed") claims.set(key, -1);
    },
    reportInput: async (b) => ({ locale: b.locale, kind: "sales", from: "2026-11-23", to: "2026-11-29", planned: 3, published: 2 }),
    sendReport: async (b) => {
      log.push(`report ${b.id}`);
      return "sent";
    },
    spentUsd: async () => 1,
    generate: async (b) => {
      log.push(`generate ${b.id}`);
      return 3;
    },
    tell: async (b, what) => {
      log.push(`tell ${b.id} ${what}`);
      return "sent";
    },
    pause: async (id) => void log.push(`pause ${id}`),
    ...over,
  };
  return { deps, log, claims };
}

const ctl = { timeLeft: () => 125_000 };
const clock = (ms: number) => tashkentClock(new Date(ms));

describe("who gets the Monday report and next week's posts", () => {
  it("autopilot on, a channel, the owner seen in the last 14 days", () => {
    expect(weeklyEligibility(brand(), MONDAY_10, 14)).toBe("ok");
    expect(weeklyEligibility(brand({ autopilot: { on: false } }), MONDAY_10, 14)).toBe("off");
    expect(weeklyEligibility(brand({ autopilot: { on: true, paused: "blocked" } }), MONDAY_10, 14)).toBe("paused");
    expect(weeklyEligibility(brand({ channel: null }), MONDAY_10, 14)).toBe("no_channel");
    expect(weeklyEligibility(brand({ lastSeenAt: MONDAY_10 - 14 * DAY }), MONDAY_10, 14)).toBe("ok");
    expect(weeklyEligibility(brand({ lastSeenAt: MONDAY_10 - 14 * DAY - 1 }), MONDAY_10, 14)).toBe("inactive");
    expect(weeklyEligibility(brand({ lastSeenAt: null }), MONDAY_10, 14)).toBe("inactive");
  });

  it("the $4 monthly cap: last 30 days plus next week must fit", () => {
    expect(withinCap(3.6, 0.4, 4)).toBe(true);
    expect(withinCap(3.61, 0.4, 4)).toBe(false);
    expect(withinCap(0, 0.4, 0)).toBe(false);
  });

  it("posts are written for plan items that are not videos, in plan order", () => {
    const items = [
      { day: "2026-12-03", time: "19:00", format: "photo", n: 3 },
      { day: "2026-12-01", time: "12:40", format: "video", n: 1 },
      { day: "2026-12-02", time: "09:00", format: "text", n: 2 },
      { day: "2026-12-05", time: "10:00", format: "photo", n: 5 },
    ];
    expect(pickWeekSlots(items, 2).map((i) => i.n)).toEqual([2, 3]);
  });
});

describe("runWeekly", () => {
  it("does nothing before Monday 09:00 Tashkent", async () => {
    const h = harness([brand()]);
    const early = Date.parse("2026-11-30T03:00:00Z");
    expect(await runWeekly({ ...h.deps, now: () => early }, ctl, clock(early))).toMatchObject({ reports: 0, weeks: 0 });
    expect(h.log).toEqual([]);
  });

  it("sends the report and writes the week once per brand and week, even with overlapping ticks", async () => {
    const b = brand();
    const h = harness([b]);
    const first = await runWeekly(h.deps, ctl, clock(MONDAY_10));
    expect(first).toMatchObject({ reports: 1, weeks: 1, posts: 3 });
    await runWeekly(h.deps, ctl, clock(MONDAY_10));
    expect(h.log.filter((l) => l.startsWith("report"))).toHaveLength(1);
    expect(h.log.filter((l) => l.startsWith("generate"))).toHaveLength(1);
  });

  it("writes posts for one brand per tick while time allows; the next tick does the next one", async () => {
    const a = brand();
    const b = brand();
    let left = 125_000;
    const h = harness([a, b], {
      generate: async () => {
        left = 50_000;
        return 3;
      },
    });
    await runWeekly(h.deps, { timeLeft: () => left }, clock(MONDAY_10));
    expect(h.log.filter((l) => l.startsWith("report"))).toHaveLength(2);
    expect(h.log.filter((l) => l.startsWith("finish week"))).toHaveLength(1);
  });

  it("over the cap: no posts, one message about the limit", async () => {
    const b = brand();
    const h = harness([b], { spentUsd: async () => 3.8 });
    const r = await runWeekly(h.deps, ctl, clock(MONDAY_10));
    expect(r.capped).toBe(1);
    expect(h.log).toContain(`tell ${b.id} cap_reached`);
    expect(h.log.some((l) => l.startsWith("generate"))).toBe(false);
    await runWeekly(h.deps, ctl, clock(MONDAY_10));
    expect(h.log.filter((l) => l.endsWith("cap_reached"))).toHaveLength(1);
  });

  it("an owner away for over 14 days gets one pause message and no report", async () => {
    const b = brand({ lastSeenAt: MONDAY_10 - 20 * DAY });
    const h = harness([b]);
    await runWeekly(h.deps, ctl, clock(MONDAY_10));
    await runWeekly(h.deps, ctl, clock(MONDAY_10 + 7 * DAY));
    expect(h.log.filter((l) => l.endsWith("idle"))).toHaveLength(1);
    expect(h.log.some((l) => l.startsWith("report") || l.startsWith("generate"))).toBe(false);
  });

  it("an owner who blocked the bot: the brand is paused and gets no posts", async () => {
    const b = brand();
    const h = harness([b], { sendReport: async () => "blocked" });
    await runWeekly(h.deps, ctl, clock(MONDAY_10));
    expect(h.log).toContain(`pause ${b.id}`);
    expect(h.log.some((l) => l.startsWith("generate"))).toBe(false);
  });

  it("a failed week is tried again later and the owner is told only after the last try", async () => {
    const b = brand();
    const h = harness([b], {
      generate: async () => {
        throw new Error("ai down");
      },
    });
    await runWeekly(h.deps, ctl, clock(MONDAY_10));
    await runWeekly(h.deps, ctl, clock(MONDAY_10));
    expect(h.log.some((l) => l.endsWith("week_failed"))).toBe(false);
    await runWeekly(h.deps, ctl, clock(MONDAY_10));
    expect(h.log.filter((l) => l.endsWith("week_failed"))).toHaveLength(1);
  });

  it("autopilot off or paused: nothing", async () => {
    const h = harness([brand({ autopilot: { on: false } }), brand({ autopilot: { on: true, paused: "blocked" } })]);
    await runWeekly(h.deps, ctl, clock(MONDAY_10));
    expect(h.log).toEqual([]);
  });
});

describe("the week's Claude spend is written as it happens (withSpend)", () => {
  const ledger = () => {
    const rows: { usd: number; part: string }[] = [];
    return { rows, log: async (usd: number, part: string) => void rows.push({ usd, part }), sum: () => rows.reduce((s, r) => s + r.usd, 0) };
  };

  it("the expected cost is counted before the try starts: a run cut off when the tick stops waiting still counts", async () => {
    const l = ledger();
    let started = false;
    const never = withSpend({
      expectedUsd: 0.4,
      actualUsd: () => 0.25,
      log: l.log,
      run: () => {
        started = true;
        return new Promise<number>(() => {}); // the function is frozen mid-run: no finally ever runs
      },
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(started).toBe(true);
    expect(l.rows).toEqual([{ usd: 0.4, part: "expected" }]);
    void never;
  });

  it("at the end the total is what the calls really cost, cheaper or dearer", async () => {
    for (const actual of [0.12, 0.4, 0.61]) {
      const l = ledger();
      const n = await withSpend({ expectedUsd: 0.4, actualUsd: () => actual, log: l.log, run: async () => 3 });
      expect(n).toBe(3);
      expect(l.sum()).toBeCloseTo(actual, 6);
      expect(l.rows.filter((r) => r.part === "correction")).toHaveLength(actual === 0.4 ? 0 : 1);
    }
  });

  it("a try that throws is settled too, and the error goes on to runWeekly", async () => {
    const l = ledger();
    const run = withSpend({
      expectedUsd: 0.4,
      actualUsd: () => 0.05,
      log: l.log,
      run: async () => {
        throw new Error("ai down");
      },
    });
    await expect(run).rejects.toThrow("ai down");
    expect(l.sum()).toBeCloseTo(0.05, 6);
  });
});

describe("report input from last week's numbers", () => {
  it("averages 72 h views, sums reactions, picks the best post, subscriber change from the first and last day", () => {
    const input = reportInputFrom(
      {
        planned: 3,
        published: [
          { hook: "A", url: "https://t.me/c/1", views72: 400, views: 420, reactions: 3 },
          { hook: "B", url: "https://t.me/c/2", views72: 600, views: 610, reactions: 5 },
          { hook: "C", url: "https://t.me/c/3", views72: null, views: 90, reactions: null },
        ],
        starts: 0,
        hasLinks: true,
        snapshots: [
          { day: "2026-11-22", subscribers: 1000 },
          { day: "2026-11-30", subscribers: 1018 },
        ],
      },
      { locale: "uz", kind: "growth", weekOf: "2026-11-23", thisWeekOf: "2026-11-30", medianViews: 480 },
    );
    expect(input).toEqual({
      locale: "uz",
      kind: "growth",
      from: "2026-11-23",
      to: "2026-11-29",
      planned: 3,
      published: 3,
      views72: { avg: 500, n: 2 },
      medianViews: 480,
      starts: 0,
      subscribers: { now: 1018, delta: 18 },
      reactions: 8,
      best: { hook: "B", views: 600, url: "https://t.me/c/2" },
    });
  });

  it("no tracked links and no starts: no starts line; one snapshot: no subscriber line", () => {
    const input = reportInputFrom(
      { planned: 0, published: [], starts: 0, hasLinks: false, snapshots: [{ day: "2026-11-30", subscribers: 5 }] },
      { locale: "ru", kind: "sales", weekOf: "2026-11-23", thisWeekOf: "2026-11-30" },
    );
    expect(input).toEqual({ locale: "ru", kind: "sales", from: "2026-11-23", to: "2026-11-29", planned: 0, published: 0 });
  });
});
