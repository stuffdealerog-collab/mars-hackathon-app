"use client";

import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useState, type RefObject } from "react";
import { useReveal } from "../about/motion";
import { TractionLines } from "../about/Traction";
import { useCopy, useLang } from "../ui/lang";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * "Batafsil" under "Qanday ishlaydi": a quiet pill (lime stays the field's) with one small lamp in it, and the live
 * count beside it. When the section comes into view the row rises into its place, which was held for it all along
 * (nothing moves around it), and the lamp's filament comes on with the lamp flicker. Without JavaScript, under
 * reduced motion, or when the section is already on screen, it is simply there. Focusing it by keyboard shows it.
 */
export function LearnMore({ watch }: { watch: RefObject<HTMLElement | null> }) {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const phase = useReveal(watch, 0.45);
  const [focused, setFocused] = useState(false);
  const hidden = phase === "waiting" && !focused;
  return (
    <motion.div
      className="mt-8 flex flex-col items-start gap-x-6 gap-y-4 sm:flex-row sm:items-center"
      initial={false}
      animate={hidden ? { opacity: 0, y: 18 } : { opacity: 1, y: 0 }}
      transition={hidden ? { duration: 0 } : { duration: 0.7, ease: EASE }}
    >
      {/* prefetch={false}: the proxy counts a click here as a visit to /about (src/lib/stats-pageview.ts). */}
      <Link
        href={`/about?lang=${lang}`}
        prefetch={false}
        aria-label={c.landing.learnMoreLabel}
        onFocus={() => setFocused(true)}
        data-lit={hidden ? undefined : ""}
        className="learn-more btn-2 !min-h-12 !gap-3 !pl-3 !pr-5 text-[15.5px]"
      >
        <span aria-hidden className="learn-lamp" />
        {c.landing.learnMore}
        <ArrowRight className="learn-arrow h-4 w-4 text-ink-2" aria-hidden />
      </Link>
      <TractionLines kinds={["people"]} dot={2.5} />
    </motion.div>
  );
}
