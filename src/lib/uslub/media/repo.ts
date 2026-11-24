import type { MediaJob } from "./types";

/** Spend limits checked atomically with the insert (see insertWithinQuota). */
export interface Quota {
  sinceIso: string; // rolling window start (now - 24 h)
  global: number; // all jobs in the app
  owner: number; // jobs of this job's ownerKey
}

export type QuotaResult = "ok" | "global" | "owner";

/** Storage for media jobs. Postgres in production (pg-repo.ts), memory in tests and local dev. */
export interface MediaJobRepo {
  get(id: string): Promise<MediaJob | null>;
  /**
   * Inserts the job only if both caps still have room, as ONE atomic step, so
   * parallel requests cannot all pass a count check and overspend.
   */
  insertWithinQuota(job: MediaJob, quota: Quota): Promise<QuotaResult>;
  update(job: MediaJob): Promise<void>;
}

export class MemoryMediaJobRepo implements MediaJobRepo {
  readonly jobs = new Map<string, MediaJob>();

  async get(id: string) {
    const j = this.jobs.get(id);
    return j ? structuredClone(j) : null;
  }

  // No await between the check and the write: atomic on the JS event loop.
  async insertWithinQuota(job: MediaJob, quota: Quota): Promise<QuotaResult> {
    if (this.jobs.has(job.id)) throw new Error(`Duplicate media job ${job.id}`);
    const since = Date.parse(quota.sinceIso);
    let all = 0;
    let mine = 0;
    for (const j of this.jobs.values()) {
      if (Date.parse(j.createdAt) < since) continue;
      all++;
      if (j.ownerKey === job.ownerKey) mine++;
    }
    if (all >= quota.global) return "global";
    if (mine >= quota.owner) return "owner";
    this.jobs.set(job.id, structuredClone(job));
    return "ok";
  }

  async update(job: MediaJob) {
    this.jobs.set(job.id, structuredClone(job));
  }
}
