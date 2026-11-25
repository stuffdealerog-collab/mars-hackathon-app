import { tashkentClock } from "./clock";
import type { CronTask, CronTaskContext, CronTaskResult } from "./registry";

/**
 * Runs the tick's tasks one after another, each inside its own budget, and returns a summary with counts only.
 * Never throws: a failing task is reported and the next one runs.
 */

export type TaskStatus = "ok" | "error" | "timeout" | "skipped";

export interface TaskReport {
  name: string;
  status: TaskStatus;
  ms: number;
  /** The task's counts (ok only). */
  result?: CronTaskResult;
}

/** Safe to show anywhere (GitHub Actions logs of a public repo): names, statuses, timings and counts only. */
export interface TickReport {
  startedAt: string; // ISO
  ms: number;
  /** Tasks that started (ok + error + timeout). */
  ran: number;
  /** error + timeout. */
  failed: number;
  /** Not started: their budget no longer fitted in the tick. */
  skipped: number;
  /** Still running when the tick stopped waiting for them. */
  timedOut: number;
  tasks: TaskReport[];
}

export interface RunOptions {
  /** Time for all tasks together, in ms. */
  budgetMs: number;
  /** Clock in ms (tests); default Date.now. Budgets are enforced with real timers either way. */
  now?: () => number;
  /** Server-side log for task failures (default console.error). Messages are already masked. */
  log?: (message: string) => void;
}

const RESULT_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const MAX_RESULT_KEYS = 20;

/** Keeps finite numbers under plain keys: a task cannot leak ids or texts into the summary. */
export function countsOnly(value: unknown): CronTaskResult | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, number> = {};
  for (const [key, v] of Object.entries(value)) {
    if (Object.keys(out).length >= MAX_RESULT_KEYS) break;
    if (RESULT_KEY_RE.test(key) && typeof v === "number" && Number.isFinite(v)) out[key] = v;
  }
  return out;
}

/** An error message for the server log, with token-shaped strings masked and the length capped. */
export function maskedMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw
    .replace(/\d{5,}:[A-Za-z0-9_-]{30,}/g, "<token>") // Telegram bot token
    .replace(/\bsk-ant-[A-Za-z0-9_-]+/g, "<key>")
    .replace(/\bBearer\s+\S+/gi, "Bearer <secret>")
    .replace(/postgres(ql)?:\/\/\S+/gi, "<database-url>")
    .slice(0, 300);
}

type Outcome = { kind: "done"; value: unknown } | { kind: "error"; error: unknown } | { kind: "timeout" };

export async function runTasks(tasks: readonly CronTask[], opts: RunOptions): Promise<TickReport> {
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((message: string) => console.error(message));
  const started = now();
  const tickDeadline = started + opts.budgetMs;
  const startedAt = new Date(started);
  const tashkent = tashkentClock(startedAt);
  const reports: TaskReport[] = [];

  for (const task of tasks) {
    if (tickDeadline - now() < task.budgetMs) {
      reports.push({ name: task.name, status: "skipped", ms: 0 });
      continue;
    }
    const taskStart = now();
    const taskDeadline = taskStart + task.budgetMs;
    const controller = new AbortController();
    const ctx: CronTaskContext = {
      now: startedAt,
      tashkent,
      signal: controller.signal,
      timeLeft: () => Math.max(0, taskDeadline - now()),
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<Outcome>((resolve) => {
      timer = setTimeout(() => resolve({ kind: "timeout" }), task.budgetMs);
    });
    // The rejection handler is attached here, so a task that fails after its timeout never becomes unhandled.
    const work: Promise<Outcome> = Promise.resolve()
      .then(() => task.run(ctx))
      .then(
        (value): Outcome => ({ kind: "done", value }),
        (error): Outcome => ({ kind: "error", error }),
      );
    const outcome = await Promise.race([work, timeout]);
    clearTimeout(timer);
    controller.abort();
    const ms = Math.round(now() - taskStart);

    if (outcome.kind === "done") {
      const result = countsOnly(outcome.value);
      reports.push(result ? { name: task.name, status: "ok", ms, result } : { name: task.name, status: "ok", ms });
    } else if (outcome.kind === "error") {
      log(`[cron] task ${task.name} failed: ${maskedMessage(outcome.error)}`);
      reports.push({ name: task.name, status: "error", ms });
    } else {
      log(`[cron] task ${task.name} ran past its ${task.budgetMs} ms budget; not waiting for it`);
      reports.push({ name: task.name, status: "timeout", ms });
    }
  }

  const count = (status: TaskStatus) => reports.filter((r) => r.status === status).length;
  const timedOut = count("timeout");
  const failed = count("error") + timedOut;
  const skipped = count("skipped");
  return {
    startedAt: startedAt.toISOString(),
    ms: Math.round(now() - started),
    ran: reports.length - skipped,
    failed,
    skipped,
    timedOut,
    tasks: reports,
  };
}
