import { beforeEach, describe, expect, it, vi } from "vitest";

// The bot flow runs against the in-memory store (no DATABASE_URL) and a fake Telegram API.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ isDbConfigured: () => false, getSql: () => { throw new Error("no db in tests"); } }));
vi.mock("@/lib/track", () => ({ safeLogEvent: async () => {} }));
vi.mock("@/lib/i18n", async () => await import("../src/lib/i18n"));
vi.mock("@/lib/env", () => ({ getEnv: () => ({}), getPublicUrl: () => undefined }));
vi.mock("@/lib/telegram-auth", () => ({ authenticateRequest: () => null, validateInitData: () => ({ ok: false }) }));
const publishPost = vi.fn(async (args: { postId: string; userId: number | null; chat: string }) => ({ ok: true, status: 200, url: `https://t.me/${args.chat.replace("@", "")}/42` }));
vi.mock("../src/lib/uslub/publish", () => ({ publishPost, addBotAsAdminLink: () => "https://t.me/test_bot?startchannel&admin=post_messages" }));

const { startPublish, publishFromButton, answerPendingChannel } = await import("../src/lib/uslub/botpublish");
const { parseCallback, shownHash } = await import("../src/lib/uslub/botpublish-core");
const store = await import("../src/lib/uslub/store");
const { assertDraftAccess, loadBrandFor } = await import("../src/lib/uslub/http");
import type { BrandDNA, PostDraft } from "../src/lib/uslub/contract";

const BOT_ID = 999;
type Member = { status: string; can_post_messages?: boolean } | null;

function fakeApi(members: Record<string, Record<number, Member>>) {
  const sent: { method: string; text?: string; photo?: string; opts?: Record<string, unknown> }[] = [];
  const api = {
    getMe: async () => ({ id: BOT_ID }),
    getChatMember: async (chat: string, userId: number) => {
      const m = members[chat.toLowerCase()]?.[userId];
      if (!m) {
        const { GrammyError } = await import("grammy");
        throw new GrammyError("Bad Request: member list is inaccessible", { ok: false, error_code: 400, description: "member list is inaccessible" }, "getChatMember", {});
      }
      return { ...m, user: { id: userId } };
    },
    sendMessage: async (_chat: number, text: string, opts?: Record<string, unknown>) => {
      sent.push({ method: "sendMessage", text, opts });
      return { message_id: sent.length };
    },
    sendPhoto: async (_chat: number, photo: string, opts?: Record<string, unknown>) => {
      sent.push({ method: "sendPhoto", photo, opts });
      return { message_id: sent.length };
    },
  };
  return { api: api as never, sent };
}

const buttons = (opts?: Record<string, unknown>) =>
  ((opts?.reply_markup as { inline_keyboard?: { text: string; callback_data?: string; url?: string }[][] } | undefined)?.inline_keyboard ?? []).flat();

const dna = { name: "Test", languages: ["uz_latn"] } as unknown as BrandDNA;

async function makePost(channel: string | undefined, owner: number | null, image?: PostDraft["image"]) {
  const brand = await store.saveBrand({ channel, knowledge: "Uyda tort pishiraman, Chilonzor.", samplePosts: [], dna, mode: channel ? "channel" : "fresh" }, owner, "custom");
  const post: PostDraft = {
    id: crypto.randomUUID(),
    brandId: brand.id,
    brief: "b",
    variants: { uz_latn: "Bento-tort 150 000 so‘mdan.", uz_cyrl: "Бенто-торт 150 000 сўмдан.", ru: "Бенто-торт от 150 000 сум.", en: "Bento cake from 150,000 sum." },
    neuroHits: {},
    humanScore: 90,
    status: "draft",
    ...(image ? { image } : {}),
    createdAt: new Date().toISOString(),
  };
  await store.savePosts([post]);
  return { brand, post };
}

