import { beforeEach, describe, expect, it, vi } from "vitest";

// Publishing at most once per post (publish-once.ts + store.ts claimPublish), against the in-memory store.
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => { throw new Error("outside a request"); } }));
vi.mock("@/lib/db", () => ({ isDbConfigured: () => false, getSql: () => { throw new Error("no db in tests"); } }));
vi.mock("@/lib/track", () => ({ safeLogEvent: async () => {} }));
vi.mock("@/lib/i18n", async () => await import("../src/lib/i18n"));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ TELEGRAM_BOT_TOKEN: "123:test" }), getPublicUrl: () => undefined }));
// An "x-test-user: <id>" header stands for a valid Telegram session of that user.
vi.mock("@/lib/telegram-auth", () => ({
  authenticateRequest: (req: Request) => (req.headers.get("x-test-user") ? { id: Number(req.headers.get("x-test-user")) } : null),
  validateInitData: () => ({ ok: false }),
}));
// The route imports engine modules through "@/lib/uslub/…": point them at the same files the test uses.
vi.mock("@/lib/uslub/http", async () => await import("../src/lib/uslub/http"));
vi.mock("@/lib/uslub/store", async () => await import("../src/lib/uslub/store"));
vi.mock("@/lib/uslub/context", async () => await import("../src/lib/uslub/context"));
vi.mock("@/lib/uslub/errors", async () => await import("../src/lib/uslub/errors"));
vi.mock("@/lib/uslub/publish-errors", async () => await import("../src/lib/uslub/publish-errors"));
vi.mock("@/lib/uslub/placeholders", async () => await import("../src/lib/uslub/placeholders"));
vi.mock("@/lib/uslub/publish-once", async () => await import("../src/lib/uslub/publish-once"));
vi.mock("../src/lib/uslub/brand", () => ({ buildBrand: async () => { throw new Error("not in these tests"); } }));
vi.mock("../src/lib/uslub/copywriter", () => ({ generatePosts: async () => [] }));

// A fake send: refuses anyone but the brand's owner (as publishPost does), can be held open with `hold`, and marks
// the post published like the real one. Every call that gets this far would put a message in the channel.
let gate: Promise<void> | null = null;
let sentCount = 0;
const publishPost = vi.fn(async (a: { postId: string; chat: string; userId: number | null }) => {
  const post = await store.getPost(a.postId);
  const brand = post ? await store.getBrand(post.brandId) : null;
  if (!brand || brand.ownerTelegramId !== a.userId) return { ok: false, status: 403, error: "Bu brend boshqa foydalanuvchiga tegishli" };
  if (gate) await gate;
  const url = `https://t.me/${a.chat.replace("@", "")}/${++sentCount}`;
  await store.markPublished(a.postId, url, a.chat, a.userId as number);
  return { ok: true, status: 200, url };
});
vi.mock("../src/lib/uslub/publish", () => ({ publishPost, addBotAsAdminLink: () => "https://t.me/test_bot?startchannel&admin=post_messages" }));
vi.mock("@/lib/uslub/publish", () => ({ publishPost, addBotAsAdminLink: () => "https://t.me/test_bot?startchannel&admin=post_messages" }));

const store = await import("../src/lib/uslub/store");
const { publishOnce } = await import("../src/lib/uslub/publish-once");
const { publishFromButton } = await import("../src/lib/uslub/botpublish");
const { publishFromBot } = await import("../src/lib/uslub/onboard");
const { shownHash } = await import("../src/lib/uslub/botpublish-core");
const publishRoute = await import("../src/app/api/uslub/publish/route");
import type { BrandDNA, PostDraft } from "../src/lib/uslub/contract";

const OWNER = 7;

/** Holds every send until the returned function is called. */
function hold(): () => void {
  let open = () => {};
  gate = new Promise<void>((r) => (open = r));
  return () => {
    gate = null;
    open();
  };
}

