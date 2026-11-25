/**
 * Where a brand's sample posts came from, kept inside the dna jsonb (like builtAt; no schema change): "channel" = the
 * channel's own posts, read when the brand was built; "owner" = texts the owner pasted. A rebuild (brand.ts reuseBrand)
 * takes the channel's newest posts again only for channel samples, so the voice, the older price posts and the learned
 * ending and type keep up with the channel after the owner answers the questions (which makes the row 'custom').
 * Pure.
 */
export type SamplesFrom = "owner" | "channel";

export function samplesFromOf(dna: unknown): SamplesFrom | undefined {
  const v = (dna as { samplesFrom?: unknown } | null)?.samplesFrom;
  return v === "owner" || v === "channel" ? v : undefined;
}

export const withSamplesFrom = <T extends object>(dna: T, from: SamplesFrom): T & { samplesFrom: SamplesFrom } => ({ ...dna, samplesFrom: from });

/** A rebuild refreshes the samples from the channel: a pure channel row, or one whose samples were the channel's. */
export const refreshesFromChannel = (brand: { source: string; dna: unknown }): boolean =>
  brand.source === "channel_only" || samplesFromOf(brand.dna) === "channel";
