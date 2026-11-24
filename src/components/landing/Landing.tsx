"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { keepNumbers, useCopy, useInitLang } from "../ui/lang";
import { LangSwitch, Logo, parseChannel, Steps } from "../ui/parts";

export function Landing({ bot }: { bot: string }) {
  useInitLang();
  const c = useCopy();
  const botUrl = `https://t.me/${bot}`;
  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink">
      <header className="mx-auto flex w-full max-w-[1080px] items-center justify-between gap-3 px-4 pt-3 sm:px-8 sm:pt-5">
        <Logo />
        <nav aria-label="Mercat" className="flex items-center gap-1 sm:gap-3">
          <Link href="/studio" prefetch={false} className="hidden min-h-11 items-center px-2 text-[15px] text-ink-2 hover:text-ink sm:inline-flex">
            {c.nav.studio}
          </Link>
          <LangSwitch />
        </nav>
      </header>

      <main className="flex-1">
        <Hero />

        <section aria-labelledby="how-h" className="mx-auto w-full max-w-[1080px] px-4 pt-16 sm:px-8 sm:pt-24">
          <h2 id="how-h" className="text-[24px] font-semibold tracking-[-0.015em] sm:text-[28px]">
            {c.landing.howTitle}
          </h2>
          <Steps className="mt-7" />
        </section>

        <Example />
      </main>

      <footer className="mx-auto mt-20 flex w-full max-w-[1080px] flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line px-4 py-6 text-[14px] text-ink-3 sm:px-8">
        <span>{c.landing.footer}</span>
        <span className="flex gap-5">
          <Link href="/studio" prefetch={false} className="link text-ink-2">
            {c.nav.studio}
          </Link>
          <a href={botUrl} target="_blank" rel="noreferrer" className="link text-ink-2">
            {c.nav.bot}
          </a>
        </span>
      </footer>
    </div>
  );
}

function Hero() {
  const c = useCopy();
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState("");
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    const name = parseChannel(value);
    if (!name) {
      setBad(true);
      return;
    }
    setBusy(true);
    router.push(`/studio?channel=${encodeURIComponent(`t.me/${name}`)}`);
  };

  return (
    <section className="mx-auto w-full max-w-[1080px] px-4 pt-10 sm:px-8 sm:pt-20">
      <h1 className="max-w-[22ch] text-balance text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] sm:text-[52px] sm:leading-[1.05]">{c.landing.h1}</h1>
      <p className="mt-4 max-w-[54ch] text-[17px] leading-relaxed text-ink-2 sm:text-[18px]">{c.landing.sub}</p>

      <form onSubmit={submit} noValidate className="mt-8 max-w-[620px]">
        <label htmlFor={id} className="mb-2 block text-[15px] font-medium">
          {c.start.linkLabel}
        </label>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <input
            id={id}
            className="input sm:flex-1"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={c.start.linkPh}
            value={value}
            aria-invalid={bad || undefined}
            aria-describedby={`${id}-hint`}
            onFocus={() => router.prefetch("/studio")}
            onChange={(e) => {
              setValue(e.target.value);
              if (bad) setBad(false);
            }}
          />
          <button type="submit" disabled={busy} className="btn sm:px-7">
            {c.start.go}
          </button>
        </div>
        <p id={`${id}-hint`} role={bad ? "alert" : undefined} className={`mt-2 text-[14px] ${bad ? "text-bad" : "text-ink-3"}`}>
          {bad ? c.start.linkBad : c.start.linkExample}
        </p>
      </form>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <Link href="/studio?mode=fresh" prefetch={false} className="link inline-flex min-h-11 items-center self-start text-[15px] font-medium">
          {c.start.emptyToggle}
        </Link>
        <p className="text-[15px] text-ink-2">
          {/* The no-break space keeps the beta tag on the price's last line. */}
          {keepNumbers(c.landing.price)}
          {" "}
          <span className="ml-1 whitespace-nowrap rounded-md border border-line-2 px-1.5 py-0.5 text-[12.5px] text-ink-2">{c.landing.beta}</span>
        </p>
      </div>
    </section>
  );
}

function Example() {
  const c = useCopy();
  const l = c.landing;
  return (
    <section aria-labelledby="ex-h" className="mx-auto w-full max-w-[1080px] px-4 pt-16 sm:px-8 sm:pt-24">
      <h2 id="ex-h" className="text-[24px] font-semibold tracking-[-0.015em] sm:text-[28px]">
        {l.exampleTitle}
      </h2>
      <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-ink-2">{l.exampleNote}</p>

      <div className="mt-7 grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <p className="text-[14px] text-ink-3">{l.exampleFindingLabel}</p>
          <p className="mt-2 text-[17px] font-medium leading-snug">{l.exampleFinding}</p>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{l.exampleFix}</p>
        </div>

        <article className="card p-5">
          <p className="text-[14px] text-ink-3">{l.examplePostLabel}</p>
          <div className="mt-3 flex items-center gap-2.5">
            <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full bg-tint text-[15px] font-semibold text-ink-2">
              T
            </span>
            <span className="text-[15px] font-semibold">{l.examplePostName}</span>
          </div>
          <p className="post-text mt-3">{keepNumbers(l.examplePost)}</p>
        </article>
      </div>
    </section>
  );
}
