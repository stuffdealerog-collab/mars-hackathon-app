import "server-only";
import { randomUUID } from "node:crypto";
import { getSql, isDbConfigured } from "@/lib/db";
import { safeLogEvent } from "@/lib/track";
import type { BrandDNA, BrandProfile, Flow, NeuroHit, PostDraft, Script } from "./contract";

/**
 * Persistence for brands, posts and flows (Neon Postgres). Falls back to an
 * in-memory store when DATABASE_URL is missing (local dev / tests).
 */

const mem = {
  brands: new Map<string, BrandProfile & { ownerTelegramId?: number | null }>(),
  posts: new Map<string, PostDraft>(),
  flows: new Map<string, Flow & { brandId?: string }>(),
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID_RE.test(s);

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));

type BrandRow = {
  id: string;
  channel: string | null;
  knowledge: string;
  sample_posts: string[];
  dna: BrandDNA;
  created_at: Date | string;
};

const toBrand = (r: BrandRow): BrandProfile => ({
  id: r.id,
  channel: r.channel ?? undefined,
  knowledge: r.knowledge,
  samplePosts: r.sample_posts ?? [],
  dna: r.dna,
  createdAt: iso(r.created_at),
});

type PostRow = {
  id: string;
  brand_id: string;
  brief: string;
  variants: Record<Script, string>;
  neuro_hits: Partial<Record<Script, NeuroHit[]>>;
  human_score: number;
  status: PostDraft["status"];
  published_url: string | null;
  created_at: Date | string;
};

const toPost = (r: PostRow): PostDraft => ({
  id: r.id,
  brandId: r.brand_id,
  brief: r.brief,
  variants: r.variants,
  neuroHits: r.neuro_hits ?? {},
  humanScore: r.human_score,
  status: r.status,
  publishedUrl: r.published_url ?? undefined,
  createdAt: iso(r.created_at),
});

/* ----------------------------------------------------------------- brands */

export async function saveBrand(
  input: Omit<BrandProfile, "id" | "createdAt">,
  ownerTelegramId: number | null = null,
): Promise<BrandProfile> {
  const channel = input.channel?.replace(/^@/, "").toLowerCase() || null;
  if (!isDbConfigured()) {
    const brand = { ...input, channel: channel ?? undefined, id: randomUUID(), createdAt: new Date().toISOString(), ownerTelegramId };
    mem.brands.set(brand.id, brand);
    await safeLogEvent(ownerTelegramId, "brand_created", { brand_id: brand.id, channel });
    return brand;
  }
  const rows = (await getSql()`
    INSERT INTO brands (owner_telegram_id, channel, knowledge, sample_posts, dna)
    VALUES (${ownerTelegramId}, ${channel}, ${input.knowledge}, ${JSON.stringify(input.samplePosts)}::jsonb, ${JSON.stringify(input.dna)}::jsonb)
    RETURNING id, channel, knowledge, sample_posts, dna, created_at
  `) as BrandRow[];
  const brand = toBrand(rows[0]);
  await safeLogEvent(ownerTelegramId, "brand_created", { brand_id: brand.id, channel, samples: input.samplePosts.length });
  return brand;
}

export async function getBrand(id: string): Promise<BrandProfile | null> {
  if (!isUuid(id)) return null;
  if (!isDbConfigured()) return mem.brands.get(id) ?? null;
  const rows = (await getSql()`
    SELECT id, channel, knowledge, sample_posts, dna, created_at FROM brands WHERE id = ${id}
  `) as BrandRow[];
  return rows[0] ? toBrand(rows[0]) : null;
}

/** Most recent brand built from this channel within `maxAgeHours` (cache for the 60-second demo path). */
export async function findRecentBrandByChannel(channel: string, maxAgeHours = 24): Promise<BrandProfile | null> {
  const key = channel.replace(/^@/, "").toLowerCase();
  const since = new Date(Date.now() - maxAgeHours * 3600_000);
  if (!isDbConfigured()) {
    const hits = [...mem.brands.values()].filter((b) => b.channel === key && new Date(b.createdAt) >= since);
    return hits.at(-1) ?? null;
  }
  const rows = (await getSql()`
    SELECT id, channel, knowledge, sample_posts, dna, created_at FROM brands
    WHERE channel = ${key} AND created_at >= ${since.toISOString()} AND knowledge = ''
    ORDER BY created_at DESC LIMIT 1
  `) as BrandRow[];
  return rows[0] ? toBrand(rows[0]) : null;
}

/* ------------------------------------------------------------------ posts */

export async function savePosts(posts: PostDraft[], telegramId: number | null = null): Promise<void> {
  if (!posts.length) return;
  if (!isDbConfigured()) {
    for (const p of posts) mem.posts.set(p.id, p);
  } else {
    const sql = getSql();
    await Promise.all(
      posts.map(
        (p) => sql`
          INSERT INTO posts (id, brand_id, brief, variants, neuro_hits, human_score, status)
          VALUES (${p.id}, ${p.brandId}, ${p.brief}, ${JSON.stringify(p.variants)}::jsonb,
                  ${JSON.stringify(p.neuroHits)}::jsonb, ${p.humanScore}, ${p.status})
        `,
      ),
    );
  }
  await safeLogEvent(telegramId, "posts_generated", { brand_id: posts[0].brandId, count: posts.length });
}

export async function getPost(id: string): Promise<PostDraft | null> {
  if (!isUuid(id)) return null;
  if (!isDbConfigured()) return mem.posts.get(id) ?? null;
  const rows = (await getSql()`
    SELECT id, brand_id, brief, variants, neuro_hits, human_score, status, published_url, created_at
    FROM posts WHERE id = ${id}
  `) as PostRow[];
  return rows[0] ? toPost(rows[0]) : null;
}

export async function markPublished(id: string, url: string | null, chat: string): Promise<void> {
  if (!isDbConfigured()) {
    const p = mem.posts.get(id);
    if (p) mem.posts.set(id, { ...p, status: "published", publishedUrl: url ?? undefined });
  } else {
    await getSql()`UPDATE posts SET status = 'published', published_url = ${url} WHERE id = ${id}`;
  }
  await safeLogEvent(null, "post_published", { post_id: id, chat });
}

export async function countPublished(brandId: string): Promise<number> {
  if (!isUuid(brandId)) return 0;
  if (!isDbConfigured()) return [...mem.posts.values()].filter((p) => p.brandId === brandId && p.status === "published").length;
  const rows = (await getSql()`
    SELECT count(*)::int AS n FROM posts WHERE brand_id = ${brandId} AND status = 'published'
  `) as { n: number }[];
  return rows[0]?.n ?? 0;
}

/* ------------------------------------------------------------------ flows */

export async function saveFlow(flow: Omit<Flow, "id">, brandId: string | null): Promise<Flow> {
  if (!isDbConfigured()) {
    const saved = { ...flow, id: randomUUID() };
    mem.flows.set(saved.id, { ...saved, brandId: brandId ?? undefined });
    await safeLogEvent(null, "flow_planned", { flow_id: saved.id, brand_id: brandId, nodes: flow.nodes.length });
    return saved;
  }
  const rows = (await getSql()`
    INSERT INTO flows (brand_id, title, graph)
    VALUES (${brandId}, ${flow.title}, ${JSON.stringify({ nodes: flow.nodes, edges: flow.edges })}::jsonb)
    RETURNING id
  `) as { id: string }[];
  const saved = { ...flow, id: rows[0].id };
  await safeLogEvent(null, "flow_planned", { flow_id: saved.id, brand_id: brandId, nodes: flow.nodes.length });
  return saved;
}
