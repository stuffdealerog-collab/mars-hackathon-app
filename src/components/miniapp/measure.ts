import { useEffect, useRef, useState } from "react";
import { ledLayout } from "../lamp/Led";

/**
 * The element's content width, kept current for real size changes only (rotation, a narrower
 * phone): rounded, and changes under 2 px are ignored, so content that reacts to the width (the
 * LED sign's dot size) can never set off a measure → resize → measure loop.
 */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let last = 0;
    const read = (w: number) => {
      const next = Math.round(w);
      if (Math.abs(next - last) < 2) return;
      last = next;
      setWidth(next);
    };
    read(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) read(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/**
 * Dot size for an LED text so the whole text fits `room` px: the sign never drops a character.
 * Starts from `max` (the design size) and shrinks; past the smallest legible dot it says `run`,
 * and the caller scrolls the text at a comfortable size instead. With `canRun` off (reduced
 * motion) it keeps shrinking, so the whole name still shows, small, and nothing moves.
 */
export function ledFit(text: string, room: number, max: { dot: number; gap: number } = { dot: 3, gap: 1.5 }, canRun = true) {
  const ratio = max.dot / (max.dot + max.gap);
  if (!text || room <= 0) return { dot: max.dot, gap: max.gap, run: false };
  const cols = ledLayout(text, 1, 0).width + 1; // columns of dots, one step each
  const step = Math.min(max.dot + max.gap, room / cols);
  if (step < 2.1 && canRun) return { dot: 2.2, gap: 0.9, run: true };
  return { dot: step * ratio, gap: step * (1 - ratio), run: false };
}
