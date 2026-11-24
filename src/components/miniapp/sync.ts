/**
 * Keeping the Mini App honest after it was in the background: Telegram on iOS puts the webview
 * to sleep and cuts the strategy stream, and posts may have been published from the bot or
 * another device meanwhile. Read-only use of the shared store; nothing here edits studio/*.
 */
import { useEffect } from "react";
import * as api from "../studio/api";
import { useStudio } from "../studio/store";
import { useLang } from "../ui/lang";

/** Merges the server's posts into the list: status, link, approval time and picture; local edits stay. */
export async function refreshPosts() {
  const st = useStudio.getState();
  const brand = st.brand;
  if (!brand || st.sample) return;
  const r = await api.listPosts(brand.id, useLang.getState().lang);
  if (!r.ok) return;
  const now = useStudio.getState();
  if (now.brand?.id !== brand.id) return;
  const server = new Map(r.data.posts.map((p) => [p.id, p]));
  const merged = now.posts.map((p) => {
    const s = server.get(p.id);
    if (!s) return p;
    return {
      ...p,
      status: s.status === "draft" && p.status !== "draft" ? p.status : s.status,
      publishedUrl: s.publishedUrl ?? p.publishedUrl,
      approvedAt: s.approvedAt ?? p.approvedAt,
      image: s.image ?? p.image,
      needsApproval: now.edited[p.id] ? p.needsApproval : s.needsApproval,
      placeholders: now.edited[p.id] ? p.placeholders : s.placeholders,
      note: now.edited[p.id] ? p.note : s.note,
    };
  });
  const known = new Set(now.posts.map((p) => p.id));
  const added = r.data.posts.filter((p) => !known.has(p.id));
  useStudio.setState({ posts: [...merged, ...added] });
}

/** Back from the background: a run cut by the sleep resumes once; a finished one re-reads its posts. */
export function useResume(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let retried = false;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const st = useStudio.getState();
      if (st.phase === "working" && st.problem && (st.problem.code === "network" || st.problem.code === "timeout") && !retried) {
        retried = true;
        st.retry();
        return;
      }
      if (st.phase === "working" && !st.problem) retried = false;
      if (st.phase === "ready") void refreshPosts();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [active]);
}
