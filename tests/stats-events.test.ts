import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// after() outside a request throws: handle() then lets the write run on its own, which the tests wait for.
vi.mock("next/server", () => ({ after: () => { throw new Error("outside a request"); } }));

// logEvent writes through getSql(): capture the rows instead of talking to a database.
const inserted: { telegramId: unknown; type: unknown; props: Record<string, unknown> }[] = [];
let dbOn = true;
const fakeDb = () => ({
  isDbConfigured: () => dbOn,
  getSql: () => (_strings: TemplateStringsArray, ...values: unknown[]) => {
    inserted.push({ telegramId: values[0], type: values[1], props: JSON.parse(String(values[2])) });
    return Promise.resolve([]);
  },
  pgErrorCode: () => undefined,
});
vi.mock("../src/lib/db", () => fakeDb());
vi.mock("@/lib/db", () => fakeDb());
vi.mock("@/lib/track", async () => await import("../src/lib/track"));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ TELEGRAM_BOT_TOKEN: "123456:TEST-bot-token" }), getPublicUrl: () => "https://mercat.test" }));
vi.mock("@/lib/telegram-auth", () => ({
  authenticateRequest: (req: Request) => {
    const m = /^tma (\d+)$/.exec(req.headers.get("authorization") ?? "");
    return m ? { id: Number(m[1]) } : null;
  },
  validateInitData: () => ({ ok: false }),
}));
vi.mock("@/lib/uslub/handoff", async () => await import("../src/lib/uslub/handoff"));

const { handle, HttpError, json, miniAppUserId } = await import("../src/lib/uslub/http");
const { editDiff, editDiffs, errorCode, errorRoute, logApiError, logPostEdited, logPostRegenerated, logPostRejected, logTrialStarted, MinuteCap } =
  await import("../src/lib/stats-events");
const { STATS_EVENT } = await import("../src/lib/stats-meta");

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
const UUID = "3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b";

beforeEach(() => {
  inserted.length = 0;
  dbOn = true;
  vi.stubEnv("VERCEL_ENV", "production");
});
afterEach(() => vi.unstubAllEnvs());

const call = (path: string, authorization?: string) =>
  new Request(`https://mercat.test/api/${path}`, {
    method: "POST",
    headers: { "user-agent": CHROME, "x-forwarded-for": "203.0.113.60", ...(authorization ? { authorization } : {}) },
    body: "{}",
  });

describe("MinuteCap (flood guard for error rows)", () => {
  it("allows a few rows per key and a total per minute, then starts over", () => {
    const cap = new MinuteCap(2, 3);
    const t0 = Date.UTC(2026, 10, 25, 10, 0, 0);
    expect(cap.take("a", t0)).toBe(true);
    expect(cap.take("a", t0 + 1)).toBe(true);
    expect(cap.take("a", t0 + 2)).toBe(false); // third for the same key
    expect(cap.take("b", t0 + 3)).toBe(true);
    expect(cap.take("c", t0 + 4)).toBe(false); // fourth in all
    expect(cap.take("a", t0 + 60_000)).toBe(true); // next minute
  });
});

