"use client";

import type { AgentRole } from "@/lib/uslub/contract";
import { useMotionValueEvent, useScroll } from "motion/react";
import { useCallback, useEffect, useState, type RefObject } from "react";
import { LampTile } from "../lamp/LampTile";
import { OWNER_LAMPS, type LampState } from "../lamp/lamps";
import { plural } from "../ui/format";
import { useCopy, useLang } from "../ui/lang";
import { CHAPTERS, type ChapterId } from "./copy";
import { lampLevel, READING_LINE, storyLamps, type StoryLamps } from "./story";
import { useAbout } from "./useAbout";

const keyOf = (s: StoryLamps) => `${s.current.join(",")}|${OWNER_LAMPS.map((r) => s.lamps[r] ?? "-").join(",")}`;

/** The translator's sample result: the scripts the bakery's post was put into, named in their own script. */
const TRANSLATED = "Ўзбек · Рус · Eng";

/**
 * What each lit lamp holds in the sample week (the bakery, marked "namuna" on the panel): one short result per
 * employee, from the same counts the chapters show (60 posts read, 5 in the plan, 1 out). The SMM-menejer, while it
 * waits for the owner, says so with the lime dot in the same place.
 */
function SampleResult({ role, state }: { role: AgentRole; state: LampState }) {
  const c = useCopy();
  const a = useAbout();
  const lang = useLang((s) => s.lang);
  const n = (forms: readonly string[], k: number) => `${k} ${plural(forms, k, lang)}`;
  if (role === "publisher" && state === "you") {
    return (
      <span className="flex items-center gap-1.5 text-[13.5px] font-semibold leading-tight">
        <span className="lamp__you" aria-hidden />
        {a.panel.waiting}
      </span>
    );
  }
  const text: Record<AgentRole, string> = {
    brand: a.panel.voice,
    analyst: n(c.lampResult.postsRead, 60),
    strategist: n(c.lampResult.planned, 5),
    copywriter: n(c.lampResult.written, 5),
    editor: c.lampResult.clean,
    translator: TRANSLATED,
    designer: n(c.lampResult.pictures, 5),
    video: n(c.lampResult.scripts, 1),
    radar: "",
    publisher: n(c.lampResult.out, 1),
  };
  return <span className="line-clamp-1 text-[13.5px] font-semibold leading-tight">{text[role]}</span>;
}

/** Where the chapters are: About registers each chapter's section here. */
export type ChapterRefs = RefObject<Partial<Record<ChapterId, HTMLElement | null>>>;

/**
 * The department lights as the story is read. Reads the chapters' positions on scroll (motion's scroll value, once a
 * frame) and re-renders only the panel that calls it, only when a lamp changes; the lamps' own CSS does the warming
 * and the cooling. The page around it never re-renders on scroll.
 */
function useStoryLamps(chapters: ChapterRefs): StoryLamps {
  const [state, setState] = useState<StoryLamps & { key: string }>({ lamps: {}, current: [], last: null, key: "" });
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

/** The line under the panel: who works in the chapter being read and what they do; otherwise what the lamps mean. */
function NowLine({ story, oneLine = false, className = "" }: { story: StoryLamps; oneLine?: boolean; className?: string }) {
  const c = useCopy();
  const a = useAbout();
  const { last } = story;
  const anyLit = OWNER_LAMPS.some((r) => story.lamps[r]);
  return (
    // One line on the pinned strip (cut with an ellipsis), so the strip never changes height while the story scrolls.
    <p aria-hidden className={oneLine ? `min-h-6 truncate ${className}` : `flex min-h-6 flex-wrap items-baseline gap-x-2 ${className}`}>
      {last ? (
        <>
          <span className="font-semibold text-ink">{c.lamps[last].name}</span>
          {oneLine ? " " : null}
          <span className="text-ink-2">{c.lamps[last].job}</span>
        </>
      ) : (
        <span className="text-ink-3">{anyLit ? a.panel.held : a.panel.idle}</span>
      )}
    </p>
  );
}

/**
 * Computers: the department beside the story, in its housing, sticky while the chapters scroll past. Each tile names
 * the employee and what they do. The employees of the chapter being read burn at full strength; those whose chapter is
 * behind hold their sample result at a lower light. A dark tile says nothing: dark glass already means idle.
 */
export function DepartmentPanel({ chapters }: { chapters: ChapterRefs }) {
  const c = useCopy();
  const a = useAbout();
  const story = useStoryLamps(chapters);
  return (
    <div className="about-panel panel-stage">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <p className="text-[14px] text-ink-2">{a.panel.label}</p>
        <span className="namuna">{a.sample}</span>
      </div>
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
                className={lampLevel(story, r) === "held" ? "lamp--held" : ""}
              >
                {/* Always laid out (hidden while dark), so no tile grows when it lights or starts waiting. */}
                <SampleResult role={r} state={state} />
              </LampTile>
            );
          })}
        </ul>
      </div>
      <NowLine story={story} className="mt-4 px-1 text-[15px]" />
    </div>
  );
}

/**
 * Phones and tablets: the same department as a strip of lights pinned to the top of the screen while the story
 * scrolls, at the same two levels, with the employee at work named under it.
 */
export function DepartmentStrip({ chapters }: { chapters: ChapterRefs }) {
  const c = useCopy();
  const a = useAbout();
  const story = useStoryLamps(chapters);
  return (
    <div className="about-strip sticky top-0 z-20 -mx-4 overflow-hidden bg-stage px-4 pb-2.5 pt-3 shadow-[inset_0_-1px_0_var(--hair)] sm:-mx-8 sm:px-8 lg:hidden">
      <ul aria-label={a.panel.label} className="grid grid-cols-8 gap-1.5 sm:gap-2">
        {OWNER_LAMPS.map((r) => (
          <LampTile
            key={r}
            as="li"
            role={r}
            size="xs"
            state={story.lamps[r] ?? "off"}
            aria-label={c.lamps[r].name}
            className={`!min-h-7 ${lampLevel(story, r) === "held" ? "lamp--held" : ""}`}
          />
        ))}
      </ul>
      <NowLine story={story} oneLine className="mt-2 text-[13.5px] leading-6" />
    </div>
  );
}
