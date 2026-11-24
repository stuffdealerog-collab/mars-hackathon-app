/**
 * What this device keeps per brand so a reopen shows the work at once instead of paying for it
 * again: the channel's audit (12 h, then it is measured anew) and the latest week plan. The
 * server keeps the plan too (GET /strategy) and wins across devices; this copy shows at once and
 * stands in when the server has none. Storage can be full, blocked or in private mode: every
 * read and write is allowed to fail quietly.
 */
import type { ChannelAudit, ContentPlan, Strategy } from "@/lib/uslub/contract";
import type { Launch, SavedPlan, Sufficiency } from "./api";

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

/** `at`: when this device kept it (ms), read back from storage. */
export type KeptPlan = { plan: ContentPlan; strategy: Strategy | null; launch: Launch | null; sufficiency: Sufficiency[] | null; at?: number };

export function keepPlan(brandId: string, kept: KeptPlan) {
  write(planKey(brandId), { ...kept, at: Date.now() });
}

export function keptPlan(brandId: string): KeptPlan | null {
  const v = read<Partial<KeptPlan>>(planKey(brandId));
  if (!v?.plan || !Array.isArray(v.plan.items)) return null;
  return {
    plan: v.plan,
    strategy: v.strategy ?? null,
    launch: v.launch ?? null,
    sufficiency: Array.isArray(v.sufficiency) ? v.sufficiency : null,
    ...(typeof v.at === "number" ? { at: v.at } : {}),
  };
}

/** The server's copy may miss a plan built here if its save failed; a local plan this much newer wins. */
const LOCAL_NEWER_MS = 2 * 60_000;

/**
 * Which plan a reopen shows: the server's latest (it follows the owner across devices), unless
 * it has none, or this device holds a different plan built clearly after it. The same plan keeps
 * this device's extras (Pro's data sufficiency, which the server does not store).
 */
export function pickPlan(kept: KeptPlan | null, saved: SavedPlan | null): KeptPlan | null {
  const plan = saved?.plan;
  if (!plan || !Array.isArray(plan.items) || !plan.items.length) return kept;
  if (!kept) return { plan, strategy: saved.strategy ?? null, launch: saved.launch ?? null, sufficiency: null };
  if (JSON.stringify(kept.plan) === JSON.stringify(plan)) return kept;
  const savedAt = Date.parse(saved.createdAt ?? "");
  if (kept.at != null && Number.isFinite(savedAt) && kept.at - savedAt > LOCAL_NEWER_MS) return kept;
  return { plan, strategy: saved.strategy ?? null, launch: saved.launch ?? null, sufficiency: null };
}
