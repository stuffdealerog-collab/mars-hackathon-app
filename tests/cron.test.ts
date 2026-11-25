import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { tickAuth } = await import("../src/lib/cron/auth");
const { CronRegistry, defineCronTask, MIN_TASK_BUDGET_MS } = await import("../src/lib/cron/registry");
const { runTasks } = await import("../src/lib/cron/run");
const { tashkentClock } = await import("../src/lib/cron/clock");
const { tick } = await import("../src/lib/cron/tick");
const { pgLock, TICK_LOCK } = await import("../src/lib/cron/lock");

type CronTask = import("../src/lib/cron/registry").CronTask;
type LockStore = import("../src/lib/cron/lock").LockStore;
type TickReport = import("../src/lib/cron/run").TickReport;

const SECRET = "s3cret-value-for-tests_0123456789abcdef";
const bearer = (s: string) => `Bearer ${s}`;

/* ------------------------------------------------------------------ auth */

describe("tickAuth", () => {
  it("without CRON_SECRET answers health only, whatever is sent", () => {
    expect(tickAuth(null, undefined)).toBe("health");
    expect(tickAuth(bearer(SECRET), undefined)).toBe("health");
    expect(tickAuth(bearer(SECRET), "   ")).toBe("health");
  });

  it("with CRON_SECRET requires the exact bearer token", () => {
    expect(tickAuth(null, SECRET)).toBe("unauthorized");
    expect(tickAuth("", SECRET)).toBe("unauthorized");
    expect(tickAuth(SECRET, SECRET)).toBe("unauthorized"); // no scheme
    expect(tickAuth(`Basic ${SECRET}`, SECRET)).toBe("unauthorized");
    expect(tickAuth(bearer(SECRET.slice(1)), SECRET)).toBe("unauthorized"); // other length: no throw
    expect(tickAuth(bearer(`${SECRET}x`), SECRET)).toBe("unauthorized");
    expect(tickAuth(bearer(SECRET), SECRET)).toBe("run");
  });

  it("accepts the scheme in any case and trims the configured secret (Vercel Cron sends `Bearer <secret>`)", () => {
    expect(tickAuth(`bearer ${SECRET}`, SECRET)).toBe("run");
    expect(tickAuth(`BEARER  ${SECRET} `, `  ${SECRET}\n`)).toBe("run");
  });
});

/* -------------------------------------------------------------- registry */

const task = (name: string, budgetMs = 2_000, run: CronTask["run"] = async () => ({})) => defineCronTask({ name, budgetMs, run });

describe("CronRegistry", () => {
  it("keeps registration order and looks tasks up by name", () => {
    const reg = new CronRegistry().register(task("b-task")).register(task("a-task"));
    expect(reg.list().map((t) => t.name)).toEqual(["b-task", "a-task"]);
    expect(reg.get("a-task")?.name).toBe("a-task");
    expect(reg.get("missing")).toBeUndefined();
  });

  it("refuses a duplicate name, a bad name and a budget outside the tick", () => {
    const reg = new CronRegistry(60_000).register(task("publish-due"));
    expect(() => reg.register(task("publish-due"))).toThrow(/twice/);
    expect(() => reg.register(task("Publish Due"))).toThrow(/name/);
    expect(() => reg.register(task("x"))).toThrow(/name/);
    expect(() => reg.register(task("too-small", MIN_TASK_BUDGET_MS - 1))).toThrow(/budget/);
    expect(() => reg.register(task("too-big", 60_001))).toThrow(/budget/);
    expect(() => reg.register(task("not-int", 1500.5))).toThrow(/budget/);
    expect(reg.list()).toHaveLength(1);
  });

  it("ships with the heartbeat task only", async () => {
    vi.doMock("@/lib/db", () => ({ getSql: () => async () => [{ "?column?": 1 }] }));
    const { cronRegistry } = await import("../src/lib/cron/tasks");
    expect(cronRegistry.list().map((t) => t.name)).toEqual(["heartbeat"]);
    vi.doUnmock("@/lib/db");
  });
});

/* ----------------------------------------------------------------- clock */

describe("tashkentClock", () => {
  it("is UTC+5 with Monday = 0", () => {
    // 2026-11-29 is a Sunday; 19:30 UTC is already Monday 00:30 in Tashkent.
    expect(tashkentClock(new Date("2026-11-29T19:30:00Z"))).toEqual({ date: "2026-11-30", weekday: 0, hour: 0, minute: 30 });
    expect(tashkentClock(new Date("2026-11-25T04:00:00Z"))).toEqual({ date: "2026-11-25", weekday: 2, hour: 9, minute: 0 });
    expect(tashkentClock(new Date("2026-11-28T18:59:00Z"))).toEqual({ date: "2026-11-28", weekday: 5, hour: 23, minute: 59 });
  });
});

