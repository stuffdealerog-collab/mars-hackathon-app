import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// The autopilot's bot handlers (registerAutopilot) on a real grammY Bot with a fake Telegram API, the in-memory
// store, and the autopilot's database calls replaced by spies.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ isDbConfigured: () => false, getSql: () => { throw new Error("no db in tests"); } }));
const events = vi.hoisted(() => [] as { type: string; props: Record<string, unknown> }[]);
const trackMock = vi.hoisted(() => ({
  safeLogEvent: async (_id: number | null, type: string, props: Record<string, unknown> = {}) => void events.push({ type, props }),
  track: async () => null,
  parseSource: () => null,
}));
vi.mock("@/lib/track", () => trackMock);
vi.mock("../src/lib/track", () => trackMock);
vi.mock("@/lib/i18n", async () => await import("../src/lib/i18n"));
const envMock = vi.hoisted(() => ({ getEnv: () => ({ BOT_USERNAME: "test_bot" }), getPublicUrl: () => "https://mercat.test" }));
vi.mock("@/lib/env", () => envMock);
vi.mock("../src/lib/env", () => envMock);
vi.mock("@/lib/telegram-auth", () => ({ authenticateRequest: () => null, validateInitData: () => ({ ok: false }) }));
vi.mock("../src/lib/uslub/publish", () => ({ publishPost: vi.fn(), addBotAsAdminLink: () => "https://t.me/test_bot?startchannel&admin=post_messages+invite_users" }));
const repo = vi.hoisted(() => ({
  autopilot: {} as Record<string, unknown>,
  saveBotAdmin: vi.fn(async () => 1),
  saveMemberEvent: vi.fn(async () => {}),
  saveReactions: vi.fn(async () => {}),
  touchUser: vi.fn(async () => {}),
  weekPlan: vi.fn(async () => null as { id: string; tag: string } | null),
  loadAutopilotRow: vi.fn(async () => ({ autopilot: repo.autopilot, channelType: null, goal: null })),
  writeAutopilot: vi.fn(async (_id: string, state: Record<string, unknown>) => void (repo.autopilot = state)),
  enqueuePost: vi.fn(async (r: { postId: string; dueAt: number }) => ({ dueAt: r.dueAt, status: "queued" })),
  setPostSchedule: vi.fn(async () => {}),
  queueForBrand: vi.fn(async () => []),
}));
vi.mock("../src/lib/autopilot/repo", () => repo);

const { Bot } = await import("grammy");
const { registerAutopilot } = await import("../src/lib/autopilot/bot-handlers");
const store = await import("../src/lib/uslub/store");
import type { BrandDNA, PostDraft } from "../src/lib/uslub/contract";

const OWNER = 7;
const OTHER = 8;
const BOT_ID = 999;
const NOW = Date.parse("2026-11-30T05:00:00Z"); // Monday 10:00 Tashkent

vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(NOW);
afterAll(() => vi.useRealTimers());

type Member = { status: string; can_post_messages?: boolean; can_invite_users?: boolean };
type Call = { method: string; payload: Record<string, unknown> };

function makeBot(members: Record<number, Member> = {}) {
  const bot = new Bot("123456:TEST-bot-token-xxxxxxxxxxxxxxxxxxxxxxxx", {
    botInfo: { id: BOT_ID, is_bot: true, first_name: "Mercat", username: "test_bot", can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false } as never,
  });
  const calls: Call[] = [];
  bot.api.config.use(async (_prev, method, payload) => {
    const p = (payload ?? {}) as Record<string, unknown>;
    calls.push({ method, payload: p });
    if (method === "getMe") return { ok: true, result: { id: BOT_ID, is_bot: true, first_name: "Mercat", username: "test_bot" } } as never;
    if (method === "getChatMember") {
      const m = members[p.user_id as number];
      if (!m) return { ok: false, error_code: 400, description: "Bad Request: member list is inaccessible" } as never;
      return { ok: true, result: { ...m, user: { id: p.user_id, is_bot: false, first_name: "x" } } } as never;
    }
    if (method === "sendMessage") return { ok: true, result: { message_id: calls.length, date: 0, chat: { id: p.chat_id, type: "private" }, text: p.text } } as never;
    return { ok: true, result: true } as never;
  });
  registerAutopilot(bot);
  return { bot, calls, sent: () => calls.filter((c) => c.method === "sendMessage") };
}

