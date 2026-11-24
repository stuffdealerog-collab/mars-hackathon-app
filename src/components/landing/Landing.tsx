"use client";

import type { AgentRole } from "@/lib/uslub/contract";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { LedStrip } from "../lamp/Led";
import { LampTile } from "../lamp/LampTile";
import { LAMP_ORDER, WORK_LIGHT, type LampState } from "../lamp/lamps";
import { lampsFrom, Panel, sampleSnapshot, type Lamps } from "../studio/Department";
import { SAMPLE_CHANNEL, sampleBrand } from "../studio/sample";
import { ChannelField } from "../ui/ChannelField";
import { keepNumbers, useCopy, useInitLang, useLang } from "../ui/lang";
import { LangSwitch, Logo, parseChannel, Steps, useStageVariant } from "../ui/parts";

/** Roles that do nothing for the owner yet stay dark with "tez orada" (see Studio/Department). */
const SOON = new Set<AgentRole>(["video", "radar"]);
const DARK: Lamps = { state: Object.fromEntries(LAMP_ORDER.map((r) => [r, "off"])) as Record<AgentRole, LampState>, soon: SOON, result: {}, words: {} };

export function Landing({ bot }: { bot: string }) {
  useInitLang();
  const c = useCopy();
  const botUrl = `https://t.me/${bot}`;
  const [armed, setArmed] = useState(false);
  useStageVariant();
  return (
    <div className="desk flex min-h-dvh flex-col overflow-x-clip bg-stage text-ink">
      <header className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-3 px-4 pt-3 sm:px-8 sm:pt-5">
        <Logo />
        <nav aria-label="Mercat" className="flex items-center gap-1 sm:gap-3">
          <Link href="/studio" prefetch={false} className="hidden min-h-11 items-center px-2 text-[15px] text-ink-2 hover:text-ink sm:inline-flex">
            {c.nav.studio}
          </Link>
          <LangSwitch />
        </nav>
      </header>

      <main className="flex-1">
        {/* First viewport: the promise and the one field. Phones: the department below, dark.
            Computers: the department in its housing as the screen's main object, lit with the
            sample bakery's honest results until the owner types their own channel. */}
        <section className="relative isolate mx-auto w-full max-w-[1180px] px-4 pb-4 pt-8 sm:px-8 sm:pt-14 lg:pt-10">
          {/* Computers: the work light over the headline and the department. */}
          <div aria-hidden className="work-light hidden lg:block" style={{ background: WORK_LIGHT }} />
          <Hero onTyped={setArmed} />
          <div className="mt-12 lg:hidden">
            <DarkPanel />
          </div>
          <SampleDepartment armed={armed} />
        </section>

        <section aria-labelledby="how-h" className="mx-auto w-full max-w-[1180px] px-4 pt-16 sm:px-8 sm:pt-24">
          <h2 id="how-h" className="text-[26px] font-semibold tracking-[-0.025em] sm:text-[34px]">
            {c.landing.howTitle}
          </h2>
          <Steps className="mt-7" />
        </section>

        <Example />
      </main>

      <footer className="mx-auto mt-20 flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line px-4 py-6 text-[14px] text-ink-3 sm:px-8">
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

/**
 * Computer screens: the sample bakery's department after a finished run, lit with its real
 * sample results and marked "namuna". When the owner types a valid channel the sample goes out
 * (the usual 1000 ms) and the embers of their own department arm; erase it and the sample comes
 * back with a plain fade. Nothing else moves.
 */
const noop = () => () => {};
function SampleDepartment({ armed }: { armed: boolean }) {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  // The sample is built in the browser only: it stamps dates, which must not be frozen into the
  // prerendered page. The server draws the dark panel; the browser lights it on the first frame.
  const client = useSyncExternalStore(noop, () => true, () => false);
  const sample = useMemo(() => (client ? lampsFrom(sampleSnapshot(lang), c, lang) : DARK), [client, c, lang]);
  const name = useMemo(() => (client ? sampleBrand(lang).dna.name : ""), [client, lang]);
  return (
    <div className="mt-12 hidden lg:block">
      <p className={`mb-3 flex items-center justify-end gap-2.5 text-[13px] text-ink-2 transition-opacity duration-300 ${armed ? "opacity-0" : ""}`} aria-hidden={armed || undefined}>
        <span className="namuna">{c.sample.chip}</span>
        {name}
      </p>
      <Panel lamps={armed ? DARK : sample} housing armed={armed} calm readOnly />
    </div>
  );
}

function Hero({ onTyped }: { onTyped: (armed: boolean) => void }) {
  const c = useCopy();
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState("");
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const typed = parseChannel(value);
  useEffect(() => onTyped(!!typed), [typed, onTyped]);

  const submit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!typed) {
      setBad(true);
      return;
    }
    setBusy(true);
    router.push(`/studio?channel=${encodeURIComponent(`t.me/${typed}`)}`);
  };

  // Phones: sign, headline, field in one column. Computers: the headline on the left (seven of
  // twelve columns); the sign and the field on the right, ending level with the headline's foot.
  return (
    <div className="flex flex-col lg:grid lg:grid-cols-12 lg:gap-x-10">
      {/* Phones: the shop sign stays dark until there is a real channel to read, then spells it. */}
      <LedStrip text={typed ? `@${typed}` : undefined} dot={3} gap={1.5} className="mb-7 max-w-[460px] lg:hidden" label={typed ? `@${typed}` : undefined} />
      {/* Computers: the department under it is the lit sample, so the sign names the sample's
          channel (marked "namuna"); a typed channel takes its place. */}
      <div className="hidden lg:col-span-5 lg:col-start-8 lg:row-start-1 lg:mb-6 lg:block lg:self-end">
        <LedStrip text={typed ? `@${typed}` : `namuna · ${SAMPLE_CHANNEL}`} dot={3} gap={1.5} label={typed ? `@${typed}` : `${c.sample.chip} · ${SAMPLE_CHANNEL}`} />
      </div>

      <h1 className="max-w-[18ch] text-balance text-[34px] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-[56px] sm:leading-[1] lg:col-span-7 lg:row-span-2 lg:row-start-1 lg:max-w-[16ch] lg:self-end lg:text-[60px] lg:leading-[0.98] lg:tracking-[-0.038em] [@media(min-width:1024px)_and_(max-height:819px)]:text-[48px]">
        {c.landing.h1}
      </h1>
      <div className="lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-2">
      <p className="mt-4 max-w-[48ch] text-[16px] leading-relaxed text-ink-2 sm:text-[17px] lg:mt-0 [@media(min-width:1024px)_and_(max-height:819px)]:text-[16px]">{c.landing.sub}</p>

      <form onSubmit={submit} noValidate className="mt-7 max-w-[560px] lg:mt-6">
        <ChannelField
          id={id}
          value={value}
          onChange={(v) => {
            setValue(v);
            if (bad) setBad(false);
          }}
          invalid={bad}
          placeholder={c.start.linkPh}
          label={c.start.linkLabel}
          button={c.start.go}
          busy={busy}
          describedBy={`${id}-hint`}
          onFocus={() => router.prefetch("/studio")}
        />
        <p id={`${id}-hint`} role={bad ? "alert" : undefined} className={`mt-2.5 px-2 text-[14px] ${bad ? "text-bad" : "text-ink-3"}`}>
          {bad ? c.start.linkBad : c.start.linkExample}
        </p>
      </form>
      </div>

      {/* Computers: under the headline, so the first row ends sooner and the lit department is
          in the first screen of a laptop window. Phones: under the field, as before. */}
      <div className="mt-4 flex flex-col gap-2 px-2 sm:flex-row sm:items-center sm:gap-6 lg:col-span-7 lg:col-start-1 lg:row-start-3 lg:mt-6 lg:px-0">
        <Link href="/studio?mode=fresh" prefetch={false} className="link inline-flex min-h-11 items-center self-start text-[15px] font-medium">
          {c.start.emptyToggle}
        </Link>
        <p className="text-[15px] text-ink-2">
          {/* The no-break space keeps the beta tag on the price's last line. */}
          {keepNumbers(c.landing.price)}
          {" "}
          <span className="ml-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[12.5px] text-ink-2 shadow-[inset_0_0_0_1px_var(--hair-2)]">{c.landing.beta}</span>
        </p>
      </div>
    </div>
  );
}

