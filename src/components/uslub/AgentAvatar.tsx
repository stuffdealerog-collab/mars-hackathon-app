"use client";

import type { NodeKind } from "@/lib/uslub/contract";
import { useEffect, useRef, useState } from "react";
import { kindMeta, TONE } from "./agents";

/**
 * Employee avatar. Shows a lucide icon on a tile-coloured disc, and swaps to
 * /generated/agent-<role>.png automatically once the assets agent ships it.
 */
export function AgentAvatar({
  kind,
  size = 40,
  ring = false,
  className = "",
}: {
  kind: NodeKind;
  size?: number;
  ring?: boolean;
  className?: string;
}) {
  const meta = kindMeta(kind);
  const tone = TONE[meta.tone];
  const Icon = meta.icon;
  const hasImage = kind !== "input" && kind !== "approval";
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth > 0) setLoaded(true);
  }, []);

  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full ${tone.bg} ${
        ring ? "ring-2 ring-white/80" : ""
      } ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full opacity-25" aria-hidden>
        <path
          d="M20 3l4.6 12.4L37 20l-12.4 4.6L20 37l-4.6-12.4L3 20l12.4-4.6z"
          fill="none"
          stroke="white"
          strokeWidth="1.2"
        />
      </svg>
      <Icon className="relative text-white" style={{ width: size * 0.45, height: size * 0.45 }} strokeWidth={2} />
      {hasImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={ref}
          src={`/generated/agent-${kind}.png`}
          alt=""
          onLoad={() => setLoaded(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </span>
  );
}
