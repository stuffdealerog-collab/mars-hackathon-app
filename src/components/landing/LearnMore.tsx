"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode, type RefObject } from "react";
import { RevealPhase, useReveal } from "../about/reveal";
import { useCopy, useLang } from "../ui/lang";

/**
 * "Batafsil" under "Qanday ishlaydi": a quiet pill (lime stays the field's) with one small lamp in it, and the live
 * count beside it (`traction`, drawn on the server). When the section comes into view the row rises into its place,
 * which was held for it all along (nothing moves around it), and the lamp's filament comes on with the lamp flicker;
 * the count runs up as the row lands. A CSS transition on `data-reveal` does the moving. Without JavaScript, under
 * reduced motion, or when the section is already on screen, it is simply there. A keyboard focus shows it at once.
 */
export function LearnMore({ watch, traction }: { watch: RefObject<HTMLElement | null>; traction?: ReactNode }) {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const phase = useReveal(watch, 0.45);
  const [focused, setFocused] = useState(false);
  const hidden = phase === "waiting" && !focused;
  const reveal = hidden ? "wait" : focused && phase === "waiting" ? "focus" : phase === "playing" ? "play" : undefined;
  return (
    <RevealPhase.Provider value={focused && phase === "waiting" ? "shown" : phase}>
      <div className="learn-row mt-8 flex flex-col items-start gap-x-6 gap-y-4 sm:flex-row sm:items-center" data-reveal={reveal}>
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
        {traction}
      </div>
    </RevealPhase.Provider>
  );
}
