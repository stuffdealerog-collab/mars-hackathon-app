"use client";

import Link from "next/link";
import { useCopy, useInitLang } from "@/components/ui/lang";
import { LangSwitch, Logo } from "@/components/ui/parts";

/**
 * A page that does not exist: in the owner's language (the one they last picked here), with the
 * way back. One dark lamp, because nothing works on a page that is not there.
 */
export default function NotFound() {
  useInitLang();
  const c = useCopy();
  return (
    <div className="flex min-h-dvh flex-col bg-stage text-ink">
      <header className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-3 px-4 pt-3 sm:px-8 sm:pt-5">
        <Logo />
        <LangSwitch />
      </header>
      <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col justify-center px-4 pb-24 sm:px-8">
        <span aria-hidden className="mb-8 block h-[3px] w-[26px] rounded-full bg-[var(--hair-2)]" />
        <h1 className="text-balance text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[44px]">{c.notFound.title}</h1>
        <p className="mt-4 max-w-[48ch] text-[16px] leading-relaxed text-ink-2 sm:text-[17px]">{c.notFound.text}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/studio" prefetch={false} className="btn">
            {c.notFound.studio}
          </Link>
          <Link href="/" prefetch={false} className="btn-2">
            {c.notFound.home}
          </Link>
        </div>
      </main>
    </div>
  );
}
