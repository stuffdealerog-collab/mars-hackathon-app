import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The owner's video through the bot, on bot.ts's real handlers with a fake Telegram API: the Video tab's
// video_<postId> link (owner only; an unowned web brand is claimed by the channel's admin), the wait in the pending
// dispatcher (a video or a video file, limits, other messages ignored), the file id stored on the post, the confirmation
// with [Approve] bound to what was shown, the queue at the slot, and [Cancel]. Stores in memory; nothing reaches
// Telegram, Claude or a database.
const later = vi.hoisted(() => [] as (() => Promise<void>)[]);
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => void later.push(task) }));
vi.mock("@/lib/db", () => ({ isDbConfigured: () => false, getSql: () => { throw new Error("no db in tests"); }, pgErrorCode: () => undefined }));
const events = vi.hoisted(() => [] as { type: string; props: Record<string, unknown> }[]);
const trackMock = vi.hoisted(() => ({
  safeLogEvent: async (_id: number | null, type: string, props: Record<string, unknown> = {}) => void events.push({ type, props }),
  track: async () => null,
  parseSource: () => null,
}));
vi.mock("@/lib/track", () => trackMock);
vi.mock("../src/lib/track", () => trackMock);
vi.mock("@/lib/i18n", async () => await import("../src/lib/i18n"));
const envMock = vi.hoisted(() => ({
  getEnv: () => ({ TELEGRAM_BOT_TOKEN: "123456:TEST-bot-token-xxxxxxxxxxxxxxxxxxxxxxxx", ANTHROPIC_API_KEY: "test", BOT_USERNAME: "mercatai" }),
  getPublicUrl: () => "https://mercat.test",
}));
vi.mock("@/lib/env", () => envMock);
vi.mock("../src/lib/env", () => envMock);
vi.mock("@/lib/telegram-auth", () => ({ authenticateRequest: () => null, validateInitData: () => ({ ok: false }) }));
vi.mock("../src/lib/uslub/publish", () => ({ publishPost: vi.fn(), addBotAsAdminLink: () => "https://t.me/mercatai?startchannel" }));
vi.mock("../src/lib/uslub/brand", () => ({ buildBrand: vi.fn() }));
vi.mock("../src/lib/uslub/copywriter", () => ({ generatePosts: vi.fn(async () => []) }));
vi.mock("../src/lib/uslub/botflow/plan", () => ({ analyzeForBot: vi.fn(), planForBrand: vi.fn(), writePlanPosts: vi.fn() }));
vi.mock("../src/lib/uslub/visual/service", () => ({ learnAndSaveVisual: vi.fn(), actorKey: (id: number | null) => `tg:${id}`, VisualLimitError: class extends Error {} }));

const { getBot } = await import("../src/lib/bot");
const { t } = await import("../src/lib/i18n");
const store = await import("../src/lib/uslub/store");
const { getPending, resetPendingMemory } = await import("../src/lib/uslub/botflow/pending");
const { shownHash } = await import("../src/lib/uslub/botpublish-core");
import type { BrandDNA, PostDraft } from "../src/lib/uslub/contract";

type Call = { method: string; payload: Record<string, unknown> };
const calls: Call[] = [];
const members = new Map<string, string>();

const bot = getBot();
bot.botInfo = { id: 1, is_bot: true, first_name: "Mercat", username: "mercatai" } as never;
bot.api.config.use(async (_prev, method, payload) => {
  const p = (payload ?? {}) as Record<string, unknown>;
  calls.push({ method, payload: p });
  if (method === "sendMessage") return { ok: true, result: { message_id: calls.length, date: 0, chat: { id: p.chat_id, type: "private" }, text: p.text } } as never;
  if (method === "getMe") return { ok: true, result: { id: 1, is_bot: true, first_name: "Mercat", username: "mercatai" } } as never;
  if (method === "getChatMember") {
    const status = members.get(`${String(p.chat_id)}:${String(p.user_id)}`);
    if (!status) return { ok: false, error_code: 400, description: "Bad Request: member not found" } as never;
    return { ok: true, result: { status, ...(status === "administrator" ? { can_post_messages: true, can_invite_users: true } : {}), user: { id: p.user_id, is_bot: false, first_name: "x" } } } as never;
  }
  if (method.startsWith("getMy")) return { ok: true, result: method === "getMyCommands" ? [] : method === "getMyName" ? { name: "" } : method === "getMyDescription" ? { description: "" } : { short_description: "" } } as never;
  if (method === "getChatMenuButton") return { ok: true, result: { type: "default" } } as never;
  return { ok: true, result: true } as never;
});

async function drain() {
  while (later.length) await Promise.all(later.splice(0).map((task) => task()));
}

