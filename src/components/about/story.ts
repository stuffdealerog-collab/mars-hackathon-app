import type { AgentRole } from "@/lib/uslub/contract";
import type { LampState } from "../lamp/lamps";
import { CHAPTER_LAMPS, CHAPTERS, type ChapterId } from "./copy";

export type StoryLamps = { lamps: Partial<Record<AgentRole, LampState>>; last: AgentRole | null };

/** Where a chapter is read: a line a little below the middle of the screen. */
export const READING_LINE = 0.62;
/** A chapter's lamps light one by one over the first part of it, so the last is lit before the chapter ends. */
const LIGHT_SPAN = 0.6;

/**
 * Which lamps are lit, from how far the reader has scrolled (pure). A chapter whose top has crossed the reading line
 * lights its first lamp; the rest follow one by one as it is read. Later chapters win (the SMM-menejer waits for the
 * owner at "approve", then holds a result from "autopilot" on). `last` is the employee lit most recently in the story.
 */
export function storyLamps(progress: Partial<Record<ChapterId, number>>): StoryLamps {
  const lamps: Partial<Record<AgentRole, LampState>> = {};
  let last: AgentRole | null = null;
  for (const id of CHAPTERS) {
    const p = progress[id];
    if (p === undefined) continue;
    const list = CHAPTER_LAMPS[id];
    list.forEach((l, j) => {
      if (p >= (j / list.length) * LIGHT_SPAN) {
        lamps[l.role] = l.state;
        last = l.role;
      }
    });
  }
  return { lamps, last };
}

