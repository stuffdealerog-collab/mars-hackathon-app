"use client";

import type { PostDraft, Script } from "@/lib/uslub/contract";
import { useEffect } from "react";
import { botPublishUrl, handoffKey } from "./api";
import { approveWithUndo, useDesk } from "./desk";
import { queueOrder } from "./Queue";
import { useStudio } from "./store";

const SCRIPTS: Script[] = ["uz_latn", "uz_cyrl", "ru", "en"];
const CONTROLS = "button, a, input, textarea, select, [contenteditable], [contenteditable=''], [role=menuitem]";

/**
 * Pro keyboard for the queue and the preview (spec §3.8). Single keys work only while focus is
 * on the page itself, a queue option or the preview region, never on a control (WCAG 2.1.4):
 * there a button's own Enter does its own thing. `e.code`, not `e.key`, so J/K and 1-4 work in
 * the Russian and Uzbek Cyrillic layouts too.
 */
export function useHotkeys(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const st = useStudio.getState();
      const desk = useDesk.getState();
      if (st.phase !== "ready" || st.tab !== "posts" || !st.pro || desk.editingId) return;
      const a = document.activeElement as HTMLElement | null;
      const onOption = !!a?.hasAttribute("data-queue-option");
      const inScope = !a || a === document.body || onOption || a.hasAttribute("data-post-scope");
      if (!inScope || (!onOption && a?.closest(CONTROLS))) return;

      const order = queueOrder(st.posts);
      if (!order.length) return;
      const cur = order.find((p) => p.id === desk.focusedPostId) ?? order[0];
      const move = (step: number) => {
        const next = order[(order.indexOf(cur) + step + order.length) % order.length];
        desk.setFocused(next.id);
        if (onOption) requestAnimationFrame(() => document.getElementById(`q-${next.id}`)?.focus({ preventScroll: false }));
      };

      switch (e.code) {
        case "KeyJ":
        case "ArrowDown":
          move(1);
          break;
        case "KeyK":
        case "ArrowUp":
          move(-1);
          break;
        case "Enter":
        case "NumpadEnter":
          // Held Enter approves one post, never a run of them; nothing while a request is out.
          if (e.repeat || st.busy[cur.id] || st.pendingApprove[cur.id]) break;
          if (cur.status === "draft") void approveWithUndo(cur.id, true);
          else if (cur.status === "approved" && !st.sample) publishStep(cur, st.postScript);
          break;
        case "KeyE":
          if (cur.status === "draft") desk.setEditing(cur.id);
          break;
        case "Digit1":
        case "Digit2":
        case "Digit3":
        case "Digit4": {
          const s = SCRIPTS[Number(e.code.slice(-1)) - 1];
          if (cur.variants[s]?.trim()) st.setPostScript(s);
          break;
        }
        default:
          return;
      }
      e.preventDefault();
      desk.setKeysUsed();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

/** Enter on an approved post: the first press asks, the second publishes (or opens the bot). */
function publishStep(post: PostDraft, picked: Script | null) {
  const st = useStudio.getState();
  const desk = useDesk.getState();
  const script = picked && post.variants[picked]?.trim() ? picked : "uz_latn";
  if (!handoffKey()) {
    st.flushApproval(post.id);
    window.open(botPublishUrl(st.bot, post.id, script), "_blank", "noopener");
    return;
  }
  if (desk.confirmId === post.id) {
    desk.askPublish(null);
    void st.publish(post.id, script);
  } else desk.askPublish(post.id);
}
