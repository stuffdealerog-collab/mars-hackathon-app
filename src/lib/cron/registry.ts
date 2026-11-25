import type { TashkentClock } from "./clock";

/**
 * Typed registry of the work the tick (/api/cron/tick) does.
 *
 * The tick is a thin dispatcher: every ~10 minutes (GitHub Actions) and once a day (Vercel Cron) it takes the lock and
 * runs every registered task in registration order, each inside its own time budget. The tick has no schedule of its
 * own: a task decides whether it has work right now (a due queue row, "Monday after 09:00 Tashkent and not done this
 * week", …) and makes its work idempotent, because a tick can be late, skipped, or arrive twice.
 *
 * How a stream adds a task:
 *   1. export a task from its own module:
 *        export const publishDue = defineCronTask({ name: "publish-due", budgetMs: 60_000, run: async (ctx) => { … } });
 *   2. add one line in src/lib/cron/tasks.ts: `.register(publishDue)`.
 *
 * Rules for a task:
 * - Stop starting new work once `ctx.signal` is aborted or `ctx.timeLeft()` is too small for the next unit. After the
 *   budget the tick stops waiting for the task and moves on; its promise is not killed.
 * - Return counts only (`{ published: 2, failed: 0 }`): never ids, chat names, texts or personal data; anything else is
 *   dropped. Task results go to the database only (cron_locks.last_report) and to the authorised caller: the public
 *   GitHub Actions log prints the tick's totals (ran, failed, skipped, timedOut), never a task's counts.
 * - Throwing is fine: the task is reported as "error" (the message goes to the server log only) and the rest still run.
 */

export interface CronTaskContext {
  /** When this tick started. */
  readonly now: Date;
  /** The same moment on the Tashkent clock (UTC+5), for "Monday 09:00"-style checks. */
  readonly tashkent: TashkentClock;
  /** Aborted when the task's budget runs out: start no new work after that. */
  readonly signal: AbortSignal;
  /** Milliseconds left in this task's budget, never negative. */
  timeLeft(): number;
}

/** What a task did, as counts only, e.g. `{ published: 2, failed: 0 }`. */
export type CronTaskResult = Readonly<Record<string, number>>;

export interface CronTask {
  /** Unique, lowercase kebab-case, 2-48 characters, e.g. "publish-due". */
  readonly name: string;
  /**
   * Wall-clock budget for one run, in ms. The task runs only when its whole budget still fits in the tick, so keep it
   * to what one run really needs; a task with more work does the rest on the next tick.
   */
  readonly budgetMs: number;
  readonly run: (ctx: CronTaskContext) => Promise<CronTaskResult | void>;
}

export const TASK_NAME_RE = /^[a-z][a-z0-9-]{1,47}$/;
/** Smallest budget a task may ask for. */
export const MIN_TASK_BUDGET_MS = 1_000;
/** Time the tick spends on tasks: inside the route's maxDuration (300 s), with room for the lock and the reply. */
export const TICK_BUDGET_MS = 250_000;

/** Typing helper for a task definition. */
export function defineCronTask(task: CronTask): CronTask {
  return task;
}

export class CronRegistry {
  private readonly tasks = new Map<string, CronTask>();

  constructor(private readonly tickBudgetMs: number = TICK_BUDGET_MS) {}

  /** Adds a task; throws on a duplicate or malformed name and on a budget that cannot fit in a tick. */
  register(task: CronTask): this {
    if (!TASK_NAME_RE.test(task.name)) {
      throw new Error(`cron task name "${task.name}" must be lowercase kebab-case (${TASK_NAME_RE})`);
    }
    if (this.tasks.has(task.name)) throw new Error(`cron task "${task.name}" is registered twice`);
    const budget = task.budgetMs;
    if (!Number.isInteger(budget) || budget < MIN_TASK_BUDGET_MS || budget > this.tickBudgetMs) {
      throw new Error(
        `cron task "${task.name}": budget must be a whole number of ms between ${MIN_TASK_BUDGET_MS} and ${this.tickBudgetMs}`,
      );
    }
    this.tasks.set(task.name, task);
    return this;
  }

  get(name: string): CronTask | undefined {
    return this.tasks.get(name);
  }

  /** Tasks in registration order (the order the tick runs them). */
  list(): readonly CronTask[] {
    return [...this.tasks.values()];
  }
}