describe("api_error rows", () => {
  it("keep the route and the code as categories, never ids or text", () => {
    expect(errorRoute("uslub/posts/approve")).toBe("uslub/posts/approve");
    expect(errorRoute("/api/uslub/brand/")).toBe("uslub/brand");
    expect(errorRoute(`uslub/brand/${UUID}`)).toBe("uslub/brand/:id");
    expect(errorRoute("uslub/x/8123456789")).toBe("uslub/x/:id");
    expect(errorRoute("uslub/<script>")).toBe("other");
    expect(errorRoute("")).toBe("other");
    expect(errorCode("rate_limited")).toBe("rate_limited");
    expect(errorCode("Brand not found")).toBe("other");
    expect(errorCode(42)).toBe("other");
  });

  it("are written in production only, and capped", async () => {
    const cap = new MinuteCap(1, 10);
    expect(logApiError("uslub/posts", "ai_busy", 429, { env: "dev", cap })).toBeNull();
    await logApiError("uslub/posts", "ai_busy", 429, { env: "prod", cap });
    expect(logApiError("uslub/posts", "ai_busy", 429, { env: "prod", cap })).toBeNull();
    expect(inserted).toEqual([{ telegramId: null, type: "api_error", props: { route: "uslub/posts", code: "ai_busy", status: 429, env: "prod" } }]);
  });

  it("handle(): a thrown error is one row with its code and status, the ambient surface and visitor, and no message", async () => {
    const route = handle(async () => {
      throw new HttpError(429, "secret detail about 203.0.113.60", "budget_exhausted");
    });
    const res = await route(call("uslub/posts"));
    expect(res.status).toBe(429);
    await vi.waitFor(() => expect(inserted).toHaveLength(1));
    const row = inserted[0];
    expect(row.type).toBe(STATS_EVENT.apiError);
    expect(row.telegramId).toBeNull();
    expect(row.props).toEqual({ route: "uslub/posts", code: "budget_exhausted", status: 429, surface: "web", visitor: expect.stringMatching(/^v:[0-9a-f]{16}$/), env: "prod" });
    expect(JSON.stringify(row)).not.toContain("secret");
    expect(JSON.stringify(row)).not.toContain("203.0.113");
  });

  it("handle(): an unexpected error reads 'internal'; a Mini App user is the Telegram id, not a visitor key", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const route = handle(async (req) => {
      miniAppUserId(req);
      throw new Error("db password=hunter2 leaked");
    });
    expect((await route(call("uslub/brand", "tma 4242"))).status).toBe(500);
    await vi.waitFor(() => expect(inserted).toHaveLength(1));
    expect(inserted[0]).toEqual({ telegramId: 4242, type: "api_error", props: { route: "uslub/brand", code: "internal", status: 500, surface: "miniapp", env: "prod" } });
    expect(JSON.stringify(inserted)).not.toContain("hunter2");
  });

  it("handle(): a returned error answer is logged with the code from its body; a success is not", async () => {
    const refusing = handle(async () => json({ error: "Kod: [kod] is still empty", code: "placeholder_left" }, 422));
    const fine = handle(async () => json({ ok: true }));
    const plain = handle(async () => new Response("gone", { status: 410 }));
    expect((await refusing(call("uslub/publish"))).status).toBe(422);
    expect((await fine(call("uslub/plan"))).status).toBe(200);
    expect((await plain(call("uslub/radar"))).status).toBe(410);
    await vi.waitFor(() => expect(inserted).toHaveLength(2));
    expect(inserted.map((r) => r.props)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ route: "uslub/publish", code: "placeholder_left", status: 422 }),
        expect.objectContaining({ route: "uslub/radar", status: 410 }),
      ]),
    );
    expect(JSON.stringify(inserted)).not.toContain("[kod]");
  });

  it("handle(): the response body still reaches the caller after the error was read", async () => {
    const refusing = handle(async () => json({ error: "nope", code: "brand_forbidden" }, 403));
    const res = await refusing(call("uslub/posts/approve"));
    expect(await res.json()).toEqual({ error: "nope", code: "brand_forbidden" });
  });

  it("handle(): nothing is written outside production", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const route = handle(async () => {
      throw new HttpError(404, "Brand not found", "brand_not_found");
    });
    const returned = handle(async () => json({ error: "x", code: "conflict" }, 409));
    await route(call("uslub/brand"));
    await returned(call("uslub/brand"));
    await new Promise((r) => setTimeout(r, 20));
    expect(inserted).toEqual([]);
  });
});

