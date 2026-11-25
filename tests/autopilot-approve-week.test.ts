import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/uslub/posts/approve-week and GET/POST /api/uslub/autopilot against the in-memory store; the queue is a
// fake table. An "x-test-user: <id>" header stands for a verified Telegram session of that user.
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => { throw new Error("outside a request"); } }));
vi.mock("@/lib/db", () => ({ isDbConfigured: () => false, getSql: () => { throw new Error("no db in tests"); } }));
const trackMock = vi.hoisted(() => ({ safeLogEvent: async () => {}, track: async () => null, parseSource: () => null }));
vi.mock("@/lib/track", () => trackMock);
vi.mock("../src/lib/track", () => trackMock);
vi.mock("@/lib/i18n", async () => await import("../src/lib/i18n"));
const envMock = vi.hoisted(() => ({ getEnv: () => ({ BOT_USERNAME: "test_bot", TELEGRAM_BOT_TOKEN: "123:test" }), getPublicUrl: () => undefined }));
vi.mock("@/lib/env", () => envMock);
vi.mock("../src/lib/env", () => envMock);
vi.mock("@/lib/telegram-auth", () => ({
  authenticateRequest: (req: Request) => (req.headers.get("x-test-user") ? { id: Number(req.headers.get("x-test-user")) } : null),
  validateInitData: () => ({ ok: false }),
}));
vi.mock("../src/lib/uslub/publish", () => ({ publishPost: vi.fn(), addBotAsAdminLink: () => "https://t.me/test_bot?startchannel&admin=post_messages+invite_users" }));
const botAdmin = vi.hoisted(() => ({ member: { status: "administrator", can_post_messages: true, can_invite_users: true } as Record<string, unknown> }));
vi.mock("@/lib/bot", () => ({
  getBot: () => ({ api: { getMe: async () => ({ id: 999 }), getChatMember: async () => botAdmin.member } }),
}));
// The queue table: approving again keeps a queued post's time when its text is the same (repo.ts enqueuePost).
const queue = vi.hoisted(() => new Map<string, { dueAt: number; textHash: string; status: string; chat: string; brandId: string; lastError: string | null }>());
const autopilotRows = vi.hoisted(() => new Map<string, Record<string, unknown>>());
// Who counted as active (app_users.last_seen_at) through these routes.
const touched = vi.hoisted(() => [] as number[]);
vi.mock("../src/lib/autopilot/repo", () => ({
  enqueuePost: async (r: { postId: string; brandId: string; chat: string; dueAt: number; textHash: string }) => {
    const prev = queue.get(r.postId);
    const dueAt = prev && prev.status === "queued" && prev.textHash === r.textHash ? prev.dueAt : r.dueAt;
    queue.set(r.postId, { dueAt, textHash: r.textHash, status: "queued", chat: r.chat, brandId: r.brandId, lastError: null });
    return { dueAt, status: "queued" };
  },
  setPostSchedule: async () => {},
  touchUser: async (id: number) => void touched.push(id),
  saveBotAdmin: async (_c: string, s: Record<string, unknown>) => {
    for (const [id, row] of autopilotRows) autopilotRows.set(id, { ...row, botAdmin: s });
    return 1;
  },
  loadAutopilotRow: async (id: string) => ({ autopilot: autopilotRows.get(id) ?? {}, channelType: null, goal: null }),
  writeAutopilot: async (id: string, s: Record<string, unknown>) => void autopilotRows.set(id, { ...(autopilotRows.get(id) ?? {}), ...s }),
  queueForBrand: async (brandId: string) =>
    [...queue].filter(([, q]) => q.brandId === brandId).map(([postId, q]) => ({ postId, dueAt: q.dueAt, status: q.status, lastError: q.lastError, chat: q.chat })),
}));
vi.mock("@/lib/uslub/http", async () => await import("../src/lib/uslub/http"));
vi.mock("@/lib/uslub/store", async () => await import("../src/lib/uslub/store"));
vi.mock("@/lib/uslub/context", async () => await import("../src/lib/uslub/context"));
vi.mock("@/lib/autopilot/approve", async () => await import("../src/lib/autopilot/approve"));
vi.mock("@/lib/autopilot/week-hash", async () => await import("../src/lib/autopilot/week-hash"));
vi.mock("@/lib/autopilot/service", async () => await import("../src/lib/autopilot/service"));

