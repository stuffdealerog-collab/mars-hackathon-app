import type { PostDraft, Script } from "@/lib/uslub/contract";
import { useStudio } from "../studio/store";

/**
 * A post whose text still has a blank the writer could not fill (an unknown price, a code): the
 * engine marks it `needsApproval` with `placeholders` and an owner-readable `note`, and approve or
 * publish answer `placeholder_left` (the store keeps that as a "hint" note) until the owner fills it.
 */
export const hasBlank = (p: PostDraft) => !!p.needsApproval && !!p.placeholders?.some((x) => x.tokens.length);

export const blankNote = (p: PostDraft) => (hasBlank(p) ? p.note : undefined);

/** The blanks in one script's text ("[kod]", "[narx]"), in the order the engine reported them. */
export const blankTokens = (p: PostDraft, script: Script) => p.placeholders?.find((x) => x.script === script)?.tokens ?? [];

/**
 * Whether the post waits for the owner to fill a blank: the engine said so and the owner has not
 * edited the text since, or approve/publish just came back with "placeholder_left".
 */
export function useBlank(p: PostDraft | undefined): boolean {
  return useStudio((s) => !!p && ((hasBlank(p) && !s.edited[p.id]) || s.postNote[p.id]?.tone === "hint"));
}
