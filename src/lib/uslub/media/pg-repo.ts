import "server-only";
import { getSql, pgErrorCode } from "@/lib/db";
import type { MediaJobRepo, Quota, QuotaKeys, QuotaResult, QuotaUsage } from "./repo";
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
    const cap = (n: number | undefined) => (n !== undefined && Number.isFinite(n) ? n : 2_147_483_647);
    const brandCap = job.brandId ? cap(q.brand) : 2_147_483_647;
    const actorCap = job.actorKey ? cap(q.actor) : 2_147_483_647;
    const actorKey = job.actorKey ?? ""; // "" matches no row: jobs without an actor key have NULL there
    // Billable jobs of this kind in the window (a job refused at submit has no provider request id).
    const counts = sql`SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE owner_key = ${job.ownerKey})::int AS mine,
        count(*) FILTER (WHERE brand_id = ${job.brandId ?? ""})::int AS brand,
        count(*) FILTER (WHERE data->>'actorKey' = ${actorKey})::int AS actor
      FROM media_jobs
      WHERE created_at >= ${q.sinceIso} AND kind = ${job.kind}
        AND NOT (status = 'failed' AND data->>'providerRequestId' IS NULL)`;
    const results = await withTable(() =>
      sql.transaction([
        sql`SELECT pg_advisory_xact_lock(${QUOTA_LOCK})`,
        counts,
        sql`INSERT INTO media_jobs (id, brand_id, kind, status, provider, owner_key, data, created_at, updated_at)
            SELECT ${job.id}, ${job.brandId ?? null}, ${job.kind}, ${job.status}, ${job.provider}, ${job.ownerKey},
                   ${JSON.stringify(job)}::jsonb, ${job.createdAt}, ${job.updatedAt}
            FROM (
              SELECT count(*) AS total,
                     count(*) FILTER (WHERE owner_key = ${job.ownerKey}) AS mine,
                     count(*) FILTER (WHERE brand_id = ${job.brandId ?? ""}) AS brand,
                     count(*) FILTER (WHERE data->>'actorKey' = ${actorKey}) AS actor
              FROM media_jobs
              WHERE created_at >= ${q.sinceIso} AND kind = ${job.kind}
                AND NOT (status = 'failed' AND data->>'providerRequestId' IS NULL)
            ) c
            WHERE c.total < ${cap(q.global)} AND c.mine < ${cap(q.owner)} AND c.brand < ${brandCap} AND c.actor < ${actorCap}
            RETURNING id`,
      ]),
    );
    if ((results[2] as unknown[]).length) return "ok";
    const c = (results[1] as { total: number; mine: number; brand: number; actor: number }[])[0];
    if (!c || c.total >= cap(q.global)) return "global";
    if (c.mine >= cap(q.owner)) return "owner";
    if (c.brand >= brandCap) return "brand";
    return "actor";
  }

  async countSince(sinceIso: string, kind: MediaJob["kind"], keys: QuotaKeys): Promise<QuotaUsage> {
    const rows = (await withTable(
      () => getSql()`SELECT count(*)::int AS total,
                            count(*) FILTER (WHERE owner_key = ${keys.ownerKey})::int AS owner,
                            count(*) FILTER (WHERE brand_id = ${keys.brandId ?? ""})::int AS brand,
                            count(*) FILTER (WHERE data->>'actorKey' = ${keys.actorKey ?? ""})::int AS actor
                     FROM media_jobs
                     WHERE created_at >= ${sinceIso} AND kind = ${kind}
                       AND NOT (status = 'failed' AND data->>'providerRequestId' IS NULL)`,
    )) as QuotaUsage[];
    return rows[0] ?? { total: 0, owner: 0, brand: 0, actor: 0 };
  }

  async listOpen(createdBeforeIso: string, limit: number): Promise<string[]> {
    const rows = (await withTable(
      () => getSql()`SELECT id FROM media_jobs
                     WHERE status IN ('queued', 'running') AND created_at < ${createdBeforeIso}
                     ORDER BY created_at ASC
                     LIMIT ${Math.max(1, Math.min(100, Math.floor(limit)))}`,
    )) as { id: string }[];
    return rows.map((r) => r.id);
  }

  async update(job: MediaJob): Promise<void> {
    await withTable(
      () => getSql()`UPDATE media_jobs
        SET status = ${job.status}, data = ${JSON.stringify(job)}::jsonb, updated_at = ${job.updatedAt}
        WHERE id = ${job.id}`,
    );
  }

}
