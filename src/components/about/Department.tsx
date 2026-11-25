"use client";

import type { AgentRole } from "@/lib/uslub/contract";
import { useMotionValueEvent, useScroll } from "motion/react";
import { useCallback, useEffect, useState, type RefObject } from "react";
import { LampTile } from "../lamp/LampTile";
import { OWNER_LAMPS } from "../lamp/lamps";
import { useCopy } from "../ui/lang";
import { CHAPTERS, type ChapterId } from "./copy";
import { READING_LINE, storyLamps, type StoryLamps } from "./story";
import { useAbout } from "./useAbout";

const keyOf = (s: StoryLamps) => `${s.last}|${OWNER_LAMPS.map((r) => s.lamps[r] ?? "-").join(",")}`;

/**
 * The department lights as the story is read. Reads the chapters' positions on scroll (motion's scroll value, once a
 * frame) and re-renders only when a lamp changes; the lamps' own CSS does the warming and the cooling.
 */
export function useStoryLamps(chapters: RefObject<Partial<Record<ChapterId, HTMLElement | null>>>): StoryLamps {
  const [state, setState] = useState<StoryLamps & { key: string }>({ lamps: {}, last: null, key: "" });
  const { scrollY } = useScroll();
  const measure = useCallback(() => {
    const line = window.innerHeight * READING_LINE;
    const progress: Partial<Record<ChapterId, number>> = {};
    for (const id of CHAPTERS) {
      const el = chapters.current?.[id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.top <= line) progress[id] = (line - r.top) / Math.max(1, r.height);
    }
    const next = storyLamps(progress);
    const key = keyOf(next);
    setState((s) => (s.key === key ? s : { ...next, key }));
  }, [chapters]);
  useMotionValueEvent(scrollY, "change", measure);
  useEffect(() => {
    const frame = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
    };
  }, [measure]);
  return state;
}

/** The line under the panel: who lit last and what they do. */
function NowLine({ last, className = "" }: { last: AgentRole | null; className?: string }) {
  const c = useCopy();
  const a = useAbout();
  return (
    <p aria-hidden className={`flex min-h-6 flex-wrap items-baseline gap-x-2 ${className}`}>
      {last ? (
        <>
          <span className="font-semibold text-ink">{c.lamps[last].name}</span>
          <span className="text-ink-2">{c.lamps[last].job}</span>
        </>
      ) : (
        <span className="text-ink-3">{a.panel.idle}</span>
      )}
    </p>
  );
}

/**
 * Computers: the department beside the story, in its housing, sticky while the chapters scroll past. Each tile says
 * who the employee is and what they do; the tile lights while its chapter is read.
 */
export function DepartmentPanel({ story }: { story: StoryLamps }) {
  const c = useCopy();
  const a = useAbout();
  return (
    <div className="about-panel panel-stage">
      <div className="panel-housing">
        <ul aria-label={a.panel.label} className="grid grid-cols-2 gap-2.5">
          {OWNER_LAMPS.map((r) => {
            const state = story.lamps[r] ?? "off";
            return (
              <LampTile
                key={r}
                as="li"
                role={r}
                size="sm"
                state={state}
                name={c.lamps[r].name}
                job={c.lamps[r].job}
                // Every tile says its state in words, so the panel reads without the light and no tile
                // grows when the SMM-menejer starts waiting for the owner.
                stateText={c.lampState[state]}
              />
            );
          })}
        </ul>
      </div>
      <NowLine last={story.last} className="mt-4 px-1 text-[15px]" />
    </div>
  );
}

/**
 * Phones and tablets: the same department as a strip of lights pinned to the top of the screen while the story
 * scrolls, with the employee lit last named under it.
 */
export function DepartmentStrip({ story }: { story: StoryLamps }) {
  const c = useCopy();
  const a = useAbout();
  return (
    <div className="about-strip sticky top-0 z-20 -mx-4 overflow-hidden bg-stage px-4 pb-2.5 pt-3 shadow-[inset_0_-1px_0_var(--hair)] sm:-mx-8 sm:px-8 lg:hidden">
      <ul aria-label={a.panel.label} className="grid grid-cols-8 gap-1.5 sm:gap-2">
        {OWNER_LAMPS.map((r) => (
          <LampTile key={r} as="li" role={r} size="xs" state={story.lamps[r] ?? "off"} aria-label={c.lamps[r].name} className="!min-h-7" />
        ))}
      </ul>
      <NowLine last={story.last} className="mt-2 text-[13.5px] leading-tight" />
    </div>
  );
}
