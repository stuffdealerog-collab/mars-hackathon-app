import type { CSSProperties } from "react";

/**
 * Colours for the picture components, taken from the parent: inside the lamp world (`.lw`) the
 * DESIGN.md tokens (glass, hairline, ink, lime); anywhere else a tint of the parent's text colour,
 * so the components sit on a dark stage or a light one without a hard-coded background.
 */
export const MEDIA_VARS = {
  "--mi-glass": "var(--glass, color-mix(in srgb, currentColor 5%, transparent))",
  "--mi-glass-2": "var(--glass-2, color-mix(in srgb, currentColor 9%, transparent))",
  "--mi-glass-3": "var(--glass-3, color-mix(in srgb, currentColor 14%, transparent))",
  "--mi-hair": "var(--hair, color-mix(in srgb, currentColor 9%, transparent))",
  "--mi-hair-2": "var(--hair-2, color-mix(in srgb, currentColor 16%, transparent))",
  "--mi-ink": "var(--ink, currentColor)",
  "--mi-ink-2": "var(--ink-2, color-mix(in srgb, currentColor 64%, transparent))",
  "--mi-ink-3": "var(--ink-3, color-mix(in srgb, currentColor 48%, transparent))",
  "--mi-stage": "var(--stage, #000)",
  "--mi-lime": "var(--lime, #d7ff3a)",
  "--mi-bad": "var(--bad, #ff5a4e)",
} as CSSProperties;

/** Expo-out, the lamp world's ease for things arriving. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** Quiet pill (DESIGN.md button-quiet): glass-2, hairline ring, lime focus ring. */
export const QUIET_PILL =
  "inline-flex h-9 select-none items-center gap-1.5 rounded-full bg-[var(--mi-glass-2)] px-3.5 text-[13.5px] font-medium " +
  "text-[var(--mi-ink)] shadow-[inset_0_0_0_1px_var(--mi-hair-2)] transition-colors duration-150 hover:bg-[var(--mi-glass-3)] " +
  "disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] " +
  "focus-visible:outline-[var(--mi-lime)]";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
