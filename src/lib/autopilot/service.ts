import "server-only";
import { logTrialStarted } from "../stats-events";
import { safeLogEvent } from "../track";
import type { AutopilotState, BotAdminStatus, PostSchedule } from "../uslub/contract";
import type { Locale } from "../i18n";
import type { StoredBrand } from "../uslub/store";
import { queueErrorText, whenLabel } from "./copy";
import { loadAutopilotRow, queueForBrand, writeAutopilot } from "./repo";
import { readAutopilot, readBotAdmin, switchAutopilot, trialDaysLeft } from "./state";

/**
 * The autopilot's small API for the UI (GET/POST /api/uslub/autopilot) and the bot (the "do this every week" button).
 * Callers check who may act: anyone who may read the brand's drafts may read this; only the verified owner switches.
 */

export interface AutopilotInfo {
  autopilot: AutopilotState & { trialDaysLeft?: number };
  admin: BotAdminStatus;
  /** Queued, sent or stopped posts by id (PostDraft.schedule). */
  schedule: Record<string, PostSchedule>;
}

export async function autopilotInfo(brand: StoredBrand, locale: Locale, now = Date.now()): Promise<AutopilotInfo> {
  const [row, queue] = await Promise.all([loadAutopilotRow(brand.id), queueForBrand(brand.id)]);
  const state = readAutopilot(row?.autopilot);
  const days = trialDaysLeft(state, now);
  const schedule: Record<string, PostSchedule> = {};
  for (const q of queue) {
    const error = q.status === "sent" || q.status === "queued" || q.status === "sending" ? undefined : queueErrorText(locale, q.lastError, { when: whenLabel(q.dueAt, locale), channel: q.chat });
    schedule[q.postId] = { dueAt: new Date(q.dueAt).toISOString(), status: q.status, ...(error ? { error } : {}) };
  }
  return { autopilot: { ...state, ...(days !== undefined ? { trialDaysLeft: days } : {}) }, admin: readBotAdmin(row?.autopilot), schedule };
}

/** Turns the autopilot on or off; the first "on" starts the 7-day trial (logged once as trial_started). */
export async function setAutopilot(brandId: string, on: boolean, actor: number, now = Date.now()): Promise<AutopilotState> {
  const prev = readAutopilot((await loadAutopilotRow(brandId))?.autopilot);
  const next = switchAutopilot(prev, on, now);
  await writeAutopilot(brandId, next);
  await safeLogEvent(actor, on ? "autopilot_on" : "autopilot_off", { brand_id: brandId });
  if (on && !prev.since && next.since && next.trialEndsAt) await logTrialStarted(actor, { brandId, since: next.since, trialEndsAt: next.trialEndsAt });
  return next;
}
