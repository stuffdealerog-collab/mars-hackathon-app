import type { ChannelAudit } from "@/lib/uslub/contract";

type Finding = ChannelAudit["findings"][number];

const KIND_ORDER: Record<Finding["kind"], number> = { problem: 0, opportunity: 1, strength: 2 };

/** How many findings the Kanal section shows (the owner reads three, not a report). */
export const TOP_FINDINGS = 3;

/** The findings Kanal shows: problems first, then opportunities, then strengths; three at most. Pure. */
export function topFindings(audit: Pick<ChannelAudit, "findings">, n = TOP_FINDINGS): Finding[] {
  return [...audit.findings].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]).slice(0, n);
}

/** Every finding Kanal did not show, in the audit's own order (Pro's «Boshqa topilmalar»). */
export function otherFindings(audit: Pick<ChannelAudit, "findings">, n = TOP_FINDINGS): Finding[] {
  const shown = new Set(topFindings(audit, n));
  return audit.findings.filter((f) => !shown.has(f));
}
