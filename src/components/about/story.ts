import type { AgentRole } from "@/lib/uslub/contract";
import type { LampState } from "../lamp/lamps";
import { CHAPTER_LAMPS, CHAPTERS, type ChapterId } from "./copy";

/**
 * The department while the story is read. `lamps`: every lamp lit so far and its state. `current`: the employees at
 * work in the chapter being read (their lamps burn at full strength); every other lit lamp holds its result at the
 * dimmer level, so the light moves from one employee to the next instead of filling the panel. `last`: the employee
 * lit most recently in the chapter being read, or null when nobody works in it.
 */
export type StoryLamps = { lamps: Partial<Record<AgentRole, LampState>>; current: AgentRole[]; last: AgentRole | null };

/** Where a chapter is read: a line a little below the middle of the screen. */
export const READING_LINE = 0.62;
/** A chapter's lamps light one by one over the first part of it, so the last is lit before the chapter ends. */
const LIGHT_SPAN = 0.6;

/**
 * Which lamps are lit, and which of them are at work, from how far the reader has scrolled (pure). A chapter whose top
 * has crossed the reading line is being read and lights its first lamp; the rest follow one by one. Later chapters win
 * (the SMM-menejer waits for the owner at "approve", then holds a result from "autopilot" on).
 */
export function storyLamps(progress: Partial<Record<ChapterId, number>>): StoryLamps {
  const lamps: Partial<Record<AgentRole, LampState>> = {};
  let reading: ChapterId | null = null;
  for (const id of CHAPTERS) {
    const p = progress[id];
    if (p === undefined) continue;
    reading = id;
    const list = CHAPTER_LAMPS[id];
    list.forEach((l, j) => {
      if (p >= (j / list.length) * LIGHT_SPAN) lamps[l.role] = l.state;
    });
  }
  const current = reading ? CHAPTER_LAMPS[reading].map((l) => l.role).filter((r) => lamps[r]) : [];
  return { lamps, current, last: current.at(-1) ?? null };
}

/** The lamp's level in the panel: off, at work in this chapter, or holding a result from an earlier one (pure). */
export function lampLevel(story: StoryLamps, role: AgentRole): "off" | "work" | "held" {
  if (!story.lamps[role]) return "off";
  return story.current.includes(role) ? "work" : "held";
}
