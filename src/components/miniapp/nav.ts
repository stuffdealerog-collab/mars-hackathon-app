/**
 * Navigation for the Mini App: a base layer chosen by the flow (start / run / tabs), a stack of
 * pushed screens on top, one bottom sheet at most, and a short toast. Telegram's BackButton
 * walks this back: sheet first, then the stack.
 *
 * Bottom buttons: every visible layer may declare its primary (MainButton) and secondary action;
 * the highest-priority declaration drives Telegram's native bottom bar.
 */
import { useEffect, useLayoutEffect, useRef } from "react";
import { create } from "zustand";

/** A post is opened by id: writing or refreshing posts reorders the list, an index would go stale. */
export type Route = { name: "fresh" } | { name: "post"; id: string };
export type SheetName = "settings" | "edit" | "lang" | "details" | "admin" | "channel";
export type Sheet = { name: SheetName; postId?: string };

type Pushed = Route & { key: number; leaving?: boolean };

export type BtnSpec = {
  text: string;
  onClick: () => void;
  active?: boolean;
  progress?: boolean;
  shine?: boolean;
};

type Reg = { priority: number; main: BtnSpec | null; secondary: BtnSpec | null };

interface NavState {
  stack: Pushed[];
  sheet: Sheet | null;
  sheetLeaving: boolean;
  toast: { text: string; tone: "ok" | "bad" | "plain"; id: number } | null;
  regs: Record<string, Reg>;
  /** Right after a run: Kanal shows what was read, with one step on to the posts. */
  firstLook: boolean;
  push: (r: Route) => void;
  pop: () => void;
  /** Drops every pushed screen at once (flow changes such as "start over"). */
  clear: () => void;
  openSheet: (s: Sheet) => void;
  closeSheet: () => void;
  back: () => boolean;
  say: (text: string, tone?: "ok" | "bad" | "plain") => void;
  register: (key: string, reg: Reg | null) => void;
}

/** How long a popped screen or a closing sheet stays mounted for its exit. */
export const POP_MS = 300;
export const SHEET_OUT_MS = 240;

let seq = 0;

export const useNav = create<NavState>((set, get) => ({
  stack: [],
  sheet: null,
  sheetLeaving: false,
  toast: null,
  regs: {},
  firstLook: false,

  push: (r) => set({ stack: [...get().stack.filter((s) => !s.leaving), { ...r, key: ++seq }] }),

  pop: () => {
    const live = get().stack.filter((s) => !s.leaving);
    const top = live[live.length - 1];
    if (!top) return;
    set({ stack: get().stack.map((s) => (s.key === top.key ? { ...s, leaving: true } : s)) });
    setTimeout(() => set({ stack: get().stack.filter((s) => s.key !== top.key) }), POP_MS);
  },

  clear: () => set({ stack: [], sheet: null, sheetLeaving: false }),

  openSheet: (sheet) => set({ sheet, sheetLeaving: false }),

  closeSheet: () => {
    if (!get().sheet || get().sheetLeaving) return;
    set({ sheetLeaving: true });
    setTimeout(() => {
      if (get().sheetLeaving) set({ sheet: null, sheetLeaving: false });
    }, SHEET_OUT_MS);
  },

  back: () => {
    if (get().sheet && !get().sheetLeaving) {
      get().closeSheet();
      return true;
    }
    if (get().stack.some((s) => !s.leaving)) {
      get().pop();
      return true;
    }
    return false;
  },

  say: (text, tone = "plain") => set({ toast: { text, tone, id: ++seq } }),

  register: (key, reg) => {
    const regs = { ...get().regs };
    if (reg) regs[key] = reg;
    else delete regs[key];
    set({ regs });
  },
}));

/** True when something can be closed or popped: Telegram shows its Back button. */
export const useCanGoBack = () => useNav((s) => (!!s.sheet && !s.sheetLeaving) || s.stack.some((x) => !x.leaving));

/** The live (not leaving) pushed screens. */
export const liveStack = (s: NavState) => s.stack.filter((x) => !x.leaving);

/** Layer priorities: the base flow screen, pushed screens above it, sheets on top. */
export const PRIORITY = { base: 10, pushed: 20, sheet: 40 } as const;

/**
 * Declares this layer's bottom buttons while `enabled`. Handlers are read through a ref, so a
 * re-render with a new closure never re-registers the Telegram click listener.
 */
export function useBottomButtons(key: string, priority: number, enabled: boolean, main: BtnSpec | null, secondary: BtnSpec | null = null) {
  const register = useNav((s) => s.register);
  const handlers = useLatest({ main, secondary });

  const mainSig = main ? `${main.text}|${main.active !== false}|${!!main.progress}|${!!main.shine}` : "";
  const secSig = secondary ? `${secondary.text}|${secondary.active !== false}|${!!secondary.progress}` : "";

  useEffect(() => {
    if (!enabled) {
      register(key, null);
      return;
    }
    const wrap = (which: "main" | "secondary"): BtnSpec | null => {
      const spec = handlers.current[which];
      return spec ? { ...spec, onClick: () => handlers.current[which]?.onClick() } : null;
    };
    register(key, { priority, main: wrap("main"), secondary: wrap("secondary") });
    // mainSig / secSig stand for the specs' visible parts; handlers come through the ref.
  }, [key, priority, enabled, mainSig, secSig, register, handlers]);

  useEffect(() => () => register(key, null), [key, register]);
}

/** The latest value for handlers that must not re-subscribe on every render. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** The declaration that currently owns Telegram's bottom bar. */
export function topRegistration(regs: Record<string, Reg>): Reg | null {
  let best: Reg | null = null;
  for (const r of Object.values(regs)) if (!best || r.priority > best.priority) best = r;
  return best;
}