const from = (id: number, language_code = "uz") => ({ id, is_bot: false, first_name: "A", language_code });
let updateId = 1;
const startUpdate = (userId: number, payload: string) => ({
  update_id: updateId++,
  message: { message_id: 1, date: 0, chat: { id: userId, type: "private", first_name: "A" }, from: from(userId), text: `/start ${payload}`, entities: [{ type: "bot_command", offset: 0, length: 6 }] },
});
const callbackUpdate = (userId: number, data: string) => ({
  update_id: updateId++,
  callback_query: { id: String(updateId), from: from(userId), chat_instance: "ci", data, message: { message_id: 5, date: 0, chat: { id: userId, type: "private", first_name: "A" }, text: "x" } },
});

const buttons = (c: Call | undefined) =>
  ((c?.payload.reply_markup as { inline_keyboard?: { text: string; callback_data?: string; url?: string; web_app?: { url: string } }[][] } | undefined)?.inline_keyboard ?? []).flat();

const dna = { name: "Non", languages: ["uz_latn"] } as unknown as BrandDNA;

async function brandWithPosts(owner: number | null, texts: string[] = ["Yangi non har kuni ertalab.", "Somsa issiq, kelinglar."]) {
  const brand = await store.saveBrand({ channel: "nonvoy", knowledge: "Non do‘koni.", samplePosts: [], dna, mode: "channel" }, owner, "custom");
  const posts: PostDraft[] = texts.map((text, i) => ({
    id: crypto.randomUUID(),
    brandId: brand.id,
    brief: "b",
    variants: { uz_latn: text, uz_cyrl: "", ru: "", en: "" },
    neuroHits: {},
    humanScore: 90,
    status: "draft",
    slot: { day: `2026-12-0${i + 1}`, time: "12:40", goal: "reach", hook: text.slice(0, 20), cta: "" },
    createdAt: new Date(NOW - 60_000).toISOString(),
  }));
  await store.savePosts(posts);
  return { brand, posts };
}

beforeEach(() => {
  events.length = 0;
  repo.autopilot = {};
  for (const f of Object.values(repo)) if (typeof f === "function" && "mockClear" in f) (f as { mockClear: () => void }).mockClear();
});

describe("/start week_<brandId>", () => {
  it("shows the owner the week with [Approve all] (≤ 64 bytes), the Mini App week view and the autopilot switch", async () => {
    const { brand } = await brandWithPosts(OWNER);
    const { bot, sent } = makeBot();
    await bot.handleUpdate(startUpdate(OWNER, `week_${brand.id}`) as never);
    const msg = sent()[0];
    expect(String(msg.payload.text)).toContain("Bu haftaning postlari (2):");
    const kb = buttons(msg);
    const approve = kb.find((b) => b.callback_data?.startsWith("apw:"));
    expect(approve && Buffer.byteLength(approve.callback_data as string)).toBeLessThanOrEqual(64);
    expect(kb.find((b) => b.web_app)?.web_app?.url).toBe(`https://mercat.test/tg?brand=${brand.id}&view=week`);
    expect(kb.find((b) => b.callback_data === `apa:1:${brand.id}`)).toBeTruthy();
  });

  it("someone else's brand: refused, nothing shown", async () => {
    const { brand } = await brandWithPosts(OWNER);
    const { bot, sent } = makeBot();
    await bot.handleUpdate(startUpdate(OTHER, `week_${brand.id}`) as never);
    expect(sent()).toHaveLength(1);
    expect(String(sent()[0].payload.text)).toBe("Bu brend boshqa foydalanuvchiga tegishli.");
    expect(buttons(sent()[0])).toEqual([]);
  });

  it("a brand nobody owns: claimed by a channel admin who can post (the bot can post too), then the week", async () => {
    const { brand } = await brandWithPosts(null);
    const { bot, sent } = makeBot({ [BOT_ID]: { status: "administrator", can_post_messages: true }, [OTHER]: { status: "administrator", can_post_messages: true } });
    await bot.handleUpdate(startUpdate(OTHER, `week_${brand.id}`) as never);
    expect((await store.getBrand(brand.id))?.ownerTelegramId).toBe(OTHER);
    expect(String(sent().at(-1)?.payload.text)).toContain("Bu haftaning postlari (2):");
  });

  it("a brand nobody owns and a user who is not a channel admin: refused, not claimed", async () => {
    const { brand } = await brandWithPosts(null);
    const { bot, sent } = makeBot({ [BOT_ID]: { status: "administrator", can_post_messages: true }, [OTHER]: { status: "member" } });
    await bot.handleUpdate(startUpdate(OTHER, `week_${brand.id}`) as never);
    expect((await store.getBrand(brand.id))?.ownerTelegramId).toBeNull();
    expect(String(sent()[0].payload.text)).not.toContain("Bu haftaning postlari");
  });
});

