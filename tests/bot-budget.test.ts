import { beforeEach, describe, expect, it, vi } from "vitest";

// Bot onboarding (a channel link or a business description) runs Claude, so it takes the same app-wide daily budget
// as the API (2 units). Telegram users have no per-user daily cap beyond the hourly gate. Nothing reaches Telegram.
const later: (() => Promise<void>)[] = [];
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => void later.push(task) }));
vi.mock("@/lib/db", () => ({ isDbConfigured: () => false, getSql: () => { throw new Error("no db in tests"); }, pgErrorCode: () => undefined }));
vi.mock("@/lib/track", () => ({ safeLogEvent: async () => {}, track: async () => {}, parseSource: () => null }));
vi.mock("@/lib/i18n", async () => await import("../src/lib/i18n"));
const env = { TELEGRAM_BOT_TOKEN: "123456:TEST-bot-token-xxxxxxxxxxxxxxxxxxxxxxxx", ANTHROPIC_API_KEY: "test", BOT_USERNAME: "mercatai" };
vi.mock("@/lib/env", () => ({ getEnv: () => env, getPublicUrl: () => "https://mercat.test" }));
vi.mock("@/lib/telegram-auth", () => ({ authenticateRequest: () => null, validateInitData: () => ({ ok: false }) }));
vi.mock("../src/lib/env", () => ({ getEnv: () => env, getPublicUrl: () => "https://mercat.test" }));
vi.mock("../src/lib/track", () => ({ safeLogEvent: async () => {}, track: async () => {}, parseSource: () => null }));
vi.mock("../src/lib/uslub/publish", () => ({ publishPost: vi.fn(), addBotAsAdminLink: () => "https://t.me/mercatai?startchannel" }));
const buildBrand = vi.fn();
vi.mock("../src/lib/uslub/brand", () => ({ buildBrand }));

const { getBot } = await import("../src/lib/bot");
const { resetBudgetMemory, takeUnits } = await import("../src/lib/uslub/budget-core");

const sent: { method: string; payload: Record<string, unknown> }[] = [];
const bot = getBot();
bot.botInfo = { id: 1, is_bot: true, first_name: "Mercat", username: "mercatai" } as never;
bot.api.config.use(async (_prev, method, payload) => {
  sent.push({ method, payload: payload as Record<string, unknown> });
  const result = method === "sendMessage" ? { message_id: sent.length, date: 0, chat: { id: 7, type: "private" } } : true;
  return { ok: true, result } as never;
});

let uid = 100;
const linkFrom = (id: number) => ({
  update_id: id,
  message: { message_id: id, date: 0, chat: { id, type: "private" as const, first_name: "Ali" }, from: { id, is_bot: false, first_name: "Ali", language_code: "ru" }, text: "https://t.me/safiabakery" },
});
const replies = () => sent.filter((c) => c.method === "sendMessage").map((c) => String(c.payload.text));

beforeEach(() => {
  sent.length = 0;
  later.length = 0;
  resetBudgetMemory();
  delete process.env.CLAUDE_DAILY_LIMIT;
});

describe("bot onboarding takes the daily Claude budget", () => {
  it("once today's app-wide units are used up, the owner is told in their language and no Claude work starts", async () => {
    process.env.CLAUDE_DAILY_LIMIT = "3";
    expect(await takeUnits({ actor: "ip:x", anonymous: true, weight: 2, route: "brand" })).toBe("ok");
    await bot.handleUpdate(linkFrom(++uid)); // 2 + 2 > 3
    expect(replies()).toEqual(["Сегодня у Mercat слишком много запросов — дневной лимит исчерпан. Попробуйте завтра."]);
    expect(later.filter(Boolean)).toHaveLength(1); // only the profile sync, no onboarding run
    expect(buildBrand).not.toHaveBeenCalled();
  });

  it("within the budget the onboarding starts and takes 2 units", async () => {
    process.env.CLAUDE_DAILY_LIMIT = "3";
    await bot.handleUpdate(linkFrom(++uid));
    expect(replies()[0]).toMatch(/@safiabakery|safiabakery/);
    expect(later.length).toBeGreaterThanOrEqual(1);
    // 2 of 3 units are taken: a 2-unit run no longer fits, a 1-unit one does.
    expect(await takeUnits({ actor: "tg:1", anonymous: false, weight: 2, route: "t" })).toBe("app");
    expect(await takeUnits({ actor: "tg:1", anonymous: false, weight: 1, route: "t" })).toBe("ok");
  });
});
