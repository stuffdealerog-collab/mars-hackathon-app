/**
 * Monday, from 09:00 Tashkent: for every brand with the autopilot on and an owner active in the last 14 days,
 * 1) the report on last week (report.ts), once per brand and week;
 * 2) next week's plan and posts (one brand per tick while the tick has time), within the brand's monthly cap.
 * An owner away longer than 14 days gets one "paused" message instead; a brand over its cap gets one "limit"
 * message. Nothing is ever approved or published here: the owner approves the week from the message.
 *
 * Exactly once per brand and week through autopilot_runs claims (`report:<brand>:<week>`, `week:<brand>:<week>`);
 * a run that failed or died is claimed again after 30 minutes, three tries in all.
 * I/O goes through `deps` (src/lib/autopilot/tasks.ts wires the real ones); the rules are unit-tested.
 */
import type { TashkentClock } from "../cron/clock";
import type { Locale } from "../i18n";
import type { AutopilotState, ChannelType, Goal } from "../uslub/contract";
import { buildWeeklyReport, type WeeklyReportInput } from "./report";
import { isoWeek, isReportTime, tashkentDate, weekBounds } from "./time";

const DAY = 86_400_000;

export interface WeeklyBrand {
  id: string;
  ownerTelegramId: number;
  channel: string | null;
  autopilot: AutopilotState;
  channelType?: ChannelType;
  goal?: Goal;
  lastSeenAt: number | null;
  locale: Locale;
}

export interface WeeklyLimits {
  /** Monthly (rolling 30 days) spend cap per brand, USD (AUTOPILOT_BRAND_MONTHLY_USD, default 4). */
  capUsd: number;
  /** What one week of autopilot is expected to cost (plan + posts), USD. */
  weekUsd: number;
  /** Days without the owner before the autopilot pauses (AUTOPILOT_ACTIVE_DAYS, default 14). */
  activeDays: number;
}

export type Eligibility = "ok" | "off" | "paused" | "no_channel" | "inactive";

export function weeklyEligibility(b: Pick<WeeklyBrand, "autopilot" | "channel" | "lastSeenAt">, now: number, activeDays: number): Eligibility {
  if (!b.autopilot.on) return "off";
  if (b.autopilot.paused) return "paused";
  if (!b.channel?.trim()) return "no_channel";
  if (b.lastSeenAt == null || now - b.lastSeenAt > activeDays * DAY) return "inactive";
  return "ok";
}

/** Next week fits in the brand's monthly cap. */
export const withinCap = (spentUsd: number, nextUsd: number, capUsd: number) => spentUsd + nextUsd <= capUsd + 1e-9;

/** The plan items that become posts: not videos (those wait for the owner's own video), in plan order. */
export function pickWeekSlots<T extends { format?: string; day: string; time: string }>(items: readonly T[], n: number): T[] {
  const order = (a: T, b: T) => `${a.day} ${a.time}`.localeCompare(`${b.day} ${b.time}`);
  return items.filter((i) => i.format !== "video").slice().sort(order).slice(0, Math.max(0, n));
}

export type SendResult = "sent" | "blocked" | "failed";

export interface WeeklyDeps {
  now(): number;
  limits: WeeklyLimits;
  brands(): Promise<WeeklyBrand[]>;
  /** Claims a run; returns its attempt number (1, 2, 3), or 0 when it is taken or done. */
  claim(key: string, brandId: string, kind: string): Promise<number>;
  finish(key: string, status: "done" | "failed" | "skipped", detail?: Record<string, number | string>): Promise<void>;
  reportInput(b: WeeklyBrand, bounds: ReturnType<typeof weekBounds>): Promise<WeeklyReportInput>;
  sendReport(b: WeeklyBrand, report: { text: string; askOrders: boolean }, bounds: ReturnType<typeof weekBounds>): Promise<SendResult>;
  spentUsd(brandId: string): Promise<number>;
  /** Writes next week's plan and posts and sends the owner the week to approve; returns how many posts. */
  generate(b: WeeklyBrand, deadline: number): Promise<number>;
  tell(b: WeeklyBrand, what: "cap_reached" | "week_failed" | "idle"): Promise<SendResult>;
  pause(brandId: string): Promise<void>;
}

