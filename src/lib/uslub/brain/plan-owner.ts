/**
 * Whether a customer who tapped a plan post's tracked link may be told which business is behind it (plan item 6).
 * The bot names the business only when the plan's lead owner is verified as the creator or an administrator of the
 * brand's channel (Telegram getChatMember); otherwise it keeps today's anonymous wording ("the post's author").
 * The check runs on a customer tap, so results are cached for an hour. Pure apart from the injected `getChatMember`.
 */

export interface PlanForLink {
  ownerTelegramId: number | null;
  /** The plan's channel (brain_plans.channel). */
  channel?: string;
  /** The brand's channel and name (brands.channel, brands.dna.name), when the plan belongs to a brand. */
  brandChannel?: string;
  brandName?: string;
}

export type GetChatMember = (chat: string, userId: number) => Promise<{ status: string }>;

export interface NamedBusiness {
  name: string;
  /** @username without the @. */
  channel: string;
}

const HOUR = 3600_000;
const cache = new Map<string, { at: number; ok: boolean }>();

/** Telegram statuses that run a channel. */
export const isChannelAdmin = (status: string | undefined) => status === "creator" || status === "administrator";

/**
 * The business to name to the customer, or null (no owner, no channel, the owner is not an admin, Telegram failed).
 * Never throws.
 */
export async function verifiedPlanBusiness(plan: PlanForLink | null | undefined, getChatMember: GetChatMember, now = Date.now()): Promise<NamedBusiness | null> {
  const channel = (plan?.brandChannel ?? plan?.channel)?.replace(/^@/, "").toLowerCase();
  const owner = plan?.ownerTelegramId;
  if (!plan || owner == null || !channel || !/^[a-z][\w]{3,31}$/.test(channel)) return null;
  const key = `${channel}:${owner}`;
  const hit = cache.get(key);
  let ok: boolean;
  if (hit && now - hit.at < HOUR) ok = hit.ok;
  else {
    try {
      ok = isChannelAdmin((await getChatMember(`@${channel}`, owner)).status);
    } catch {
      // Telegram did not answer: say nothing about the business this time, and do not remember the failure.
      return null;
    }
    cache.set(key, { at: now, ok });
    if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  }
  if (!ok) return null;
  const name = (plan.brandName ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || `@${channel}`;
  return { name, channel };
}

/** Test hook: forget cached checks. */
export function resetPlanOwnerCache(): void {
  cache.clear();
}

/**
 * The customer's question naming the business (proposed i18n key bot.link_ask_named; bot.ts / i18n.ts belong to
 * the BOT stream, which adds the key). {name} and {channel} are filled from verifiedPlanBusiness.
 */
export const LINK_ASK_NAMED: Record<"uz" | "ru" | "en", string> = {
  uz: "Siz «{name}» (@{channel}) kanalidagi post orqali keldingiz. Sizga o‘zlari javob berishi uchun ismingiz va Telegram profilingizni ularga yuboraymi?",
  ru: "Вы пришли по ссылке из поста канала «{name}» (@{channel}). Отправить им ваше имя и профиль Telegram, чтобы вам ответили сами?",
  en: "You came from a post on «{name}» (@{channel}). Shall I send them your name and Telegram profile so they can answer you themselves?",
};
