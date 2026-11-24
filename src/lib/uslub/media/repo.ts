import type { MediaJob } from "./types";

/** Storage for media jobs. Postgres in production (pg-repo.ts), memory in tests and local dev. */
export interface MediaJobRepo {
  get(id: string): Promise<MediaJob | null>;
  insert(job: MediaJob): Promise<void>;
  update(job: MediaJob): Promise<void>;
  /** Jobs created at or after `sinceIso` (for the daily spend cap). */
  countSince(sinceIso: string): Promise<number>;
}

export class MemoryMediaJobRepo implements MediaJobRepo {
  readonly jobs = new Map<string, MediaJob>();

  async get(id: string) {
    const j = this.jobs.get(id);
    return j ? structuredClone(j) : null;
  }

  async insert(job: MediaJob) {
    if (this.jobs.has(job.id)) throw new Error(`Duplicate media job ${job.id}`);
    this.jobs.set(job.id, structuredClone(job));
  }

  async update(job: MediaJob) {
    this.jobs.set(job.id, structuredClone(job));
  }

  async countSince(sinceIso: string) {
    const since = Date.parse(sinceIso);
    let n = 0;
    for (const j of this.jobs.values()) if (Date.parse(j.createdAt) >= since) n++;
    return n;
  }
}
