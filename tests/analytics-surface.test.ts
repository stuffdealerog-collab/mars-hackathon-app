import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => { throw new Error("outside a request"); } }));
vi.mock("@/lib/db", () => ({ isDbConfigured: () => false, getSql: () => { throw new Error("no db in tests"); } }));
vi.mock("@/lib/track", () => ({ safeLogEvent: async () => {} }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ TELEGRAM_BOT_TOKEN: "123456:TEST-bot-token" }), getPublicUrl: () => "https://mercat.test" }));
// A "tma <id>" header stands for a valid Mini App session of that user.
vi.mock("@/lib/telegram-auth", () => ({
  authenticateRequest: (req: Request) => {
    const m = /^tma (\d+)$/.exec(req.headers.get("authorization") ?? "");
    return m ? { id: Number(m[1]) } : null;
  },
  validateInitData: () => ({ ok: false }),
}));
vi.mock("@/lib/uslub/handoff", async () => await import("../src/lib/uslub/handoff"));

const { handle, json, miniAppUserId, telegramUserId } = await import("../src/lib/uslub/http");
const { signHandoff } = await import("../src/lib/uslub/handoff");
const { currentEventMeta } = await import("../src/lib/stats-meta");

/** A route that reports the ambient analytics fields its events would get. */
const probe = (auth: "none" | "miniapp" | "linked") =>
  handle(async (req) => {
    if (auth === "miniapp") miniAppUserId(req);
    if (auth === "linked") telegramUserId(req);
    return json(currentEventMeta() ?? null);
  });

const request = (authorization?: string) =>
  new Request("https://mercat.test/api/uslub/brand", {
    method: "POST",
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/141.0",
      "x-forwarded-for": "203.0.113.50",
      ...(authorization ? { authorization } : {}),
    },
  });

describe("handle(): where an API call came from", () => {
  it("an anonymous web caller: surface web with a daily visitor key, no Telegram id", async () => {
    const meta = await (await probe("none")(request())).json();
    expect(meta).toEqual({ surface: "web", visitor: expect.stringMatching(/^v:[0-9a-f]{16}$/), telegramId: null });
    // The same browser makes the same key within the day.
    const again = await (await probe("none")(request())).json();
    expect(again.visitor).toBe(meta.visitor);
  });

  it("the Mini App (verified initData): surface miniapp and the Telegram user", async () => {
    const meta = await (await probe("miniapp")(request("tma 4242"))).json();
    expect(meta.surface).toBe("miniapp");
    expect(meta.telegramId).toBe(4242);
  });

  it("the desktop Studio opened from the bot (handoff key): stays web, with the Telegram user", async () => {
    const key = signHandoff(5151);
    expect(key).toBeTruthy();
    const meta = await (await probe("linked")(request(`handoff ${key}`))).json();
    expect(meta.surface).toBe("web");
    expect(meta.telegramId).toBe(5151);
  });

  it("an unverified tma header changes nothing", async () => {
    const meta = await (await probe("miniapp")(request("tma not-a-number"))).json();
    expect(meta.surface).toBe("web");
    expect(meta.telegramId).toBeNull();
  });
});
