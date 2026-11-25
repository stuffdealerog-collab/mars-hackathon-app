import "server-only";
import type { OwnerAnswers } from "../brain/answers";
import { saveAnswers } from "../brain/answers-store";
import type { Lang } from "../brain/types";
import { samplesFromOf, withSamplesFrom } from "../samples";
import { setBrandSource, setBrandTypeGoal, type StoredBrand, updateBrandProfile } from "../store";

/**
 * The owner's answers, stored like POST /api/uslub/answers stores them: a channel_only brand becomes the owner's own
 * (private prices never sit on a public cache row, its samples stay the channel's), the answers are merged into the
 * brand's one answers row, and a goal is the brand's confirmed goal. Returns the saved answers.
 */
export async function saveOwnerAnswers(brand: StoredBrand, given: OwnerAnswers, lang: Lang): Promise<OwnerAnswers> {
  if (brand.source === "channel_only") {
    await setBrandSource(brand.id, "custom");
    if (!samplesFromOf(brand.dna)) await updateBrandProfile(brand.id, { dna: withSamplesFrom(brand.dna, "channel") });
  }
  const answers = await saveAnswers(brand.id, given, lang);
  if (given.goal) await setBrandTypeGoal(brand.id, { goal: given.goal });
  return answers;
}
