import "server-only";
import { randomUUID } from "node:crypto";
import { getSql, isDbConfigured } from "@/lib/db";
import { safeLogEvent } from "@/lib/track";
import { BRAND_CACHE_MAX_AGE_HOURS, type BrandSource } from "./access";
import type { BrandDNA, BrandMode, BrandProfile, Flow, NeuroHit, PlanSlot, PostDraft, PostImage, Script, VisualStyle } from "./contract";

/**
 * Persistence for brands, posts and flows (Neon Postgres). Falls back to an
 * in-memory store when DATABASE_URL is missing (local dev / tests).
 */

/** A brand as stored: the contract's BrandProfile plus ownership. Never send owner ids to clients (see publicBrand). */
export type StoredBrand = BrandProfile & { ownerTelegramId: number | null; source: BrandSource };

export const publicBrand = (b: StoredBrand): BrandProfile => ({
  id: b.id,
  channel: b.channel,
  knowledge: b.knowledge,
  samplePosts: b.samplePosts,
  dna: b.dna,
  mode: b.mode ?? "channel",
  ...(b.visual ? { visual: b.visual } : {}),
  createdAt: b.createdAt,
});

const mem = {
  brands: new Map<string, StoredBrand>(),
  posts: new Map<string, PostDraft>(),
  flows: new Map<string, Flow & { brandId?: string }>(),
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID_RE.test(s);

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));

type BrandRow = {
  id: string;
  owner_telegram_id: string | number | null; // bigint arrives as string
  source: string;
  channel: string | null;
  knowledge: string;
  sample_posts: string[];
  dna: BrandDNA;
  mode?: string | null;
  visual?: VisualStyle | null;
  created_at: Date | string;
};

const toBrand = (r: BrandRow): StoredBrand => ({
  id: r.id,
  channel: r.channel ?? undefined,
  knowledge: r.knowledge,
  samplePosts: r.sample_posts ?? [],
  dna: r.dna,
  mode: r.mode === "fresh" ? "fresh" : "channel",
  ...(r.visual ? { visual: r.visual } : {}),
  createdAt: iso(r.created_at),
  ownerTelegramId: r.owner_telegram_id == null ? null : Number(r.owner_telegram_id),
  source: r.source === "channel_only" ? "channel_only" : "custom",
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
  slot?: PlanSlot | null;
  image?: PostImage | null;
  approved_at?: Date | string | null;
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
  ...(r.slot ? { slot: r.slot } : {}),
  ...(r.image ? { image: r.image } : {}),
  ...(r.approved_at ? { approvedAt: iso(r.approved_at) } : {}),
  createdAt: iso(r.created_at),
});

/* ----------------------------------------------------------------- brands */

const normChannel = (c?: string | null) => c?.replace(/^@/, "").toLowerCase() || null;

export async function saveBrand(
  input: Omit<BrandProfile, "id" | "createdAt">,
  ownerTelegramId: number | null,
  source: BrandSource,
): Promise<StoredBrand> {
  const channel = normChannel(input.channel);
  const mode: BrandMode = input.mode === "fresh" ? "fresh" : "channel";
  let brand: StoredBrand;
  if (!isDbConfigured()) {
    brand = { ...input, mode, channel: channel ?? undefined, id: randomUUID(), createdAt: new Date().toISOString(), ownerTelegramId, source };
    mem.brands.set(brand.id, brand);
  } else {
    const rows = (await getSql()`
      INSERT INTO brands (owner_telegram_id, source, channel, knowledge, sample_posts, dna, mode)
      VALUES (${ownerTelegramId}, ${source}, ${channel}, ${input.knowledge},
              ${JSON.stringify(input.samplePosts)}::jsonb, ${JSON.stringify(input.dna)}::jsonb, ${mode})
      RETURNING id, owner_telegram_id, source, channel, knowledge, sample_posts, dna, mode, visual, created_at
    `) as BrandRow[];
    brand = toBrand(rows[0]);
  }
  await safeLogEvent(ownerTelegramId, "brand_created", { brand_id: brand.id, channel, source, mode, samples: input.samplePosts.length });
  return brand;
}

