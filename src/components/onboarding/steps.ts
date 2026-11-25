/**
 * The intro's cards, in order. The tour tells the story (lamps → link → result → approve); the
 * last card is the one setup the story depends on: the bot must be a channel admin to post.
 * Pure: the component, the hosts and tests read it.
 */
export const STEP_KINDS = ["lamps", "link", "result", "approve", "admin"] as const;
export type StepKind = (typeof STEP_KINDS)[number];

/** "admin": the add-the-bot card alone (owners who saw an older intro, the Studio's tool). */
export type IntroOnly = "admin";

export const INTRO_STEPS = STEP_KINDS.length;
export const ADMIN_STEP = STEP_KINDS.indexOf("admin");

/** The cards to show: the whole intro, or only the add-the-bot card. */
export function introSteps(only?: IntroOnly | null): StepKind[] {
  return only === "admin" ? ["admin"] : [...STEP_KINDS];
}
