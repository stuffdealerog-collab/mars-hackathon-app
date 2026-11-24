import Link from "next/link";

/** The logo: one dark lamp with a warm filament, and the name. */
export function Mark({ href = "/", label = "Mercat" }: { href?: string | null; label?: string }) {
  const inner = (
    <>
      <span aria-hidden className="relative h-[22px] w-[22px] rounded-[7px] bg-[var(--glass-2)]" style={{ boxShadow: "inset 0 0 0 1px var(--hair-2)" }}>
        <span className="absolute left-1/2 top-[5px] h-[2px] w-[10px] -translate-x-1/2 rounded-full bg-[#FFD6A0] shadow-[0_0_7px_1px_#FFD6A0]" />
      </span>
      <span className="text-[16px] font-semibold tracking-[-0.015em] text-[var(--ink)]">{label}</span>
    </>
  );
  if (!href) return <span className="flex items-center gap-2">{inner}</span>;
  return (
    <Link href={href} className="-my-2.5 flex min-h-11 items-center gap-2 py-2.5" aria-label="Mercat, bosh sahifa">
      {inner}
    </Link>
  );
}