describe("publish from the bot (t.me/<bot>?start=publish_<postId>)", () => {
  beforeEach(() => {
    publishPost.mockClear();
  });

  it("shows the post with its picture and claims an unowned web brand for the channel's creator", async () => {
    const { brand, post } = await makePost("tortlar_uz", null, { status: "ready", url: "https://cdn.example/p.jpg", refsUsed: 2 });
    const { api, sent } = fakeApi({ "@tortlar_uz": { 7: { status: "creator" }, [BOT_ID]: { status: "administrator", can_post_messages: true } } });

    expect(await startPublish(api, 7, { id: 7 }, "uz", `publish_${post.id}_ru`)).toBe(true);
    const photo = sent.find((m) => m.method === "sendPhoto");
    expect(photo?.photo).toBe("https://cdn.example/p.jpg");
    expect(photo?.opts?.caption).toBe("Бенто-торт от 150 000 сум.");
    const pb = buttons(photo?.opts).find((b) => b.callback_data?.startsWith(`pb:${post.id}:r:`));
    expect(pb).toBeDefined();
    const data = parseCallback(pb?.callback_data ?? "");
    // The button is bound to the text AND the picture the owner saw.
    expect(data?.hash).toBe(shownHash(post, "ru"));

    await publishFromButton(api, 7, { id: 7 }, "uz", post.id, "ru", data?.hash);
    expect((await store.getBrand(brand.id))?.ownerTelegramId).toBe(7);
    expect(publishPost).toHaveBeenCalledWith({
      postId: post.id,
      script: "ru",
      chat: "tortlar_uz",
      userId: 7,
      // publish.ts re-checks exactly what the owner saw right before sending.
      expectedText: "Бенто-торт от 150 000 сум.",
      expectedImageUrl: "https://cdn.example/p.jpg",
    });
    expect(sent.at(-1)?.text).toContain("https://t.me/tortlar_uz/42");

    // The web Studio that created the brand (anonymous, holds the id) keeps working after the claim.
    const claimed = await loadBrandFor(brand.id, null);
    await expect(assertDraftAccess(claimed, null)).resolves.toBeUndefined();
  });

  it("a new picture after the preview also blocks publishing (the channel gets only what the owner saw)", async () => {
    const { post } = await makePost("tortlar8_uz", 7, { status: "ready", url: "https://cdn.example/a.jpg", refsUsed: 1 });
    const seen = shownHash(post, "uz_latn");
    await store.setPostImage(post.id, { status: "running", url: "https://cdn.example/b.jpg", refsUsed: 1 });
    const { api, sent } = fakeApi({});
    await publishFromButton(api, 7, { id: 7 }, "uz", post.id, "uz_latn", seen);
    expect(publishPost).not.toHaveBeenCalled();
    expect(sent.find((m) => m.method === "sendPhoto")?.photo).toBe("https://cdn.example/b.jpg");
  });

  it("a post with an unfilled slot gets no publish button, only a note; an old button is refused", async () => {
    const { post } = await makePost("tortlar9_uz", 7);
    await store.approvePost(post.id, 7, { variants: { ...post.variants, uz_latn: "Chegirma kodi: [kod]. Buyurtma: @tortlar9_uz" }, neuroHits: {}, humanScore: 80, changed: ["uz_latn"] });
    const { api, sent } = fakeApi({});
    await startPublish(api, 7, { id: 7 }, "ru", `publish_${post.id}_uz_latn`);
    const preview = sent.find((m) => m.text?.includes("[kod]"));
    expect(buttons(preview?.opts).some((b) => b.callback_data?.startsWith("pb:"))).toBe(false);
    expect(sent.at(-1)?.text).toMatch(/незаполненное место: «\[kod\]»/);
    const fresh = await store.getPost(post.id);
    await publishFromButton(api, 7, { id: 7 }, "ru", post.id, "uz_latn", fresh ? shownHash(fresh, "uz_latn") : undefined);
    expect(publishPost).not.toHaveBeenCalled();
  });

  it("keeps a brand created in the bot private to its owner", async () => {
    const { brand } = await makePost("bot_brand_uz", 55);
    await expect(loadBrandFor(brand.id, null)).rejects.toMatchObject({ status: 403, code: "brand_forbidden" });
    await expect(assertDraftAccess(brand, 56)).rejects.toMatchObject({ status: 403 });
    await expect(assertDraftAccess(brand, 55)).resolves.toBeUndefined();
  });

  it("falls back to a real variant when a button names an empty one", async () => {
    const { post } = await makePost("tortlar5_uz", 7);
    await store.approvePost(post.id, 7, { variants: { ...post.variants, en: "" }, neuroHits: {}, humanScore: 90, changed: ["en"] });
    const { api } = fakeApi({});
    await publishFromButton(api, 7, { id: 7 }, "en", post.id, "en", shownHash(post, "uz_latn"));
    expect(publishPost).toHaveBeenCalledWith(expect.objectContaining({ script: "uz_latn" }));
  });

  it("never publishes a text the owner has not seen: an edit after the preview shows the new version instead", async () => {
    const { post } = await makePost("tortlar6_uz", 7);
    const seen = shownHash(post, "uz_latn");
    await store.approvePost(post.id, null, { variants: { ...post.variants, uz_latn: "Boshqa odam yozgan matn." }, neuroHits: {}, humanScore: 90, changed: ["uz_latn"] });
    const { api, sent } = fakeApi({});
    await publishFromButton(api, 7, { id: 7 }, "uz", post.id, "uz_latn", seen);
    expect(publishPost).not.toHaveBeenCalled();
    expect(sent[0].text).toMatch(/o‘zgargan/);
    expect(sent[1].text).toBe("Boshqa odam yozgan matn.");
    // An edit that lands while the bot is checking channel rights is caught by the re-read before sending.
    const race = await makePost("tortlar7_uz", null);
    const raceApi = fakeApi({ "@tortlar7_uz": { 7: { status: "creator" }, [BOT_ID]: { status: "administrator", can_post_messages: true } } });
    const getChatMember = raceApi.api as unknown as { getChatMember: (c: string, u: number) => Promise<unknown> };
    const original = getChatMember.getChatMember;
    getChatMember.getChatMember = async (c, u) => {
      await store.approvePost(race.post.id, null, { variants: { ...race.post.variants, uz_latn: "Ichkariga kirib olgan matn." }, neuroHits: {}, humanScore: 90, changed: ["uz_latn"] });
      return original(c, u);
    };
    await publishFromButton(raceApi.api, 7, { id: 7 }, "uz", race.post.id, "uz_latn", shownHash(race.post, "uz_latn"));
    expect(publishPost).not.toHaveBeenCalled();
    expect(raceApi.sent.some((m) => m.text === "Ichkariga kirib olgan matn.")).toBe(true);
    // A button without a hash (old message) is treated the same way.
    await publishFromButton(api, 7, { id: 7 }, "uz", post.id, "uz_latn");
    expect(publishPost).not.toHaveBeenCalled();
  });

  it("never lets a non-admin claim or publish", async () => {
    const { brand, post } = await makePost("tortlar2_uz", null);
    const { api, sent } = fakeApi({ "@tortlar2_uz": { 8: { status: "member" }, [BOT_ID]: { status: "administrator", can_post_messages: true } } });
    await publishFromButton(api, 8, { id: 8 }, "ru", post.id, "uz_latn", shownHash(post, "uz_latn"));
    expect(publishPost).not.toHaveBeenCalled();
    expect((await store.getBrand(brand.id))?.ownerTelegramId).toBeNull();
    expect(sent.at(-1)?.text).toMatch(/не владелец и не админ/);
  });

  it("asks to add the bot first when it cannot post (and does not claim)", async () => {
    const { brand, post } = await makePost("tortlar3_uz", null);
    const { api, sent } = fakeApi({ "@tortlar3_uz": { 7: { status: "creator" } } });
    await publishFromButton(api, 7, { id: 7 }, "en", post.id, "uz_latn", shownHash(post, "uz_latn"));
    expect(publishPost).not.toHaveBeenCalled();
    expect((await store.getBrand(brand.id))?.ownerTelegramId).toBeNull();
    expect(sent.at(-1)?.text).toMatch(/Make the bot an admin/);
    expect(buttons(sent.at(-1)?.opts).some((b) => b.url?.includes("startchannel"))).toBe(true);
  });

  it("does not show someone else's post", async () => {
    const { post } = await makePost("tortlar4_uz", 100);
    const { api, sent } = fakeApi({});
    await startPublish(api, 7, { id: 7 }, "uz", `publish_${post.id}`);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toMatch(/boshqa foydalanuvchining/);
    expect(sent[0].text).not.toContain("Bento");
  });

  it("fresh brand without a channel: asks for it, verifies rights, links it and offers the button", async () => {
    const { brand, post } = await makePost(undefined, null);
    const { api, sent } = fakeApi({ "@yangi_tortlar": { 7: { status: "administrator", can_post_messages: true }, [BOT_ID]: { status: "administrator", can_post_messages: true } } });
    await startPublish(api, 7, { id: 7 }, "uz", `publish_${post.id}`);
    expect(sent.at(-1)?.text).toMatch(/qaysi kanalga/);

    // Anything that is not "@name" or a t.me link is not an answer (it goes to normal onboarding); the right channel links it.
    expect(await answerPendingChannel(api, 7, { id: 7 }, "uz", "salom")).toBe(false);
    expect(await answerPendingChannel(api, 7, { id: 7 }, "uz", "@yangi_tortlar")).toBe(true);
    const linked = await store.getBrand(brand.id);
    expect(linked?.channel).toBe("yangi_tortlar");
    expect(linked?.ownerTelegramId).toBe(7);
    expect(buttons(sent.at(-1)?.opts).some((b) => b.callback_data === `pb:${post.id}:l:${shownHash(post, "uz_latn")}`)).toBe(true);
    // Nothing pending any more: the next channel link is onboarding again.
    expect(await answerPendingChannel(api, 7, { id: 7 }, "uz", "@boshqa_kanal")).toBe(false);
  });
});
