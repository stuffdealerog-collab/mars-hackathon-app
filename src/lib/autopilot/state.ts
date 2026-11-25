/**
 * The autopilot's state on a brand (brands.autopilot jsonb) and the bot's admin status in the brand's channel.
 * Pure and client-safe: the Studio and the Mini App read the same shapes from GET /api/uslub/autopilot.
 */
import type { AutopilotState, BotAdminStatus } from "./types";

export const TRIAL_DAYS = 7;
const DAY = 86_400_000;

const isoOrUndefined = (v: unknown) => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : undefined);

/** The stored jsonb as an AutopilotState; anything unreadable counts as never switched on. */
export function readAutopilot(raw: unknown): AutopilotState {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const since = isoOrUndefined(o.since);
  const trialEndsAt = isoOrUndefined(o.trialEndsAt);
  return {
    on: o.on === true,
    ...(since ? { since } : {}),
    ...(trialEndsAt ? { trialEndsAt } : {}),
    ...(o.paused === "blocked" ? { paused: "blocked" as const } : {}),
  };
}

/**
 * On: the trial starts now if it never started (7 days); a pause ends, because the owner is back.
 * Off: only `on` changes, so turning it on again later never restarts the trial.
 */
export function switchAutopilot(prev: AutopilotState, on: boolean, now: number): AutopilotState {
  if (!on) return { ...prev, on: false };
  const since = prev.since ?? new Date(now).toISOString();
  const trialEndsAt = prev.trialEndsAt ?? new Date(Date.parse(since) + TRIAL_DAYS * DAY).toISOString();
  return { on: true, since, trialEndsAt };
}

/** Whole days of trial left (rounded up), 0 once it ended; undefined when it never started. */
export function trialDaysLeft(state: AutopilotState, now: number): number | undefined {
  if (!state.trialEndsAt) return undefined;
  return Math.max(0, Math.ceil((Date.parse(state.trialEndsAt) - now) / DAY));
}

type Member = { status: string; can_post_messages?: boolean; can_invite_users?: boolean } | null | undefined;

/** The bot's rights in a channel, from getChatMember or a my_chat_member update. */
export function botAdminFrom(member: Member, now: number): BotAdminStatus {
  const checkedAt = new Date(now).toISOString();
  if (member?.status === "creator") return { status: "admin", canPost: true, canInvite: true, checkedAt };
  if (member?.status !== "administrator") return { status: "not_admin", canPost: false, canInvite: false, checkedAt };
  const canPost = member.can_post_messages === true;
  const canInvite = member.can_invite_users === true;
  return { status: canPost ? "admin" : "no_post_right", canPost, canInvite, checkedAt };
}

const STATUSES = new Set<BotAdminStatus["status"]>(["admin", "no_post_right", "not_admin"]);

/** The stored admin status (brands.autopilot.botAdmin); "unknown" until Telegram has told us. */
export function readBotAdmin(raw: unknown): BotAdminStatus {
  const b = raw && typeof raw === "object" ? (raw as { botAdmin?: unknown }).botAdmin : undefined;
  const o = b && typeof b === "object" ? (b as Record<string, unknown>) : {};
  const status = o.status as BotAdminStatus["status"];
  if (!STATUSES.has(status)) return { status: "unknown", canPost: false, canInvite: false };
  const checkedAt = typeof o.checkedAt === "string" ? o.checkedAt : undefined;
  return { status, canPost: o.canPost === true, canInvite: o.canInvite === true, ...(checkedAt ? { checkedAt } : {}) };
}
