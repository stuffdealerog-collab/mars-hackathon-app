import { describe, expect, it } from "vitest";
import { runWeekMessages, WEEK_MSG_WAIT_MS, type WeekMessageSend, type WeekReadyDeps } from "../src/lib/autopilot/week-ready";

// "Next week's posts are ready" goes out once the week's pictures are done, so the owner approves each post with
// its picture and no picture drawn later changes what was approved (the queue would stop it at its slot).
const NOW = Date.parse("2026-11-30T05:10:00Z");
const MIN = 60_000;

function harness(o: { since?: number; pending?: number | Error; take?: boolean; send?: WeekMessageSend }) {
  const log: string[] = [];
  const deps: WeekReadyDeps = {
    now: () => NOW,
    waiting: async () => [{ key: "week_msg:b1:2026-W49", brandId: "b1", since: o.since ?? NOW - 2 * MIN }],
    pendingPictures: async () => {
      log.push("poll");
      if (o.pending instanceof Error) throw o.pending;
      return o.pending ?? 0;
    },
    take: async () => {
      log.push("take");
      return o.take ?? true;
    },
    send: async () => {
      log.push("send");
      return o.send ?? "sent";
    },
    settle: async (_k, status) => void log.push(`settle ${status}`),
  };
  return { deps, log };
}

const ctl = { timeLeft: () => 15_000 };

describe("the week message waits for the week's pictures", () => {
  it("a picture still being drawn: waits, nothing sent", async () => {
    const h = harness({ pending: 2 });
    expect(await runWeekMessages(h.deps, ctl)).toEqual({ sent: 0, waiting: 1, failed: 0, skipped: 0 });
    expect(h.log).toEqual(["poll"]);
  });

  it("all pictures done (ready or failed): sent once, then done", async () => {
    const h = harness({ pending: 0 });
    expect((await runWeekMessages(h.deps, ctl)).sent).toBe(1);
    expect(h.log).toEqual(["poll", "take", "send", "settle done"]);
  });

  it("after 15 minutes it goes out whatever the pictures do", async () => {
    const h = harness({ since: NOW - WEEK_MSG_WAIT_MS, pending: 3 });
    expect((await runWeekMessages(h.deps, ctl)).sent).toBe(1);
    expect(h.log).toEqual(["take", "send", "settle done"]);
  });

  it("a picture check that fails counts as still drawing (the 15-minute limit still sends it)", async () => {
    const h = harness({ pending: new Error("fal down") });
    expect((await runWeekMessages(h.deps, ctl)).waiting).toBe(1);
    expect(h.log).toEqual(["poll"]);
  });

  it("another tick took it: not sent twice", async () => {
    const h = harness({ take: false });
    await runWeekMessages(h.deps, ctl);
    expect(h.log).toEqual(["poll", "take"]);
  });

  it("Telegram failed: back to waiting for the next tick; nobody to send to: skipped", async () => {
    const failed = harness({ send: "failed" });
    expect((await runWeekMessages(failed.deps, ctl)).failed).toBe(1);
    expect(failed.log.at(-1)).toBe("settle waiting");
    const gone = harness({ send: "gone" });
    expect((await runWeekMessages(gone.deps, ctl)).skipped).toBe(1);
    expect(gone.log.at(-1)).toBe("settle skipped");
  });

  it("stops when the budget runs low", async () => {
    const h = harness({});
    await runWeekMessages(h.deps, { timeLeft: () => 2_000 });
    expect(h.log).toEqual([]);
  });
});
