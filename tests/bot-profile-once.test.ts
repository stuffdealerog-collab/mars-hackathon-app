import { describe, expect, it, vi } from "vitest";

// bot.ts: the profile sync starts on the first update an instance handles, runs after the answer (after()), and
// never again in that instance. The Bot API is intercepted with a transformer; nothing reaches Telegram.
const later: (() => Promise<void>)[] = [];
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => void later.push(task) }));
vi.mock("@/lib/db", () => ({ isDbConfigured: () => false, getSql: () => { throw new Error("no db in tests"); } }));
vi.mock("@/lib/track", () => ({ safeLogEvent: async () => {}, track: async () => {}, parseSource: () => null }));
vi.mock("@/lib/i18n", async () => await import("../src/lib/i18n"));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ TELEGRAM_BOT_TOKEN: "123456:TEST-bot-token-xxxxxxxxxxxxxxxxxxxxxxxx" }), getPublicUrl: () => "https://mercat.test" }));
vi.mock("@/lib/telegram-auth", () => ({ authenticateRequest: () => null, validateInitData: () => ({ ok: false }) }));
vi.mock("../src/lib/env", () => ({ getEnv: () => ({ TELEGRAM_BOT_TOKEN: "123456:TEST-bot-token-xxxxxxxxxxxxxxxxxxxxxxxx" }), getPublicUrl: () => "https://mercat.test" }));
vi.mock("../src/lib/track", () => ({ safeLogEvent: async () => {}, track: async () => {}, parseSource: () => null }));
vi.mock("../src/lib/uslub/publish", () => ({ publishPost: vi.fn(), addBotAsAdminLink: () => "https://t.me/test_bot?startchannel" }));

const { getBot } = await import("../src/lib/bot");

const calls: { method: string; payload: Record<string, unknown> }[] = [];
const RESULTS: Record<string, unknown> = {
  getMyName: { name: "" },
  getMyShortDescription: { short_description: "" },
  getMyDescription: { description: "" },
  getMyCommands: [],
  getChatMenuButton: { type: "default" },
};

const bot = getBot();
bot.botInfo = { id: 1, is_bot: true, first_name: "Mercat", username: "mercat_test_bot" } as never;
bot.api.config.use(async (_prev, method, payload) => {
  calls.push({ method, payload: payload as Record<string, unknown> });
  const result = method in RESULTS ? RESULTS[method] : method === "sendMessage" ? { message_id: calls.length, date: 0, chat: { id: 7, type: "private" } } : true;
  return { ok: true, result } as never;
});

const helpUpdate = (id: number) => ({
  update_id: id,
  message: {
    message_id: id,
    date: 0,
    chat: { id: 7, type: "private" as const, first_name: "Ali" },
    from: { id: 7, is_bot: false, first_name: "Ali", language_code: "ru" },
    text: "/help",
    entities: [{ type: "bot_command" as const, offset: 0, length: 5 }],
  },
});

describe("bot profile sync in the webhook", () => {
  it("starts once per instance, after the answer, and never delays the reply", async () => {
    await bot.handleUpdate(helpUpdate(1));
    // The reply went out; the sync was only scheduled.
    expect(calls.map((c) => c.method)).toEqual(["sendMessage"]);
    expect(String(calls[0].payload.text)).toMatch(/^Как это работает:/);
    expect(later).toHaveLength(1);

    await later[0]();
    const sets = calls.filter((c) => c.method.startsWith("set")).map((c) => c.method);
    expect(sets).toContain("setMyName");
    expect(sets.filter((m) => m === "setMyDescription")).toHaveLength(4);
    expect(calls.find((c) => c.method === "setChatMenuButton")?.payload.menu_button).toEqual({
      type: "web_app",
      text: "Mercat",
      web_app: { url: "https://mercat.test/tg" },
    });

    await bot.handleUpdate(helpUpdate(2));
    expect(later).toHaveLength(1); // not scheduled again in this instance
  });
});
