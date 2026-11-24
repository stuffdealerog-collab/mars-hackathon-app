import { Onest } from "next/font/google";

/** One family for the whole lamp world: calm, phone-legible, full Uzbek Cyrillic (ў қ ғ ҳ). */
// Only Latin is preloaded (Uzbek Latin first). Cyrillic faces are still declared by
// unicode-range and download on demand the moment Russian or Uzbek Cyrillic text appears.
export const onest = Onest({
  subsets: ["latin", "latin-ext"],
  variable: "--font-onest",
  display: "swap",
});
