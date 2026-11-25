import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The publish claim (store.ts claimPublish, publish-once.ts) must outlive the longest caller that sends while holding
// it: the cron tick publishes approved posts and may live 300 s. A tap on Publish in the bot or the Mini App while
// that send is still running must not take the claim over and post the same post a second time.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ isDbConfigured: () => false, getSql: () => { throw new Error("no db in tests"); } }));
vi.mock("@/lib/track", () => ({ safeLogEvent: async () => {} }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ TELEGRAM_BOT_TOKEN: "123:test" }), getPublicUrl: () => undefined }));

// A fake send that can be held open with `hold` and marks the post published like the real one. Every call that gets
// this far would put a message in the channel.
let gate: Promise<void> | null = null;
let sentCount = 0;
const publishPost = vi.fn(async (a: { postId: string; chat: string; userId: number | null }) => {
  if (gate) await gate;
  const url = `https://t.me/${a.chat.replace("@", "")}/${++sentCount}`;
  await store.markPublished(a.postId, url, a.chat, a.userId as number);
  return { ok: true, status: 200, url };
});
vi.mock("../src/lib/uslub/publish", () => ({ publishPost }));

const store = await import("../src/lib/uslub/store");
const { publishOnce } = await import("../src/lib/uslub/publish-once");
import type { BrandDNA, PostDraft } from "../src/lib/uslub/contract";

const OWNER = 7;
const TICK_MAX_MS = 300_000; // src/app/api/cron/tick/route.ts maxDuration

/** Holds every send until the returned function is called. */
function hold(): () => void {
  let open = () => {};
  gate = new Promise<void>((r) => (open = r));
  return () => {
    gate = null;
    open();
  };
}

async function approvedPost() {
  const dna = { name: "Tort", languages: ["uz_latn"] } as unknown as BrandDNA;
  const brand = await store.saveBrand({ channel: "tortlar_uz", knowledge: "Uyda tort pishiraman.", samplePosts: [], dna, mode: "channel" }, OWNER, "custom");
  const post: PostDraft = {
    id: crypto.randomUUID(),
    brandId: brand.id,
    brief: "b",
    variants: { uz_latn: "Bento-tort 150 000 so‘mdan.", uz_cyrl: "", ru: "", en: "" },
    neuroHits: {},
    humanScore: 90,
    status: "approved",
    createdAt: new Date().toISOString(),
  };
  await store.savePosts([post]);
  return post;
}

const args = (post: PostDraft) => ({ postId: post.id, script: "uz_latn" as const, chat: "@tortlar_uz", userId: OWNER });
const settle = () => new Promise((r) => setTimeout(r, 5));

beforeEach(() => {
  publishPost.mockClear();
  gate = null;
});
afterEach(() => vi.restoreAllMocks());

describe("publish claim vs a long cron send", () => {
  it("lasts longer than the tick may live", () => {
    expect(store.PUBLISH_CLAIM_STALE_MS).toBeGreaterThan(TICK_MAX_MS);
  });

  it.each([181_000, TICK_MAX_MS])("a manual tap %i ms into a still-running autopilot send is told it is in progress; the post goes out once", async (later) => {
    const post = await approvedPost();
    const release = hold();
    const realNow = Date.now();
    const queueSend = publishOnce(args(post)); // the tick's send (publish-due -> publishOnce), still in flight
    await settle();
    vi.spyOn(Date, "now").mockReturnValue(realNow + later);
    const manual = await publishOnce(args(post), { waitMs: 0 }); // the owner taps Publish in the bot / Mini App
    expect(manual).toMatchObject({ ok: false, status: 409, inProgress: true });
    release();
    await expect(queueSend).resolves.toMatchObject({ ok: true });
    expect(publishPost).toHaveBeenCalledTimes(1);
  });

  it("a claim left by a send that died with its function (older than the tick's life) can be taken over", async () => {
    const post = await approvedPost();
    const stale = await store.claimPublish(post.id, Date.now() - store.PUBLISH_CLAIM_STALE_MS - 1000);
    expect(stale.kind).toBe("claimed");
    const res = await publishOnce(args(post), { waitMs: 0 });
    expect(res).toMatchObject({ ok: true });
    expect(publishPost).toHaveBeenCalledTimes(1);
  });
});
