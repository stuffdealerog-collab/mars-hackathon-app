"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";

const noop = () => () => {};

/** True only in the browser after hydration (false on the server and in the hydrating render). */
export const useHydrated = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

/** Is any part of the element on screen right now? */
const onScreen = (el: Element | null) => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight;
};

export type Reveal = "shown" | "waiting" | "playing";

/**
 * An entrance that never hides content from a page without JavaScript: the server and the hydrating render draw the
 * element as it ends. Once hydrated, an element below the fold waits at its start and plays when it scrolls into view;
 * one already on screen, and every element under reduced motion, just stays shown.
 */
export function useReveal(ref: RefObject<Element | null>, amount = 0.35): Reveal {
  const hydrated = useHydrated();
  const reduced = useReducedMotion();
  const inView = useInView(ref, { once: true, amount });
  // Decided once, on the first frame after mount: was the element off screen then? Until known, it is shown.
  const [offAtMount, setOffAtMount] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setOffAtMount(!onScreen(ref.current)));
    return () => cancelAnimationFrame(frame);
  }, [ref]);
  if (!hydrated || reduced || !offAtMount) return "shown";
  return inView ? "playing" : "waiting";
}

/**
 * A number that counts up from 0 to `to` once `play` turns true (ease-out, no overshoot: a count never shows more
 * than it measured). Under reduced motion it shows the number at once.
 */
export function useCountUp(to: number, play: boolean, duration = 1.1): number {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!play) return;
    if (reduced) {
      const frame = requestAnimationFrame(() => setShown(to));
      return () => cancelAnimationFrame(frame);
    }
    const controls = animate(0, to, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setShown(Math.round(v)) });
    return () => controls.stop();
  }, [to, play, reduced, duration]);
  return play ? shown : 0;
}