let nextUser = 5000;
let updateId = 1;
const from = (id: number) => ({ id, is_bot: false, first_name: "Ali", language_code: "uz" });
const chat = (id: number) => ({ id, type: "private" as const, first_name: "Ali" });
const send = async (update: object) => {
  await bot.handleUpdate(update as never);
  await drain();
};
const message = (user: number, extra: object) => ({ update_id: updateId++, message: { message_id: updateId, date: 0, chat: chat(user), from: from(user), ...extra } });
const start = (user: number, payload: string) => message(user, { text: `/start ${payload}`, entities: [{ type: "bot_command", offset: 0, length: 6 }] });
const text = (user: number, s: string) => message(user, { text: s });
const video = (user: number, v: Record<string, unknown> = {}) =>
  message(user, { video: { file_id: "BAACvid1", file_unique_id: "AgADvid1", width: 720, height: 1280, duration: 23, file_size: 9_000_000, mime_type: "video/mp4", thumbnail: { file_id: "AAMthumb1", file_unique_id: "t1", width: 180, height: 320 }, ...v } });
const callback = (user: number, data: string) => ({
  update_id: updateId++,
  callback_query: { id: String(updateId), from: from(user), chat_instance: "ci", data, message: { message_id: 5, date: 0, chat: chat(user), text: "x" } },
});

const sent = () => calls.filter((c) => c.method === "sendMessage");
const lastText = () => String(sent().at(-1)?.payload.text ?? "");
type Kb = { inline_keyboard?: { text: string; callback_data?: string; url?: string; web_app?: { url: string } }[][] };
const buttonsOf = (c: Call | undefined) => ((c?.payload.reply_markup as Kb | undefined)?.inline_keyboard ?? []).flat();

const dna = { name: "Tandir", products: ["patir"], languages: ["uz_latn"] } as unknown as BrandDNA;
const plan = { hook: "Tong", scenes: [{ seconds: 3, visual: "Tandir", voiceover: "Non chiqdi.", caption: "6:00" }], musicMood: "Iliq" };

/** A day three days from now (Tashkent), so the slot is ahead whenever the test runs. */
const ahead = () => new Date(Date.now() + 3 * 86_400_000 + 5 * 3600_000).toISOString().slice(0, 10);

async function setup(owner: number | null, over: Partial<PostDraft> = {}) {
  const brand = await store.saveBrand({ channel: "tandirnon", knowledge: "", samplePosts: [], dna, mode: "channel" }, owner, "custom");
  const post: PostDraft = {
    id: crypto.randomUUID(),
    brandId: brand.id,
    brief: "Tong",
    variants: { uz_latn: "Ertalab issiq patir. Videoni ko‘ring!", uz_cyrl: "", ru: "", en: "" },
    neuroHits: {},
    humanScore: 90,
    status: "draft",
    slot: { day: ahead(), time: "12:00", goal: "reach", hook: "Tandirdan birinchi non", cta: "", format: "video" },
    video: { plan },
    createdAt: new Date().toISOString(),
    ...over,
  };
  await store.savePosts([post]);
  return { brand, post };
}

beforeEach(() => {
  calls.length = 0;
  events.length = 0;
  later.length = 0;
  members.clear();
  resetPendingMemory();
});

afterEach(async () => {
  await drain();
});

describe("video_<postId>: the bot waits for the owner's video", () => {
  it("the owner: the bot asks for the video (with the script's length) and waits", async () => {
    const user = ++nextUser;
    const { post } = await setup(user);
    await send(start(user, `video_${post.id}`));
    expect(await getPending(user)).toMatchObject({ kind: "video", postId: post.id });
    expect(lastText()).toContain("«Tandirdan birinchi non»");
    expect(lastText()).toContain(t("uz", "vid.ask_plan", { n: 1, seconds: 3 }));
    expect(buttonsOf(sent().at(-1)).map((b) => b.callback_data)).toEqual([`vdx:${post.id}`]);
  });

  it("someone else: refused, nothing waits", async () => {
    const owner = ++nextUser;
    const other = ++nextUser;
    const { post } = await setup(owner);
    await send(start(other, `video_${post.id}`));
    expect(lastText()).toBe(t("uz", "pub.not_yours"));
    expect(await getPending(other)).toBeNull();
  });

  it("a post that is not a video post: said so, nothing waits", async () => {
    const user = ++nextUser;
    const { post } = await setup(user, { slot: { day: ahead(), time: "12:00", goal: "reach", hook: "x", cta: "", format: "photo" }, video: undefined });
    await send(start(user, `video_${post.id}`));
    expect(lastText()).toBe(t("uz", "vid.not_video"));
    expect(await getPending(user)).toBeNull();
  });

  it("an unowned web brand: the channel's admin claims it here, as at a publish", async () => {
    const user = ++nextUser;
    const { brand, post } = await setup(null);
    members.set("@tandirnon:1", "administrator");
    members.set(`@tandirnon:${user}`, "creator");
    await send(start(user, `video_${post.id}`));
    expect((await store.getBrand(brand.id))?.ownerTelegramId).toBe(user);
    expect(await getPending(user)).toMatchObject({ kind: "video", postId: post.id });
  });
});

