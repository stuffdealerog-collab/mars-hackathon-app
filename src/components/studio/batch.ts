/**
 * The posts of the latest run: the newest post and the ones written up to 15 minutes before it,
 * seven at most (a run writes one week). Pictures start by themselves only for these; an older
 * draft without one waits for the owner's own «Rasm yaratish», so reopening a brand with many
 * old drafts never starts a pile of paid pictures at once.
 */
export const BATCH_MAX = 7;
const BATCH_WINDOW_MS = 15 * 60_000;

export function latestBatch(posts: { id: string; createdAt: string }[], max = BATCH_MAX, windowMs = BATCH_WINDOW_MS): Set<string> {
  const at = (p: { createdAt: string }) => {
    const t = Date.parse(p.createdAt);
    return Number.isFinite(t) ? t : 0;
  };
  const newest = [...posts].sort((a, b) => at(b) - at(a));
  if (!newest.length) return new Set();
  const from = at(newest[0]) - windowMs;
  return new Set(
    newest
      .filter((p) => at(p) >= from)
      .slice(0, max)
      .map((p) => p.id),
  );
}
