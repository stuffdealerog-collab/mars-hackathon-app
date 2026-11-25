import { beforeEach, describe, expect, it, vi } from "vitest";

// QA 2026-11-25, engine fixes that live in the API routes: the daily Claude budget (E6), drafts written into an
// owned brand (E13), plan posts that mention a video or a past date (E3, E4), tracked links of web-made plans (E2)
// and the language of a 429 (E12d). No database (in-memory store), no network, no model: llmJson is a mock.
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => { throw new Error("outside a request"); } }));
vi.mock("@/lib/db", () => ({ isDbConfigured: () => false, getSql: () => { throw new Error("no db in tests"); }, pgErrorCode: () => undefined }));
vi.mock("@/lib/track", () => ({ safeLogEvent: async () => {} }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ TELEGRAM_BOT_TOKEN: "test-token", BOT_USERNAME: "mercatai" }), getPublicUrl: () => undefined }));
vi.mock("@/lib/telegram-auth", () => ({
  authenticateRequest: (req: Request) => {
    const m = /^tma (\d+)$/.exec(req.headers.get("authorization") ?? "");
    return m ? { id: Number(m[1]) } : null;
  },
  validateInitData: () => ({ ok: false }),
}));
vi.mock("@/lib/uslub/http", async () => await import("../src/lib/uslub/http"));
vi.mock("@/lib/uslub/budget", async () => await import("../src/lib/uslub/budget"));
vi.mock("@/lib/uslub/store", async () => await import("../src/lib/uslub/store"));
vi.mock("@/lib/uslub/context", async () => await import("../src/lib/uslub/context"));
vi.mock("@/lib/uslub/errors", async () => await import("../src/lib/uslub/errors"));
vi.mock("@/lib/uslub/placeholders", async () => await import("../src/lib/uslub/placeholders"));
vi.mock("@/lib/uslub/postguard", async () => await import("../src/lib/uslub/postguard"));
vi.mock("@/lib/uslub/slots", async () => await import("../src/lib/uslub/slots"));
vi.mock("@/lib/uslub/sensitivity", async () => await import("../src/lib/uslub/sensitivity"));
vi.mock("@/lib/uslub/copywriter", async () => await import("../src/lib/uslub/copywriter"));
// Owner answers and documents the posts route loads for the writer (none here), and the ending/link helpers.
vi.mock("@/lib/uslub/brain/answers", async () => await import("../src/lib/uslub/brain/answers"));
vi.mock("@/lib/uslub/brain/answers-store", () => ({ loadAnswers: async () => null }));
vi.mock("@/lib/uslub/brain/kbstore", () => ({ loadKnowledge: async () => ({ text: "", sources: [] }) }));
vi.mock("@/lib/uslub/ending", async () => await import("../src/lib/uslub/ending"));

const llmJson = vi.fn();
vi.mock("../src/lib/uslub/llm", () => ({
  llmJson,
  MODEL_QUALITY: "claude-sonnet-5-5",
  MODEL_FAST: "claude-haiku-5-5",
  LlmError: class extends Error {},
}));

const store = await import("../src/lib/uslub/store");
const budget = await import("../src/lib/uslub/budget");
const memory = await import("../src/lib/uslub/brain/memory");
const postsRoute = await import("../src/app/api/uslub/posts/route");
import type { BrandDNA } from "../src/lib/uslub/contract";

const DNA = { name: "Safia", languages: ["uz_latn"] } as unknown as BrandDNA;
let ip = 0;

