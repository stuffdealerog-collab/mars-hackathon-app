/**
 * Back from the background: Telegram on iOS puts the webview to sleep and cuts the strategy
 * stream, and posts may have been published from the bot or another device meanwhile.
 */
import type { ContentPlan, Strategy } from "@/lib/uslub/contract";
import { useEffect } from "react";
import * as api from "../studio/api";
import { useStudio } from "../studio/store";
import { useLang } from "../ui/lang";

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

/**
 * A reopened brand shows its latest week plan even on a phone that never kept it: the server holds
 * it for 30 days (GET /api/uslub/strategy?brandId=). Quiet on any failure: Kanal still offers a rebuild.
 */
export async function loadLatestPlan(brandId: string) {
  const auth = api.authHeader();
  try {
    const res = await fetch(`/api/uslub/strategy?brandId=${encodeURIComponent(brandId)}`, {
      headers: { "x-lang": useLang.getState().lang, ...(auth ? { authorization: auth } : {}) },
    });
    if (!res.ok) return;
    const j = (await res.json().catch(() => null)) as { plan?: ContentPlan | null; strategy?: Strategy | null; launch?: api.Launch | null } | null;
    const plan = j?.plan;
    const st = useStudio.getState();
    // Another brand opened meanwhile, or a plan arrived another way (kept on this phone, a rebuild).
    if (!plan || !Array.isArray(plan.items) || st.brand?.id !== brandId || st.plan) return;
    useStudio.setState({
      plan,
      strategy: j?.strategy ?? null,
      launch: j?.launch?.tactics?.length ? j.launch : null,
      steps: st.steps.map((s) => (s.key === "plan" ? { ...s, status: "done" as const, n: plan.items.length } : s)),
    });
  } catch {
    /* offline: the plan stays as it was */
  }
}
