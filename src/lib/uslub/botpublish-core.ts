/**
 * Pure parts of publishing from the bot (deep link t.me/<bot>?start=publish_<postId>): payload and
 * callback parsing, the script to show, and who may claim an unowned web brand. No I/O — unit-tested.
 */
import { checkChatRights, type MemberInfo } from "./access";
import type { Script } from "./contract";

const SCRIPTS: Script[] = ["uz_latn", "uz_cyrl", "ru", "en"];
const SHORT: Record<Script, string> = { uz_latn: "l", uz_cyrl: "c", ru: "r", en: "e" };
const FROM_SHORT: Record<string, Script> = { l: "uz_latn", c: "uz_cyrl", r: "ru", e: "en" };
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** "publish_<uuid>" or "publish_<uuid>_<script>" (Telegram start payloads: A-Z a-z 0-9 _ -, ≤64 chars). */
export function parsePublishPayload(payload: string): { postId: string; script?: Script } | null {
  const m = new RegExp(`^publish_(${UUID})(?:_(uz_latn|uz_cyrl|ru|en))?$`, "i").exec(payload.trim());
  return m ? { postId: m[1].toLowerCase(), script: m[2] as Script | undefined } : null;
}

export const publishPayload = (postId: string, script?: Script) => `publish_${postId}${script ? `_${script}` : ""}`;

/** FNV-1a 32-bit of the text, 8 hex chars: binds a publish button to the exact text the owner saw. */
export function textHash(text: string): string {
  let h = 0x811c9dc5;
  for (const ch of text.trim()) {
    h ^= ch.codePointAt(0) as number;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Callback data for the "Kanalga joylash" button (pb, with the hash of the text shown) and the script switch (pv).
 * ≤ 64 bytes: "pb:" + uuid + ":l:" + 8 hex = 49.
 */
export const callbackData = (kind: "pb" | "pv", postId: string, script: Script, hash?: string) =>
  `${kind}:${postId}:${SHORT[script]}${kind === "pb" && hash ? `:${hash}` : ""}`;

export const CALLBACK_RE = new RegExp(`^(pb|pv):(${UUID}):([lcre])(?::([0-9a-f]{8}))?$`);

export function parseCallback(data: string): { kind: "pb" | "pv"; postId: string; script: Script; hash?: string } | null {
  const m = CALLBACK_RE.exec(data);
  return m ? { kind: m[1] as "pb" | "pv", postId: m[2], script: FROM_SHORT[m[3]], ...(m[4] ? { hash: m[4] } : {}) } : null;
}

/** The owner's chosen script, else the brand's main language, else Uzbek Latin; never an empty variant. */
export function pickScript(variants: Partial<Record<Script, string>>, wanted?: Script, brandLanguages: Script[] = []): Script {
  const order = [wanted, ...brandLanguages, "uz_latn", "ru", "uz_cyrl", "en"].filter(Boolean) as Script[];
  return order.find((s) => SCRIPTS.includes(s) && (variants[s] ?? "").trim().length > 0) ?? "uz_latn";
}

/** Other scripts the post has, for the "show in another script" row. */
export const otherScripts = (variants: Partial<Record<Script, string>>, current: Script): Script[] =>
  SCRIPTS.filter((s) => s !== current && (variants[s] ?? "").trim().length > 0);

export type ClaimDecision =
  | { ok: true; claim: boolean }
  | { ok: false; reason: "not_owner" | "user_not_admin" | "user_cannot_post" | "bot_not_admin" };

/**
 * May this Telegram user publish the brand's posts? The owner may (publishPost re-checks channel rights).
 * An unowned web brand may be claimed only by a creator/administrator of the brand's channel who can post
 * there, and only when the bot can post there too. Anyone else is refused — a link is not ownership.
 */
export function claimDecision(args: { ownerTelegramId: number | null; userId: number; user: MemberInfo; bot: MemberInfo }): ClaimDecision {
  if (args.ownerTelegramId != null) return args.ownerTelegramId === args.userId ? { ok: true, claim: false } : { ok: false, reason: "not_owner" };
  // Without post rights the bot cannot even read the channel's admin list, so it has to be added first.
  const botCanPost = args.bot?.status === "creator" || (args.bot?.status === "administrator" && args.bot.can_post_messages === true);
  if (!botCanPost) return { ok: false, reason: "bot_not_admin" };
  const rights = checkChatRights(args.user, args.bot, "");
  if (rights.ok) return { ok: true, claim: true };
  if (!args.user || (args.user.status !== "creator" && args.user.status !== "administrator")) return { ok: false, reason: "user_not_admin" };
  return { ok: false, reason: "user_cannot_post" };
}

/** Telegram limits: photo caption 1024 chars, message 4096. */
export function splitForPhoto(text: string): { caption?: string; rest?: string } {
  const t = text.trim();
  if (!t) return {};
  if (t.length <= 1024) return { caption: t };
  return { rest: t.slice(0, 4096) };
}
