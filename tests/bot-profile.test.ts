import { describe, expect, it, vi } from "vitest";
import type { BotCommand, MenuButton } from "grammy/types";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/i18n", async () => await import("../src/lib/i18n"));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ BOT_USERNAME: "mercatai" }) }));

const { botProfile, syncBotProfile, BOT_NAME } = await import("../src/lib/uslub/bot-profile");
type ProfileApi = import("../src/lib/uslub/bot-profile").ProfileApi;
const { LOCALES, t } = await import("../src/lib/i18n");

/** A fake Bot API that keeps the profile like Telegram does (per language_code, "" = default). */
function fakeTelegram(fail: string[] = []) {
  const state = {
    name: "",
    short: new Map<string, string>(),
    description: new Map<string, string>(),
    commands: new Map<string, BotCommand[]>(),
    menu: { type: "default" } as MenuButton,
  };
  const sets: string[] = [];
  const lang = (o?: { language_code?: string }) => o?.language_code ?? "";
  const set = (label: string) => {
    if (fail.includes(label)) throw new Error("Too Many Requests: retry after 60");
    sets.push(label);
  };
  const api = {
    getMyName: async () => ({ name: state.name }),
    setMyName: async (name: string) => (set("name"), (state.name = name), true),
    getMyShortDescription: async (o?: { language_code?: string }) => ({ short_description: state.short.get(lang(o)) ?? "" }),
    setMyShortDescription: async (s: string, o?: { language_code?: string }) => (set(`short:${lang(o) || "default"}`), state.short.set(lang(o), s), true),
    getMyDescription: async (o?: { language_code?: string }) => ({ description: state.description.get(lang(o)) ?? "" }),
    setMyDescription: async (s: string, o?: { language_code?: string }) => (set(`description:${lang(o) || "default"}`), state.description.set(lang(o), s), true),
    getMyCommands: async (o?: { language_code?: string }) => state.commands.get(lang(o)) ?? [],
    setMyCommands: async (c: BotCommand[], o?: { language_code?: string }) => (set(`commands:${lang(o) || "default"}`), state.commands.set(lang(o), c), true),
    getChatMenuButton: async () => state.menu,
    setChatMenuButton: async (o?: { menu_button?: MenuButton }) => (set("menu"), (state.menu = o?.menu_button ?? { type: "default" }), true),
  };
  return { api: api as unknown as ProfileApi, state, sets };
}

const APP = "https://mercat-ai.vercel.app";

describe("the bot's Telegram profile", () => {
  it("fits Telegram's limits in every language and lists only commands the bot handles", () => {
    const p = botProfile(APP);
    expect(p.name).toBe("Mercat");
    expect(Object.keys(p.texts).sort()).toEqual(["", "en", "ru", "uz"]);
    expect(p.texts[""]).toEqual(p.texts.uz); // Uzbek is the default
    for (const texts of Object.values(p.texts)) {
      expect(texts.shortDescription.length).toBeGreaterThan(40);
      expect(texts.shortDescription.length).toBeLessThanOrEqual(120);
      expect(texts.description.length).toBeLessThanOrEqual(512);
      expect(texts.commands.map((c) => c.command)).toEqual(["start", "natija", "help"]);
      for (const c of texts.commands) expect(c.description.length).toBeGreaterThanOrEqual(3);
    }
    // The texts are written to fit, not cut by the limit.
    for (const l of LOCALES) {
      expect(p.texts[l].shortDescription).toBe(t(l, "bot.profile.short"));
      expect(p.texts[l].description).toBe(t(l, "bot.profile.description"));
    }
  });

  it("the menu button opens the Mini App, named Mercat or MENU_BUTTON_TEXT; no https URL leaves it alone", () => {
    expect(botProfile(APP).menuButton).toEqual({ type: "web_app", text: BOT_NAME, web_app: { url: `${APP}/tg` } });
    expect(botProfile(APP, "  Ochish  ").menuButton).toMatchObject({ text: "Ochish" });
    expect(botProfile(APP, "   ").menuButton).toMatchObject({ text: "Mercat" });
    expect(botProfile(undefined).menuButton).toBeNull();
    expect(botProfile("http://localhost:3000").menuButton).toBeNull();
  });

  it("the first sync sets everything; the next one only reads", async () => {
    const tg = fakeTelegram();
    const want = botProfile(APP);
    const first = await syncBotProfile(tg.api, want);
    expect(first.failed).toEqual([]);
    expect(first.changed).toHaveLength(1 + 4 * 3 + 1);
    expect(tg.state.name).toBe("Mercat");
    expect(tg.state.description.get("ru")).toBe(t("ru", "bot.profile.description"));
    expect(tg.state.commands.get("en")?.map((c) => c.command)).toEqual(["start", "natija", "help"]);
    expect(tg.state.menu).toEqual(want.menuButton);

    tg.sets.length = 0;
    expect(await syncBotProfile(tg.api, want)).toEqual({ changed: [], failed: [] });
    expect(tg.sets).toEqual([]);
  });

  it("only what differs is written (an edited Russian text, a new app URL)", async () => {
    const tg = fakeTelegram();
    await syncBotProfile(tg.api, botProfile(APP));
    tg.state.description.set("ru", "старый текст");
    tg.sets.length = 0;
    const res = await syncBotProfile(tg.api, botProfile("https://mercat.example"));
    expect(res.changed).toEqual(["description:ru", "menu"]);
    expect(tg.sets).toEqual(["description:ru", "menu"]);
  });

  it("a failing part is logged and the rest still goes through", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tg = fakeTelegram(["name", "commands:uz"]);
    const res = await syncBotProfile(tg.api, botProfile(APP));
    expect(res.failed).toEqual(["name", "commands:uz"]);
    expect(res.changed).toContain("description:default");
    expect(res.changed).toContain("menu");
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("/help explains the flow in every language and names only real commands", () => {
    for (const l of LOCALES) {
      const help = t(l, "bot.help");
      expect(help).toContain("/natija");
      expect(help).toContain("/start");
      expect(help).toContain("📢");
      expect(help).toMatch(/t\.me\//);
    }
  });
});
