import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------- mocks (no network, no Claude, no DB)
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => { throw new Error("outside a request"); } }));
vi.mock("@/lib/db", () => ({ isDbConfigured: () => false, getSql: () => { throw new Error("no db in tests"); } }));
vi.mock("@/lib/track", () => ({ safeLogEvent: async () => {} }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ TELEGRAM_BOT_TOKEN: "test-token" }), getPublicUrl: () => undefined }));
vi.mock("@/lib/telegram-auth", () => ({
  authenticateRequest: (req: Request) => (req.headers.get("x-test-user") ? { id: Number(req.headers.get("x-test-user")) } : null),
  validateInitData: () => ({ ok: false }),
}));
// The routes import engine modules through "@/lib/uslub/…": point them at the same files the test uses.
vi.mock("@/lib/uslub/edits", async () => await import("../src/lib/uslub/edits"));
vi.mock("@/lib/uslub/http", async () => await import("../src/lib/uslub/http"));
vi.mock("@/lib/uslub/botpublish-core", async () => await import("../src/lib/uslub/botpublish-core"));
vi.mock("@/lib/uslub/placeholders", async () => await import("../src/lib/uslub/placeholders"));
vi.mock("@/lib/uslub/store", async () => await import("../src/lib/uslub/store"));
vi.mock("@/lib/uslub/context", async () => await import("../src/lib/uslub/context"));
vi.mock("@/lib/uslub/errors", async () => await import("../src/lib/uslub/errors"));
vi.mock("@/lib/uslub/publish-errors", async () => await import("../src/lib/uslub/publish-errors"));
const publishPost = vi.fn(async (): Promise<{ ok: boolean; status: number; url?: string; error?: string; addAdminUrl?: string }> => ({ ok: true, status: 200, url: "https://t.me/x/1" }));
vi.mock("@/lib/uslub/publish", () => ({ publishPost, addBotAsAdminLink: () => "https://t.me/test_bot?startchannel&admin=post_messages" }));
// The publish route sends through publish-once.ts, which imports "./publish": the same fake there.
vi.mock("../src/lib/uslub/publish", () => ({ publishPost, addBotAsAdminLink: () => "https://t.me/test_bot?startchannel&admin=post_messages" }));
vi.mock("@/lib/uslub/publish-once", async () => await import("../src/lib/uslub/publish-once"));

// The copywriter's model calls, by purpose.
const llmJson = vi.fn();
vi.mock("../src/lib/uslub/llm", () => ({
  llmJson,
  MODEL_QUALITY: "claude-sonnet-5-5",
  MODEL_FAST: "claude-haiku-5-5",
  LlmError: class extends Error {},
}));

import { findPlaceholders, placeholderNote, placeholdersIn } from "../src/lib/uslub/placeholders";
const store = await import("../src/lib/uslub/store");
const { generatePosts } = await import("../src/lib/uslub/copywriter");
const approveRoute = await import("../src/app/api/uslub/posts/approve/route");
const publishRoute = await import("../src/app/api/uslub/publish/route");
import type { BrandDNA, PostDraft } from "../src/lib/uslub/contract";

