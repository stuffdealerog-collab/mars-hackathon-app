import { describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, type OwnerEvent, type PublishAttempt, type PublishDueDeps, runPublishDue } from "../src/lib/autopilot/publish-due";
import type { QueueRow, QueueStatus } from "../src/lib/autopilot/repo";
import { shownHash } from "../src/lib/uslub/botpublish-core";
import type { PostDraft } from "../src/lib/uslub/contract";

const NOW = Date.parse("2026-11-30T07:40:00Z");
const OWNER = 7;

function makePost(over: Partial<PostDraft> = {}): PostDraft {
  return {
    id: crypto.randomUUID(),
    brandId: "b1",
    brief: "",
    variants: { uz_latn: "Yangi non har kuni ertalab.", uz_cyrl: "", ru: "", en: "" },
    neuroHits: {},
    humanScore: 90,
    status: "approved",
    slot: { day: "2026-11-30", time: "12:40", goal: "reach", hook: "Yangi non", cta: "" },
    createdAt: "2026-11-29T10:00:00Z",
    ...over,
  };
}

function rowFor(post: PostDraft, over: Partial<QueueRow> = {}): QueueRow {
  return {
    postId: post.id,
    brandId: "b1",
    ownerTelegramId: OWNER,
    chat: "nonvoy",
    script: "uz_latn",
    dueAt: NOW,
    textHash: shownHash(post, "uz_latn"),
    status: "sending",
    attempts: 1,
    lastError: null,
    prev: "queued",
    ...over,
  };
}

type SendArgs = { postId: string; userId: number; chat: string; textOnly?: boolean; expectedImageUrl: string | null };

function harness(opts: {
  posts: PostDraft[];
  rows: QueueRow[];
  publish?: (a: SendArgs) => PublishAttempt;
  brand?: { ownerTelegramId: number | null; channel?: string };
  stale?: QueueRow[];
  overdue?: QueueRow[];
  now?: number;
}) {
  const queue = [...opts.rows];
  const finished: { postId: string; status: QueueStatus; error?: string | null }[] = [];
  const told: { postId: string; event: OwnerEvent }[] = [];
  const team: string[] = [];
  const sends: { postId: string; userId: number; chat: string; textOnly?: boolean }[] = [];
  const deps: PublishDueDeps = {
    now: () => opts.now ?? NOW,
    markStaleSending: async () => opts.stale ?? [],
    expireOverdue: async () => opts.overdue ?? [],
    claimDue: async () => queue.shift() ?? null,
    finish: async (row, status, error) => void finished.push({ postId: row.postId, status, error }),
    loadPost: async (id) => opts.posts.find((p) => p.id === id) ?? null,
    loadBrand: async () => opts.brand ?? { ownerTelegramId: OWNER, channel: "nonvoy" },
    publish: async (a) => {
      sends.push({ postId: a.postId, userId: a.userId, chat: a.chat, ...(a.textOnly ? { textOnly: true } : {}) });
      return opts.publish?.(a) ?? { ok: true, status: 200, url: `https://t.me/nonvoy/${sends.length}` };
    },
    notifyOwner: async (row, event) => void told.push({ postId: row.postId, event }),
    alertTeam: async (_row, reason) => void team.push(reason),
  };
  return { deps, finished, told, team, sends };
}

const ctl = { timeLeft: () => 60_000 };

