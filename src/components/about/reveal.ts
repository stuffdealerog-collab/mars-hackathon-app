"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type RefObject } from "react";

/*
 * Entrances and the count-up for the landing and /about, with no animation library: an IntersectionObserver decides
 * when, CSS transitions or one requestAnimationFrame loop do the moving. The landing loads none of `motion`.
 */

const noop = () => () => {};

/** True only in the browser after hydration (false on the server and in the hydrating render). */
export const useHydrated = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

const REDUCE = "(prefers-reduced-motion: reduce)";
const onReduceChange = (cb: () => void) => {
  const m = window.matchMedia(REDUCE);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

/** The visitor asked for less motion (false on the server: the server draws every element as it ends anyway). */
export const useReducedMotion = () =>
  useSyncExternalStore(
    onReduceChange,
    () => window.matchMedia(REDUCE).matches,
    () => false,
  );

/** Is any part of the element on screen right now? */
const onScreen = (el: Element | null) => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight;
};

const THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20);

/**
 * How much of an element is in view, as a share of what can be: an element taller than the window counts as fully in
 * view once it fills the window (pure).
 */
export function visibleShare(visible: number, height: number, viewport: number): number {
  const most = Math.min(height, viewport);
  return most > 0 ? Math.min(1, visible / most) : 0;
}

/** Has the element been at least `amount` in view, once? */
export function useInViewOnce(ref: RefObject<Element | null>, amount: number): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const viewport = e.rootBounds?.height ?? window.innerHeight;
          if (e.isIntersecting && visibleShare(e.intersectionRect.height, e.boundingClientRect.height, viewport) >= amount) {
            setSeen(true);
            io.disconnect();
          }
        }
      },
      { threshold: THRESHOLDS },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, amount, seen]);
  return seen;
}

export type Reveal = "shown" | "waiting" | "playing";

/**
 * An entrance that never hides content from a page without JavaScript: the server and the hydrating render draw the
 * element as it ends. Once hydrated, an element below the fold waits at its start and plays when it scrolls into view;
 * one already on screen, and every element under reduced motion, just stays shown.
 */
export function useReveal(ref: RefObject<Element | null>, amount = 0.35): Reveal {
  const hydrated = useHydrated();
  const reduced = useReducedMotion();
  const inView = useInViewOnce(ref, amount);
  // Decided once, on the first frame after mount: was the element off screen then? Until known, it is shown.
  const [offAtMount, setOffAtMount] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setOffAtMount(!onScreen(ref.current)));
    return () => cancelAnimationFrame(frame);
  }, [ref]);
  if (!hydrated || reduced || !offAtMount) return "shown";
  return inView ? "playing" : "waiting";
}

/** A parent's entrance (the landing's Learn more row): a count inside it plays with the row, not on its own. */
export const RevealPhase = createContext<Reveal | null>(null);
export const useParentReveal = () => useContext(RevealPhase);

/** The count-up: from about two thirds of the figure to the figure in a little over half a second. */
export const COUNT_MS = 520;
const COUNT_FROM = 0.65;

/** Where a count starts: never 0, so the page never claims nobody for a frame (pure). */
export const countFrom = (to: number) => Math.round(to * COUNT_FROM);

/**
 * Mostly linear with a soft landing: the slope at the end stays at 0.6, so the last numbers do not hold for several
 * frames, and nothing overshoots (pure).
 */
export function countEase(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 0.6 * c + 0.4 * (1 - (1 - c) ** 2);
}

/** The number shown `elapsed` ms into a count from `from` to `to` (pure). */
export const countAt = (from: number, to: number, elapsed: number) => Math.round(from + (to - from) * countEase(elapsed / COUNT_MS));

/**
 * A number that counts up to `to` while `phase` plays (after `delayMs`), and simply is `to` when shown. While it waits
 * off screen it holds its start. Under reduced motion the phase is "shown": the number is there from the first frame.
 */
export function useCountUp(to: number, phase: Reveal, delayMs = 0): number {
  // A count streamed in after the page hydrates its boundary late, when a parent's phase may already be "waiting":
  // its hydrating render must still draw what the server drew (the figure).
  const hydrated = useHydrated();
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (phase !== "playing") return;
    const from = countFrom(to);
    let start = 0;
    let frame = 0;
    const tick = (ts: number) => {
      if (!start) start = ts + delayMs;
      const elapsed = ts - start;
      setShown(elapsed <= 0 ? from : countAt(from, to, elapsed));
      if (elapsed < COUNT_MS) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, phase, delayMs]);
  if (!hydrated || phase === "shown") return to;
  if (phase === "waiting") return countFrom(to);
  return shown ?? countFrom(to);
}
