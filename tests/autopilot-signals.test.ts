import { describe, expect, it } from "vitest";
import { chatKey, median, memberChange, metricPatch, reactionTotals, runMetrics, runSnapshots, typicalViews } from "../src/lib/autopilot/signals";

const H = 3600_000;
const ctl = { timeLeft: () => 60_000 };

describe("chat_member: joins and leaves", () => {
  it("counts only real membership changes", () => {
    expect(memberChange({ status: "left" }, { status: "member" })).toBe("join");
    expect(memberChange({ status: "kicked" }, { status: "member" })).toBe("join");
    expect(memberChange({ status: "member" }, { status: "left" })).toBe("leave");
    expect(memberChange({ status: "member" }, { status: "kicked" })).toBe("leave");
    expect(memberChange({ status: "member" }, { status: "administrator" })).toBeNull();
    expect(memberChange({ status: "restricted", is_member: true }, { status: "restricted", is_member: false })).toBe("leave");
    expect(memberChange({ status: "left" }, { status: "left" })).toBeNull();
  });

  it("a channel key is its username in lowercase, else its id", () => {
    expect(chatKey({ id: -1001, username: "NonVoy" })).toBe("nonvoy");
    expect(chatKey({ id: -1001 })).toBe("-1001");
  });
});

describe("message_reaction_count", () => {
  it("totals reactions and keeps a count per reaction", () => {
    expect(
      reactionTotals([
        { type: { type: "emoji", emoji: "👍" }, total_count: 3 },
        { type: { type: "custom_emoji", custom_emoji_id: "77" }, total_count: 2 },
        { type: { type: "paid" }, total_count: 1 },
      ]),
    ).toEqual({ total: 6, counts: { "👍": 3, "custom:77": 2, paid: 1 } });
    expect(reactionTotals([])).toEqual({ total: 0, counts: {} });
  });
});

describe("24 h and 72 h views", () => {
  const pub = Date.parse("2026-11-25T10:00:00Z");
  const row = { publishedAt: pub, views24h: null, views72h: null };

  it("stores the 24 h reading 24–48 h after, the 72 h reading 72–120 h after, and the latest views always", () => {
    expect(metricPatch(row, 300, pub + 23 * H)).toEqual({ views: 300 });
    expect(metricPatch(row, 310, pub + 25 * H)).toEqual({ views: 310, views24h: 310 });
    expect(metricPatch(row, 400, pub + 49 * H)).toEqual({ views: 400 });
    expect(metricPatch({ ...row, views24h: 310 }, 520, pub + 73 * H)).toEqual({ views: 520, views72h: 520 });
    expect(metricPatch({ ...row, views24h: 310, views72h: 520 }, 600, pub + 100 * H)).toEqual({ views: 600 });
  });

  it("the channel's typical post: median of posts at least 72 h old (forwards left out), from 3 posts", () => {
    const now = Date.parse("2026-11-30T05:00:00Z");
    const at = (h: number) => new Date(now - h * H).toISOString();
    expect(typicalViews([{ postedAt: at(80), views: 100 }, { postedAt: at(90), views: 300 }, { postedAt: at(100), views: 200 }, { postedAt: at(10), views: 9_000 }], now)).toBe(200);
    expect(typicalViews([{ postedAt: at(80), views: 100 }, { postedAt: at(90), views: 300, isForward: true }, { postedAt: at(100), views: 200 }], now)).toBeUndefined();
    expect(median([4, 1, 3, 2])).toBe(3);
    expect(median([])).toBeUndefined();
  });

  it("reads each channel's page once, stores what it finds, and backs off from what it did not find", async () => {
    const saved: unknown[] = [];
    const reads: string[] = [];
    const tried: unknown[] = [];
    const now = pub + 25 * H;
    const r = await runMetrics(
      {
        now: () => now,
        due: async () => [
          { channel: "nonvoy", messageId: 41, publishedAt: pub, views24h: null, views72h: null },
          { channel: "nonvoy", messageId: 42, publishedAt: pub, views24h: null, views72h: null },
          { channel: "-1009", messageId: 5, publishedAt: pub, views24h: null, views72h: null },
        ],
        channelPosts: async (c) => {
          reads.push(c);
          return [{ id: 41, views: 120 }];
        },
        save: async (channel, messageId, v) => void saved.push({ channel, messageId, v }),
        tried: async (channel, ids) => void tried.push({ channel, ids }),
      },
      ctl,
    );
    expect(reads).toEqual(["nonvoy"]);
    expect(saved).toEqual([{ channel: "nonvoy", messageId: 41, v: { views: 120, views24h: 120 } }]);
    expect(r).toEqual({ measured: 1, notFound: 1, channels: 1 });
    // The post missing from the page waits an hour (repo.ts metricsDue skips it), not the next 10-minute tick.
    expect(tried).toEqual([{ channel: "nonvoy", ids: [42] }]);
  });

  it("a page that does not load backs off every post of that channel", async () => {
    const tried: unknown[] = [];
    await runMetrics(
      {
        now: () => pub + 25 * H,
        due: async () => [
          { channel: "nonvoy", messageId: 41, publishedAt: pub, views24h: null, views72h: null },
          { channel: "nonvoy", messageId: 42, publishedAt: pub, views24h: null, views72h: null },
        ],
        channelPosts: async () => {
          throw new Error("429");
        },
        save: async () => {},
        tried: async (channel, ids) => void tried.push({ channel, ids }),
      },
      ctl,
    );
    expect(tried).toEqual([{ channel: "nonvoy", ids: [41, 42] }]);
  });
});

describe("daily subscriber counts", () => {
  it("uses getChatMemberCount, falls back to the public page, skips a channel with neither", async () => {
    const saved: unknown[] = [];
    const tried: string[] = [];
    const r = await runSnapshots(
      {
        today: "2026-11-30",
        channels: async () => ["a_chan", "b_chan", "c_chan"],
        memberCount: async (c) => (c === "a_chan" ? 1520 : null),
        scrapeCount: async (c) => (c === "b_chan" ? 300 : null),
        save: async (...args) => void saved.push(args),
        tried: async (c) => void tried.push(c),
      },
      ctl,
    );
    expect(saved).toEqual([
      ["a_chan", "2026-11-30", 1520, "bot"],
      ["b_chan", "2026-11-30", 300, "scrape"],
    ]);
    expect(r).toEqual({ saved: 2, missing: 1 });
    // The channel with no count is left alone for an hour (repo.ts channelsForSnapshot), not fetched every tick.
    expect(tried).toEqual(["c_chan"]);
  });

  it("a failing call never stops the others", async () => {
    const saved: string[] = [];
    await runSnapshots(
      {
        today: "2026-11-30",
        channels: async () => ["x_chan", "y_chan"],
        memberCount: async (c) => {
          if (c === "x_chan") throw new Error("network");
          return 10;
        },
        scrapeCount: async () => {
          throw new Error("down");
        },
        save: async (c) => void saved.push(c),
        tried: async () => {},
      },
      ctl,
    );
    expect(saved).toEqual(["y_chan"]);
  });
});