describe("edit diffs (post_edited)", () => {
  const before =
    "Yangi non keldi! Narxi: [narx] so'm.\nBuyurtma: t.me/mercatai?start=src_ab12cd_3\nTandir noni issiq va mazali.";
  const after = "Yangi non keldi! Narxi: 12 000 so'm.\nBuyurtma: +998 90 123 45 67\nTandir noni issiq, mazali va arzon.";

  it("counts what changed, without any of the text", () => {
    const diff = editDiff("uz_latn", before, after);
    expect(diff).toMatchObject({
      script: "uz_latn",
      chars_before: before.length,
      chars_after: after.length,
      placeholders_filled: 1,
      link_removed: true,
      phone_added: true,
      lines_changed: 3,
    });
    expect(diff.words_added).toBeGreaterThan(0);
    expect(diff.words_removed).toBeGreaterThan(0);
    const json = JSON.stringify(diff);
    for (const word of ["non", "narx", "mercatai", "998", "Tandir"]) expect(json).not.toContain(word);
    for (const value of Object.values(diff)) expect(["number", "boolean", "string"]).toContain(typeof value);
  });

  it("reads a moved word as no change and an identical text as no diff", () => {
    expect(editDiff("ru", "один два три", "три два один")).toMatchObject({ words_added: 0, words_removed: 0 });
    expect(editDiffs({ ru: "a" }, { ru: "a" }, ["ru"])).toEqual([]);
    expect(editDiffs({ ru: "a" }, { en: "b" }, ["ru", "en"])).toEqual([]);
    expect(editDiffs({ ru: "a b" }, { ru: "a c" }, ["ru", "ru"])).toHaveLength(1);
  });

  it("logs one post_edited row with numbers only, and nothing when nothing changed", async () => {
    await logPostEdited(77, UUID, { uz_latn: before, ru: "Тот же текст" }, { uz_latn: after, ru: "Тот же текст" }, ["uz_latn", "ru"]);
    expect(logPostEdited(77, UUID, { ru: "x" }, { ru: "x" }, ["ru"])).toBeNull();
    expect(inserted).toHaveLength(1);
    expect(inserted[0].type).toBe("post_edited");
    expect(inserted[0].telegramId).toBe(77);
    expect(inserted[0].props).toMatchObject({ post_id: UUID, scripts: ["uz_latn"], env: "prod" });
    expect(JSON.stringify(inserted[0].props.diff)).not.toMatch(/non|narx|mercatai|Тот/);
  });
});

describe("regenerations, rejections and the trial (helpers for the other streams)", () => {
  it("write their event with whitelisted codes only", async () => {
    await logPostRegenerated(5, { postId: UUID, why: "rewrite_phrase" });
    await logPostRegenerated(5, { brandId: UUID, why: "made up" as never });
    await logPostRejected(5, { postId: UUID, reason: "wrong_contact" });
    await logPostRejected(5, { postId: UUID, reason: "it's bad <b>" as never });
    await logTrialStarted(5, { brandId: UUID, since: "2026-11-25T10:00:00Z", trialEndsAt: "2026-12-09T10:00:00Z" });
    expect(inserted.map((r) => [r.type, r.props])).toEqual([
      ["post_regenerated", { post_id: UUID, why: "rewrite_phrase", env: "prod" }],
      ["post_regenerated", { brand_id: UUID, why: "other", env: "prod" }],
      ["post_rejected", { post_id: UUID, reason: "wrong_contact", env: "prod" }],
      ["post_rejected", { post_id: UUID, reason: "other", env: "prod" }],
      ["trial_started", { brand_id: UUID, trial_days: 14, env: "prod" }],
    ]);
  });

  it("outside production they are tagged dev, never prod", async () => {
    vi.stubEnv("VERCEL_ENV", "development");
    await logTrialStarted(5, { brandId: UUID, since: "2026-11-25T10:00:00Z", trialEndsAt: "nonsense" });
    expect(inserted[0].props).toEqual({ brand_id: UUID, trial_days: null, env: "dev" });
  });
});
