import type { PostDraft, Script } from "@/lib/uslub/contract";
import type { PostNote } from "../studio/store";

/**
 * A post whose text still has a blank the writer could not fill (an unknown price, a code): the
 * engine marks it `needsApproval` with `placeholders` and an owner-readable `note`, and approve or
 * publish answer `placeholder_left` (the store keeps that as a "hint" note) until the owner fills it.
 */
export const hasBlank = (p: PostDraft) => !!p.needsApproval && !!p.placeholders?.some((x) => x.tokens.length);

export const blankNote = (p: PostDraft) => (hasBlank(p) ? p.note : undefined);

/**
 * The blanks in one script's text ("[kod]", "[narx]"): what the post carries, plus what the last
 * approve/publish refusal named (`postNote.missing`, placeholder_left), without repeats.
 */
export function blankTokens(p: PostDraft, script: Script, note?: PostNote): string[] {
  const own = p.placeholders?.find((x) => x.script === script)?.tokens ?? [];
  const named = note?.missing?.find((x) => x.script === script)?.tokens ?? [];
  return [...new Set([...own, ...named])];
}

/** The script to edit for a blank: the one the server named first whose text still has it. */
export function blankScript(p: PostDraft, note?: PostNote): Script | null {
  const still = (x: { script: Script; tokens: string[] }) => x.tokens.some((tok) => (p.variants[x.script] ?? "").includes(tok));
  return note?.missing?.find(still)?.script ?? p.placeholders?.find(still)?.script ?? null;
}
