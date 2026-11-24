/** A single girih star, used as a quiet accent (logo mark, dividers). */
export function GirihStar({ className = "", stroke = "currentColor" }: { className?: string; stroke?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <path d="M20 2l5 13 13 5-13 5-5 13-5-13-13-5 13-5z" fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
      <path
        d="M7.3 7.3L20 12.6l12.7-5.3L27.4 20l5.3 12.7L20 27.4 7.3 32.7 12.6 20z"
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ className = "", light = false }: { className?: string; light?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span
        aria-hidden
        className="h-6 w-6 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 32% 28%, #fff 0 6%, transparent 30%), radial-gradient(circle at 50% 55%, #D7FF3A 0%, #16B364 60%, #0b0b0e 100%)",
          boxShadow: "0 0 18px -2px rgba(215,255,58,.6)",
        }}
      />
      <span className={`text-[16px] font-bold tracking-[-0.02em] ${light ? "text-white" : "text-fog"}`}>Uslub AI</span>
    </span>
  );
}
