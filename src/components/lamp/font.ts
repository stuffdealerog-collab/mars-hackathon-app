import { Onest } from "next/font/google";

/** One family for the whole lamp world: calm, phone-legible, full Uzbek Cyrillic (ў қ ғ ҳ). */
export const onest = Onest({
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"],
  variable: "--font-onest",
  display: "swap",
});
