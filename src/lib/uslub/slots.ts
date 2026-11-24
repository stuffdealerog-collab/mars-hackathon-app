/**
 * Plan slot → copywriter brief (pure). A post written from the weekly plan keeps the plan's day, time,
 * goal, opening line and call to action, so the plan and the posts stay one thing.
 */
import type { Goal, PlanSlot } from "./contract";
import { clip } from "./text";

export type SlotInput = PlanSlot & { brief: string };

/** Ledger ids ("[F3, S.ctaRate]") and the strategist's meta line ("— Dalil: … | Vaqt: …") are not for the copywriter. */
export function cleanBrief(brief: string): string {
  return brief
    .split("\n")
    .filter((line) => !/^\s*—\s*(Dalil|Evidence|Доказ)/i.test(line))
    .join("\n")
    .replace(/\s*[[(]\s*(?:S\.[\w.-]+|F\d+|W\d+|P\.\w+\/\d+|R\.[A-Z_]+)(?:\s*,\s*(?:S\.[\w.-]+|F\d+|W\d+|P\.\w+\/\d+|R\.[A-Z_]+))*\s*[\])]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const GOAL_GUIDE: Record<Goal, string> = {
  reach:
    "REACH post: something people want to read and forward — a useful tip, a short story, a question, behind the scenes. No hard sell, no price list.",
  trust:
    "TRUST post: show why people can rely on the business — real process, people, place, address and hours, a real customer case. Only facts from the knowledge.",
  sale:
    "SALE post: one product or service, its price if the knowledge has it (otherwise invite people to ask the admin for the price — never a blank like [narx]), and exactly how to order. The call to action in the first 3 lines or at the end.",
};

/** The brief the copywriter gets for one plan slot. Hook and CTA are the plan's; links are kept verbatim. */
export function slotBrief(slot: SlotInput): string {
  const lines = [
    `This post fills one slot of the owner's content plan: ${slot.day} at ${slot.time} (Tashkent time).`,
    GOAL_GUIDE[slot.goal] ?? "",
    slot.hook.trim() ? `OPENING LINE (from the plan): "${cleanBrief(slot.hook)}" — start the post with it. You may polish the wording, never change its facts.` : "",
    slot.cta.trim()
      ? `CALL TO ACTION (from the plan): "${cleanBrief(slot.cta)}" — use it once. Copy any link or @handle in it exactly, character for character.`
      : "",
    cleanBrief(slot.brief) ? `WHAT THE POST IS ABOUT: ${cleanBrief(slot.brief)}` : "",
    "Notes in the brief about which photo or video to take are for the owner: do not put them in the post, do not describe the picture.",
    "Blanks in the plan such as [narx], [shart], [muddat], [telefon] are facts nobody has given yet: never copy them into the post — write around them.",
  ];
  return lines.filter(Boolean).join("\n");
}

/** What we store as the post's brief (owner-readable): the plan's idea, without ids or meta. */
export function slotSummary(slot: SlotInput): string {
  return clip(cleanBrief(slot.brief) || cleanBrief(slot.hook) || `${slot.day} ${slot.time}`, 2000);
}

/** The slot as stored on the post (contract PlanSlot, no brief). */
export const toPlanSlot = (s: SlotInput): PlanSlot => ({ day: s.day, time: s.time, goal: s.goal, hook: cleanBrief(s.hook), cta: cleanBrief(s.cta) });
