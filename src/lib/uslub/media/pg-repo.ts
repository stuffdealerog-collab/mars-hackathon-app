import "server-only";
import { getSql, pgErrorCode } from "@/lib/db";
import type { MediaJobRepo } from "./repo";
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
    data jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS media_jobs_created_idx ON media_jobs (created_at DESC)`;
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PgMediaJobRepo implements MediaJobRepo {
  async get(id: string): Promise<MediaJob | null> {
    if (!UUID_RE.test(id)) return null;
    const rows = await withTable(() => getSql()`SELECT data FROM media_jobs WHERE id = ${id}`);
    return rows.length ? (rows[0].data as MediaJob) : null;
  }

  async insert(job: MediaJob): Promise<void> {
    await withTable(
      () => getSql()`INSERT INTO media_jobs (id, brand_id, kind, status, provider, data, created_at, updated_at)
        VALUES (${job.id}, ${job.brandId ?? null}, ${job.kind}, ${job.status}, ${job.provider},
                ${JSON.stringify(job)}::jsonb, ${job.createdAt}, ${job.updatedAt})`,
    );
  }

  async update(job: MediaJob): Promise<void> {
    await withTable(
      () => getSql()`UPDATE media_jobs
        SET status = ${job.status}, data = ${JSON.stringify(job)}::jsonb, updated_at = ${job.updatedAt}
        WHERE id = ${job.id}`,
    );
  }

  async countSince(sinceIso: string): Promise<number> {
    const rows = await withTable(() => getSql()`SELECT count(*)::int AS n FROM media_jobs WHERE created_at >= ${sinceIso}`);
    return Number(rows[0]?.n ?? 0);
  }
}
