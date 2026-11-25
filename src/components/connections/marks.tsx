import type { ConnectorId } from "@/lib/connectors/types";

/**
 * Small one-colour platform marks in the parent's ink (lucide ships no brand icons). Simple geometric glyphs, not
 * the brands' coloured logos: the lamp world keeps colour for lamps, lime and the LED.
 */
export function ProviderMark({ id, size = 18 }: { id: ConnectorId; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true } as const;
  switch (id) {
    case "instagram":
      return (
        <svg {...common}>
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      );
    case "meta_ads":
      return (
        <svg {...common}>
          <path d="M3.5 15.5c0-4.5 2-8 4.3-8 2.6 0 4.2 4.6 6.4 7.8 1.3 1.9 2.4 2.7 3.5 2.7 1.6 0 2.8-1.6 2.8-4.3 0-3.6-1.7-6.2-3.8-6.2-1.9 0-3.4 2.3-4.9 4.6-1.6 2.6-3.1 5.9-5.3 5.9-1.8 0-3-1.6-3-4.5Z" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...common}>
          <rect x="2.8" y="5.5" width="18.4" height="13" rx="4" />
          <path d="M10.3 9.4v5.2l4.4-2.6-4.4-2.6Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "google_ads":
      return (
        <svg {...common}>
          <path d="M9.6 4.8 3.8 15" strokeWidth="3.4" strokeLinecap="round" />
          <path d="m14.4 4.8 5.8 10.2" strokeWidth="3.4" strokeLinecap="round" />
          <circle cx="5.6" cy="17.6" r="2.2" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}
