import "server-only";
import { getSql, pgErrorCode } from "@/lib/db";
import type { MediaJobRepo, Quota, QuotaResult } from "./repo";
import type { MediaJob } from "./types";

/**
 * Neon Postgres storage for media jobs: a few indexed columns + the whole job as jsonb.
 *
 * db/schema.sql belongs to the engine agent, so the table is created lazily the
 * first time a query hits "relation does not exist" (42P01). The same DDL is
 * proposed for schema.sql in docs/creative/media-pipeline.md.
 */
async function ensureTable(): Promise<void> {
  const sql = getSql();
  await sql`CREATE TABLE IF NOT EXISTS media_jobs (
    id uuid PRIMARY KEY,
    brand_id text,
    kind text NOT NULL,
    status text NOT NULL,
    provider text NOT NULL,
    owner_key text NOT NULL DEFAULT 'anon',
    data jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS media_jobs_created_idx ON media_jobs (created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS media_jobs_owner_created_idx ON media_jobs (owner_key, created_at DESC)`;
}

async function withTable<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (pgErrorCode(err) !== "42P01") throw err;
    await ensureTable();
    return fn();
  }
}

/** Arbitrary constant key for pg_advisory_xact_lock: serialises media job inserts. */
const QUOTA_LOCK = 7_310_524_001;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PgMediaJobRepo implements MediaJobRepo {
  async get(id: string): Promise<MediaJob | null> {
    if (!UUID_RE.test(id)) return null;
    const rows = await withTable(() => getSql()`SELECT data FROM media_jobs WHERE id = ${id}`);
    return rows.length ? (rows[0].data as MediaJob) : null;
  }

  /**
   * Check-and-insert in ONE transaction behind a transaction-scoped advisory
   * lock: concurrent creates are serialised, so the caps cannot be overshot.
   */
  async insertWithinQuota(job: MediaJob, q: Quota): Promise<QuotaResult> {
    const sql = getSql();
    const cap = (n: number) => (Number.isFinite(n) ? n : 2_147_483_647);
    const results = await withTable(() =>
      sql.transaction([
        sql`SELECT pg_advisory_xact_lock(${QUOTA_LOCK})`,
        sql`SELECT
              (SELECT count(*)::int FROM media_jobs WHERE created_at >= ${q.sinceIso}) AS total,
              (SELECT count(*)::int FROM media_jobs WHERE owner_key = ${job.ownerKey} AND created_at >= ${q.sinceIso}) AS mine`,
        sql`INSERT INTO media_jobs (id, brand_id, kind, status, provider, owner_key, data, created_at, updated_at)
            SELECT ${job.id}, ${job.brandId ?? null}, ${job.kind}, ${job.status}, ${job.provider}, ${job.ownerKey},
                   ${JSON.stringify(job)}::jsonb, ${job.createdAt}, ${job.updatedAt}
            WHERE (SELECT count(*) FROM media_jobs WHERE created_at >= ${q.sinceIso}) < ${cap(q.global)}
              AND (SELECT count(*) FROM media_jobs WHERE owner_key = ${job.ownerKey} AND created_at >= ${q.sinceIso}) < ${cap(q.owner)}
            RETURNING id`,
      ]),
    );
    if ((results[2] as unknown[]).length) return "ok";
    const counts = (results[1] as { total: number; mine: number }[])[0];
    return counts && counts.total >= q.global ? "global" : "owner";
  }

  async update(job: MediaJob): Promise<void> {
    await withTable(
      () => getSql()`UPDATE media_jobs
        SET status = ${job.status}, data = ${JSON.stringify(job)}::jsonb, updated_at = ${job.updatedAt}
        WHERE id = ${job.id}`,
    );
  }

}
