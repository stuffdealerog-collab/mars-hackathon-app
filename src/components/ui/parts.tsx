"use client";

import Link from "next/link";
import { LANGS, useCopy, useLang } from "./lang";

/** The name, set plainly. No mark, no glow. */
export function Logo({ href = "/" }: { href?: string | null }) {
  const word = <span className="text-[18px] font-semibold tracking-[-0.015em] text-ink">Mercat</span>;
  if (!href) return word;
  return (
    <Link href={href} className="-my-2 inline-flex min-h-11 items-center" aria-label="Mercat">
      {word}
    </Link>
  );
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

/** Accepts t.me/x, https://t.me/x, t.me/s/x, @x or a bare username. */
export function parseChannel(v: string): string | null {
  const m = v.trim().match(/^(?:https?:\/\/)?(?:t(?:elegram)?\.me\/(?:s\/)?|@)?([A-Za-z][A-Za-z0-9_]{3,31})\/?$/);
  return m ? m[1] : null;
}