export async function getBrand(id: string): Promise<StoredBrand | null> {
  if (!isUuid(id)) return null;
  if (!isDbConfigured()) return mem.brands.get(id) ?? null;
  const rows = (await getSql()`
    SELECT id, owner_telegram_id, source, channel, knowledge, sample_posts, dna, mode, visual, created_at FROM brands WHERE id = ${id}
  `) as BrandRow[];
  return rows[0] ? toBrand(rows[0]) : null;
}

/** Most recent channel_only brand for this channel (cache candidate; callers still check isReusableBrand). */
export async function findChannelOnlyBrand(channel: string): Promise<StoredBrand | null> {
  const key = normChannel(channel);
  if (!key) return null;
  const since = new Date(Date.now() - BRAND_CACHE_MAX_AGE_HOURS * 3600_000);
  if (!isDbConfigured()) {
    const hits = [...mem.brands.values()].filter(
      (b) => b.channel === key && b.source === "channel_only" && b.mode !== "fresh" && new Date(b.createdAt) >= since,
    );
    return hits.at(-1) ?? null;
  }
  const rows = (await getSql()`
    SELECT id, owner_telegram_id, source, channel, knowledge, sample_posts, dna, mode, visual, created_at FROM brands
    WHERE channel = ${key} AND source = 'channel_only' AND mode = 'channel' AND created_at >= ${since.toISOString()}
    ORDER BY created_at DESC LIMIT 1
  `) as BrandRow[];
  return rows[0] ? toBrand(rows[0]) : null;
}

/** Links a verified channel to a brand that had none (first authorized publish). */
export async function linkBrandChannel(brandId: string, channel: string): Promise<void> {
  const key = normChannel(channel);
  if (!key) return;
  if (!isDbConfigured()) {
    const b = mem.brands.get(brandId);
    if (b && !b.channel) mem.brands.set(brandId, { ...b, channel: key });
    return;
  }
  await getSql()`UPDATE brands SET channel = ${key} WHERE id = ${brandId} AND channel IS NULL`;
}

const memClaimed = new Set<string>();

/**
 * Was this brand created anonymously on the web and later claimed in the bot? Such a brand stays usable by the
 * browser that holds its (unguessable) id — the claim adds publishing rights, it does not lock the Studio out.
 * Brands created through the bot or the Mini App (owned from the start) are never in this set.
 */
