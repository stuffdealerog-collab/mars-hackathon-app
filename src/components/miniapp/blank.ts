import type { PostDraft } from "@/lib/uslub/contract";

/**
 * A post whose text still has a blank the writer could not fill (an unknown price or code):
 * the engine marks it `needsApproval` with an owner-readable `note`, and approve/publish refuse
 * it ("placeholder_left") until the owner fills it. Read loosely so this works on both sides of
 * the engine merge.
 */
type WithBlank = PostDraft & { needsApproval?: boolean; note?: string };

export const hasBlank = (p: PostDraft) => !!(p as WithBlank).needsApproval;
export const blankNote = (p: PostDraft) => (p as WithBlank).note;
