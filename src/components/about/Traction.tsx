"use client";

import { useRef } from "react";
import type { Traction } from "@/lib/traction-model";
import { Led, ledLayout } from "../lamp/Led";
import { useLang } from "../ui/lang";
import { useCountUp, useParentReveal, useReveal } from "./reveal";
import { tractionLine, tractionNote, type TractionKind, type TractionLine } from "./traction-words";

/** Inside the landing's Learn more row the count starts once the row has mostly risen. */
const AFTER_ROW_MS = 200;

/**
 * One counted line: the words, and the figure on an amber LED (a measured number, so the LED may print it). The server
 * draws the figure itself; in the browser, a line that scrolls into view counts up to it from two thirds. The well is
 * as wide as the final figure from the start, so nothing moves while it counts. A screen reader hears the whole line
 * once, in words.
 */
function CountLine({ line, dot }: { line: TractionLine; dot: number }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const own = useReveal(ref, 0.6);
  const parent = useParentReveal();
  const value = useCountUp(line.figure, parent ?? own, parent ? AFTER_ROW_MS : 0);
  const gap = dot / 2;
  const width = ledLayout(String(line.figure), dot, gap).width;
  const height = 7 * (dot + gap) - gap;
  return (
    <p ref={ref} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[15px] leading-snug text-ink-2 sm:text-[16px]">
      <span className="sr-only">{line.sentence}</span>
      {line.before && <span aria-hidden>{line.before}</span>}
      <span
        aria-hidden
        data-value={value}
        className="led-well inline-flex shrink-0 items-center rounded-[9px] bg-[var(--led-well,var(--stage))] px-2.5"
        style={{ boxShadow: "inset 0 0 0 1px var(--hair)", height: height + 14 }}
      >
        {/* The unlit grid spans the final figure; the lit digits sit at its right end, on the same grid. */}
        <span
          className="flex justify-end"
          style={{
            width,
            height,
            backgroundImage: `radial-gradient(circle at ${dot / 2}px ${dot / 2}px, var(--led-off) ${(dot / 2) * 0.9}px, transparent ${dot / 2}px)`,
            backgroundSize: `${dot + gap}px ${dot + gap}px`,
          }}
        >
          <Led text={String(value)} dot={dot} gap={gap} grid={false} label="" />
        </span>
      </span>
      <span aria-hidden className="text-ink">
        {line.after}
      </span>
    </p>
  );
}

export type TractionLinesProps = {
  data: Traction;
  kinds?: TractionKind[];
  dot?: number;
  /** say under the lines what the people count is (/about) */
  withNote?: boolean;
  className?: string;
};

/**
 * "More than {n} people have tried Mercat" and "{m} channels analysed": the live counts, read on the server
 * (src/components/about/TractionSlot.tsx) and drawn with the page, so they read without JavaScript and nothing on the
 * page moves when they arrive. A count that is missing or too small draws nothing at all.
 */
export function TractionLines({ data, kinds = ["people", "channels"], dot = 3, withNote = false, className = "" }: TractionLinesProps) {
  const lang = useLang((s) => s.lang);
  const lines = kinds
    .map((k) => ({ kind: k, line: tractionLine(lang, k, data[k]) }))
    .filter((l): l is { kind: TractionKind; line: TractionLine } => !!l.line);
  if (lines.length === 0) return null;
  const people = lines.some((l) => l.kind === "people");
  return (
    <div className={`flex flex-col gap-2.5 ${className}`}>
      {lines.map(({ kind, line }) => (
        <CountLine key={kind} line={line} dot={dot} />
      ))}
      {withNote && people && <p className="max-w-[56ch] text-[13px] leading-snug text-ink-3">{tractionNote(lang)}</p>}
    </div>
  );
}
