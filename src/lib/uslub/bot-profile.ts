import "server-only";
import type { Api } from "grammy";
import type { BotCommand, MenuButton } from "grammy/types";
import { getEnv } from "@/lib/env";
import { DEFAULT_BOT_HANDLE, LOCALES, type Locale, t } from "@/lib/i18n";
import { clip } from "./text";

/**
 * The bot's Telegram profile, kept in code: name, short description (the bot's profile page and link previews),
 * description (the empty chat's "What can this bot do?"), the command menu, and the menu button that opens the
 * Mini App. Default texts are Uzbek; ru, uz and en are set as localized versions.
 * The avatar and the Main Mini App / loading screen can only be set in BotFather by the owner.
 *
 * syncBotProfile reads the current values first and writes only what differs, so running it on every cold start
 * costs a few reads; the set* methods (rate-limited by Telegram) run only after a change ships.
 */

export const BOT_NAME = "Mercat";

/** "@mercatai": the bot's own handle (BOT_USERNAME), named in the texts that tell owners which bot to add. */
export function botHandle(): string {
  const name = getEnv().BOT_USERNAME?.replace(/^@/, "").trim();
  return name ? `@${name}` : DEFAULT_BOT_HANDLE;
}

/** Telegram limits (Bot API): name 64, short description 120, description 512, command description 256. */
const LIMIT = { name: 64, short: 120, description: 512, command: 256, menuText: 64 } as const;

export type ProfileTexts = { shortDescription: string; description: string; commands: BotCommand[] };

export type BotProfile = {
  name: string;
  /** "" = the default (no language_code), shown to everyone without a localized version. */
  texts: Record<"" | Locale, ProfileTexts>;
  /** The menu button next to the input field; null leaves it as it is (no https app URL). */
  menuButton: MenuButton | null;
};

/** The commands the bot really handles (bot.ts). */
const COMMANDS = ["start", "natija", "help"] as const;

const textsFor = (locale: Locale, bot: string): ProfileTexts => ({
  shortDescription: clip(t(locale, "bot.profile.short"), LIMIT.short),
  description: clip(t(locale, "bot.profile.description", { bot }), LIMIT.description),
  commands: COMMANDS.map((command) => ({ command, description: clip(t(locale, `bot.cmd.${command}`), LIMIT.command) })),
});

/**
 * What the profile should be. `appUrl` = the public https origin; `menuText` = MENU_BUTTON_TEXT when set;
 * `bot` = the bot's "@handle" named in the description.
 */
export function botProfile(appUrl: string | undefined, menuText?: string, bot = DEFAULT_BOT_HANDLE): BotProfile {
  const texts = { "": textsFor("uz", bot) } as BotProfile["texts"];
  for (const locale of LOCALES) texts[locale] = textsFor(locale, bot);
  const text = clip(menuText?.trim() || BOT_NAME, LIMIT.menuText);
  return {
    name: BOT_NAME,
    texts,
    menuButton: appUrl?.startsWith("https://") ? { type: "web_app", text, web_app: { url: `${appUrl}/tg` } } : null,
  };
}

export type ProfileApi = Pick<
  Api,
  | "getMyName"
  | "setMyName"
  | "getMyShortDescription"
  | "setMyShortDescription"
  | "getMyDescription"
  | "setMyDescription"
  | "getMyCommands"
  | "setMyCommands"
  | "getChatMenuButton"
  | "setChatMenuButton"
>;

const sameCommands = (a: BotCommand[], b: BotCommand[]) =>
  a.length === b.length && a.every((c, i) => c.command === b[i].command && c.description === b[i].description);

const sameMenu = (a: MenuButton, b: MenuButton) =>
  a.type === b.type && (a.type !== "web_app" || (b.type === "web_app" && a.text === b.text && a.web_app.url === b.web_app.url));

/**
 * Brings the bot's profile to `want`: for each part, reads it and sets it only when it differs. Every part is tried
 * on its own; a failure is logged and the rest goes on. Returns what was changed ("description:ru", "menu", …) and
 * what failed.
 */
export async function syncBotProfile(api: ProfileApi, want: BotProfile): Promise<{ changed: string[]; failed: string[] }> {
  const changed: string[] = [];
  const failed: string[] = [];
  const step = async (label: string, run: () => Promise<boolean>) => {
    try {
      if (await run()) changed.push(label);
    } catch (err) {
      failed.push(label);
      console.warn(`[bot-profile] ${label} not synced:`, err instanceof Error ? err.message : err);
    }
  };

  await step("name", async () => {
    if ((await api.getMyName()).name === want.name) return false;
    await api.setMyName(want.name);
    return true;
  });
  for (const [lang, texts] of Object.entries(want.texts) as ["" | Locale, ProfileTexts][]) {
    const tag = lang || "default";
    const scope = lang ? { language_code: lang } : {};
    await step(`short:${tag}`, async () => {
      if ((await api.getMyShortDescription(scope)).short_description === texts.shortDescription) return false;
      await api.setMyShortDescription(texts.shortDescription, scope);
      return true;
    });
    await step(`description:${tag}`, async () => {
      if ((await api.getMyDescription(scope)).description === texts.description) return false;
      await api.setMyDescription(texts.description, scope);
      return true;
    });
    await step(`commands:${tag}`, async () => {
      if (sameCommands(await api.getMyCommands(scope), texts.commands)) return false;
      await api.setMyCommands(texts.commands, scope);
      return true;
    });
  }
  const menu = want.menuButton;
  if (menu) {
    await step("menu", async () => {
      if (sameMenu(await api.getChatMenuButton(), menu)) return false;
      await api.setChatMenuButton({ menu_button: menu });
      return true;
    });
  }
  return { changed, failed };
}