describe("[Approve all]", () => {
  async function shownWeek(owner = OWNER) {
    const { brand, posts } = await brandWithPosts(owner);
    const { bot, sent } = makeBot({ [BOT_ID]: { status: "administrator", can_post_messages: true, can_invite_users: true } });
    await bot.handleUpdate(startUpdate(OWNER, `week_${brand.id}`) as never);
    const data = buttons(sent()[0]).find((b) => b.callback_data?.startsWith("apw:"))?.callback_data as string;
    return { brand, posts, data };
  }

  it("the owner's tap approves and queues exactly the posts shown, each for its slot", async () => {
    const { posts, data } = await shownWeek();
    const { bot, sent } = makeBot({ [BOT_ID]: { status: "administrator", can_post_messages: true, can_invite_users: true } });
    await bot.handleUpdate(callbackUpdate(OWNER, data) as never);
    expect(repo.enqueuePost.mock.calls.map((c) => (c[0] as { postId: string }).postId).sort()).toEqual(posts.map((p) => p.id).sort());
    expect(repo.enqueuePost.mock.calls.map((c) => new Date((c[0] as { dueAt: number }).dueAt).toISOString()).sort()).toEqual(["2026-12-01T07:40:00.000Z", "2026-12-02T07:40:00.000Z"]);
    for (const p of posts) expect((await store.getPost(p.id))?.status).toBe("approved");
    const done = sent().at(-1);
    expect(String(done?.payload.text)).toContain("Tasdiqlandi.");
    expect(buttons(done)).toEqual([]); // the bot can post: no "add the bot" button
    expect(events.find((e) => e.type === "week_approved")?.props).toMatchObject({ queued: 2, skipped: 0, bot_admin: "admin" });
  });

  it("the posts changed since the list was shown: nothing is queued, the new list is shown", async () => {
    const { posts, data } = await shownWeek();
    posts[0].variants.uz_latn = "Boshqa matn.";
    await store.savePosts([posts[0]]);
    const { bot, sent } = makeBot();
    await bot.handleUpdate(callbackUpdate(OWNER, data) as never);
    expect(repo.enqueuePost).not.toHaveBeenCalled();
    expect(String(sent().at(-1)?.payload.text)).toContain("Postlar o‘zgargan.");
  });

  it("anyone but the owner is refused", async () => {
    const { data } = await shownWeek();
    const { bot, calls } = makeBot();
    await bot.handleUpdate(callbackUpdate(OTHER, data) as never);
    expect(repo.enqueuePost).not.toHaveBeenCalled();
    expect(calls.find((c) => c.method === "answerCallbackQuery")?.payload.text).toBe("Bu brend boshqa foydalanuvchiga tegishli.");
  });

  it("the bot cannot post in the channel: queued anyway, with a warning and the add-the-bot button", async () => {
    const { data } = await shownWeek();
    const { bot, sent } = makeBot({ [BOT_ID]: { status: "administrator", can_post_messages: false } });
    await bot.handleUpdate(callbackUpdate(OWNER, data) as never);
    expect(repo.enqueuePost).toHaveBeenCalledTimes(2);
    const done = sent().at(-1);
    expect(String(done?.payload.text)).toContain("Bot hali @nonvoy kanalida post joylay olmaydi.");
    expect(buttons(done)[0].url).toBe("https://t.me/test_bot?startchannel&admin=post_messages+invite_users");
    expect(repo.saveBotAdmin).toHaveBeenCalledWith("nonvoy", expect.objectContaining({ status: "no_post_right", canPost: false }));
  });
});