export async function wasClaimed(brandId: string): Promise<boolean> {
  if (!isUuid(brandId)) return false;
  if (memClaimed.has(brandId)) return true;
  if (!isDbConfigured()) return false;
  try {
    const rows = (await getSql()`
      SELECT 1 AS ok FROM events WHERE type = 'brand_claimed' AND props->>'brand_id' = ${brandId} LIMIT 1
    `) as { ok: number }[];
    if (rows.length) memClaimed.add(brandId);
    return rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Gives an unowned brand to a Telegram user. Atomic: only succeeds while owner_telegram_id is NULL, so two
 * people racing for one brand cannot both win. Callers must first verify that the user administers the
 * brand's channel with post rights (see botpublish.ts). Returns the brand's owner after the call.
 */
export async function claimBrand(brandId: string, telegramId: number): Promise<number | null> {
  if (!isUuid(brandId)) return null;
  if (!isDbConfigured()) {
    const b = mem.brands.get(brandId);
    if (!b) return null;
    if (b.ownerTelegramId == null) {
      mem.brands.set(brandId, { ...b, ownerTelegramId: telegramId });
      memClaimed.add(brandId);
    }
    return mem.brands.get(brandId)?.ownerTelegramId ?? null;
  }
  const claimed = (await getSql()`
    UPDATE brands SET owner_telegram_id = ${telegramId} WHERE id = ${brandId} AND owner_telegram_id IS NULL RETURNING id
  `) as { id: string }[];
  if (claimed.length) {
    memClaimed.add(brandId);
    await safeLogEvent(telegramId, "brand_claimed", { brand_id: brandId });
  }
  const rows = (await getSql()`SELECT owner_telegram_id FROM brands WHERE id = ${brandId}`) as { owner_telegram_id: string | number | null }[];
  const owner = rows[0]?.owner_telegram_id;
  return owner == null ? null : Number(owner);
}

/** Stores the brand's learned visual style (used by the images session). */
export async function setBrandVisual(brandId: string, visual: VisualStyle): Promise<void> {
  if (!isUuid(brandId)) return;
  if (!isDbConfigured()) {
    const b = mem.brands.get(brandId);
    if (b) mem.brands.set(brandId, { ...b, visual });
    return;
  }
  await getSql()`UPDATE brands SET visual = ${JSON.stringify(visual)}::jsonb WHERE id = ${brandId}`;
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
          INSERT INTO posts (id, brand_id, brief, variants, neuro_hits, human_score, status, slot, image, created_at)
          VALUES (${p.id}, ${p.brandId}, ${p.brief}, ${JSON.stringify(p.variants)}::jsonb,
                  ${JSON.stringify(p.neuroHits)}::jsonb, ${p.humanScore}, ${p.status},
                  ${p.slot ? JSON.stringify(p.slot) : null}::jsonb, ${p.image ? JSON.stringify(p.image) : null}::jsonb,
                  ${p.createdAt})
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
    SELECT id, brand_id, brief, variants, neuro_hits, human_score, status, published_url, slot, image, approved_at, created_at
    FROM posts WHERE id = ${id}
  `) as PostRow[];
  return rows[0] ? toPost(rows[0]) : null;
}

/** The brand's posts, newest first (drafts, approved and published). */
export async function listPosts(brandId: string, limit = 50): Promise<PostDraft[]> {
  if (!isUuid(brandId)) return [];
  const n = Math.max(1, Math.min(100, Math.round(limit)));
  if (!isDbConfigured()) {
    const key = (p: PostDraft) => `${p.slot?.day ?? "~"} ${p.slot?.time ?? ""}`;
    return [...mem.posts.values()]
      .filter((p) => p.brandId === brandId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || key(a).localeCompare(key(b)))
      .slice(0, n);
  }
  const rows = (await getSql()`
    SELECT id, brand_id, brief, variants, neuro_hits, human_score, status, published_url, slot, image, approved_at, created_at
    FROM posts WHERE brand_id = ${brandId}
    ORDER BY created_at DESC, slot->>'day' ASC NULLS LAST, slot->>'time' ASC NULLS LAST, id DESC LIMIT ${n}
  `) as PostRow[];
  return rows.map(toPost);
}

/**
 * Marks a draft approved (persisted, survives a reload). Idempotent: an approved or published post comes back
 * unchanged. Returns null when the post does not exist.
 */
export async function approvePost(
  id: string,
  telegramId: number | null = null,
  /** The owner's edited text (merged variants), approved together with the post. Never applied to a published post. */
  edited?: Pick<PostDraft, "variants" | "neuroHits" | "humanScore"> & { changed: string[] },
): Promise<PostDraft | null> {
  if (!isUuid(id)) return null;
  if (!isDbConfigured()) {
    const p = mem.posts.get(id);
    if (!p) return null;
    if (edited && p.status !== "published")
      mem.posts.set(id, { ...p, variants: edited.variants, neuroHits: edited.neuroHits, humanScore: edited.humanScore, status: "approved", approvedAt: new Date().toISOString() });
    else if (p.status === "draft") mem.posts.set(id, { ...p, status: "approved", approvedAt: new Date().toISOString() });
    return mem.posts.get(id) ?? null;
  }
  const rows = edited
    ? ((await getSql()`
        UPDATE posts SET status = 'approved', approved_at = now(),
          variants = ${JSON.stringify(edited.variants)}::jsonb, neuro_hits = ${JSON.stringify(edited.neuroHits)}::jsonb,
          human_score = ${edited.humanScore}
        WHERE id = ${id} AND status IN ('draft', 'approved')
        RETURNING id
      `) as { id: string }[])
    : ((await getSql()`
        UPDATE posts SET status = 'approved', approved_at = now() WHERE id = ${id} AND status = 'draft' RETURNING id
      `) as { id: string }[]);
  if (rows.length) await safeLogEvent(telegramId, "post_approved", { post_id: id, edited: edited?.changed ?? [] });
  return getPost(id);
}

/** Stores the post's picture state (used by the images session). */
export async function setPostImage(postId: string, image: PostImage): Promise<void> {
  if (!isUuid(postId)) return;
  if (!isDbConfigured()) {
    const p = mem.posts.get(postId);
    if (p) mem.posts.set(postId, { ...p, image });
    return;
  }
  await getSql()`UPDATE posts SET image = ${JSON.stringify(image)}::jsonb WHERE id = ${postId}`;
}

export async function markPublished(id: string, url: string | null, chat: string, telegramId: number): Promise<void> {
  if (!isDbConfigured()) {
    const p = mem.posts.get(id);
    if (p) mem.posts.set(id, { ...p, status: "published", publishedUrl: url ?? undefined });
  } else {
    await getSql()`UPDATE posts SET status = 'published', published_url = ${url} WHERE id = ${id}`;
  }
  await safeLogEvent(telegramId, "post_published", { post_id: id, chat });
}

export async function countPublished(brandId: string): Promise<number> {
  if (!isUuid(brandId)) return 0;
  if (!isDbConfigured()) return [...mem.posts.values()].filter((p) => p.brandId === brandId && p.status === "published").length;
  const rows = (await getSql()`
    SELECT count(*)::int AS n FROM posts WHERE brand_id = ${brandId} AND status = 'published'
  `) as { n: number }[];
  return rows[0]?.n ?? 0;
}

/* ------------------------------------------------------- bot: pending publish
 * The bot asked "which channel?" for a post of a brand without one. The answer arrives as the user's next
 * message (another webhook call, maybe another instance), so the question is kept in `events` for 30 min. */

const PENDING_MIN = 30;
const memPending = new Map<number, { postId: string; script: Script; at: number }>();

export async function setPendingPublish(telegramId: number, postId: string, script: Script): Promise<void> {
  memPending.set(telegramId, { postId, script, at: Date.now() });
  await safeLogEvent(telegramId, "publish_pending", { post_id: postId, script });
}

export async function clearPendingPublish(telegramId: number): Promise<void> {
  memPending.delete(telegramId);
  await safeLogEvent(telegramId, "publish_pending_done", {});
}

/** The post waiting for a channel name from this user, if they were asked in the last 30 minutes. */
export async function getPendingPublish(telegramId: number): Promise<{ postId: string; script: Script } | null> {
  if (!isDbConfigured()) {
    const p = memPending.get(telegramId);
    return p && Date.now() - p.at < PENDING_MIN * 60_000 ? { postId: p.postId, script: p.script } : null;
  }
  try {
    const rows = (await getSql()`
      SELECT type, props FROM events
      WHERE telegram_id = ${telegramId} AND type IN ('publish_pending', 'publish_pending_done')
        AND created_at > now() - make_interval(mins => ${PENDING_MIN})
      ORDER BY created_at DESC, id DESC LIMIT 1
    `) as { type: string; props: { post_id?: string; script?: Script } }[];
    const row = rows[0];
    if (!row || row.type !== "publish_pending" || !row.props.post_id || !isUuid(row.props.post_id)) return null;
    return { postId: row.props.post_id, script: row.props.script ?? "uz_latn" };
  } catch {
    return null;
  }
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
