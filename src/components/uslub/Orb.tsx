import type { NodeKind } from "@/lib/uslub/contract";
import { GRAD, kindMeta } from "./agents";

/** Glossy 3D orb drawn in CSS: the AI employee's "face" across the product. */
export function Orb({
  kind,
  size = 44,
  icon = true,
  glow = false,
  className = "",
}: {
  kind: NodeKind;
  size?: number;
  icon?: boolean;
  glow?: boolean;
  className?: string;
}) {
  const [a, b] = GRAD[kind];
  const Icon = kindMeta(kind).icon;
  return (
    <span
      aria-hidden
      className={`relative inline-grid shrink-0 place-items-center rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 32% 26%, rgba(255,255,255,.95) 0 5%, rgba(255,255,255,.35) 12%, transparent 30%),
          radial-gradient(circle at 70% 80%, ${b} 0%, transparent 60%),
          radial-gradient(circle at 45% 45%, ${a} 0%, ${b} 70%, #0b0b0e 100%)`,
        boxShadow: `inset 0 -${size * 0.12}px ${size * 0.22}px rgba(0,0,0,.45), inset 0 ${size * 0.06}px ${size * 0.12}px rgba(255,255,255,.35), 0 ${size * 0.12}px ${size * 0.35}px -${size * 0.1}px ${b}${glow ? "cc" : "66"}${glow ? `, 0 0 ${size * 0.9}px ${size * 0.1}px ${a}88` : ""}`,
        transition: "box-shadow .5s ease",
      }}
    >
      {icon && (
        <Icon
          className="relative text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.45)]"
          style={{ width: size * 0.4, height: size * 0.4 }}
          strokeWidth={2.2}
        />
      )}
    </span>
  );
}