async function approvedPost(owner: number | null = OWNER) {
  const dna = { name: "Tort", languages: ["uz_latn"] } as unknown as BrandDNA;
  const brand = await store.saveBrand({ channel: "tortlar_uz", knowledge: "Uyda tort pishiraman.", samplePosts: [], dna, mode: "channel" }, owner, "custom");
  const post: PostDraft = {
    id: crypto.randomUUID(),
    brandId: brand.id,
    brief: "b",
    variants: { uz_latn: "Bento-tort 150 000 so‘mdan.", uz_cyrl: "Бенто-торт 150 000 сўмдан.", ru: "Бенто-торт от 150 000 сум.", en: "Bento cake from 150,000 sum." },
    neuroHits: {},
    humanScore: 90,
    status: "approved",
    createdAt: new Date().toISOString(),
  };
  await store.savePosts([post]);
  return post;
}

const args = (post: PostDraft, userId: number | null = OWNER) => ({ postId: post.id, script: "uz_latn" as const, chat: "@tortlar_uz", userId });
const tick = () => new Promise((r) => setTimeout(r, 5));

beforeEach(() => {
  publishPost.mockClear();
  gate = null;
});

describe("publishOnce: a post goes to the channel at most once", () => {
  it("a second publish answers { ok, url, already } with the first link and sends nothing", async () => {
    const post = await approvedPost();
    const first = await publishOnce(args(post));
    expect(first.ok).toBe(true);
    expect(first.already).toBeUndefined();
    const again = await publishOnce(args(post));
    expect(again).toMatchObject({ ok: true, url: first.url, already: true });
    expect(publishPost).toHaveBeenCalledTimes(1);
    expect((await store.getPost(post.id))?.status).toBe("published");
  });

  it("two taps at once send once: the second is told it is in progress, or waits and gets the same link", async () => {
    const post = await approvedPost();
    const open = hold();
    const first = publishOnce(args(post));
    await tick();
    // While it is being sent the post still reads as approved (the contract's statuses are unchanged).
    expect((await store.getPost(post.id))?.status).toBe("approved");
    expect(await publishOnce(args(post))).toMatchObject({ ok: false, status: 409, inProgress: true });
    const waiting = publishOnce(args(post), { waitMs: 2000, pollMs: 10 });
    await tick();
    open();
    const [a, b] = await Promise.all([first, waiting]);
    expect(a).toMatchObject({ ok: true });
    expect(b).toMatchObject({ ok: true, url: a.url, already: true });
    expect(publishPost).toHaveBeenCalledTimes(1);
  });

  it("a failed send releases the claim, so the owner can try again", async () => {
    const post = await approvedPost();
    publishPost.mockImplementationOnce(async () => ({ ok: false, status: 502, error: "Telegramga yuborib bo‘lmadi" }));
    expect((await publishOnce(args(post))).ok).toBe(false);
    expect((await store.getPost(post.id))?.status).toBe("approved");
    const retry = await publishOnce(args(post));
    expect(retry.ok).toBe(true);
    expect(retry.already).toBeUndefined();
    expect(publishPost).toHaveBeenCalledTimes(2);
  });

  it("a send that throws releases the claim too", async () => {
    const post = await approvedPost();
    publishPost.mockImplementationOnce(async () => { throw new Error("boom"); });
    await expect(publishOnce(args(post))).rejects.toThrow("boom");
    expect((await publishOnce(args(post))).ok).toBe(true);
  });

  it("a claim left by a call that died mid-send expires; a fresh one does not", async () => {
    const post = await approvedPost();
    const stale = await store.claimPublish(post.id, Date.now() - store.PUBLISH_CLAIM_STALE_MS - 1000);
    expect(stale.kind).toBe("claimed");
    expect((await publishOnce(args(post))).ok).toBe(true);

    const other = await approvedPost();
    expect((await store.claimPublish(other.id)).kind).toBe("claimed");
    expect(await publishOnce(args(other))).toMatchObject({ ok: false, inProgress: true });
    expect(publishPost).toHaveBeenCalledTimes(1);
  });

  it("someone else never hears 'already' or gets the link", async () => {
    const post = await approvedPost();
    await publishOnce(args(post));
    const stranger = await publishOnce(args(post, 8));
    expect(stranger.ok).toBe(false);
    expect(stranger.url).toBeUndefined();
    expect(stranger.already).toBeUndefined();
  });

  it("reads a stored claim as the status it replaced", () => {
    expect(store.contractStatus("publishing:approved:1764000000000")).toBe("approved");
    expect(store.contractStatus("publishing:draft:1764000000000")).toBe("draft");
    expect(store.contractStatus("published")).toBe("published");
  });
});

