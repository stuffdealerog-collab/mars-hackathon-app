"use client";

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

/** The three steps of the owner's path, as a plain numbered list. */
export function Steps({ className = "" }: { className?: string }) {
  const c = useCopy();
  return (
    <ol className={`grid gap-5 sm:grid-cols-3 sm:gap-6 ${className}`}>
      {c.steps.map((s, i) => (
        <li key={s.t} className="flex gap-3.5 sm:flex-col sm:gap-3">
          <span aria-hidden className="tnum grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line-2 text-[14px] font-semibold text-ink">
            {i + 1}
          </span>
          <span className="min-w-0">
            <span className="block text-[16px] font-semibold leading-snug">{s.t}</span>
            <span className="mt-1 block text-[15px] leading-relaxed text-ink-2">{s.d}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export { parseChannel } from "./format";