const store = await import("../src/lib/uslub/store");
const approveWeekRoute = await import("../src/app/api/uslub/posts/approve-week/route");
const autopilotRoute = await import("../src/app/api/uslub/autopilot/route");
import { selectWeekBatch } from "../src/lib/autopilot/week";
import { weekHashForClient } from "../src/lib/autopilot/week-hash";
import type { BrandDNA, PostDraft } from "../src/lib/uslub/contract";

const OWNER = 7;
const NOW = Date.parse("2026-11-30T05:00:00Z"); // Monday 10:00 Tashkent
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(NOW);
afterAll(() => vi.useRealTimers());

const dna = { name: "Non", languages: ["uz_latn"] } as unknown as BrandDNA;

async function brandWithPosts(owner: number | null, specs: { text: string; day?: string; time?: string; format?: string; status?: PostDraft["status"] }[]) {
  const brand = await store.saveBrand({ channel: "nonvoy", knowledge: "Non do‘koni.", samplePosts: [], dna, mode: "channel" }, owner, "custom");
  const posts: PostDraft[] = specs.map((s) => ({
    id: crypto.randomUUID(),
    brandId: brand.id,
    brief: "b",
    variants: { uz_latn: s.text, uz_cyrl: "", ru: "", en: "" },
    neuroHits: {},
    humanScore: 90,
    status: s.status ?? "draft",
    slot: { day: s.day ?? "2026-12-01", time: s.time ?? "12:40", goal: "reach", hook: s.text.slice(0, 20), cta: "", ...(s.format ? { format: s.format } : {}) },
    createdAt: new Date(NOW - 60_000).toISOString(),
  }));
  await store.savePosts(posts);
  return { brand, posts };
}

/** What the Studio / Mini App sends: the hash of the week on screen, computed in the client's own way. */
async function shownWeekHash(brandId: string): Promise<string> {
  const posts = await store.listPosts(brandId, 50);
  const batch = selectWeekBatch({ posts, channel: "nonvoy", languages: ["uz_latn"], now: Date.now() });
  return weekHashForClient(batch, posts);
}