export interface RunControl {
  signal?: AbortSignal;
  timeLeft(): number;
}

/** A plan (≤45 s) and its posts (≤60 s) must fit in what is left of the task's budget. */
export const GENERATE_MIN_MS = 110_000;
export const MAX_RUN_ATTEMPTS = 3;

export type WeeklyCounts = { reports: number; weeks: number; posts: number; capped: number; idle: number; failed: number };

export async function runWeekly(deps: WeeklyDeps, ctl: RunControl, clock: TashkentClock): Promise<WeeklyCounts> {
  const counts: WeeklyCounts = { reports: 0, weeks: 0, posts: 0, capped: 0, idle: 0, failed: 0 };
  if (!isReportTime(clock)) return counts;
  const now = deps.now();
  const week = isoWeek(now);
  const bounds = weekBounds(now);
  const live = () => !ctl.signal?.aborted;

  const ready: WeeklyBrand[] = [];
  for (const b of await deps.brands()) {
    if (!live() || ctl.timeLeft() < 5_000) break;
    const e = weeklyEligibility(b, now, deps.limits.activeDays);
    if (e === "inactive" && b.lastSeenAt != null) {
      // Once per absence: the key carries the day the owner was last seen.
      const key = `idle:${b.id}:${tashkentDate(b.lastSeenAt)}`;
      if (await deps.claim(key, b.id, "idle")) {
        const r = await deps.tell(b, "idle");
        if (r === "blocked") await deps.pause(b.id);
        await deps.finish(key, "done");
        counts.idle++;
      }
      continue;
    }
    if (e !== "ok") continue;
    ready.push(b);
    const key = `report:${b.id}:${week}`;
    if (!(await deps.claim(key, b.id, "report"))) continue;
    try {
      const report = buildWeeklyReport(await deps.reportInput(b, bounds));
      const r = await deps.sendReport(b, report, bounds);
      if (r === "blocked") {
        await deps.pause(b.id);
        ready.pop();
      }
      await deps.finish(key, r === "failed" ? "failed" : "done");
      if (r === "sent") counts.reports++;
    } catch (err) {
      counts.failed++;
      await deps.finish(key, "failed", { error: err instanceof Error ? err.message.slice(0, 120) : "error" });
    }
  }

  for (const b of ready) {
    if (!live() || ctl.timeLeft() < GENERATE_MIN_MS) break;
    const key = `week:${b.id}:${week}`;
    const attempt = await deps.claim(key, b.id, "week");
    if (!attempt) continue;
    const spent = await deps.spentUsd(b.id).catch(() => 0);
    if (!withinCap(spent, deps.limits.weekUsd, deps.limits.capUsd)) {
      await deps.finish(key, "skipped", { reason: "cap", spentCents: Math.round(spent * 100) });
      await deps.tell(b, "cap_reached");
      counts.capped++;
      continue;
    }
    try {
      const n = await deps.generate(b, deps.now() + ctl.timeLeft() - 5_000);
      await deps.finish(key, n > 0 ? "done" : "failed", { posts: n });
      if (n > 0) {
        counts.weeks++;
        counts.posts += n;
      } else {
        counts.failed++;
        if (attempt >= MAX_RUN_ATTEMPTS) await deps.tell(b, "week_failed");
      }
    } catch (err) {
      counts.failed++;
      await deps.finish(key, "failed", { error: err instanceof Error ? err.message.slice(0, 120) : "error" });
      if (attempt >= MAX_RUN_ATTEMPTS) await deps.tell(b, "week_failed");
    }
  }
  return counts;
}
