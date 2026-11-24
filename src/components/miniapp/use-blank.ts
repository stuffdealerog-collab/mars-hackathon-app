import type { PostDraft } from "@/lib/uslub/contract";
import { useStudio } from "../studio/store";
import { hasBlank } from "./blank";

/**
 * Whether the post waits for the owner to fill a blank: the engine said so and the owner has not
 * edited the text since, or approve/publish just came back with "placeholder_left".
 */
export function useBlank(p: PostDraft | undefined): boolean {
  return useStudio((s) => !!p && ((hasBlank(p) && !s.edited[p.id]) || s.postNote[p.id]?.tone === "hint"));
}