/* ---------------------------------------------------------------- runner */

/** A clock the test moves by hand; timers still use real (short) time. */
function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

describe("runTasks", () => {
  it("runs tasks in order and keeps only numeric counts in the results", async () => {
    const order: string[] = [];
    const tasks = [
      task("first", 2_000, async () => {
        order.push("first");
        return { published: 2, failed: 0 };
      }),
      task("second", 2_000, async () => {
        order.push("second");
        // A task that returns more than counts: only finite numbers with plain keys survive.
        return { sent: 1, chat: "@secret", nan: Number.NaN, "bad key": 3 } as unknown as Record<string, number>;
      }),
      task("third", 2_000, async () => undefined),
    ];
    const report = await runTasks(tasks, { budgetMs: 10_000 });
    expect(order).toEqual(["first", "second"]);
    expect(report.tasks.map((t) => [t.name, t.status])).toEqual([
      ["first", "ok"],
      ["second", "ok"],
      ["third", "ok"],
    ]);
    expect(report.tasks[0].result).toEqual({ published: 2, failed: 0 });
    expect(report.tasks[1].result).toEqual({ sent: 1 });
    expect(report.tasks[2].result).toBeUndefined();
    expect(report).toMatchObject({ ran: 3, failed: 0, skipped: 0, timedOut: 0 });
  });

  it("records a failing task as error, never echoes its message, and runs the rest", async () => {
    const log = vi.fn();
    const tasks = [
      task("boom", 2_000, async () => {
        throw new Error(`bot 123456789:${"A".repeat(35)} refused`); // token-shaped, built at runtime
      }),
      task("sync-throw", 2_000, (() => {
        throw new Error("kaboom right away");
      }) as unknown as CronTask["run"]),
      task("after", 2_000, async () => ({ ok: 1 })),
    ];
    const report = await runTasks(tasks, { budgetMs: 10_000, log });
    expect(report.tasks.map((t) => t.status)).toEqual(["error", "error", "ok"]);
    expect(report.failed).toBe(2);
    expect(JSON.stringify(report)).not.toMatch(/refused|AAAA|kaboom/);
    // The server log gets the message, with anything token-shaped masked.
    expect(log.mock.calls.join(" ")).toMatch(/boom/);
    expect(log.mock.calls.join(" ")).not.toMatch(/AAAAAAAA/);
  });

  it("stops waiting for a task at its budget, aborts its signal and moves on", async () => {
    let signal: AbortSignal | undefined;
    const tasks = [
      task("slow", MIN_TASK_BUDGET_MS, (ctx) => {
        signal = ctx.signal;
        return new Promise(() => {}); // never settles
      }),
      task("next", 2_000, async () => ({ done: 1 })),
    ];
    const report = await runTasks(tasks, { budgetMs: 10_000 });
    expect(report.tasks.map((t) => t.status)).toEqual(["timeout", "ok"]);
    expect(report.timedOut).toBe(1);
    expect(report.failed).toBe(1);
    expect(signal?.aborted).toBe(true);
  });

  it("a rejection after the timeout is swallowed (no unhandled rejection)", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const tasks = [
      task("late-fail", MIN_TASK_BUDGET_MS, () => new Promise((_, reject) => setTimeout(() => reject(new Error("late")), MIN_TASK_BUDGET_MS + 50))),
    ];
    const report = await runTasks(tasks, { budgetMs: 5_000 });
    expect(report.tasks[0].status).toBe("timeout");
    await new Promise((r) => setTimeout(r, 120));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("skips a task when its full budget no longer fits in the tick", async () => {
    const clock = fakeClock();
    const ran: string[] = [];
    const tasks = [
      task("eats-time", 5_000, async () => {
        ran.push("eats-time");
        clock.advance(6_000);
        return {};
      }),
      task("needs-5s", 5_000, async () => {
        ran.push("needs-5s");
        return {};
      }),
      task("needs-3s", 3_000, async () => {
        ran.push("needs-3s");
        return {};
      }),
    ];
    const report = await runTasks(tasks, { budgetMs: 10_000, now: clock.now });
    expect(ran).toEqual(["eats-time", "needs-3s"]);
    expect(report.tasks.map((t) => t.status)).toEqual(["ok", "skipped", "ok"]);
    expect(report.skipped).toBe(1);
  });

  it("gives each task its time left, the tick start and the Tashkent clock", async () => {
    const clock = fakeClock(Date.parse("2026-11-30T04:00:00Z"));
    const seen: { left: number[]; date?: string; hour?: number } = { left: [] };
    const tasks = [
      task("probe", 4_000, async (ctx) => {
        seen.left.push(ctx.timeLeft());
        clock.advance(1_500);
        seen.left.push(ctx.timeLeft());
        clock.advance(10_000);
        seen.left.push(ctx.timeLeft());
        seen.date = ctx.tashkent.date;
        seen.hour = ctx.tashkent.hour;
        expect(ctx.now.toISOString()).toBe("2026-11-30T04:00:00.000Z");
        return {};
      }),
    ];
    await runTasks(tasks, { budgetMs: 10_000, now: clock.now });
    expect(seen.left).toEqual([4_000, 2_500, 0]);
    expect(seen).toMatchObject({ date: "2026-11-30", hour: 9 });
  });
});

/* ------------------------------------------------------------------ tick */

function memoryLock(opts: { busy?: boolean; fail?: unknown } = {}) {
  const calls: { acquire: number; release: { report: TickReport; keepLease: boolean }[] } = { acquire: 0, release: [] };
  const lock: LockStore = {
    async acquire() {
      calls.acquire++;
      if (opts.fail) throw opts.fail;
      return !opts.busy;
    },
    async release(_name, _holder, report, release) {
      calls.release.push({ report, keepLease: release.keepLease });
    },
  };
  return { lock, calls };
}

describe("tick", () => {
  const runSpy = () => vi.fn(async () => ({ n: 1 }));

  it("without CRON_SECRET is a no-op health answer: no lock, no task", async () => {
    const run = runSpy();
    const { lock, calls } = memoryLock();
    const res = await tick({ authorization: bearer(SECRET), secret: undefined, lock, tasks: [task("t-one", 2_000, run)] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, mode: "health" });
    expect(calls.acquire).toBe(0);
    expect(run).not.toHaveBeenCalled();
  });

  it("with CRON_SECRET and a wrong bearer answers 401 before touching the database", async () => {
    const run = runSpy();
    const { lock, calls } = memoryLock();
    const res = await tick({ authorization: bearer("nope"), secret: SECRET, lock, tasks: [task("t-one", 2_000, run)] });
    expect(res.status).toBe(401);
    expect(calls.acquire).toBe(0);
    expect(run).not.toHaveBeenCalled();
  });

  it("answers 503 when the database is not configured", async () => {
    const res = await tick({ authorization: bearer(SECRET), secret: SECRET, lock: null, tasks: [] });
    expect(res).toMatchObject({ status: 503, body: { ok: false, error: "db_not_configured" } });
  });

  it("answers 503 schema_missing when the lock table is not migrated yet", async () => {
    const { lock } = memoryLock({ fail: Object.assign(new Error('relation "cron_locks" does not exist'), { code: "42P01" }) });
    const res = await tick({ authorization: bearer(SECRET), secret: SECRET, lock, tasks: [task("t-one")], log: () => {} });
    expect(res).toMatchObject({ status: 503, body: { ok: false, error: "schema_missing" } });
  });

  it("skips quietly (200) while another tick holds the lock", async () => {
    const run = runSpy();
    const { lock, calls } = memoryLock({ busy: true });
    const res = await tick({ authorization: bearer(SECRET), secret: SECRET, lock, tasks: [task("t-one", 2_000, run)] });
    expect(res).toMatchObject({ status: 200, body: { ok: true, skipped: "busy" } });
    expect(run).not.toHaveBeenCalled();
    expect(calls.release).toHaveLength(0);
  });

  it("runs the tasks under the lock and releases it with the report", async () => {
    const run = runSpy();
    const { lock, calls } = memoryLock();
    const res = await tick({ authorization: bearer(SECRET), secret: SECRET, lock, tasks: [task("t-one", 2_000, run)] });
    expect(run).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, ran: 1, failed: 0, tasks: [{ name: "t-one", status: "ok", result: { n: 1 } }] });
    expect(calls.release).toHaveLength(1);
    expect(calls.release[0].keepLease).toBe(false);
    expect(calls.release[0].report.tasks[0].name).toBe("t-one");
  });

  it("keeps the lease after a timed-out task (it may still be running) and reports ok:false", async () => {
    const { lock, calls } = memoryLock();
    const res = await tick({
      authorization: bearer(SECRET),
      secret: SECRET,
      lock,
      tasks: [task("hangs", MIN_TASK_BUDGET_MS, () => new Promise(() => {}))],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: false, timedOut: 1 });
    expect(calls.release[0].keepLease).toBe(true);
  });

  it("still answers when releasing the lock fails", async () => {
    const lock: LockStore = {
      acquire: async () => true,
      release: async () => {
        throw new Error("network");
      },
    };
    const res = await tick({ authorization: bearer(SECRET), secret: SECRET, lock, tasks: [task("t-one")], log: () => {} });
    expect(res).toMatchObject({ status: 200, body: { ok: true, ran: 1 } });
  });
});

