/**
 * Authorization and cache-eligibility decisions for the engine.
 * Pure functions (no I/O, no server-only imports) so every rule is unit-tested.
 */

/** 'channel_only' = built from public channel posts alone; 'custom' = includes owner-supplied knowledge/samples. */
export type BrandSource = "channel_only" | "custom";

export interface BrandAccessInfo {
  ownerTelegramId: number | null;
  source: BrandSource;
  channel?: string | null; // linked public channel username (lowercase, no @)
  createdAt: string; // ISO
}

export const BRAND_CACHE_MAX_AGE_HOURS = 24;

export function brandSourceFor(input: { channel?: string; knowledge?: string; samplePosts?: string[] }): BrandSource {
  const hasCustom = Boolean(input.knowledge?.trim()) || (input.samplePosts ?? []).some((p) => p.trim().length > 0);
  return input.channel?.trim() && !hasCustom ? "channel_only" : "custom";
}

/**
 * A cached brand may be reused only when both the request and the cached row
 * are pure channel scrapes (no owner-supplied text could have been injected),
 * and the row is fresh.
 */
export function isReusableBrand(
  cached: Pick<BrandAccessInfo, "source" | "createdAt">,
  request: { channel?: string; knowledge?: string; samplePosts?: string[] },
  now = Date.now(),
  maxAgeHours = BRAND_CACHE_MAX_AGE_HOURS,
): boolean {
  if (brandSourceFor(request) !== "channel_only") return false;
  if (cached.source !== "channel_only") return false;
  const age = now - new Date(cached.createdAt).getTime();
  return Number.isFinite(age) && age >= 0 && age < maxAgeHours * 3600_000;
}

/**
 * Who may read a brand (and generate content from it):
 * - channel_only brands hold only public channel content: anyone with the id;
 * - custom brands without an owner (anonymous web Studio): anyone with the unguessable id;
 * - custom brands with an owner: only that Telegram user.
 */
export function canAccessBrand(brand: Pick<BrandAccessInfo, "ownerTelegramId" | "source">, userId: number | null): boolean {
  if (brand.source === "channel_only") return true;
  if (brand.ownerTelegramId == null) return true;
  return userId != null && userId === brand.ownerTelegramId;
}

/** Stable codes for refusals (the owner-facing sentence per language lives in errors.ts). */
export type AccessCode =
  | "auth_required"
  | "post_not_found"
  | "brand_unowned"
  | "brand_forbidden"
  | "channel_invalid"
  | "channel_mismatch"
  | "channel_admin_required"
  | "bot_not_admin";

export type AccessDecision =
  | { ok: true; linkChannel: boolean } // linkChannel: first publish links this chat to the brand
  | { ok: false; status: 401 | 403 | 404; error: string; code: AccessCode };

const MSG = {
  auth: "Telegram orqali e’lon qiling: botni oching va «E’lon qilish» tugmasini bosing.",
  notFound: "Post yoki brend topilmadi",
  unowned: "Bu brend hech kimga biriktirilmagan. Brendni Telegram bot orqali yarating.",
  notYours: "Bu post sizning brendingizga tegishli emas.",
  badChannel: "Kanal nomi noto‘g‘ri. Misol: @kanal_nomi",
  onlyOwnChannel: "Faqat brendingiz kanaliga e’lon qilish mumkin: @",
  notAdmin: "Siz bu kanalning egasi yoki admini emassiz. / Вы не владелец и не админ этого канала.",
  noPostRight: "Sizda bu kanalda post yozish huquqi yo‘q. / У вас нет права публиковать в этом канале.",
  botNotAdmin: "Botni kanalga admin qiling va «Post yozish» huquqini bering: ",
} as const;

/**
 * The code behind a refusal message from this module. publishPost (publish.ts) passes only the message on, so the
 * publish route and the bot map it back to a code and show the owner's language instead of this Uzbek text.
 */
export function accessErrorCode(error: string | undefined): AccessCode | undefined {
  if (!error) return undefined;
  if (error === MSG.auth) return "auth_required";
  if (error === MSG.notFound) return "post_not_found";
  if (error === MSG.unowned) return "brand_unowned";
  if (error === MSG.notYours) return "brand_forbidden";
  if (error === MSG.badChannel) return "channel_invalid";
  if (error.startsWith(MSG.onlyOwnChannel)) return "channel_mismatch";
  if (error === MSG.notAdmin || error === MSG.noPostRight) return "channel_admin_required";
  if (error.startsWith(MSG.botNotAdmin)) return "bot_not_admin";
  return undefined;
}

const sameChat = (a: string, b: string) => a.replace(/^@/, "").toLowerCase() === b.replace(/^@/, "").toLowerCase();

/** Step 1 (before any Telegram call): caller, post ownership, target channel. */
export function checkPublishAccess(args: {
  userId: number | null;
  brand: Pick<BrandAccessInfo, "ownerTelegramId" | "channel"> | null;
  chat: string | null; // normalized "@username"
}): AccessDecision {
  if (args.userId == null) return { ok: false, status: 401, error: MSG.auth, code: "auth_required" };
  if (!args.brand) return { ok: false, status: 404, error: MSG.notFound, code: "post_not_found" };
  if (args.brand.ownerTelegramId == null) return { ok: false, status: 403, error: MSG.unowned, code: "brand_unowned" };
  if (args.brand.ownerTelegramId !== args.userId) return { ok: false, status: 403, error: MSG.notYours, code: "brand_forbidden" };
  if (!args.chat) return { ok: false, status: 403, error: MSG.badChannel, code: "channel_invalid" };
  if (args.brand.channel && !sameChat(args.brand.channel, args.chat)) {
    return { ok: false, status: 403, error: `${MSG.onlyOwnChannel}${args.brand.channel.replace(/^@/, "")}`, code: "channel_mismatch" };
  }
  return { ok: true, linkChannel: !args.brand.channel };
}

export type MemberInfo = { status: string; can_post_messages?: boolean } | null;

/** Channel post right: the creator always has it; an administrator only with can_post_messages === true. */
const canPost = (m: MemberInfo) =>
  m?.status === "creator" || (m?.status === "administrator" && m.can_post_messages === true);

/**
 * Step 2 (after getChatMember): the bot must be able to post in the channel, and so must the caller
 * themselves (no privilege escalation through the bot). The bot is checked FIRST: without admin rights it cannot
 * even read the channel's members, so the caller would look like a non-admin and get the wrong advice.
 */
export function checkChatRights(user: MemberInfo, bot: MemberInfo, addAdminUrl: string): AccessDecision {
  if (!canPost(bot)) return { ok: false, status: 403, error: `${MSG.botNotAdmin}${addAdminUrl}`, code: "bot_not_admin" };
  if (!user || (user.status !== "creator" && user.status !== "administrator")) {
    return { ok: false, status: 403, error: MSG.notAdmin, code: "channel_admin_required" };
  }
  if (!canPost(user)) return { ok: false, status: 403, error: MSG.noPostRight, code: "channel_admin_required" };
  return { ok: true, linkChannel: false };
}