function post(body: unknown, headers: Record<string, string> = {}) {
  ip++;
  return postsRoute.POST(
    new Request("http://localhost/api/uslub/posts", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${ip}`, ...headers },
      body: JSON.stringify(body),
    }),
  );
}

const SLOT = { day: "2026-11-27", time: "20:40", goal: "reach", hook: "Tortni qanday eritish kerak?", cta: "", brief: "Muzlatilgan tort haqida maslahat" };

const written = (uz: string, ru = "Совет: достаньте торт за 2 часа.", en = "Tip: take the cake out 2 hours early.") => ({
  posts: [{ angle: "tip", uz_latn: uz, ru, en }],
});

beforeEach(() => {
  llmJson.mockReset();
  budget.resetBudgetMemory();
  delete process.env.CLAUDE_DAILY_LIMIT;
  delete process.env.CLAUDE_ANON_DAILY_LIMIT;
});

describe("drafts in an owned brand's queue (E13)", () => {
  it("a channel_only brand claimed by its owner refuses drafts from anyone else, before any Claude call", async () => {
    const b = await store.saveBrand({ channel: "safiabakery", knowledge: "", samplePosts: [], dna: DNA, mode: "channel" }, 4242, "channel_only");
    const res = await post({ brandId: b.id, slots: [SLOT] });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("brand_forbidden");
    expect(llmJson).not.toHaveBeenCalled();
  });

  it("the owner (Telegram) and an unowned brand's id holder still get posts", async () => {
    llmJson.mockResolvedValue(written("Tortni 2 soat oldin oling."));
    const owned = await store.saveBrand({ channel: "safiabakery", knowledge: "", samplePosts: [], dna: DNA, mode: "channel" }, 4243, "channel_only");
    expect((await post({ brandId: owned.id, slots: [SLOT] }, { authorization: "tma 4243" })).status).toBe(200);
    const open = await store.saveBrand({ channel: "safiabakery", knowledge: "", samplePosts: [], dna: DNA, mode: "channel" }, null, "channel_only");
    expect((await post({ brandId: open.id, slots: [{ ...SLOT, day: "2026-11-28" }] })).status).toBe(200);
  });
});

describe("plan posts: format and dates (E3, E4)", () => {
  it("a picture post loses its 'save the video' line; a video post keeps it", async () => {
    const b = await store.saveBrand({ channel: "safiabakery", knowledge: "", samplePosts: [], dna: DNA, mode: "channel" }, null, "channel_only");
    llmJson.mockResolvedValue(written("Tortni 2 soat oldin oling. Videoni saqlab qo‘ying!", "Достаньте торт за 2 часа. Сохраните видео!", "Take the cake out 2 hours early. Save this video!"));
    const pic = (await (await post({ brandId: b.id, slots: [{ ...SLOT, day: "2026-11-29" }] })).json()).posts[0];
    expect(pic.variants.uz_latn).toBe("Tortni 2 soat oldin oling.");
    expect(pic.variants.ru).toBe("Достаньте торт за 2 часа.");
    expect(pic.variants.uz_cyrl).not.toMatch(/видео/i);
    const vid = (await (await post({ brandId: b.id, slots: [{ ...SLOT, day: "2026-11-30", format: "video" }] })).json()).posts[0];
    expect(vid.variants.uz_latn).toMatch(/Videoni saqlab/);
  });

  it("a post that announces an opening dated before its own day needs the owner's look, with a note in their language", async () => {
    const b = await store.saveBrand({ channel: "safiabakery", knowledge: "", samplePosts: [], dna: DNA, mode: "channel" }, null, "channel_only");
    llmJson.mockResolvedValue(written("Shota Rustaveli ko‘chasida yangi filial ochilmoqda! Ochilish sanasi: 03.11.2026", "Открываем филиал 03.11.2026!", "Opening on 03.11.2026!"));
    const body = await (await post({ brandId: b.id, slots: [{ ...SLOT, day: "2026-12-01", goal: "trust" }], lang: "ru" })).json();
    expect(body.posts[0].needsApproval).toBe(true);
    expect(body.posts[0].note).toMatch(/прошедшая дата \(03\.11\.2026\)/);
  });
});

describe("the daily Claude budget (E6)", () => {
  it("an anonymous caller over CLAUDE_ANON_DAILY_LIMIT gets a localized 429 budget_exhausted, before any Claude call", async () => {
    process.env.CLAUDE_ANON_DAILY_LIMIT = "1";
    llmJson.mockResolvedValue(written("Tortni 2 soat oldin oling."));
    const b = await store.saveBrand({ channel: "safiabakery", knowledge: "", samplePosts: [], dna: DNA, mode: "channel" }, null, "channel_only");
    const same = { "x-forwarded-for": "10.9.9.9" };
    expect((await post({ brandId: b.id, slots: [{ ...SLOT, day: "2026-12-02" }] }, same)).status).toBe(200);
    // A retry of the same slot hands back the post already written: no new bill, no budget unit.
    expect((await post({ brandId: b.id, slots: [{ ...SLOT, day: "2026-12-02" }] }, same)).status).toBe(200);
    expect(llmJson).toHaveBeenCalledTimes(1);
    const res = await post({ brandId: b.id, slots: [{ ...SLOT, day: "2026-12-03" }], lang: "ru" }, same);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toMatchObject({ code: "budget_exhausted", scope: "anonymous" });
    expect(body.error).toBe("Дневной лимит исчерпан. Попробуйте завтра или продолжите в Telegram через бота @mercatai.");
    expect(llmJson).toHaveBeenCalledTimes(1);
    // Another anonymous caller still has its own allowance; a Telegram user is not capped per caller.
    expect((await post({ brandId: b.id, slots: [{ ...SLOT, day: "2026-12-04" }] })).status).toBe(200);
  });

  it("the app-wide CLAUDE_DAILY_LIMIT stops everyone, Telegram users too", async () => {
    process.env.CLAUDE_DAILY_LIMIT = "2";
    expect(await budget.takeUnits({ actor: "tg:1", anonymous: false, weight: 1, route: "t" })).toBe("ok");
    expect(await budget.takeUnits({ actor: "ip:a", anonymous: true, weight: 1, route: "t" })).toBe("ok");
    expect(await budget.takeUnits({ actor: "tg:1", anonymous: false, weight: 1, route: "t" })).toBe("app");
  });

  it("an anonymous 'write them all again' costs two units; a verified user only counts app-wide", async () => {
    const limits = { daily: 100, anonDaily: 3 };
    expect(await budget.takeUnits({ actor: "ip:b", anonymous: true, weight: 2, route: "posts", limits })).toBe("ok");
    expect(await budget.takeUnits({ actor: "ip:b", anonymous: true, weight: 2, route: "posts", limits })).toBe("anonymous");
    expect(await budget.takeUnits({ actor: "ip:b", anonymous: true, weight: 1, route: "posts", limits })).toBe("ok");
    for (let i = 0; i < 5; i++) expect(await budget.takeUnits({ actor: "tg:7", anonymous: false, weight: 1, route: "posts", limits })).toBe("ok");
  });

  it("units older than 24 h no longer count", async () => {
    const limits = { daily: 1, anonDaily: 1 };
    const t0 = Date.parse("2026-11-25T08:00:00Z");
    expect(await budget.takeUnits({ actor: "ip:c", anonymous: true, weight: 1, route: "t", now: t0, limits })).toBe("ok");
    expect(await budget.takeUnits({ actor: "ip:c", anonymous: true, weight: 1, route: "t", now: t0 + 3600_000, limits })).toBe("app");
    expect(await budget.takeUnits({ actor: "ip:c", anonymous: true, weight: 1, route: "t", now: t0 + 25 * 3600_000, limits })).toBe("ok");
  });

  it("no raw IP is stored: the caller key is a hash", () => {
    expect(budget.spenderKey(null, "203.0.113.7")).toMatch(/^ip:[0-9a-f]{16}$/);
    expect(budget.spenderKey(null, "203.0.113.7")).not.toContain("203");
    expect(budget.spenderKey(55, "203.0.113.7")).toBe("tg:55");
  });
});

describe("a 429 answers in the owner's language even before the body is read (E12d)", () => {
  it("the rate limit reads body.lang", async () => {
    const b = await store.saveBrand({ channel: "safiabakery", knowledge: "", samplePosts: [], dna: DNA, mode: "channel" }, 777, "channel_only");
    const fixed = { "x-forwarded-for": "10.8.8.8" };
    let last: Response | null = null;
    for (let i = 0; i < 11; i++) {
      ip--; // keep one IP for all 11 calls
      last = await post({ brandId: b.id, slots: [SLOT], lang: "en" }, fixed);
    }
    expect(last?.status).toBe(429);
    expect((await (last as Response).json()).error).toMatch(/^Too many requests/);
  });
});

describe("tracked links of a plan made on the web (E2)", () => {
  it("claiming the brand in the bot gives its ownerless plans to the new owner", async () => {
    const b = await store.saveBrand({ channel: "safiabakery", knowledge: "", samplePosts: [], dna: DNA, mode: "channel" }, null, "channel_only");
    await memory.savePlan({ tag: "ab12cd", brandId: b.id, ownerTelegramId: null, channel: "safiabakery", weekOf: "2026-11-26", items: [], baseline: {} });
    expect((await memory.planByTag("ab12cd"))?.ownerTelegramId).toBeNull();
    expect(await store.claimBrand(b.id, 9001)).toBe(9001);
    expect((await memory.planByTag("ab12cd"))?.ownerTelegramId).toBe(9001);
    expect((await memory.latestPlanForOwner(9001))?.tag).toBe("ab12cd");
  });
});
