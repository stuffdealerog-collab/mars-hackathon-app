/**
 * What this device keeps per brand so a reopen shows the work at once instead of paying for it
 * again: the channel's audit (12 h, then it is measured anew) and the latest week plan (until a
 * newer one replaces it; the server will hold plans too). Storage can be full, blocked or in
 * private mode: every read and write is allowed to fail quietly.
 */
import type { ChannelAudit, ContentPlan, Strategy } from "@/lib/uslub/contract";
import type { Launch, Sufficiency } from "./api";

const AUDIT_TTL = 12 * 60 * 60 * 1000;
const auditKey = (brandId: string) => `mercat.audit.${brandId}`;
const planKey = (brandId: string) => `mercat.plan.${brandId}`;

const read = <T>(key: string): T | null => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* full or blocked: the next reopen measures again */
  }
};

export function keepAudit(brandId: string, audit: ChannelAudit) {
  write(auditKey(brandId), { audit, at: Date.now() });
}

/** The kept audit if it is younger than 12 h, else null (and the caller measures again). */
export function keptAudit(brandId: string, now = Date.now()): ChannelAudit | null {
  const v = read<{ audit?: ChannelAudit; at?: number }>(auditKey(brandId));
  if (!v?.audit || typeof v.at !== "number" || now - v.at > AUDIT_TTL || now < v.at) return null;
  return v.audit;
}

export type KeptPlan = { plan: ContentPlan; strategy: Strategy | null; launch: Launch | null; sufficiency: Sufficiency[] | null };

export function keepPlan(brandId: string, kept: KeptPlan) {
  write(planKey(brandId), { ...kept, at: Date.now() });
}

export function keptPlan(brandId: string): KeptPlan | null {
  const v = read<Partial<KeptPlan>>(planKey(brandId));
  if (!v?.plan || !Array.isArray(v.plan.items)) return null;
  return { plan: v.plan, strategy: v.strategy ?? null, launch: v.launch ?? null, sufficiency: Array.isArray(v.sufficiency) ? v.sufficiency : null };
}
