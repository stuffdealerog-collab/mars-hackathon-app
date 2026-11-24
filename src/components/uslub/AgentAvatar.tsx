"use client";

import type { NodeKind } from "@/lib/uslub/contract";
import { useEffect, useRef, useState } from "react";
import { Orb } from "./Orb";

/**
 * Employee avatar. Default is the CSS orb. With `photo`, it shows the generated
 * character (/generated/agent-<role>.webp) over the orb once the file loads —
 * used only on Team detail cards.
 */
export function AgentAvatar({
  kind,
  size = 40,
  photo = false,
  glow = false,
  className = "",
}: {
  kind: NodeKind;
  size?: number;
  photo?: boolean;
  glow?: boolean;
  ring?: boolean;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  const hasImage = photo && kind !== "input" && kind !== "approval";
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth > 0) setLoaded(true);
  }, []);
  return (
    <span className={`relative inline-block shrink-0 ${className}`} style={{ width: size, height: size }}>
      <Orb kind={kind} size={size} glow={glow} />
      {hasImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={ref}
          src={`/generated/agent-${kind}.webp`}
          alt=""
          onLoad={() => setLoaded(true)}
          className={`absolute inset-0 h-full w-full rounded-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </span>
  );
}