describe("the video arrives", () => {
  it("stored on the post (file id, length, thumbnail; no copy), the wait ends, the caption shown with [Approve] and [Open in the app]", async () => {
    const user = ++nextUser;
    const { post } = await setup(user);
    await store.approvePost(post.id);
    await send(start(user, `video_${post.id}`));
    await send(video(user));
    const saved = await store.getPost(post.id);
    expect(saved?.video).toMatchObject({ plan, fileId: "BAACvid1", fileUniqueId: "AgADvid1", as: "video", duration: 23, width: 720, height: 1280, thumbFileId: "AAMthumb1" });
    // The owner approves the post with this video: an earlier approval does not carry over.
    expect(saved?.status).toBe("draft");
    expect(await getPending(user)).toBeNull();
    const msg = sent().at(-1);
    expect(String(msg?.payload.text)).toContain(t("uz", "vid.got", { duration: "0:23", hook: "Tandirdan birinchi non" }));
    expect(String(msg?.payload.text)).toContain("Ertalab issiq patir");
    const buttons = buttonsOf(msg);
    expect(buttons[0].callback_data).toBe(`vda:${post.id}:${shownHash(saved!, "uz_latn")}`);
    expect(buttons[1].web_app?.url).toBe("https://mercat.test/tg");
    expect(events.find((e) => e.type === "video_received")?.props).toMatchObject({ post_id: post.id, seconds: 23, as: "video" });
    expect(JSON.stringify(events)).not.toContain("BAACvid1");
  });

  it("too long: said with the limit, the wait goes on, nothing stored", async () => {
    const user = ++nextUser;
    const { post } = await setup(user);
    await send(start(user, `video_${post.id}`));
    await send(video(user, { duration: 400 }));
    expect(lastText()).toBe(t("uz", "vid.too_long", { duration: "6:40", max: 3 }));
    expect((await store.getPost(post.id))?.video?.fileId).toBeUndefined();
    expect(await getPending(user)).toMatchObject({ kind: "video" });
  });

  it("a video sent as a file is taken (and goes out as a file); a photo is ignored; a short text gets a reminder", async () => {
    const user = ++nextUser;
    const { post } = await setup(user);
    await send(start(user, `video_${post.id}`));
    const before = sent().length;
    await send(message(user, { photo: [{ file_id: "ph", file_unique_id: "u", width: 100, height: 100 }] }));
    expect(sent().length).toBe(before);
    await send(text(user, "hozir"));
    expect(lastText()).toBe(t("uz", "vid.waiting"));
    await send(message(user, { document: { file_id: "BQACdoc", file_unique_id: "d1", file_name: "v.mp4", mime_type: "video/mp4", file_size: 5_000_000 } }));
    expect((await store.getPost(post.id))?.video).toMatchObject({ fileId: "BQACdoc", as: "document", mime: "video/mp4" });
    expect(lastText()).toContain(t("uz", "vid.as_file"));
  });

  it("[Cancel] ends the wait", async () => {
    const user = ++nextUser;
    const { post } = await setup(user);
    await send(start(user, `video_${post.id}`));
    await send(callback(user, `vdx:${post.id}`));
    expect(await getPending(user)).toBeNull();
    expect(lastText()).toBe(t("uz", "vid.cancelled"));
  });
});

describe("[Approve] under the received video", () => {
  it("approved and queued for its slot, with exactly what was shown", async () => {
    const user = ++nextUser;
    const { post } = await setup(user);
    members.set("@tandirnon:1", "administrator");
    await send(start(user, `video_${post.id}`));
    await send(video(user));
    const data = buttonsOf(sent().at(-1))[0].callback_data!;
    await send(callback(user, data));
    expect((await store.getPost(post.id))?.status).toBe("approved");
    expect(lastText()).toMatch(/@tandirnon/);
    expect(lastText()).toContain(t("uz", "vid.queued", { when: "X", channel: "tandirnon" }).split("X")[0]);
  });

  it("the post changed after the message (another video): nothing approved, the new state is shown", async () => {
    const user = ++nextUser;
    const { post } = await setup(user);
    await send(start(user, `video_${post.id}`));
    await send(video(user));
    const data = buttonsOf(sent().at(-1))[0].callback_data!;
    await store.setPostVideoFile(post.id, { fileId: "BAACvid2", as: "video", duration: 30 });
    await send(callback(user, data));
    expect((await store.getPost(post.id))?.status).toBe("draft");
    expect(lastText()).toContain(t("uz", "vid.changed"));
  });

  it("an idea (no slot): the usual publish preview, with the owner's video", async () => {
    const user = ++nextUser;
    const { post } = await setup(user, { slot: undefined });
    await send(start(user, `video_${post.id}`));
    await send(video(user));
    await send(callback(user, buttonsOf(sent().at(-1))[0].callback_data!));
    const preview = calls.filter((c) => c.method === "sendVideo").at(-1);
    expect(preview?.payload.video).toBe("BAACvid1");
    expect(String(preview?.payload.caption)).toContain("Ertalab issiq patir");
  });

  it("someone else's tap: refused", async () => {
    const user = ++nextUser;
    const { post } = await setup(user);
    await send(start(user, `video_${post.id}`));
    await send(video(user));
    const data = buttonsOf(sent().at(-1))[0].callback_data!;
    await send(callback(++nextUser, data));
    expect(lastText()).toBe(t("uz", "pub.not_yours"));
    expect((await store.getPost(post.id))?.status).toBe("draft");
  });
});
