import type { BrandDNA } from "@/lib/uslub/contract";

const EMOJI: Record<BrandDNA["emojiDensity"], string> = {
  none: "ishlatmaydi",
  low: "kam, postga 0–1",
  medium: "postga 1–2 ta",
  high: "ko‘p",
};
const ADDRESS: Record<BrandDNA["address"], string> = {
  siz: "«siz»",
  sen: "«sen»",
  mixed: "«siz» va «sen»",
  "n/a": "aniqlanmadi",
};

export function dnaRows(dna: BrandDNA): [string, string][] {
  return [
    ["Murojaat", ADDRESS[dna.address]],
    ["Ohang", dna.tone],
    ["Emoji", EMOJI[dna.emojiDensity]],
    ["Uzunlik", dna.avgPostLength ? `~${dna.avgPostLength} belgi` : "—"],
    ["Chaqiriq", dna.ctaStyle],
  ];
}

/** What the department understood about the owner's voice: five lines, no tag clouds. */
export function DnaCard({ rows, sample = false, title = "Ovozingiz", className = "" }: { rows: [string, string][]; sample?: boolean; title?: string; className?: string }) {
  return (
    <div className={`rounded-[20px] bg-[var(--glass)] p-4 ${className}`} style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-semibold">{title}</span>
        {sample && <span className="namuna">namuna</span>}
      </div>
      <dl className="mt-3 grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[14px] leading-snug">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-[var(--ink-2)]">{k}</dt>
            <dd className="line-clamp-2">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