describe("POST /api/uslub/publish is idempotent", () => {
  const post = (body: object, user = OWNER) =>
    publishRoute.POST(new Request("http://x/api/uslub/publish", { method: "POST", headers: { "Content-Type": "application/json", "x-test-user": String(user) }, body: JSON.stringify(body) }));
  type Body = { ok: boolean; url?: string; already?: boolean; code?: string };

  it("a repeat tap (the Mini App lost the answer) gets { ok, url, already: true } and nothing is sent again", async () => {
    const p = await approvedPost();
    const first = (await (await post({ postId: p.id, script: "uz_latn", chat: "@tortlar_uz" })).json()) as Body;
    const res = await post({ postId: p.id, script: "ru", chat: "@tortlar_uz" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, url: first.url, already: true });
    expect(publishPost).toHaveBeenCalledTimes(1);
  });

  it("a tap while the first send is still running waits for it and gets the same link", async () => {
    const p = await approvedPost();
    const open = hold();
    const both = Promise.all([post({ postId: p.id, script: "uz_latn", chat: "@tortlar_uz" }), post({ postId: p.id, script: "uz_latn", chat: "@tortlar_uz" })]);
    await tick();
    open();
    const bodies = (await Promise.all((await both).map((r) => r.json()))) as Body[];
    expect(bodies.every((b) => b.ok)).toBe(true);
    expect(bodies[0].url).toBe(bodies[1].url);
    expect(bodies.filter((b) => b.already)).toHaveLength(1);
    expect(publishPost).toHaveBeenCalledTimes(1);
  });
});

describe("bot buttons publish once", () => {
  function fakeApi() {
    const sent: string[] = [];
    return { sent, api: { sendMessage: async (_c: number, text: string) => (sent.push(text), { message_id: sent.length }) } as never };
  }

  it("“Kanalga joylash” pressed twice (or delivered twice by Telegram) sends once and reports once", async () => {
    const p = await approvedPost();
    const { api, sent } = fakeApi();
    const hash = shownHash(p, "uz_latn");
    const open = hold();
    const first = publishFromButton(api, OWNER, { id: OWNER }, "uz", p.id, "uz_latn", hash);
    await tick();
    await publishFromButton(api, OWNER, { id: OWNER }, "uz", p.id, "uz_latn", hash);
    open();
    await first;
    expect(publishPost).toHaveBeenCalledTimes(1);
    expect(sent).toEqual([expect.stringMatching(/^✅ Kanalga joylandi: https:\/\/t\.me\/tortlar_uz\/\d+$/)]);
    await publishFromButton(api, OWNER, { id: OWNER }, "ru", p.id, "uz_latn", hash);
    expect(sent[1]).toMatch(/^Этот пост уже в канале: https:\/\/t\.me\/tortlar_uz\/\d+$/);
    expect(publishPost).toHaveBeenCalledTimes(1);
  });

  it("the onboarding “📢” button: a second press while sending says nothing, a later one says it is already there", async () => {
    const p = await approvedPost();
    const open = hold();
    const first = publishFromBot(p.id, OWNER, "uz");
    await tick();
    expect(await publishFromBot(p.id, OWNER, "uz")).toBeNull();
    open();
    expect((await first)?.text).toMatch(/^✅ Kanalga joylandi: /);
    expect((await publishFromBot(p.id, OWNER, "en"))?.text).toMatch(/^This post is already in the channel: https:\/\/t\.me\/tortlar_uz\/\d+$/);
    expect(publishPost).toHaveBeenCalledTimes(1);
  });
});
