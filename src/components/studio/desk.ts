"use client";

/**
 * The desk: what is under the owner's hand right now, apart from the data in store.ts.
 * The post in focus (queue, preview, the hub's Asboblar), the handles of the picture and style
 * components that the hub's tools call, and the toasts.
 */
import { create } from "zustand";

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
  imageHandle: ImageHandle | null;
  setImageHandle: (h: ImageHandle | null) => void;
  refsHandle: RefsHandle | null;
  setRefsHandle: (h: RefsHandle | null) => void;
  toasts: Toast[];
  toast: (t: Omit<Toast, "id" | "ms"> & { ms?: number }) => number;
  dismiss: (id: number) => void;
};

let next = 1;

export const useDesk = create<Desk>((set, get) => ({
  focusedPostId: null,
  setFocused: (focusedPostId) => set({ focusedPostId }),
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
