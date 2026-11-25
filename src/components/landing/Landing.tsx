"use client";

import type { AgentRole } from "@/lib/uslub/contract";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { LedStrip } from "../lamp/Led";
import { LampTile } from "../lamp/LampTile";
import { OWNER_LAMPS, WORK_LIGHT, type LampState } from "../lamp/lamps";
import { ChannelField } from "../ui/ChannelField";
import { LearnMore } from "./LearnMore";
import { SamplePicture } from "./SamplePicture";
import { keepNumbers, useCopy, useInitLang, useLang, useTabTitle } from "../ui/lang";
import { LangSwitch, Logo, parseChannel, Steps, useStageVariant } from "../ui/parts";

export function Landing({ bot }: { bot: string }) {
  useInitLang();
  useTabTitle("landing");
  const c = useCopy();
  const botUrl = `https://t.me/${bot}`;
  // The Studio opens in a fresh document (see Hero's submit), so it takes the language along.
  const studioHref = `/studio?lang=${useLang((s) => s.lang)}`;
  const how = useRef<HTMLElement>(null);
  useStageVariant();
  return (
    <div className="desk relative isolate flex min-h-dvh flex-col overflow-x-clip bg-stage text-ink">
      {/* Computers: the work light over the header, the headline and the proof. It hangs from the
          page's top edge, so nothing cuts it above the headline. */}
      <div aria-hidden data-at="page" className="work-light hidden lg:block" style={{ background: WORK_LIGHT }} />
      <header className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-3 px-4 pt-3 sm:px-8 sm:pt-5">
        <Logo />
        <nav aria-label="Mercat" className="flex items-center gap-1 sm:gap-3">
          <Link href={studioHref} prefetch={false} className="hidden min-h-11 items-center px-2 text-[15px] text-ink-2 hover:text-ink sm:inline-flex">
            {c.nav.studio}
          </Link>
          <LangSwitch />
        </nav>
      </header>

      <main className="flex-1">
        {/* First viewport: the promise, the one field, and what the owner gets: one real-shaped
            finding and one ready post, both marked "namuna". */}
        <section className="relative isolate mx-auto w-full max-w-[1180px] px-4 pb-4 pt-8 sm:px-8 sm:pt-14 lg:pt-10">
          <Hero />
          <Proof />
        </section>

        <section ref={how} aria-labelledby="how-h" className="relative mx-auto w-full max-w-[1180px] px-4 pt-16 sm:px-8 sm:pt-24">
          <h2 id="how-h" className="text-[26px] font-semibold tracking-[-0.025em] sm:text-[34px]">
            {c.landing.howTitle}
          </h2>
          <Steps className="mt-7" />
          {/* Everything else (the department, the plan, approval, the autopilot, the price) is on /about. */}
          <LearnMore watch={how} />
        </section>
      </main>

      <footer className="mx-auto mt-20 flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line px-4 py-6 text-[14px] text-ink-3 sm:px-8">
        <span>{c.landing.footer}</span>
        <span className="flex gap-5">
          <Link href={studioHref} prefetch={false} className="link text-ink-2">
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
  const lang = useLang((s) => s.lang);
  const id = useId();
  const [value, setValue] = useState("");
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const typed = parseChannel(value);
  // Back from the Studio, the browser may show this page from its cache: the button works again.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const submit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!typed) {
      setBad(true);
      return;
    }
    setBusy(true);
    // A full page load, not router.push: the visit counters live only in the landing's own
    // document (components/analytics), and the Studio must never be drawn inside it. The new
    // document starts without this page's state, so the language goes in the address.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load on purpose, see above
    window.location.assign(`/studio?channel=${encodeURIComponent(`t.me/${typed}`)}&lang=${lang}`);
  };

  // Phones: sign, headline, field in one column. Computers: the headline on the left (seven of
  // twelve columns); the sign and the field on the right, ending level with the headline's foot.
  return (
    <div className="flex flex-col lg:grid lg:grid-cols-12 lg:gap-x-10">
      {/* The shop sign stays dark until there is a real channel to read, then spells it. */}
      <LedStrip
        text={typed ? `@${typed}` : undefined}
        dot={3}
        gap={1.5}
        className="mb-7 max-w-[460px] lg:col-span-5 lg:col-start-8 lg:row-start-1 lg:mb-6 lg:max-w-none lg:self-end"
        label={typed ? `@${typed}` : undefined}
        offLabel={c.landing.ledOff}
      />

      <h1 className="max-w-[18ch] text-balance text-[34px] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-[56px] sm:leading-[1] lg:col-span-7 lg:row-span-2 lg:row-start-1 lg:max-w-[16ch] lg:self-end lg:text-[60px] lg:leading-[0.98] lg:tracking-[-0.038em] [@media(min-width:64rem)_and_(max-height:819px)]:text-[48px]">
        {c.landing.h1}
      </h1>
      <div className="lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-2">
      <p className="mt-4 max-w-[48ch] text-[16px] leading-relaxed text-ink-2 sm:text-[17px] lg:mt-0 [@media(min-width:64rem)_and_(max-height:819px)]:text-[16px]">{c.landing.sub}</p>

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
        />
        <p id={`${id}-hint`} role={bad ? "alert" : undefined} className={`mt-2.5 px-2 text-[14px] ${bad ? "text-bad" : "text-ink-3"}`}>
          {bad ? c.start.linkBad : c.start.linkExample}
        </p>
      </form>
      </div>

      {/* Computers: under the headline, so the first row ends sooner and the proof below is in
          the first screen of a laptop window. Phones: under the field, as before. */}
      <div className="mt-4 flex flex-col gap-2 px-2 sm:flex-row sm:items-center sm:gap-6 lg:col-span-7 lg:col-start-1 lg:row-start-3 lg:mt-6 lg:px-0">
        <Link href={`/studio?mode=fresh&lang=${lang}`} prefetch={false} className="link inline-flex min-h-11 items-center self-start text-[15px] font-medium">
          {c.start.emptyToggle}
        </Link>
        {/* Until the paid plan exists there is no trial to promise: the line says what is true today. */}
        <p className="text-[15px] text-ink-2">
          {c.landing.price}{" "}
          <span className="ml-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[12.5px] text-ink-2 shadow-[inset_0_0_0_1px_var(--hair-2)]">{c.landing.beta}</span>
        </p>
      </div>
    </div>
  );
}