describe("finding unfilled template slots", () => {
  it("catches [kod], {narx}, <telefon>, {{LINK}}, ____ and XXX in any script", () => {
    expect(findPlaceholders("Kod: [kod]")).toEqual(["[kod]"]);
    expect(findPlaceholders("Narxi {narx}, tel <telefon>")).toEqual(["{narx}", "<telefon>"]);
    expect(findPlaceholders("Buyurtma: {{LINK}}")).toEqual(["{{LINK}}"]);
    expect(findPlaceholders("Ism: ____")).toEqual(["____"]);
    expect(findPlaceholders("+998 XX XXX XX XX")).toEqual(["XXX"]);
    expect(findPlaceholders("Тел: ХХХ-ХХ-ХХ")).toEqual(["ХХХ"]);
  });

  it("leaves real content alone", () => {
    expect(findPlaceholders("Napoleon torti 180 000 so‘m. XXL o‘lcham ham bor. Taxi bilan yetkazamiz.")).toEqual([]);
    expect(findPlaceholders("Manba [1], kanal [https://t.me/kanal]")).toEqual([]);
  });

  it("checks only the given non-empty variants and explains in uz/ru/en", () => {
    expect(placeholdersIn({ uz_latn: "Kod: [kod]", ru: "Код уточните у админа", en: "" }, ["uz_latn", "ru", "en"])).toEqual([{ script: "uz_latn", tokens: ["[kod]"] }]);
    expect(placeholderNote(["[kod]"], "uz")).toMatch(/to‘ldirilmagan joy qoldi: «\[kod\]»/);
    expect(placeholderNote(["[kod]"], "ru")).toMatch(/незаполненное место: «\[kod\]»/);
    expect(placeholderNote(["[kod]"], "en")).toMatch(/blank to fill: «\[kod\]»/);
  });
});

const brand = async () =>
  store.saveBrand({ knowledge: "Life Smile idishlari. Buyurtma: @lifesmile_admin", samplePosts: [], dna: { name: "Life Smile", languages: ["uz_latn"] } as unknown as BrandDNA, mode: "channel" }, null, "custom");

const written = {
  posts: [
    {
      angle: "promo",
      uz_latn: "Yangi idishlar to‘plami keldi. Chegirma kodi: [kod]. Buyurtma uchun @lifesmile_admin ga yozing.",
      ru: "Пришёл новый набор посуды. Промокод: [kod]. Для заказа пишите @lifesmile_admin.",
      en: "A new cookware set has arrived. Promo code: [kod]. To order, message @lifesmile_admin.",
    },
  ],
};

