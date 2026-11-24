import type { CSSProperties, ReactNode } from "react";

/**
 * Big rounded widget card with a luminous gradient that fades into black,
 * after the "AI OS" reference. `from` = top glow colour, `to` = deeper tone.
 */
export function glowBg(from: string, to: string, strength = 1, at = "50% 0%") {
  const s = Math.max(0, Math.min(1, strength));
  const hex = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
  return `radial-gradient(130% 85% at ${at}, ${from}${hex(0.95 * s)} 0%, ${to}${hex(0.75 * s)} 38%, ${to}00 78%), linear-gradient(#0c0c0f, #0c0c0f)`;
}

export function GlowCard({
  from,
  to,
  strength = 1,
  at,
  className = "",
  style,
  children,
}: {
  from: string;
  to: string;
  strength?: number;
  at?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[32px] shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)] ${className}`}
      style={{ background: glowBg(from, to, strength, at), ...style }}
    >
      {children}
    </div>
  );
}