describe("autopilot switch and the orders answer", () => {
  it("the owner turns the autopilot on: the trial starts (7 days)", async () => {
    const { brand } = await brandWithPosts(OWNER);
    const { bot, sent } = makeBot();
    await bot.handleUpdate(callbackUpdate(OWNER, `apa:1:${brand.id}`) as never);
    expect(repo.autopilot).toMatchObject({ on: true, since: new Date(NOW).toISOString(), trialEndsAt: new Date(NOW + 7 * 86_400_000).toISOString() });
    expect(String(sent()[0].payload.text)).toContain("Avtopilot yoqildi.");
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(["autopilot_on", "trial_started"]));
  });

  it("nobody else can switch it", async () => {
    const { brand } = await brandWithPosts(OWNER);
    const { bot } = makeBot();
    await bot.handleUpdate(callbackUpdate(OTHER, `apa:1:${brand.id}`) as never);
    expect(repo.writeAutopilot).not.toHaveBeenCalled();
  });

  it("the orders answer is stored for last week (owner only)", async () => {
    const { brand } = await brandWithPosts(OWNER);
    const { bot } = makeBot();
    await bot.handleUpdate(callbackUpdate(OTHER, `apo:${brand.id}:4`) as never);
    expect(events.some((e) => e.type === "orders_week")).toBe(false);
    await bot.handleUpdate(callbackUpdate(OWNER, `apo:${brand.id}:4`) as never);
    expect(events.find((e) => e.type === "orders_week")?.props).toEqual({ brand_id: brand.id, week: "2026-W48", value: 7 });
  });
});

describe("channel updates", () => {
  const channel = { id: -1001234, type: "channel", title: "Non", username: "NonVoy" };

  it("my_chat_member stores the bot's rights on the channel's brands and tells the person who changed them", async () => {
    const { bot, sent } = makeBot();
    await bot.handleUpdate({
      update_id: updateId++,
      my_chat_member: {
        chat: channel,
        from: from(OWNER, "ru"),
        date: 0,
        old_chat_member: { status: "left", user: { id: BOT_ID, is_bot: true, first_name: "M" } },
        new_chat_member: { status: "administrator", user: { id: BOT_ID, is_bot: true, first_name: "M" }, can_post_messages: true, can_invite_users: true, can_be_edited: false, is_anonymous: false, can_manage_chat: true, can_delete_messages: false, can_manage_video_chats: false, can_restrict_members: false, can_promote_members: false, can_change_info: false, can_post_stories: false, can_edit_stories: false, can_delete_stories: false },
      },
    } as never);
    expect(repo.saveBotAdmin).toHaveBeenCalledWith("nonvoy", expect.objectContaining({ status: "admin", canPost: true, canInvite: true }));
    expect(sent()[0].payload.chat_id).toBe(OWNER);
    expect(String(sent()[0].payload.text)).toBe("Бот стал админом @nonvoy. Подтверждённые посты теперь выходят сами в своё время.");
  });

  it("chat_member stores a join with its invite link and a keyed hash, never the member's id", async () => {
    const { bot } = makeBot();
    await bot.handleUpdate({
      update_id: updateId++,
      chat_member: {
        chat: channel,
        from: from(555),
        date: 0,
        old_chat_member: { status: "left", user: { id: 555, is_bot: false, first_name: "C" } },
        new_chat_member: { status: "member", user: { id: 555, is_bot: false, first_name: "C" } },
        invite_link: { invite_link: "https://t.me/+AbCdEf", creator: { id: BOT_ID, is_bot: true, first_name: "M" }, creates_join_request: false, is_primary: false, is_revoked: false, name: "qr" },
      },
    } as never);
    expect(repo.saveMemberEvent).toHaveBeenCalledTimes(1);
    const [ch, key, kind, link] = repo.saveMemberEvent.mock.calls[0] as unknown as [string, string, string, string];
    expect([ch, kind, link]).toEqual(["nonvoy", "join", "https://t.me/+AbCdEf"]);
    expect(key).toMatch(/^m:[0-9a-f]{16}$/);
    expect(key).not.toContain("555");
  });

  it("message_reaction_count stores the totals", async () => {
    const { bot } = makeBot();
    await bot.handleUpdate({
      update_id: updateId++,
      message_reaction_count: { chat: channel, message_id: 42, date: 0, reactions: [{ type: { type: "emoji", emoji: "👍" }, total_count: 3 }, { type: { type: "emoji", emoji: "🔥" }, total_count: 2 }] },
    } as never);
    expect(repo.saveReactions).toHaveBeenCalledWith("nonvoy", 42, 5, { "👍": 3, "🔥": 2 });
  });

  it("any other /start goes on to the bot's own handler", async () => {
    const { bot, sent } = makeBot();
    let reached = false;
    bot.command("start", () => void (reached = true));
    await bot.handleUpdate(startUpdate(OWNER, "src_booth1") as never);
    expect(reached).toBe(true);
    expect(sent()).toEqual([]);
  });
});