/**
 * What the owner gets, in the first screen: one finding from the channel review and one ready
 * post with its picture, both the made-up bakery's and marked "namuna". The owner's own come from
 * their channel.
 */
function Proof() {
  const c = useCopy();
  const l = c.landing;
  return (
    <section aria-labelledby="proof-h" className="mt-12 lg:mt-14 [@media(min-width:64rem)_and_(max-height:819px)]:mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="proof-h" className="text-[20px] font-semibold tracking-[-0.015em] sm:text-[22px]">
          {l.exampleTitle}
        </h2>
        <p className="max-w-[60ch] text-[14px] leading-relaxed text-ink-3">{l.exampleNote}</p>
      </div>

      {/* Phones: the finding, the post, then the lamps. Wider: the finding over the lamps on the
          left, the post beside them. */}
      <div className="mt-5 grid items-start gap-4 md:grid-cols-2 md:grid-rows-[auto_1fr] lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:gap-x-6">
        <div className="card p-5 sm:p-6 md:col-start-1 md:row-start-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[14px] text-ink-2">{l.exampleFindingLabel}</p>
            <span className="namuna">{c.sample.chip}</span>
          </div>
          <p className="mt-3 text-[20px] font-semibold leading-snug tracking-[-0.01em] sm:text-[22px]">{keepNumbers(l.exampleFinding)}</p>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{l.exampleFix}</p>
        </div>

        <div className="md:col-start-2 md:row-span-2 md:row-start-1">
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <p className="text-[14px] text-ink-2">{l.examplePostLabel}</p>
            <span className="namuna">{c.sample.chip}</span>
          </div>
          <article className="tgpost overflow-hidden">
            <SamplePicture label={l.examplePicture} />
            <div className="px-4 pb-2.5 pt-3">
              <div className="mb-2 flex items-center gap-2.5">
                <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full text-[14px] font-semibold text-white" style={{ background: "linear-gradient(160deg, #C86B3C, #6b3115)" }}>
                  {l.examplePostName.slice(0, 1)}
                </span>
                <span className="text-[14.5px] font-semibold" style={{ color: "color-mix(in oklab, #E08A55 70%, var(--ink))" }}>
                  {l.examplePostName}
                </span>
              </div>
              <p className="post-text">{keepNumbers(l.examplePost)}</p>
              <p className="mt-1.5 text-right text-[12px] text-ink-3">07:30</p>
            </div>
          </article>
        </div>

        <LampRow />
      </div>
    </section>
  );
}

/** The owner's lamps lighting one after another (the signature, small): who works on a run. */
const noop = () => () => {};
const STEP_MS = 650;
const HOLD = 4;

function LampRow() {
  const c = useCopy();
  // Everything lit on the server and under reduced motion; the browser then plays the sequence.
  const still = useSyncExternalStore(
    noop,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true,
  );
  const [k, setK] = useState(0);
  useEffect(() => {
    if (still) return;
    const t = setInterval(() => setK((v) => (v >= OWNER_LAMPS.length + HOLD ? 0 : v + 1)), STEP_MS);
    return () => clearInterval(t);
  }, [still]);
  const at = still ? OWNER_LAMPS.length : k;
  const state = (r: AgentRole, i: number): LampState => (i < at ? "on" : i === at ? "warming" : "off");
  const now = OWNER_LAMPS[Math.min(at, OWNER_LAMPS.length - 1)];
  return (
    <div className="mt-4 px-1 md:col-start-1 md:row-start-2 md:mt-2">
      <p className="mb-3 text-[14px] text-ink-2">{c.dept.label}</p>
      <ul aria-label={c.dept.label} className="grid grid-cols-8 gap-1.5 sm:gap-2">
        {OWNER_LAMPS.map((r, i) => (
          <LampTile key={r} as="li" role={r} size="xs" state={state(r, i)} aria-label={c.lamps[r].name} className="!min-h-10 sm:!min-h-12" />
        ))}
      </ul>
      {/* Which employee is at work right now: its name and its job, in one quiet line. */}
      <p aria-hidden className="mt-3 flex min-h-6 flex-wrap items-baseline gap-x-2 text-[14px]">
        <span className="font-semibold">{c.lamps[now].name}</span>
        <span className="text-ink-2">{c.lamps[now].job}</span>
      </p>
    </div>
  );
}