const post = (body: unknown, user?: number) =>
  approveWeekRoute.POST(
    new Request("http://localhost/api/uslub/posts/approve-week", {
      method: "POST",
      headers: { "content-type": "application/json", ...(user ? { "x-test-user": String(user) } : {}) },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  queue.clear();
  touched.length = 0;
  botAdmin.member = { status: "administrator", can_post_messages: true, can_invite_users: true };
});

describe("POST /api/uslub/posts/approve-week", () => {
  it("anonymous: 401 with the bot's week_ link (under Telegram's 64-character payload limit)", async () => {
    const { brand } = await brandWithPosts(OWNER, [{ text: "Yangi non." }]);
    const res = await post({ brandId: brand.id });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string; continueUrl: string };
    expect(body.code).toBe("auth_required");
    expect(body.continueUrl).toBe(`https://t.me/test_bot?start=week_${brand.id}`);
    expect(`week_${brand.id}`.length).toBeLessThanOrEqual(64);
    expect(queue.size).toBe(0);
  });

  it("a brand nobody owns: 403 brand_unowned with the same link (the bot checks channel rights)", async () => {
    const { brand } = await brandWithPosts(null, [{ text: "Yangi non." }]);
    const res = await post({ brandId: brand.id }, OWNER);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "brand_unowned", continueUrl: `https://t.me/test_bot?start=week_${brand.id}` });
  });

  it("another owner's brand: 403", async () => {
    const { brand } = await brandWithPosts(OWNER, [{ text: "Yangi non." }]);
    const res = await post({ brandId: brand.id }, 99);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("brand_forbidden");
    expect(queue.size).toBe(0);
  });

  it("the owner: clean posts approved and queued for their slot; blanks, past dates and videos stay out with reasons", async () => {
    const { brand, posts } = await brandWithPosts(OWNER, [
      { text: "Yangi non har kuni ertalab.", day: "2026-12-01", time: "12:40" },
      { text: "Tort narxi: [narx].", day: "2026-12-02" },
      { text: "Ochilish 28-noyabr kuni bo‘ladi!", day: "2026-12-03" },
      { text: "Videoda non qanday pishadi.", day: "2026-12-04", format: "video" },
      { text: "Chiqib bo‘lgan post.", day: "2026-11-29", status: "published" },
    ]);
    const res = await post({ brandId: brand.id }, OWNER);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { queued: { postId: string; dueAt: string }[]; skipped: { postId: string; reason: string; tokens?: string[] }[]; admin: { status: string } };
    expect(body.queued).toEqual([{ postId: posts[0].id, dueAt: "2026-12-01T07:40:00.000Z" }]);
    expect(new Map(body.skipped.map((s) => [s.postId, s.reason]))).toEqual(
      new Map([
        [posts[1].id, "blank"],
        [posts[2].id, "past_date"],
        [posts[3].id, "video_missing"],
        [posts[4].id, "published"],
      ]),
    );
    expect(body.skipped.find((s) => s.reason === "blank")?.tokens).toEqual(["[narx]"]);
    expect(body.admin.status).toBe("admin");
    expect((await store.getPost(posts[0].id))?.status).toBe("approved");
    expect((await store.getPost(posts[1].id))?.status).toBe("draft");
    expect((await store.getPost(posts[4].id))?.status).toBe("published");
    // Approving the week from the web counts as the owner being active (the autopilot's 14-day gate).
    expect(touched).toEqual([OWNER]);
  });

  it("a second call is idempotent: same posts, same times", async () => {
    const { brand } = await brandWithPosts(OWNER, [{ text: "Yangi non.", day: "2026-11-30", time: "08:00" }]);
    const first = (await (await post({ brandId: brand.id }, OWNER)).json()) as { queued: { dueAt: string }[] };
    vi.setSystemTime(NOW + 3 * 60_000);
    const second = (await (await post({ brandId: brand.id }, OWNER)).json()) as { queued: { dueAt: string }[] };
    vi.setSystemTime(NOW);
    expect(first.queued).toHaveLength(1);
    expect(second.queued).toEqual(first.queued);
  });

  it("postIds queues just those posts", async () => {
    const { brand, posts } = await brandWithPosts(OWNER, [{ text: "Bir." }, { text: "Ikki.", day: "2026-12-02" }]);
    const body = (await (await post({ brandId: brand.id, postIds: [posts[1].id] }, OWNER)).json()) as { queued: { postId: string }[] };
    expect(body.queued.map((q) => q.postId)).toEqual([posts[1].id]);
  });

  it("hash = the week the owner was shown: approved as usual", async () => {
    const { brand, posts } = await brandWithPosts(OWNER, [{ text: "Yangi non." }, { text: "Tort narxi: [narx].", day: "2026-12-02" }]);
    const hash = await shownWeekHash(brand.id);
    const res = await post({ brandId: brand.id, hash }, OWNER);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { queued: { postId: string }[] }).queued.map((q) => q.postId)).toEqual([posts[0].id]);
  });

  it("the week changed after it was shown (an edit, a new batch, a finished picture): 409 batch_changed, nothing approved", async () => {
    const { brand, posts } = await brandWithPosts(OWNER, [{ text: "Yangi non." }, { text: "Somsa issiq.", day: "2026-12-02" }]);
    const hash = await shownWeekHash(brand.id);
    const changes: (() => Promise<unknown>)[] = [
      () => store.savePosts([{ ...posts[0], variants: { ...posts[0].variants, uz_latn: "Boshqa matn." } }]),
      () => store.savePosts([{ ...posts[1], image: { status: "ready", url: "https://v3.fal.media/files/x/picture.png", refsUsed: 1 } }]),
    ];
    for (const change of changes) {
      await change();
      const res = await post({ brandId: brand.id, hash, lang: "en" }, OWNER);
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ code: "batch_changed", error: "The week's posts changed after you opened them. Look at the new list and approve again." });
      expect(queue.size).toBe(0);
      expect((await store.getPost(posts[0].id))?.status).toBe("draft");
    }
  });

  it("a hash that is not one: 400", async () => {
    const { brand } = await brandWithPosts(OWNER, [{ text: "Yangi non." }]);
    const res = await post({ brandId: brand.id, hash: "not a hash" }, OWNER);
    expect(res.status).toBe(400);
    expect(queue.size).toBe(0);
  });

  it("the bot cannot post in the channel yet: queued, with the admin status and the add-the-bot link", async () => {
    botAdmin.member = { status: "left" };
    const { brand } = await brandWithPosts(OWNER, [{ text: "Yangi non." }]);
    const body = (await (await post({ brandId: brand.id }, OWNER)).json()) as { queued: unknown[]; admin: { status: string }; addAdminUrl?: string };
    expect(body.queued).toHaveLength(1);
    expect(body.admin.status).toBe("not_admin");
    expect(body.addAdminUrl).toBe("https://t.me/test_bot?startchannel&admin=post_messages+invite_users");
  });
});

