import type { MediaJob, MediaKind } from "./types";

/**
 * Spend limits checked atomically with the insert (see insertWithinQuota). Counting is scoped to
 * the job's kind (pictures and videos have separate pools) and skips jobs the provider refused at
 * submit (status failed without a provider request id: nothing was billed).
 */
export interface Quota {
  sinceIso: string; // rolling window start (now - 24 h)
  global: number; // jobs of this kind in the app
  owner: number; // jobs of this kind of this job's ownerKey
  brand?: number; // jobs of this kind for this job's brandId (when the job has one)
  actor?: number; // jobs of this kind for this job's actorKey (an anonymous caller's hashed IP, when known)
}

export type QuotaResult = "ok" | "global" | "owner" | "brand" | "actor";

export interface QuotaUsage {
  total: number;
  owner: number;
  brand: number;
  actor: number;
}

/** Whose jobs to count besides the whole app: the quota owner, and optionally a brand and an anonymous caller. */
export interface QuotaKeys {
  ownerKey: string;
  brandId?: string;
  actorKey?: string;
}

/** Storage for media jobs. Postgres in production (pg-repo.ts), memory in tests and local dev. */
export interface MediaJobRepo {
  get(id: string): Promise<MediaJob | null>;
  /**
   * Inserts the job only if every cap still has room, as ONE atomic step, so
   * parallel requests cannot all pass a count check and overspend.
   */
  insertWithinQuota(job: MediaJob, quota: Quota): Promise<QuotaResult>;
  update(job: MediaJob): Promise<void>;
  /** Billable jobs of a kind since `sinceIso`: app-wide, for one owner, brand and anonymous caller (a cheap pre-check). */
  countSince?(sinceIso: string, kind: MediaKind, keys: QuotaKeys): Promise<QuotaUsage>;
  /** Ids of queued/running jobs created before `createdBeforeIso`, oldest first (for the stuck-job sweep). */
  listOpen?(createdBeforeIso: string, limit: number): Promise<string[]>;
}

/** Counts toward a quota: inside the window, same kind, and not refused at submit. */
export const isBillable = (j: MediaJob) => !(j.status === "failed" && !j.providerRequestId);

export class MemoryMediaJobRepo implements MediaJobRepo {
  readonly jobs = new Map<string, MediaJob>();

  async get(id: string) {
    const j = this.jobs.get(id);
    return j ? structuredClone(j) : null;
  }

  // No await between the check and the write: atomic on the JS event loop.
  async insertWithinQuota(job: MediaJob, quota: Quota): Promise<QuotaResult> {
    if (this.jobs.has(job.id)) throw new Error(`Duplicate media job ${job.id}`);
    const used = this.count(quota.sinceIso, job.kind, job);
    if (used.total >= quota.global) return "global";
    if (used.owner >= quota.owner) return "owner";
    if (quota.brand !== undefined && job.brandId && used.brand >= quota.brand) return "brand";
    if (quota.actor !== undefined && job.actorKey && used.actor >= quota.actor) return "actor";
    this.jobs.set(job.id, structuredClone(job));
    return "ok";
  }

  async update(job: MediaJob) {
    this.jobs.set(job.id, structuredClone(job));
  }

  async countSince(sinceIso: string, kind: MediaKind, keys: QuotaKeys) {
    return this.count(sinceIso, kind, keys);
  }

  async listOpen(createdBeforeIso: string, limit: number): Promise<string[]> {
    const before = Date.parse(createdBeforeIso);
    return [...this.jobs.values()]
      .filter((j) => (j.status === "queued" || j.status === "running") && Date.parse(j.createdAt) < before)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .slice(0, limit)
      .map((j) => j.id);
  }

  private count(sinceIso: string, kind: MediaKind, keys: QuotaKeys): QuotaUsage {
    const since = Date.parse(sinceIso);
    const u = { total: 0, owner: 0, brand: 0, actor: 0 };
    for (const j of this.jobs.values()) {
      if (Date.parse(j.createdAt) < since || j.kind !== kind || !isBillable(j)) continue;
      u.total++;
      if (j.ownerKey === keys.ownerKey) u.owner++;
      if (keys.brandId && j.brandId === keys.brandId) u.brand++;
      if (keys.actorKey && j.actorKey === keys.actorKey) u.actor++;
    }
    return u;
  }
}
