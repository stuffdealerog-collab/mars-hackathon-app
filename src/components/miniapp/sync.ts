/**
 * Back from the background: Telegram on iOS puts the webview to sleep and cuts the strategy
 * stream, and posts may have been published from the bot or another device meanwhile.
 */
import { useEffect } from "react";
import { useStudio } from "../studio/store";

/** A run cut by the sleep (network / timeout) resumes once; a finished one re-reads its posts. */
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
      if (st.phase === "ready") void st.refreshPosts();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [active]);
}
