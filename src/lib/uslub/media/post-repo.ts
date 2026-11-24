import "server-only";
import { getSql, isDbConfigured } from "@/lib/db";
import type { PlanSlot, Script } from "../contract";
import { getPost } from "../store";
import type { PostForImage, StoredPostImage } from "./post-image";

/**
 * posts.image (and the post fields a picture needs). Own SQL so the images stream does not
 * depend on the engine's store.ts changes; the columns are the same (2026-11-25 migration).
 */
const memImages = new Map<string, StoredPostImage>();

type Row = {
  id: string;
  brand_id: string;
  brief: string;
  variants: Partial<Record<Script, string>>;
  slot: PlanSlot | null;
  image: StoredPostImage | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getPostForImage(id: string): Promise<PostForImage | null> {
  if (!UUID_RE.test(id)) return null;
  if (!isDbConfigured()) {
    const p = await getPost(id);
    return p ? { id: p.id, brandId: p.brandId, brief: p.brief, variants: p.variants, slot: p.slot, image: memImages.get(id) } : null;
  }
  const rows = (await getSql()`SELECT id, brand_id, brief, variants, slot, image FROM posts WHERE id = ${id}`) as Row[];
  const r = rows[0];
  if (!r) return null;
  return { id: r.id, brandId: r.brand_id, brief: r.brief, variants: r.variants ?? {}, slot: r.slot ?? undefined, image: r.image ?? undefined };
}

export async function savePostImage(postId: string, image: StoredPostImage): Promise<void> {
  if (!isDbConfigured()) {
    memImages.set(postId, image);
    return;
  }
  await getSql()`UPDATE posts SET image = ${JSON.stringify(image)}::jsonb WHERE id = ${postId}`;
}
