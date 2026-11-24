"use client";

import { useEffect, useState } from "react";

/** Stage the prototypes are authored on (9:16), scaled to the frame width. */
export const STAGE_W = 340;
export const STAGE_H = (STAGE_W * 16) / 9;

export interface SigProps {
  runKey: number;
  playing: boolean;
  reduced: boolean;
}

export interface Beat {
  t: number; // seconds
  sound: string; // sound-design cue (RU)
  picture: string; // what is on screen (RU)
}

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** 0→1 progress of t inside [a, b]. */
export const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
export const expoOut = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
export const easeIn = (x: number) => x * x * x;
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/**
 * One rAF clock per run. Returns elapsed seconds for the current runKey,
 * 0 until the run's first frame, frozen when `playing` turns false.
 */
export function useRunClock(runKey: number, playing: boolean, length: number) {
  const [st, setSt] = useState({ k: runKey, t: 0 });
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const e = Math.min(length, (now - start) / 1000);
      setSt({ k: runKey, t: e });
      if (e < length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [runKey, playing, length]);
  return st.k === runKey ? st.t : 0;
}

/** The time a prototype should show: its poster frame when motion is reduced and nothing has run yet. */
export function useSigTime({ runKey, playing, reduced }: SigProps, length: number, poster: number) {
  const t = useRunClock(runKey, playing, length);
  return reduced && runKey === 0 ? poster : t;
}
