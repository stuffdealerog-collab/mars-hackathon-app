"use client";

import { useEffect, useRef, useState } from "react";

/* 5x7 LED glyphs. '#' = lit. */
const G: Record<string, string[]> = {
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
  ".": [".", ".", ".", ".", ".", ".", "#"],
  ",": [".", ".", ".", ".", ".", "#", "#"],
  ":": [".", "#", ".", ".", ".", "#", "."],
  "%": ["##..#", "##.#.", "...#.", "..#..", ".#...", ".#.##", "#..##"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  k: ["#....", "#....", "#..#.", "#.#..", "##...", "#.#..", "#..#."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  "/": ["....#", "...#.", "...#.", "..#..", ".#...", ".#...", "#...."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  "×": [".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "....."],
  " ": ["..", "..", "..", "..", "..", "..", ".."],
};

export function DotMatrix({
  value,
  dot = 4,
  gap = 2,
  color = "#ffffff",
  off = "rgba(255,255,255,.07)",
  className = "",
  label,
}: {
  value: string | number;
  dot?: number;
  gap?: number;
  color?: string;
  off?: string;
  className?: string;
  label?: string;
}) {
  const chars = String(value).split("").map((c) => G[c] ?? G[" "]);
  const step = dot + gap;
  let x = 0;
  const circles: { cx: number; cy: number; on: boolean; k: string }[] = [];
  chars.forEach((g, ci) => {
    const w = g[0].length;
    g.forEach((row, ry) =>
      row.split("").forEach((c, rx) => {
        circles.push({ cx: x + rx * step + dot / 2, cy: ry * step + dot / 2, on: c === "#", k: `${ci}-${rx}-${ry}` });
      }),
    );
    x += w * step + step;
  });
  const width = Math.max(0, x - step - gap);
  const height = 7 * step - gap;
  return (
    <svg
      role="img"
      aria-label={label ?? String(value)}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
    >
      {circles.map((c) => (
        <circle
          key={c.k}
          cx={c.cx}
          cy={c.cy}
          r={dot / 2}
          fill={c.on ? color : off}
          style={{ transition: "fill .25s ease", filter: c.on ? `drop-shadow(0 0 ${dot * 0.6}px ${color}88)` : undefined }}
        />
      ))}
    </svg>
  );
}

/** Counts up to `to` once visible / when `to` changes. Respects reduced motion. */
export function useCountUp(to: number, ms = 1200, decimals = 0) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      from.current = to;
      const id = requestAnimationFrame(() => setV(to));
      return () => cancelAnimationFrame(id);
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      const val = a + (to - a) * e;
      setV(Number(val.toFixed(decimals)));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, ms, decimals]);
  return v;
}

export function CountMatrix({ to, decimals = 0, suffix = "", ms, ...rest }: { to: number; decimals?: number; suffix?: string; ms?: number } & Omit<Parameters<typeof DotMatrix>[0], "value">) {
  const v = useCountUp(to, ms, decimals);
  return <DotMatrix value={`${v.toFixed(decimals)}${suffix}`} label={`${to}${suffix}`} {...rest} />;
}
