"use client";

import { useInView } from "motion/react";
import { useRef } from "react";
import { CountMatrix } from "@/components/uslub/DotMatrix";

/** Dot-matrix number that ticks up the first time it scrolls into view. */
export function Ticker({
  to,
  suffix = "",
  dot = 6,
  gap = 3,
  color = "#ffffff",
  label,
}: {
  to: number;
  suffix?: string;
  dot?: number;
  gap?: number;
  color?: string;
  label?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  return (
    <span ref={ref} className="inline-block">
      <CountMatrix to={inView ? to : 0} suffix={suffix} dot={dot} gap={gap} color={color} ms={1100} label={label ?? `${to}${suffix}`} />
    </span>
  );
}
