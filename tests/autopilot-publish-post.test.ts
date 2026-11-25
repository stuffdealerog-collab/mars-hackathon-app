import { beforeEach, describe, expect, it, vi } from "vitest";

// publishPost (src/lib/uslub/publish.ts) against a fake Telegram API and store, driven by the autopilot's queue
// (publish-due.ts): once Telegram has the post, nothing (a failed database write, a retry) may send it again; a send
// cut off mid-way is never resent on its own; a send Telegram refused is safe to try again.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ BOT_USERNAME: "test_bot" }) }));
const repo = vi.hoisted(() => ({ recordPublication: vi.fn(async () => {}) }));
vi.mock("@/lib/autopilot/repo", () => repo);
const tg = vi.hoisted(() => ({ sends: 0, sendError: null as Error | null }));
vi.mock("@/lib/bot", () => ({
  getBot: () => ({
    api: {
      getMe: async () => ({ id: 999 }),
      getChatMember: async () => ({ status: "administrator", can_post_messages: true }),
      sendMessage: async () => {
        tg.sends++;
        if (tg.sendError) throw tg.sendError;
        return { message_id: 42 };
      },
      sendPhoto: async () => {
        throw new Error("no pictures in these tests");
      },
      deleteMessage: async () => true,
    },
  }),
}));
vi.mock("../src/lib/uslub/media/post-image-service", () => ({ publishImageUrl: async () => undefined }));
const st = vi.hoisted(() => ({
  markPublished: vi.fn(async () => {}),
  linkBrandChannel: vi.fn(async () => {}),
}));
const POST = {
  id: "11111111-1111-4111-8111-111111111111",
  brandId: "22222222-2222-4222-8222-222222222222",
  brief: "",
  variants: { uz_latn: "Yangi non har kuni ertalab.", uz_cyrl: "", ru: "", en: "" },
  neuroHits: {},
  humanScore: 90,
  status: "approved" as const,
  slot: { day: "2026-11-30", time: "12:40", goal: "reach" as const, hook: "Yangi non", cta: "" },
  createdAt: "2026-11-29T10:00:00Z",
};
const BRAND = { id: POST.brandId, ownerTelegramId: 7, channel: "nonvoy", source: "custom" };
vi.mock("../src/lib/uslub/store", () => ({
  getPost: async () => POST,
  getBrand: async () => BRAND,
  markPublished: st.markPublished,
  linkBrandChannel: st.linkBrandChannel,
}));

const { GrammyError, HttpError } = await import("grammy");
const { publishPost } = await import("../src/lib/uslub/publish");
const { runPublishDue } = await import("../src/lib/autopilot/publish-due");
const { shownHash } = await import("../src/lib/uslub/botpublish-core");
import type { QueueRow, QueueStatus } from "../src/lib/autopilot/repo";
import type { PostDraft } from "../src/lib/uslub/contract";

const NOW = Date.parse("2026-11-30T07:40:00Z");

/** One tick of the queue with one due row, publishing through the real publishPost. */
async function tick(attempts = 1) {
  const row: QueueRow = {
    postId: POST.id,
    brandId: BRAND.id,
    ownerTelegramId: 7,
    chat: "nonvoy",
    script: "uz_latn",
    dueAt: NOW,
    textHash: shownHash(POST as PostDraft, "uz_latn"),
    status: "sending",
    attempts,
    lastError: null,
    prev: "queued",
  };
  const queue = [row];
  const finished: { status: QueueStatus; error?: string | null }[] = [];
  const told: string[] = [];
  const counts = await runPublishDue(
    {
      now: () => NOW,
      markStaleSending: async () => [],
      expireOverdue: async () => [],
      claimDue: async () => queue.shift() ?? null,
      finish: async (_r, status, error) => void finished.push({ status, error }),
      loadPost: async () => POST as PostDraft,
      loadBrand: async () => BRAND,
      publish: (a) => publishPost(a),
      notifyOwner: async (_r, e) => void told.push(e.kind),
      alertTeam: async () => {},
    },
    { timeLeft: () => 60_000 },
  );
  return { counts, finished, told };
}

beforeEach(() => {
  tg.sends = 0;
  tg.sendError = null;
  st.markPublished.mockReset();
  st.markPublished.mockImplementation(async () => {});
  repo.recordPublication.mockReset();
  repo.recordPublication.mockImplementation(async () => {});
});

describe("publishPost: a post Telegram accepted is never reported as failed", () => {
  it("the database write after the send fails (twice): still ok with the link, and the queue does not send again", async () => {
    st.markPublished.mockImplementation(async () => {
      throw new Error("Neon: connection terminated");
    });
    repo.recordPublication.mockImplementation(async () => {
      throw new Error("Neon: connection terminated");
    });
    const res = await publishPost({ postId: POST.id, script: "uz_latn", chat: "@nonvoy", userId: 7 });
    expect(res).toEqual({ ok: true, status: 200, url: "https://t.me/nonvoy/42" });
    expect(st.markPublished).toHaveBeenCalledTimes(2); // one more try before giving up

    tg.sends = 0;
    const t = await tick();
    expect(tg.sends).toBe(1);
    expect(t.finished).toEqual([{ status: "sent", error: undefined }]);
    expect(t.told).toEqual(["post_out"]);
  });

  it("a network error while sending (not Telegram's answer): no `sent: false`, the queue marks it unknown and never resends", async () => {
    tg.sendError = new HttpError("Network request for 'sendMessage' failed!", new Error("socket hang up"));
    const res = await publishPost({ postId: POST.id, script: "uz_latn", chat: "@nonvoy", userId: 7 });
    expect(res.ok).toBe(false);
    expect(res.sent).toBeUndefined();

    tg.sends = 0;
    const t = await tick();
    expect(tg.sends).toBe(1);
    expect(t.finished).toEqual([{ status: "unknown", error: "unknown" }]);
    expect(t.counts.retried).toBe(0);
    expect(t.told).toEqual(["unknown"]);
  });

  it("Telegram refused the send: `sent: false`, so the queue tries again on the next tick", async () => {
    tg.sendError = new GrammyError(
      "Call to 'sendMessage' failed!",
      { ok: false, error_code: 429, description: "Too Many Requests: retry after 5" },
      "sendMessage",
      {},
    );
    const res = await publishPost({ postId: POST.id, script: "uz_latn", chat: "@nonvoy", userId: 7 });
    expect(res).toMatchObject({ ok: false, status: 502, sent: false });

    const t = await tick();
    expect(t.finished).toEqual([{ status: "queued", error: "retry" }]);
    expect(t.told).toEqual([]);
  });
});
