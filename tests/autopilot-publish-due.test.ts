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

function harness(opts: { posts: PostDraft[]; rows: QueueRow[]; publish?: (a: { postId: string; userId: number; chat: string }) => PublishAttempt; brand?: { ownerTelegramId: number | null; channel?: string } ; stale?: QueueRow[]; overdue?: QueueRow[] }) {
  const queue = [...opts.rows];
  const finished: { postId: string; status: QueueStatus; error?: string | null }[] = [];
  const told: { postId: string; event: OwnerEvent }[] = [];
  const team: string[] = [];
  const sends: { postId: string; userId: number; chat: string }[] = [];
  const deps: PublishDueDeps = {
    now: () => NOW,
    markStaleSending: async () => opts.stale ?? [],
    expireOverdue: async () => opts.overdue ?? [],
    claimDue: async () => queue.shift() ?? null,
    finish: async (row, status, error) => void finished.push({ postId: row.postId, status, error }),
    loadPost: async (id) => opts.posts.find((p) => p.id === id) ?? null,
    loadBrand: async () => opts.brand ?? { ownerTelegramId: OWNER, channel: "nonvoy" },
    publish: async (a) => {
      sends.push({ postId: a.postId, userId: a.userId, chat: a.chat });
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

  it("Telegram errors are retried, then fail with the owner and the team told", async () => {
    const post = makePost();
    const down = () => ({ ok: false, status: 502, error: "Telegram xatosi: Bad Gateway" });
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

  it("a send cut off mid-way is reported as unknown and never resent; an outage-late post expires with a message", async () => {
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
    expect(h.told.map((t) => t.event.kind)).toEqual(["unknown", "expired"]);
    expect(h.team).toEqual(["unknown"]);
  });

  it("stops claiming when the budget runs low", async () => {
    const posts = [makePost(), makePost()];
    const h = harness({ posts, rows: posts.map((p) => rowFor(p)) });
    let left = 26_000;
    await runPublishDue(h.deps, { timeLeft: () => (left -= 6_000) });
    expect(h.sends).toHaveLength(1);
  });
});