/* ----------------------------------------------------- lock on Postgres */

// cron_locks against a fake table, in the mocked-sql style of publish-claim-sql.test.ts. The fake runs a
// transaction's statements one after another under a mutex (that is what pg_advisory_xact_lock gives), and every
// query answers a few ms later, like a network round trip.
type LockRow = { holder: string; locked_until: number; released_at: number | null; last_report: unknown };

function fakeDb(now: () => number) {
  const rows = new Map<string, LockRow>();
  const seen: string[] = [];
  let chain: Promise<unknown> = Promise.resolve();
  const delay = () => new Promise((r) => setTimeout(r, 2));

  type Query = { q: string; v: unknown[] };
  function exec({ q, v }: Query): unknown[] {
    seen.push(q);
    if (q === "SELECT pg_advisory_xact_lock(?)") return [{}];
    if (q.startsWith("INSERT INTO cron_locks")) {
      const [name, holder, ttlSeconds] = v as [string, string, number];
      const until = now() + ttlSeconds * 1000;
      const row = rows.get(name);
      if (row && row.locked_until > now()) return [];
      rows.set(name, { holder, locked_until: until, released_at: null, last_report: row?.last_report ?? {} });
      return [{ holder }];
    }
    const upd = /^UPDATE cron_locks SET (locked_until = now\(\), released_at = now\(\), )?last_report = \?::jsonb WHERE name = \? AND holder = \?$/.exec(q);
    if (upd) {
      const [report, name, holder] = v as [string, string, string];
      const row = rows.get(name);
      if (!row || row.holder !== holder) return [];
      row.last_report = JSON.parse(report);
      if (upd[1]) {
        row.locked_until = now();
        row.released_at = now();
      }
      return [];
    }
    throw new Error(`unexpected query: ${q}`);
  }

  const sql = (strings: TemplateStringsArray, ...values: unknown[]): Query & PromiseLike<unknown[]> => {
    const query: Query = { q: strings.join("?").replace(/\s+/g, " ").trim(), v: values };
    return { ...query, then: (ok, err) => delay().then(() => exec(query)).then(ok, err) };
  };
  sql.transaction = (queries: Query[]) => {
    const run = chain.then(async () => {
      await delay();
      return queries.map(exec);
    });
    chain = run.catch(() => undefined);
    return run;
  };
  return { sql, rows, seen };
}

