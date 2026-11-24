"use client";

import { Lightbulb, Link2, Send } from "lucide-react";
import { Mark } from "../lamp/Mark";
import { LANGS, useCopy, useLang } from "./lang";

/** The logo: one small lamp with a warm filament, and the name. */
export function Logo({ href = "/" }: { href?: string | null }) {
  return <Mark href={href} />;
}

export function LangSwitch() {
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const c = useCopy();
  return (
    <div className="seg" role="group" aria-label={c.lang.label}>
      {LANGS.map((l) => (
        <button key={l} type="button" lang={l} aria-pressed={lang === l} onClick={() => setLang(l)}>
          {c.lang[l]}
        </button>
      ))}
    </div>
  );
}

const STEP_ICONS = [Link2, Lightbulb, Send];

/**
 * The owner's path on one quiet line (computer screens): the department under it carries the
 * screen, so the steps are words, not three more boxes on the dark.
 */
export function StepsLine({ className = "" }: { className?: string }) {
  const c = useCopy();
  return (
    <ol className={`flex flex-wrap items-center gap-x-6 gap-y-2 text-[15px] text-ink-2 ${className}`}>
      {c.steps.map((s, i) => {
        const Icon = STEP_ICONS[i];
        return (
          <li key={s} className="flex items-center gap-2.5">
            <Icon className="h-[18px] w-[18px] text-ink-3" strokeWidth={1.75} aria-hidden />
            <span>{s}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** The three steps of the owner's path: three words and one drawn icon each, nothing more. */
export function Steps({ className = "" }: { className?: string }) {
  const c = useCopy();
  return (
    <ol className={`grid grid-cols-3 gap-2.5 ${className}`}>
      {c.steps.map((s, i) => {
        const Icon = STEP_ICONS[i];
        return (
          <li key={s} className="flex flex-col items-start gap-3 rounded-[18px] bg-glass px-3.5 pb-3.5 pt-4 shadow-[inset_0_0_0_1px_var(--hair)]">
            <Icon className="h-5 w-5 text-ink-2" strokeWidth={1.75} aria-hidden />
            <span className="text-[14px] font-semibold leading-tight">{s}</span>
          </li>
        );
      })}
    </ol>
  );
}

export { parseChannel } from "./format";
