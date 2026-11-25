"use client";

import { useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { parseTractionBody, type Traction } from "@/lib/traction-model";
import { Led, ledLayout } from "../lamp/Led";
import { useLang } from "../ui/lang";
import { useCountUp } from "./motion";
import { tractionLine, type TractionKind, type TractionLine } from "./traction-words";

type Load = { state: "loading" } | { state: "ready"; data: Traction } | { state: "none" };

/** The live counts, read once per page from GET /api/public/traction (cached there for ten minutes). */
function useTraction(): Load {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/public/traction", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: unknown) => {
        const data = parseTractionBody(body);
        setLoad(data ? { state: "ready", data } : { state: "none" });
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setLoad({ state: "none" });
      });
    return () => ctrl.abort();
  }, []);
  return load;
}

/**
 * One counted line: the words, and the figure on an amber LED (a measured number, so the LED may print it) that
 * counts up from zero when it comes into view. The well is as wide as the final figure from the start, so nothing
 * moves while it counts. A screen reader hears the whole line once, in words.
 */
function CountLine({ line, dot, play }: { line: TractionLine; dot: number; play: boolean }) {
  const gap = dot / 2;
  const value = useCountUp(line.figure, play);
  const width = ledLayout(String(line.figure), dot, gap).width;
  const height = 7 * (dot + gap) - gap;
  return (
    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[15px] leading-snug text-ink-2 sm:text-[16px]">
      <span className="sr-only">{line.sentence}</span>
      {line.before && <span aria-hidden>{line.before}</span>}
      <span
        aria-hidden
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

/**
 * "{n} people have tried Mercat" and "{m} channels analysed": live, rounded down only with "more than" in the words.
 * Space is held while the counts load, so the page never jumps; if they cannot be read, the block goes away.
 */
export function TractionLines({
  kinds = ["people", "channels"],
  dot = 3,
  note,
  className = "",
}: {
  kinds?: TractionKind[];
  dot?: number;
  note?: string;
  className?: string;
}) {
  const load = useTraction();
  const lang = useLang((s) => s.lang);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const lines =
    load.state === "ready" ? kinds.map((k) => tractionLine(lang, k, load.data[k])).filter((l): l is TractionLine => !!l) : [];
  if (load.state === "none" || (load.state === "ready" && lines.length === 0)) return null;
  const rowHeight = 7 * (dot + dot / 2) - dot / 2 + 14;
  return (
    <div
      ref={ref}
      className={`flex flex-col gap-2.5 transition-opacity duration-500 ease-out ${load.state === "ready" ? "opacity-100" : "opacity-0"} ${className}`}
      // Holds the lines' height while the counts load: nothing below moves when they arrive.
      style={{ minHeight: kinds.length * rowHeight + (kinds.length - 1) * 10 + (note ? 26 : 0) }}
    >
      {lines.map((line) => (
        <CountLine key={line.sentence} line={line} dot={dot} play={inView} />
      ))}
      {note && lines.length > 0 && <p className="text-[13px] text-ink-3">{note}</p>}
    </div>
  );
}