/** The department before any link: ten dark lamps. Light means work, so nothing glows yet. */
function DarkPanel() {
  const c = useCopy();
  return (
    <ul aria-label={c.dept.label} className="grid grid-cols-2 gap-2.5">
      {LAMP_ORDER.map((r) => (
        <LampTile
          key={r}
          as="li"
          role={r}
          size="sm"
          state="off"
          name={c.lamps[r].name}
          job={c.lamps[r].job}
          stateText={SOON.has(r) ? c.lampState.soon : undefined}
          className={SOON.has(r) ? "opacity-60" : ""}
        />
      ))}
    </ul>
  );
}

function Example() {
  const c = useCopy();
  const l = c.landing;
  return (
    <section aria-labelledby="ex-h" className="mx-auto w-full max-w-[1180px] px-4 pt-16 sm:px-8 sm:pt-24">
      <h2 id="ex-h" className="text-[26px] font-semibold tracking-[-0.025em] sm:text-[34px]">
        {l.exampleTitle}
      </h2>
      <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-ink-2">{l.exampleNote}</p>

      <div className="mt-7 grid gap-4 md:grid-cols-2">
        <div className="card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[14px] text-ink-2">{l.exampleFindingLabel}</p>
            <span className="namuna">{c.sample.chip}</span>
          </div>
          <p className="mt-3 text-[18px] font-semibold leading-snug tracking-[-0.01em]">{l.exampleFinding}</p>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{l.exampleFix}</p>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <p className="text-[14px] text-ink-2">{l.examplePostLabel}</p>
            <span className="namuna">{c.sample.chip}</span>
          </div>
          <article className="tgpost px-4 pb-2.5 pt-3">
            <div className="mb-2 flex items-center gap-2.5">
              <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full text-[14px] font-semibold text-white" style={{ background: "linear-gradient(160deg, #C86B3C, #6b3115)" }}>
                T
              </span>
              <span className="text-[14.5px] font-semibold" style={{ color: "color-mix(in oklab, #E08A55 70%, var(--ink))" }}>
                {l.examplePostName}
              </span>
            </div>
            <p className="post-text">{keepNumbers(l.examplePost)}</p>
            <p className="mt-1.5 text-right text-[12px] text-ink-3">07:30</p>
          </article>
        </div>
      </div>
    </section>
  );
}