describe("the copywriter fixes slots that slipped through", () => {
  beforeEach(() => {
    llmJson.mockReset();
  });

  it("rewrites just those sentences when the fix adds no new facts", async () => {
    llmJson.mockImplementation(async (opts: { purpose?: string; prompt: string }) => {
      if (opts.purpose === "copywriter") return written;
      if (opts.purpose === "placeholder_fix") {
        const ids = [...opts.prompt.matchAll(/### id: (\S+)/g)].map((m) => m[1]);
        return {
          items: ids.map((id) => ({
            id,
            text: id.endsWith(":uz_latn")
              ? "Yangi idishlar to‘plami keldi. Chegirma kodini adminga yozib so‘rang. Buyurtma uchun @lifesmile_admin ga yozing."
              : id.endsWith(":ru")
                ? "Пришёл новый набор посуды. Промокод уточните у администратора. Для заказа пишите @lifesmile_admin."
                : "A new cookware set has arrived. Ask the admin for the promo code. To order, message @lifesmile_admin.",
          })),
        };
      }
      return { items: [] };
    });
    const [post] = await generatePosts(await brand(), "brief", 1, { deadline: Date.now() + 60_000 });
    expect(placeholdersIn(post.variants, ["uz_latn", "uz_cyrl", "ru", "en"])).toEqual([]);
    expect(post.variants.uz_latn).toMatch(/adminga yozib so.rang/); // the Uzbek polisher normalises the apostrophe
    expect(post.variants.uz_cyrl).not.toContain("[kod]");
  });

  it("keeps the post held back when the fix would invent a value", async () => {
    llmJson.mockImplementation(async (opts: { purpose?: string; prompt: string }) => {
      if (opts.purpose === "copywriter") return written;
      if (opts.purpose === "placeholder_fix") {
        const ids = [...opts.prompt.matchAll(/### id: (\S+)/g)].map((m) => m[1]);
        return { items: ids.map((id) => ({ id, text: "Yangi idishlar to‘plami keldi. Chegirma kodi: SMILE20, 20% chegirma! Buyurtma: @lifesmile_admin." })) };
      }
      return { items: [] };
    });
    const [post] = await generatePosts(await brand(), "brief", 1, { deadline: Date.now() + 60_000 });
    expect(findPlaceholders(post.variants.uz_latn)).toEqual(["[kod]"]);
    expect(post.variants.uz_latn).not.toContain("SMILE20");
  });
});

describe("approve and publish refuse a post with a blank (placeholder_left)", () => {
  async function postWithBlank(owner: number | null): Promise<PostDraft> {
    const b = await store.saveBrand({ channel: "lifesmileuz", knowledge: "x", samplePosts: [], dna: { name: "Life Smile", languages: ["uz_latn"] } as unknown as BrandDNA, mode: "channel" }, owner, "custom");
    const post: PostDraft = {
      id: crypto.randomUUID(),
      brandId: b.id,
      brief: "b",
      variants: { uz_latn: "Chegirma kodi: [kod]. Buyurtma: @lifesmile_admin", uz_cyrl: "Чегирма коди: [kod].", ru: "Промокод: [kod].", en: "Promo code: [kod]." },
      neuroHits: {},
      humanScore: 80,
      status: "draft",
      createdAt: new Date().toISOString(),
    };
    await store.savePosts([post]);
    return post;
  }
  const req = (url: string, body: object, user?: number) =>
    new Request(url, { method: "POST", headers: { "Content-Type": "application/json", ...(user ? { "x-test-user": String(user) } : {}) }, body: JSON.stringify(body) });

  it("approve says which blank to fill, in the owner's language; filling it lets the approval through", async () => {
    const post = await postWithBlank(null);
    const refused = await approveRoute.POST(req("http://x/api/uslub/posts/approve", { postId: post.id, lang: "ru" }));
    expect(refused.status).toBe(422);
    const body = (await refused.json()) as { code: string; error: string };
    expect(body.code).toBe("placeholder_left");
    expect(body.error).toMatch(/незаполненное место: «\[kod\]»/);
    expect((await store.getPost(post.id))?.status).toBe("draft");

    const ok = await approveRoute.POST(req("http://x/api/uslub/posts/approve", { postId: post.id, lang: "uz", variants: { uz_latn: "Chegirma kodini adminga yozing. Buyurtma: @lifesmile_admin" } }));
    expect(ok.status).toBe(200);
    const approved = ((await ok.json()) as { post: PostDraft }).post;
    expect(approved.status).toBe("approved");
    expect(approved.variants.uz_cyrl).not.toContain("[kod]");
  });

  it("publish refuses the owner's post with a blank and never calls publishPost", async () => {
    publishPost.mockClear();
    const post = await postWithBlank(7);
    const res = await publishRoute.POST(req("http://x/api/uslub/publish", { postId: post.id, script: "uz_latn", chat: "@lifesmileuz", lang: "en" }, 7));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe("placeholder_left");
    expect(body.error).toMatch(/blank to fill/);
    expect(publishPost).not.toHaveBeenCalled();
  });

  it("publish: bot_not_admin always comes with the add-bot link, even when publishPost gave none", async () => {
    const post = await postWithBlank(8);
    await store.approvePost(post.id, 8, { variants: { ...post.variants, uz_latn: "Chegirma kodini adminga yozing." }, neuroHits: {}, humanScore: 80, changed: ["uz_latn"] });
    // The bot is in the channel but cannot post: publishPost refuses with access.ts's message and no addAdminUrl.
    publishPost.mockImplementationOnce(async () => ({ ok: false, status: 403, error: "Botni kanalga admin qiling va «Post yozish» huquqini bering: " }));
    const res = await publishRoute.POST(req("http://x/api/uslub/publish", { postId: post.id, script: "uz_latn", chat: "@lifesmileuz", lang: "ru" }, 8));
    const body = (await res.json()) as { code: string; error: string; addAdminUrl?: string };
    expect(res.status).toBe(403);
    expect(body.code).toBe("bot_not_admin");
    expect(body.error).toMatch(/Сделайте бота админом/);
    expect(body.addAdminUrl).toBe("https://t.me/test_bot?startchannel&admin=post_messages");
  });
});
