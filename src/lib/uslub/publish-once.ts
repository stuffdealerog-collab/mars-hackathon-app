import "server-only";
import { publishPost, type PublishResult } from "./publish";
import { claimPublish, getBrand, getPost, releasePublish } from "./store";

/**
 * Publishing at most once per post. On a flaky mobile network the Mini App can lose the answer and the owner taps
 * again; Telegram can also deliver the same button press twice. Every publish (the publish route, both bot buttons)
 * goes through here, and publishPost (publish.ts) does the sending:
 * - already published: { ok: true, url, already: true }, nothing is sent;
 * - another call is sending the same post right now: waits up to `waitMs` for it (then answers as above), else
 *   { ok: false, status: 409, inProgress: true };
 * - otherwise the post is claimed atomically (store.ts claimPublish), published, and the claim released: a failed
 *   send leaves the post as it was, so the owner can try again.
 * Only the brand's owner can get past publishPost's checks, so only the owner hears "already" or "in progress";
 * anyone else gets publishPost's own refusal and learns nothing about the post.
 */

export type PublishOnceResult = PublishResult & { already?: boolean; inProgress?: boolean };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function publishOnce(
  args: Parameters<typeof publishPost>[0],
  opts: { waitMs?: number; pollMs?: number } = {},
): Promise<PublishOnceResult> {
  const post = await getPost(args.postId);
  const brand = post ? await getBrand(post.brandId) : null;
  if (!post || !brand || args.userId == null || brand.ownerTelegramId !== args.userId) return publishPost(args);
  const deadline = Date.now() + (opts.waitMs ?? 0);
  for (;;) {
    const claim = await claimPublish(post.id);
    if (claim.kind === "published") return { ok: true, status: 200, ...(claim.url ? { url: claim.url } : {}), already: true };
    if (claim.kind === "missing") return publishPost(args);
    if (claim.kind === "claimed") {
      try {
        return await publishPost(args);
      } finally {
        await releasePublish(post.id, claim).catch((err) =>
          console.warn("[uslub/publish-once] claim not released (it expires by itself)", err instanceof Error ? err.message : err),
        );
      }
    }
    if (Date.now() >= deadline) return { ok: false, status: 409, inProgress: true, error: "publish in progress" };
    await sleep(opts.pollMs ?? 600);
  }
}