describe("publish-due: approved posts go out at their slot, once", () => {
  it("sends with the brand owner as the publisher and tells the owner the post is out", async () => {
    const post = makePost();
    const h = harness({ posts: [post], rows: [rowFor(post)] });
    const counts = await runPublishDue(h.deps, ctl);
    expect(counts.published).toBe(1);
    expect(h.sends).toEqual([{ postId: post.id, userId: OWNER, chat: "@nonvoy" }]);
    expect(h.finished).toEqual([{ postId: post.id, status: "sent", error: undefined }]);
    expect(h.told).toEqual([{ postId: post.id, event: { kind: "post_out", url: "https://t.me/nonvoy/1" } }]);
  });

  it("an already published post ends 'sent' without a second send or message", async () => {
    const post = makePost({ status: "published", publishedUrl: "https://t.me/nonvoy/9" });
    const h = harness({ posts: [post], rows: [rowFor(post)] });
    expect((await runPublishDue(h.deps, ctl)).already).toBe(1);
    expect(h.sends).toEqual([]);
    expect(h.told).toEqual([]);
    expect(h.finished[0].status).toBe("sent");
  });

  it("a publishOnce 'already' (a manual tap won the race) sends no 'post is out'", async () => {
    const post = makePost();
    const h = harness({ posts: [post], rows: [rowFor(post)], publish: () => ({ ok: true, status: 200, url: "https://t.me/nonvoy/3", already: true }) });
    await runPublishDue(h.deps, ctl);
    expect(h.told).toEqual([]);
    expect(h.finished[0].status).toBe("sent");
  });

  it("text edited after the approval: nothing is sent, the owner is asked to approve again", async () => {
    const post = makePost();
    const row = rowFor(post);
    post.variants.uz_latn = "Boshqa matn.";
    const h = harness({ posts: [post], rows: [row] });
    await runPublishDue(h.deps, ctl);
    expect(h.sends).toEqual([]);
    expect(h.finished).toEqual([{ postId: post.id, status: "failed", error: "changed" }]);
    expect(h.told[0].event).toEqual({ kind: "changed" });
  });

  it("a post with a blank is never sent", async () => {
    const post = makePost({ variants: { uz_latn: "Narxi: [narx].", uz_cyrl: "", ru: "", en: "" } });
    const h = harness({ posts: [post], rows: [rowFor(post)] });
    await runPublishDue(h.deps, ctl);
    expect(h.sends).toEqual([]);
    expect(h.told[0].event).toEqual({ kind: "blank", tokens: ["[narx]"] });
  });

  it("the brand changed owner or channel: dropped silently", async () => {
    const post = makePost();
    const h = harness({ posts: [post], rows: [rowFor(post)], brand: { ownerTelegramId: 99, channel: "nonvoy" } });
    expect((await runPublishDue(h.deps, ctl)).dropped).toBe(1);
    expect(h.sends).toEqual([]);
    expect(h.told).toEqual([]);
    const moved = harness({ posts: [post], rows: [rowFor(post)], brand: { ownerTelegramId: OWNER, channel: "boshqa" } });
    expect((await runPublishDue(moved.deps, ctl)).dropped).toBe(1);
  });

  it("bot not admin: blocked, the owner is told once (not again on the retry)", async () => {
    const post = makePost();
    const refuse = () => ({ ok: false, status: 403, error: "Botni kanalga admin qiling va «Yozuvli xabarlar» huquqini bering: https://t.me/x", addAdminUrl: "https://t.me/x" });
    const first = harness({ posts: [post], rows: [rowFor(post)], publish: refuse });
    await runPublishDue(first.deps, ctl);
    expect(first.finished).toEqual([{ postId: post.id, status: "blocked", error: "bot_not_admin" }]);
    expect(first.told.map((t) => t.event.kind)).toEqual(["bot_not_admin"]);
    const retry = harness({ posts: [post], rows: [rowFor(post, { prev: "blocked" })], publish: refuse });
    await runPublishDue(retry.deps, ctl);
    expect(retry.finished[0].status).toBe("blocked");
    expect(retry.told).toEqual([]);
  });

  it("the owner is not an admin with post rights: blocked with that reason", async () => {
    const post = makePost();
    const h = harness({ posts: [post], rows: [rowFor(post)], publish: () => ({ ok: false, status: 403, error: "Siz bu kanalning egasi yoki admini emassiz. / Вы не владелец и не админ этого канала." }) });
    await runPublishDue(h.deps, ctl);
    expect(h.finished[0]).toEqual({ postId: post.id, status: "blocked", error: "owner_not_admin" });
    expect(h.told[0].event.kind).toBe("owner_not_admin");
  });

  it("Telegram refused it (nothing reached the channel): retried, then failed with the owner and the team told", async () => {
    const post = makePost();
    const down = () => ({ ok: false, status: 502, error: "Telegram xatosi: Bad Gateway", sent: false as const });
    const early = harness({ posts: [post], rows: [rowFor(post, { attempts: 1 })], publish: down });
    await runPublishDue(early.deps, ctl);
    expect(early.finished[0].status).toBe("queued");
    expect(early.told).toEqual([]);
    const last = harness({ posts: [post], rows: [rowFor(post, { attempts: MAX_ATTEMPTS })], publish: down });
    await runPublishDue(last.deps, ctl);
    expect(last.finished[0]).toEqual({ postId: post.id, status: "failed", error: "failed" });
    expect(last.told[0].event.kind).toBe("failed");
    expect(last.team).toHaveLength(1);
  });

  it("a manual tap sending it right now: back to the queue, looked at next tick", async () => {
    const post = makePost();
    const h = harness({ posts: [post], rows: [rowFor(post)], publish: () => ({ ok: false, status: 409, inProgress: true }) });
    await runPublishDue(h.deps, ctl);
    expect(h.finished[0].status).toBe("queued");
  });

  it("a 409 (changed in the last moment) is a re-approval, not a retry", async () => {
    const post = makePost();
    const h = harness({ posts: [post], rows: [rowFor(post)], publish: () => ({ ok: false, status: 409, error: "Post matni o‘zgargan." }) });
    await runPublishDue(h.deps, ctl);
    expect(h.finished[0]).toEqual({ postId: post.id, status: "failed", error: "changed" });
  });

  it("a send cut off mid-way is reported as unknown and never resent; a post 3 hours late expires with a message", async () => {
    const post = makePost();
    const h = harness({
      posts: [post],
      rows: [],
      stale: [rowFor(post, { status: "unknown" })],
      overdue: [rowFor(post, { status: "expired", prev: "queued" }), rowFor(post, { status: "expired", prev: "blocked" })],
    });
    const counts = await runPublishDue(h.deps, ctl);
    expect(counts).toMatchObject({ unknown: 1, expired: 2 });
    expect(h.sends).toEqual([]);
    // A blocked post was promised to go out once the rights were fixed, so its expiry is news too.
    expect(h.told.map((t) => t.event.kind)).toEqual(["unknown", "expired", "expired"]);
    expect(h.team).toEqual(["unknown"]);
  });

  it("a send cut off after the post went out: 'sent' with 'post is out', no 'check the channel'", async () => {
    const post = makePost({ status: "published", publishedUrl: "https://t.me/nonvoy/77" });
    const h = harness({ posts: [post], rows: [], stale: [rowFor(post, { status: "unknown" })] });
    const counts = await runPublishDue(h.deps, ctl);
    expect(counts).toMatchObject({ unknown: 0, already: 1 });
    expect(h.finished).toEqual([{ postId: post.id, status: "sent", error: undefined }]);
    expect(h.told).toEqual([{ postId: post.id, event: { kind: "post_out", url: "https://t.me/nonvoy/77" } }]);
    expect(h.team).toEqual([]);
  });

  it("a failure that may have reached the channel (no `sent: false`) is 'unknown' and never retried", async () => {
    const post = makePost();
    // publishPost's answer to a network error or timeout while sending: the post may be in the channel.
    const cut = harness({ posts: [post], rows: [rowFor(post, { attempts: 1 })], publish: () => ({ ok: false, status: 502, error: "Telegramga yuborib bo‘lmadi" }) });
    const counts = await runPublishDue(cut.deps, ctl);
    expect(counts).toMatchObject({ unknown: 1, retried: 0 });
    expect(cut.finished).toEqual([{ postId: post.id, status: "unknown", error: "unknown" }]);
    expect(cut.told.map((t) => t.event.kind)).toEqual(["unknown"]);
    expect(cut.team).toHaveLength(1);
    expect(cut.sends).toHaveLength(1);

    const threw = harness({
      posts: [post],
      rows: [rowFor(post, { attempts: 1 })],
      publish: () => {
        throw new Error("socket hang up");
      },
    });
    await runPublishDue(threw.deps, ctl);
    expect(threw.finished).toEqual([{ postId: post.id, status: "unknown", error: "unknown" }]);
    expect(threw.told.map((t) => t.event.kind)).toEqual(["unknown"]);
  });

  it("approved without a picture, a picture drawn later: the approved text goes out alone", async () => {
    const post = makePost();
    const row = rowFor(post); // approved with no picture
    post.image = { status: "ready", url: "https://v3.fal.media/files/p.png", refsUsed: 0 };
    const h = harness({ posts: [post], rows: [row] });
    expect((await runPublishDue(h.deps, ctl)).published).toBe(1);
    expect(h.sends).toEqual([{ postId: post.id, userId: OWNER, chat: "@nonvoy", textOnly: true }]);
    expect(h.finished[0].status).toBe("sent");
    expect(h.told[0].event.kind).toBe("post_out");
  });

  it("approved with a picture that was replaced since: stopped as changed", async () => {
    const post = makePost({ image: { status: "ready", url: "https://v3.fal.media/files/a.png", refsUsed: 0 } });
    const row = rowFor(post);
    post.image = { status: "ready", url: "https://v3.fal.media/files/b.png", refsUsed: 0 };
    const h = harness({ posts: [post], rows: [row] });
    await runPublishDue(h.deps, ctl);
    expect(h.sends).toEqual([]);
    expect(h.finished[0]).toEqual({ postId: post.id, status: "failed", error: "changed" });
  });

  it("more than 3 hours late, or late at night: stopped as expired, the owner told", async () => {
    const post = makePost();
    const HOUR = 3600_000;
    const tooLate = harness({ posts: [post], rows: [rowFor(post, { dueAt: NOW - 3 * HOUR - 60_000 })] });
    expect((await runPublishDue(tooLate.deps, ctl)).expired).toBe(1);
    expect(tooLate.sends).toEqual([]);
    expect(tooLate.finished[0]).toEqual({ postId: post.id, status: "expired", error: "expired" });
    expect(tooLate.told[0].event.kind).toBe("expired");

    // 21:00 Tashkent slot, the tick only gets to it at 22:30: an evening post at night is not sent.
    const at2230 = Date.parse("2026-11-30T17:30:00Z");
    const night = harness({ posts: [post], rows: [rowFor(post, { dueAt: Date.parse("2026-11-30T16:00:00Z") })], now: at2230 });
    expect((await runPublishDue(night.deps, ctl)).expired).toBe(1);
    expect(night.sends).toEqual([]);

    // The owner's own 22:30 slot, on time: it goes out.
    const own = harness({ posts: [post], rows: [rowFor(post, { dueAt: at2230 })], now: at2230 });
    expect((await runPublishDue(own.deps, ctl)).published).toBe(1);

    // 2 hours late in the afternoon: still sent.
    const late = harness({ posts: [post], rows: [rowFor(post, { dueAt: NOW - 2 * HOUR })] });
    expect((await runPublishDue(late.deps, ctl)).published).toBe(1);
  });

  it("going out on another day than its slot: a text that says 'today' or names a past date is stopped", async () => {
    // Slot Monday 23:55 Tashkent, sent Tuesday 00:05 (on time, but the day changed).
    const due = Date.parse("2026-11-30T18:55:00Z");
    const at = Date.parse("2026-11-30T19:05:00Z");
    const today = makePost({ variants: { uz_latn: "Bugun soat 23:59 gacha chegirma!", uz_cyrl: "", ru: "", en: "" } });
    const h = harness({ posts: [today], rows: [rowFor(today, { dueAt: due })], now: at });
    await runPublishDue(h.deps, ctl);
    expect(h.sends).toEqual([]);
    expect(h.finished[0]).toEqual({ postId: today.id, status: "failed", error: "past_date" });
    expect(h.told[0].event).toEqual({ kind: "past_date", dates: ["bugun"] });

    const plain = makePost();
    const ok = harness({ posts: [plain], rows: [rowFor(plain, { dueAt: due })], now: at });
    expect((await runPublishDue(ok.deps, ctl)).published).toBe(1);

    // The same "today" on the slot's own day is fine.
    const sameDay = harness({ posts: [today], rows: [rowFor(today)] });
    expect((await runPublishDue(sameDay.deps, ctl)).published).toBe(1);
  });

  it("stops claiming when the budget runs low", async () => {
    const posts = [makePost(), makePost()];
    const h = harness({ posts, rows: posts.map((p) => rowFor(p)) });
    let left = 26_000;
    await runPublishDue(h.deps, { timeLeft: () => (left -= 6_000) });
    expect(h.sends).toHaveLength(1);
  });
});
