/**
 * The autopilot's clock (pure, no I/O): when an approved post goes out, which week a report is about.
 * Tashkent is UTC+5 all year, so a plan slot "2026-11-30 12:40" is 2026-11-30T12:40:00+05:00.
 */
import { tashkentClock, type TashkentClock } from "../cron/clock";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/** Ticks come every ~10 minutes, so a post may go out up to 15 minutes before its slot ("on time" = ±15 min). */
export const DUE_EARLY_MS = 15 * MIN;
/** A queued post more than this late (the ticker was down) is not sent on its own: the owner decides. */
export const LATE_LIMIT_MS = DAY;
/** A slot that passed earlier today goes out this much after the approval… */
export const LATE_TODAY_DELAY_MS = 10 * MIN;
/** …but never from this Tashkent hour on (an evening post at night reads wrong). */
export const LAST_LATE_HOUR = 21;

const DAY_RE = /^(\d{4}-\d{2}-\d{2})/;
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** The slot's moment in ms, or null when the slot has no usable day or time. */
export function slotTime(slot: { day?: string; time?: string } | null | undefined): number | null {
  const day = DAY_RE.exec(slot?.day ?? "")?.[1];
  const m = TIME_RE.exec((slot?.time ?? "").trim());
  if (!day || !m) return null;
  const ms = Date.parse(`${day}T${m[1].padStart(2, "0")}:${m[2]}:00+05:00`);
  return Number.isFinite(ms) ? ms : null;
}

export type DuePlan = { ok: true; dueAt: number; late: boolean } | { ok: false; reason: "no_slot" | "slot_passed" };

/**
 * When a post approved now goes out: at its slot; a slot that passed earlier today, in 10 minutes while it is still
 * day; anything older is left to the owner ("slot_passed").
 */
export function planDue(slot: { day?: string; time?: string } | null | undefined, now: number): DuePlan {
  const at = slotTime(slot);
  if (at == null) return { ok: false, reason: "no_slot" };
  if (at >= now - DUE_EARLY_MS) return { ok: true, dueAt: at, late: false };
  const later = now + LATE_TODAY_DELAY_MS;
  const today = tashkentClock(new Date(now)).date;
  const then = tashkentClock(new Date(later));
  if (tashkentClock(new Date(at)).date === today && then.date === today && then.hour < LAST_LATE_HOUR) {
    return { ok: true, dueAt: later, late: true };
  }
  return { ok: false, reason: "slot_passed" };
}

export type DueState = "wait" | "send" | "expired";

/** What the tick does with a queued post due at `dueAt`. */
export function dueState(dueAt: number, now: number): DueState {
  if (dueAt - now > DUE_EARLY_MS) return "wait";
  if (now - dueAt > LATE_LIMIT_MS) return "expired";
  return "send";
}

export const onTime = (dueAt: number, sentAt: number) => Math.abs(sentAt - dueAt) <= DUE_EARLY_MS;

/** The Tashkent calendar date (YYYY-MM-DD) of a moment. */
export const tashkentDate = (ms: number) => tashkentClock(new Date(ms)).date;

/** ISO week of the Tashkent date, e.g. "2026-W49": the key of the weekly report and the week's posts. */
export function isoWeek(at: Date | number): string {
  const local = new Date((typeof at === "number" ? at : at.getTime()) + 5 * 3600_000);
  const d = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const weekday = (new Date(d).getUTCDay() + 6) % 7; // 0 = Monday
  const thursday = new Date(d + (3 - weekday) * DAY);
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / (7 * DAY)) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

const addDays = (isoDate: string, n: number) => new Date(Date.parse(`${isoDate}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** Last full week before the Monday of `now`: [start, end) in ms, and the Mondays (YYYY-MM-DD) of last and this week. */
export function weekBounds(now: number): { start: number; end: number; weekOf: string; thisWeekOf: string } {
  const c = tashkentClock(new Date(now));
  const thisWeekOf = addDays(c.date, -c.weekday);
  const weekOf = addDays(thisWeekOf, -7);
  const end = Date.parse(`${thisWeekOf}T00:00:00+05:00`);
  return { start: end - 7 * DAY, end, weekOf, thisWeekOf };
}

/** The Monday report and next week's posts: Monday from 09:00 Tashkent. */
export const isReportTime = (c: TashkentClock) => c.weekday === 0 && c.hour >= 9;
