import { useEffect, useRef, useState } from "react";
import { ledLayout } from "../lamp/Led";

/** The element's content width, kept current (rotation, font load, a 360 px phone). */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(el.clientWidth);
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/**
 * Dot size for an LED text so the whole text fits `room` px: the sign never drops a character.
 * Starts from `max` (the design size) and shrinks; past the smallest legible dot the text runs
 * through the strip like a shop's running line instead.
 */
export function ledFit(text: string, room: number, max: { dot: number; gap: number } = { dot: 3, gap: 1.5 }) {
  const ratio = max.dot / (max.dot + max.gap);
  if (!text || room <= 0) return { dot: max.dot, gap: max.gap, run: false };
  const cols = ledLayout(text, 1, 0).width + 1; // columns of dots, one step each
  const step = Math.min(max.dot + max.gap, room / cols);
  if (step < 2.1) return { dot: 1.5, gap: 0.6, run: true };
  return { dot: step * ratio, gap: step * (1 - ratio), run: false };
}
