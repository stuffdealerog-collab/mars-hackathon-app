/**
 * Plan slot → copywriter brief (pure). A post written from the weekly plan keeps the plan's day, time,
 * goal, opening line and call to action, so the plan and the posts stay one thing.
 */
import type { Goal, PlanSlot } from "./contract";
import { stripBareIds } from "./brain/copy";
import { clip } from "./text";

export type SlotInput = PlanSlot & { brief: string; format?: string };

/** Ledger ids ("[F3, S.ctaRate]") and the strategist's meta line ("— Dalil: … | Vaqt: …") are not for the copywriter. */
export function cleanBrief(brief: string): string {
  return brief
    .split("\n")
    .filter((line) => !/^\s*—\s*(Dalil|Evidence|Доказ)/i.test(line))
    .join("\n")
    .replace(/\s*[[(]\s*(?:S\.[\w.-]+|F\d+|W\d+|P\.\w+\/\d+|R\.[A-Z_]+)(?:\s*,\s*(?:S\.[\w.-]+|F\d+|W\d+|P\.\w+\/\d+|R\.[A-Z_]+))*\s*[\])]/g, "")
    .split("\n")
    .map(stripBareIds)
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const GOAL_GUIDE: Record<Goal, string> = {
  reach:
    "REACH post: something people want to read and forward — a useful tip, a short story, a question, behind the scenes. No hard sell, no price list.",
  trust:
    "TRUST post: show why people can rely on the business — real process, people, place, address and hours, a real customer case. Only facts from the knowledge.",
  sale:
    "SALE post: one product or service, its price if the knowledge has it (otherwise write [narx] / [цена] / [price] where the price goes — the owner fills it in; never 'ask the admin for the price'), and exactly how to order. The call to action in the first 3 lines or at the end.",
  engage:
    "ENGAGE post (a growth channel: blog, expert, media or community): get the people already reading to answer — a question, a poll, a take they can agree or argue with, a 'which one would you pick'. No selling, no prices.",
  grow:
    "GROW post (a growth channel: blog, expert, media or community): something worth forwarding, or the next part of a series people come back for, with one reason to subscribe or share. No selling, no prices.",
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
    slot.format === "video"
      ? "FORMAT: a short video the owner films; the text goes under it."
      : "FORMAT: the post goes out with a picture (or as text), not a video: never mention a video, never ask people to watch or save one.",
    `DATES: the post goes out on ${slot.day}. An opening, promotion or event dated before that day is over: never announce it as coming or happening now; mention it in the past tense or leave it out.`,
    "Notes in the brief about which photo or video to take are for the owner: do not put them in the post, do not describe the picture.",
    "Blanks in the plan such as [shart], [muddat], [telefon] are facts nobody has given yet: never copy them into the post — write around them. A missing price is the one exception: [narx] / [цена] / [price].",
  ];
  return lines.filter(Boolean).join("\n");
}

/** What we store as the post's brief (owner-readable): the plan's idea, without ids or meta. */
export function slotSummary(slot: SlotInput): string {
  return clip(cleanBrief(slot.brief) || cleanBrief(slot.hook) || `${slot.day} ${slot.time}`, 2000);
}

/** The slot as stored on the post (contract PlanSlot, no brief). */
export const toPlanSlot = (s: SlotInput): PlanSlot => ({
  day: s.day,
  time: s.time,
  goal: s.goal,
  hook: cleanBrief(s.hook),
  cta: cleanBrief(s.cta),
  ...(s.format ? { format: s.format } : {}),
});
