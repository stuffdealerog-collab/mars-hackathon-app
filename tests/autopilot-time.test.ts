import { describe, expect, it } from "vitest";
import { dueState, isoWeek, isReportTime, onTime, planDue, relativeDayWords, slotTime, weekBounds } from "../src/lib/autopilot/time";
import { tashkentClock } from "../src/lib/cron/clock";

const at = (iso: string) => Date.parse(iso);
const MIN = 60_000;

describe("slotTime: a plan slot on the Tashkent clock (UTC+5, no daylight saving)", () => {
  it("reads day + time as +05:00", () => {
    expect(slotTime({ day: "2026-11-30", time: "12:40" })).toBe(at("2026-11-30T07:40:00Z"));
    expect(slotTime({ day: "2026-07-01", time: "9:05" })).toBe(at("2026-07-01T04:05:00Z")); // summer: still +5
    expect(slotTime({ day: "2026-11-30T00:00:00Z", time: "19:00" })).toBe(at("2026-11-30T14:00:00Z"));
  });

  it("no usable day or time -> null", () => {
    expect(slotTime(undefined)).toBeNull();
    expect(slotTime({ day: "", time: "12:00" })).toBeNull();
    expect(slotTime({ day: "dushanba", time: "12:00" })).toBeNull();
    expect(slotTime({ day: "2026-11-30", time: "" })).toBeNull();
    expect(slotTime({ day: "2026-11-30", time: "25:00" })).toBeNull();
  });
});

describe("planDue: when an approved post goes out", () => {
  const now = at("2026-11-30T05:00:00Z"); // Monday 10:00 Tashkent

  it("a future slot goes out at the slot", () => {
    expect(planDue({ day: "2026-11-30", time: "12:40" }, now)).toEqual({ ok: true, dueAt: at("2026-11-30T07:40:00Z"), late: false });
    expect(planDue({ day: "2026-12-02", time: "19:00" }, now)).toEqual({ ok: true, dueAt: at("2026-12-02T14:00:00Z"), late: false });
  });

  it("a slot that passed a few minutes ago still counts as on time", () => {
    expect(planDue({ day: "2026-11-30", time: "09:50" }, now)).toEqual({ ok: true, dueAt: at("2026-11-30T04:50:00Z"), late: false });
  });

  it("a slot that passed earlier today goes out in 10 minutes, while it is still day", () => {
    expect(planDue({ day: "2026-11-30", time: "08:00" }, now)).toEqual({ ok: true, dueAt: now + 10 * MIN, late: true });
  });

  it("a slot that passed in the evening or on an earlier day is not sent", () => {
    const evening = at("2026-11-30T16:00:00Z"); // 21:00 Tashkent
    expect(planDue({ day: "2026-11-30", time: "12:40" }, evening)).toEqual({ ok: false, reason: "slot_passed" });
    expect(planDue({ day: "2026-11-29", time: "19:00" }, now)).toEqual({ ok: false, reason: "slot_passed" });
  });

  it("a post without a slot has no time to go out", () => {
    expect(planDue(undefined, now)).toEqual({ ok: false, reason: "no_slot" });
  });
});

describe("dueState: the ±15 minute window of the tick", () => {
  const due = at("2026-11-30T07:40:00Z");
  it("waits until 15 minutes before the slot, then sends; more than 3 h late expires", () => {
    expect(dueState(due, due - 16 * MIN)).toBe("wait");
    expect(dueState(due, due - 15 * MIN)).toBe("send");
    expect(dueState(due, due + 3 * 3600_000)).toBe("send");
    expect(dueState(due, due + 3 * 3600_000 + 1)).toBe("expired");
    expect(dueState(due, due + 24 * 3600_000)).toBe("expired");
  });

  it("late only by day (07:00–22:00 Tashkent); on time at the owner's own hour whatever it is", () => {
    const nine = at("2026-11-30T16:00:00Z"); // 21:00 Tashkent
    expect(dueState(nine, nine + 50 * MIN)).toBe("send"); // 21:50
    expect(dueState(nine, nine + 60 * MIN)).toBe("expired"); // 22:00, late: not at night
    const lateNight = at("2026-11-30T17:45:00Z"); // 22:45, the owner's slot
    expect(dueState(lateNight, lateNight + 10 * MIN)).toBe("send");
    const early = at("2026-11-30T01:00:00Z"); // 06:00 Tashkent slot
    expect(dueState(early, early + 30 * MIN)).toBe("expired"); // 06:30, late and before 07:00
    expect(dueState(early, early + 70 * MIN)).toBe("send"); // 07:10
  });

  it("'today'/'tomorrow' words matter only when the post goes out on another day than its slot", () => {
    const slot = at("2026-11-30T18:55:00Z"); // Monday 23:55 Tashkent
    const tuesday = at("2026-11-30T19:05:00Z"); // Tuesday 00:05
    expect(relativeDayWords("Bugun 23:59 gacha chegirma, ertaga yangi menyu.", slot, tuesday)).toEqual(["bugun", "ertaga"]);
    expect(relativeDayWords("Скидка только сегодня! Завтрашний день тоже хорош.", slot, tuesday)).toEqual(["сегодня", "завтрашний"]);
    expect(relativeDayWords("Bugun 23:59 gacha chegirma.", slot, slot + 2 * MIN)).toEqual([]);
    expect(relativeDayWords("Bugungi narxlar.", slot, tuesday)).toEqual(["bugungi"]);
    expect(relativeDayWords("Bugunchalik emas.", slot, tuesday)).toEqual([]);
  });

  it("on time = within 15 minutes of the slot", () => {
    expect(onTime(due, due + 14 * MIN)).toBe(true);
    expect(onTime(due, due - 15 * MIN)).toBe(true);
    expect(onTime(due, due + 16 * MIN)).toBe(false);
  });
});

describe("weeks on the Tashkent calendar", () => {
  it("isoWeek uses the Tashkent date", () => {
    expect(isoWeek(at("2026-11-30T05:00:00Z"))).toBe("2026-W49");
    // Sunday 23:30 UTC is already Monday in Tashkent.
    expect(isoWeek(at("2026-11-29T20:30:00Z"))).toBe("2026-W49");
    expect(isoWeek(at("2026-11-29T18:00:00Z"))).toBe("2026-W48");
    expect(isoWeek(at("2027-01-01T05:00:00Z"))).toBe("2026-W53");
  });

  it("weekBounds gives last week, Monday 00:00 to Monday 00:00 Tashkent", () => {
    const b = weekBounds(at("2026-11-30T05:00:00Z"));
    expect(new Date(b.start).toISOString()).toBe("2026-11-22T19:00:00.000Z");
    expect(new Date(b.end).toISOString()).toBe("2026-11-29T19:00:00.000Z");
    expect(b.weekOf).toBe("2026-11-23");
    expect(b.thisWeekOf).toBe("2026-11-30");
  });

  it("the Monday report goes from 09:00 Tashkent on Monday", () => {
    expect(isReportTime(tashkentClock(new Date(at("2026-11-30T03:59:00Z"))))).toBe(false);
    expect(isReportTime(tashkentClock(new Date(at("2026-11-30T04:00:00Z"))))).toBe(true);
    expect(isReportTime(tashkentClock(new Date(at("2026-12-01T04:00:00Z"))))).toBe(false);
  });
});
