"use client";

/**
 * The desk: what is under the owner's hand right now, apart from the data in store.ts.
 * The post in focus (queue, preview, the hub's Asboblar), the handles of the picture and style
 * components that the hub's tools call, and the toasts.
 */
import { create } from "zustand";
import { COPY } from "../ui/copy";
import { fmt, useLang } from "../ui/lang";
import { weekday } from "../ui/format";
import { useStudio } from "./store";

/** PostImage's handle (media/PostImage.tsx): both run inside the caller's click. */
export type ImageHandle = { regenerate(): void; pickPhoto(): void };
/** StyleRefs' handle (media/StyleRefs.tsx). */
export type RefsHandle = { addPhotos(): void };

export type Toast = {
  id: number;
  text: string;
  tone?: "ok" | "bad";
  /** One action at most ("Bekor qilish", "Ko‘rish"). */
  action?: { label: string; run: () => void };
  /** How long it stays (ms). */
  ms: number;
};

type Desk = {
  focusedPostId: string | null;
  setFocused: (id: string | null) => void;
  /** The post whose text is open for editing (one at a time; E opens it from the keyboard). */
  editingId: string | null;
  setEditing: (id: string | null) => void;
  /** "Telegramda joylash" asked once: the second press within 6 s publishes. */
  confirmId: string | null;
  askPublish: (id: string | null) => void;
  /** Any shortcut used once: the hint line under the preview may show. */
  keysUsed: boolean;
  setKeysUsed: () => void;
  imageHandle: ImageHandle | null;
  setImageHandle: (h: ImageHandle | null) => void;
  refsHandle: RefsHandle | null;
  setRefsHandle: (h: RefsHandle | null) => void;
  toasts: Toast[];
  toast: (t: Omit<Toast, "id" | "ms"> & { ms?: number }) => number;
  dismiss: (id: number) => void;
};

let next = 1;

let confirmTimer: ReturnType<typeof setTimeout> | null = null;

const keysSeen = () => {
  try {
    return localStorage.getItem("mercat.keys") === "1";
  } catch {
    return false;
  }
};

export const useDesk = create<Desk>((set, get) => ({
  focusedPostId: null,
  setFocused: (focusedPostId) => set({ focusedPostId }),
  editingId: null,
  setEditing: (editingId) => set({ editingId }),
  confirmId: null,
  askPublish: (confirmId) => {
    if (confirmTimer) clearTimeout(confirmTimer);
    set({ confirmId });
    if (confirmId) confirmTimer = setTimeout(() => set({ confirmId: null }), 6000);
  },
  keysUsed: typeof window !== "undefined" && keysSeen(),
  setKeysUsed: () => {
    if (get().keysUsed) return;
    set({ keysUsed: true });
    try {
      localStorage.setItem("mercat.keys", "1");
    } catch {
      /* fine */
    }
  },
  imageHandle: null,
  setImageHandle: (imageHandle) => set({ imageHandle }),
  refsHandle: null,
  setRefsHandle: (refsHandle) => set({ refsHandle }),
  toasts: [],
  toast: ({ ms = 4000, ...t }) => {
    const id = next++;
    // Two at most: a new one pushes the oldest out rather than stacking a wall.
    set({ toasts: [...get().toasts.slice(-1), { id, ms, ...t }] });
    setTimeout(() => get().dismiss(id), ms);
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

/** Brings a post into view and focus, wherever it is drawn (queue preview or card list). */
export function showPost(id: string) {
  useDesk.getState().setFocused(id);
  requestAnimationFrame(() => {
    const el = document.getElementById(`post-${id}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus({ preventScroll: true });
  });
}

const copy = () => COPY[useLang.getState().lang];

/** "Du 09:00": a slot's suggested day and time, short. */
export function whenOf(slot?: { day: string; time: string }): string {
  if (!slot) return "";
  const c = copy();
  const d = weekday(slot.day);
  return [d != null ? c.weekdays[d] : null, slot.time].filter(Boolean).join(" ");
}

/**
 * Tasdiqlash: the post shows approved at once and a toast offers "Bekor qilish" for the undo
 * window. With `advance` (Pro queue) the focus moves on to the next draft right away. A failure
 * is never lost on a post out of view: it toasts with "Ko‘rish".
 */
export async function approveWithUndo(id: string, advance = false) {
  const c = copy();
  const st = useStudio.getState();
  const { toast, dismiss, setFocused } = useDesk.getState();
  const next = advance ? st.posts.find((p) => p.status === "draft" && p.id !== id) : undefined;
  if (next) setFocused(next.id);
  const delay = st.approveDelayMs;
  const text = next?.slot ? fmt(c.approve.next, { when: whenOf(next.slot) }) : c.approve.toast;
  const t = delay > 0 && !st.sample ? toast({ text, action: { label: c.approve.undo, run: () => useStudio.getState().undoApprove(id) }, ms: delay }) : null;
  const r = await st.approve(id);
  if (t) dismiss(t);
  if (!r.ok && !r.undone && r.message) {
    toast({ text: fmt(c.approve.failed, { why: r.message }), tone: "bad", ms: 7000, action: { label: c.approve.show, run: () => showPost(id) } });
  }
}