describe("GET/POST /api/uslub/autopilot", () => {
  const set = (body: unknown, user?: number) =>
    autopilotRoute.POST(
      new Request("http://localhost/api/uslub/autopilot", {
        method: "POST",
        headers: { "content-type": "application/json", ...(user ? { "x-test-user": String(user) } : {}) },
        body: JSON.stringify(body),
      }),
    );
  const get = (brandId: string, user?: number) =>
    autopilotRoute.GET(new Request(`http://localhost/api/uslub/autopilot?brandId=${brandId}`, { headers: user ? { "x-test-user": String(user) } : {} }));

  it("the owner turns it on: the 7-day trial starts; the state, admin status and schedule come back", async () => {
    const { brand } = await brandWithPosts(OWNER, [{ text: "Yangi non." }]);
    await post({ brandId: brand.id }, OWNER);
    const res = await set({ brandId: brand.id, on: true }, OWNER);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { autopilot: Record<string, unknown>; admin: { status: string }; schedule: Record<string, { status: string; dueAt: string }> };
    expect(body.autopilot).toEqual({ on: true, since: new Date(NOW).toISOString(), trialEndsAt: new Date(NOW + 7 * 86_400_000).toISOString(), trialDaysLeft: 7 });
    expect(Object.values(body.schedule)).toEqual([{ dueAt: "2026-12-01T07:40:00.000Z", status: "queued" }]);
    // Approving and switching both count as the owner being active.
    expect(touched).toEqual([OWNER, OWNER]);
    const again = (await (await get(brand.id, OWNER)).json()) as { autopilot: { on: boolean } };
    expect(again.autopilot.on).toBe(true);
  });

  it("anonymous cannot switch it (401 with the bot link); another owner gets 403", async () => {
    const { brand } = await brandWithPosts(OWNER, [{ text: "Yangi non." }]);
    const anon = await set({ brandId: brand.id, on: true });
    expect(anon.status).toBe(401);
    expect(touched).toEqual([]);
    expect(((await anon.json()) as { continueUrl: string }).continueUrl).toBe(`https://t.me/test_bot?start=week_${brand.id}`);
    expect((await set({ brandId: brand.id, on: true }, 99)).status).toBe(403);
    expect((await get(brand.id, 99)).status).toBe(403);
  });
});