describe("pgLock", () => {
  it("of two ticks started together exactly one gets the lock", async () => {
    const db = fakeDb(Date.now);
    const lock = pgLock(db.sql as never);
    const got = await Promise.all([lock.acquire(TICK_LOCK, "a", 330_000), lock.acquire(TICK_LOCK, "b", 330_000)]);
    expect(got.filter(Boolean)).toHaveLength(1);
    expect(db.seen).toContain("SELECT pg_advisory_xact_lock(?)");
  });

  it("is taken again after release, and a lease that ran out can be taken over", async () => {
    let t = Date.now();
    const db = fakeDb(() => t);
    const lock = pgLock(db.sql as never);
    const report = { startedAt: "x", ms: 1, ran: 0, failed: 0, skipped: 0, timedOut: 0, tasks: [] } satisfies TickReport;

    expect(await lock.acquire(TICK_LOCK, "a", 330_000)).toBe(true);
    expect(await lock.acquire(TICK_LOCK, "b", 330_000)).toBe(false);
    // Only the holder can release.
    await lock.release(TICK_LOCK, "b", report, { keepLease: false });
    expect(await lock.acquire(TICK_LOCK, "c", 330_000)).toBe(false);
    await lock.release(TICK_LOCK, "a", report, { keepLease: false });
    expect(db.rows.get(TICK_LOCK)?.last_report).toEqual(report);
    expect(await lock.acquire(TICK_LOCK, "c", 330_000)).toBe(true);

    // c keeps its lease (a task timed out): nobody gets in until the lease runs out.
    await lock.release(TICK_LOCK, "c", report, { keepLease: true });
    expect(await lock.acquire(TICK_LOCK, "d", 330_000)).toBe(false);
    t += 331_000;
    expect(await lock.acquire(TICK_LOCK, "d", 330_000)).toBe(true);
  });
});
