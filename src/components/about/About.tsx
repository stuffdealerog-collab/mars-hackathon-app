"use client";

import { ArrowDown, ChevronDown, Send } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { lampVars, WORK_LIGHT } from "../lamp/lamps";
import { ChannelField } from "../ui/ChannelField";
import { useCopy, useInitLang, useLang, useTabTitle } from "../ui/lang";
import { LangSwitch, Logo, parseChannel, useStageVariant } from "../ui/parts";
import { CHAPTER_LAMPS, CHAPTERS, type ChapterId } from "./copy";
import { DepartmentPanel, DepartmentStrip } from "./Department";
import { useAbout } from "./useAbout";
import { AnalysisVisual, ApproveVisual, BotMessage, LinkVisual, PlanVisual, PostVisual, VideoVisual, WhereVisual } from "./Visuals";

/**
 * /about, "How Mercat works": the owner's path from the channel link to the Monday report, told in the order the
 * department works. On a computer the department stands beside the story and each employee's lamp lights while their
 * chapter is read; on a phone the same lamps ride in a strip pinned to the top. Everything shown is the made-up bakery,
 * marked "namuna"; what is not live yet says so. The one lime action is the link field at the end.
 */
export function About({ bot, traction }: { bot: string; traction?: ReactNode }) {
  useInitLang();
  useTabTitle("about");
  useStageVariant();
  const c = useCopy();
  const a = useAbout();
  const lang = useLang((s) => s.lang);
  const studioHref = `/studio?lang=${lang}`;
  const botUrl = `https://t.me/${bot}`;
  const chapters = useRef<Partial<Record<ChapterId, HTMLElement | null>>>({});
  const register = useCallback((id: ChapterId, el: HTMLElement | null) => {
    chapters.current[id] = el;
  }, []);

  return (
    <div className="desk relative isolate flex min-h-dvh flex-col overflow-x-clip bg-stage text-ink">
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
        <div className="mx-auto grid w-full max-w-[1180px] px-4 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:gap-x-16">
          <div className="min-w-0">
            <Intro traction={traction} />
            <div className="relative">
              <DepartmentStrip chapters={chapters} />
              {CHAPTERS.map((id) => (
                <Chapter key={id} id={id} register={register} />
              ))}
            </div>
          </div>
          <aside aria-label={a.panel.label} className="hidden lg:block">
            <div className="about-sticky sticky pt-10">
              <DepartmentPanel chapters={chapters} />
            </div>
          </aside>
        </div>

        <Privacy />
        <Price />
        <Faq />
        <Cta botUrl={botUrl} />
      </main>

      <footer className="mx-auto mt-8 flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line px-4 py-6 text-[14px] text-ink-3 sm:px-8">
        <span>{c.landing.footer}</span>
        <span className="flex flex-wrap gap-5">
          <Link href={`/?lang=${lang}`} prefetch={false} className="link text-ink-2">
            {c.nav.home}
          </Link>
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

/** The first screen: what this page is, the live counts (drawn on the server), and a way straight to the link field. */
function Intro({ traction }: { traction?: ReactNode }) {
  const a = useAbout();
  const toStart = () => {
    const field = document.getElementById("about-start");
    if (!field) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    field.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "center" });
    // Focus the field without a second jump, once the scroll has had its time.
    window.setTimeout(() => document.getElementById("about-channel")?.focus({ preventScroll: true }), smooth ? 700 : 0);
  };
  return (
    <section aria-labelledby="about-h" className="pb-10 pt-10 sm:pt-16 lg:pb-16 lg:pt-20">
      <h1 id="about-h" className="max-w-[14ch] text-balance text-[40px] font-semibold leading-[1] tracking-[-0.035em] sm:text-[56px] lg:text-[64px]">
        {a.title}
      </h1>
      <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-ink-2 sm:text-[18px]">{a.lead}</p>
      {traction}
      <button type="button" onClick={toStart} className="btn-2 mt-8 !min-h-12 !px-5 text-[15px]">
        {a.jump}
        <ArrowDown className="h-4 w-4 text-ink-3" aria-hidden />
      </button>
    </section>
  );
}

const VISUAL: Record<ChapterId, () => React.ReactNode> = {
  link: () => <LinkVisual />,
  analysis: () => <AnalysisVisual />,
  plan: () => <PlanVisual />,
  posts: () => <PostVisual />,
  approve: () => <ApproveVisual />,
  autopilot: () => <AutopilotMessage />,
  report: () => <ReportMessage />,
  video: () => <VideoVisual />,
  where: () => <WhereVisual />,
};

function AutopilotMessage() {
  const a = useAbout();
  return <BotMessage lines={[a.chapters.autopilot.message]} buttons={[a.chapters.autopilot.open]} time="07:30" />;
}

function ReportMessage() {
  const a = useAbout();
  return <BotMessage lines={a.chapters.report.message} buttons={a.chapters.report.buttons} time="09:00" />;
}

/**
 * Who works in a chapter: each employee's name after the ember of their lamp's colour (ready, not lit: the lamp itself
 * lights in the department). "You" for the owner's chapters.
 */
function Who({ id }: { id: ChapterId }) {
  const a = useAbout();
  const c = useCopy();
  const roles = [...new Set(CHAPTER_LAMPS[id].map((l) => l.role))];
  const owner = id === "link" || id === "approve";
  if (!roles.length && !owner) return null;
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[14px] text-ink-2">
      <span className="text-ink-3">{a.who}</span>
      {owner && (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="lamp__you !h-1.5 !w-1.5" />
          {a.you}
        </span>
      )}
      {roles.map((r) => (
        <span key={r} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="about-ember" style={lampVars(r)} />
          {c.lamps[r].name}
        </span>
      ))}
    </p>
  );
}

function Chapter({ id, register }: { id: ChapterId; register: (id: ChapterId, el: HTMLElement | null) => void }) {
  const a = useAbout();
  const ch = a.chapters[id];
  const hid = `about-${id}`;
  return (
    <section
      ref={(el) => register(id, el)}
      aria-labelledby={hid}
      className="border-t border-line py-14 first-of-type:border-t-0 sm:py-20"
    >
      <h2 id={hid} className="max-w-[22ch] text-balance text-[28px] font-semibold leading-[1.08] tracking-[-0.028em] sm:text-[36px]">
        {ch.h}
      </h2>
      <Who id={id} />
      <p className="mt-5 max-w-[58ch] text-[16px] leading-relaxed text-ink-2 sm:text-[17px]">{ch.p}</p>
      <div className="mt-8">{VISUAL[id]()}</div>
    </section>
  );
}

/** What Mercat reads and never does, in plain rows; the full texts are one link away. */
function Privacy() {
  const a = useAbout();
  const lang = useLang((s) => s.lang);
  return (
    <section aria-labelledby="about-privacy" className="mx-auto w-full max-w-[1180px] px-4 pt-16 sm:px-8 sm:pt-24">
      <h2 id="about-privacy" className="text-[28px] font-semibold tracking-[-0.028em] sm:text-[36px]">
        {a.privacy.h}
      </h2>
      <dl className="mt-8 grid border-t border-line md:grid-cols-2 md:gap-x-16">
        {a.privacy.items.map(([k, v]) => (
          <div key={k} className="border-b border-line py-4 sm:py-5">
            <dt className="text-[17px] font-semibold tracking-[-0.01em]">{k}</dt>
            <dd className="mt-1 max-w-[52ch] text-[15px] leading-relaxed text-ink-2">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
        <Link href={`/privacy?lang=${lang}`} prefetch={false} className="link text-ink-2">
          {a.privacy.policy}
        </Link>
        <Link href={`/data-deletion?lang=${lang}`} prefetch={false} className="link text-ink-2">
          {a.privacy.deletion}
        </Link>
      </p>
    </section>
  );
}

function Price() {
  const a = useAbout();
  return (
    <section aria-labelledby="about-price" className="mx-auto w-full max-w-[1180px] px-4 pt-16 sm:px-8 sm:pt-24">
      <h2 id="about-price" className="text-[28px] font-semibold tracking-[-0.028em] sm:text-[36px]">
        {a.price.h}
      </h2>
      <div className="mt-6 flex flex-col gap-x-10 gap-y-3 border-t border-line pt-6 md:flex-row md:items-baseline">
        <p className="flex items-center gap-3 text-[24px] font-semibold tracking-[-0.02em] sm:text-[28px]">
          {a.price.big}
          <span className="rounded-full px-2 py-0.5 text-[12.5px] font-normal tracking-normal text-ink-2 shadow-[inset_0_0_0_1px_var(--hair-2)]">{a.price.chip}</span>
        </p>
        <p className="max-w-[52ch] text-[16px] leading-relaxed text-ink-2">{a.price.p}</p>
      </div>
    </section>
  );
}

function Faq() {
  const a = useAbout();
  return (
    <section aria-labelledby="about-faq" className="mx-auto w-full max-w-[1180px] px-4 pt-16 sm:px-8 sm:pt-24">
      <h2 id="about-faq" className="text-[28px] font-semibold tracking-[-0.028em] sm:text-[36px]">
        {a.faq.h}
      </h2>
      <div className="mt-6 max-w-[820px] border-t border-line">
        {a.faq.items.map((item) => (
          <details key={item.q} className="about-faq group border-b border-line">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-[17px] font-medium leading-snug [&::-webkit-details-marker]:hidden">
              {item.q}
              <ChevronDown className="h-5 w-5 shrink-0 text-ink-3 transition-transform duration-200 group-open:rotate-180" aria-hidden />
            </summary>
            <p className="max-w-[62ch] pb-5 text-[16px] leading-relaxed text-ink-2">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/** The close: the same field as the landing, the page's one lime action, and the bot for those who live in Telegram. */
function Cta({ botUrl }: { botUrl: string }) {
  const a = useAbout();
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const hint = useId();
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
    // A full page load: the Studio never opens inside a document that runs the visit counters (components/analytics).
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load on purpose, see above
    window.location.assign(`/studio?channel=${encodeURIComponent(`t.me/${typed}`)}&lang=${lang}`);
  };
  return (
    <section id="about-start" aria-labelledby="about-cta" className="mx-auto w-full max-w-[1180px] px-4 pt-20 sm:px-8 sm:pt-28">
      <div className="border-t border-line pt-10 sm:pt-14">
        <h2 id="about-cta" className="max-w-[18ch] text-balance text-[32px] font-semibold leading-[1.04] tracking-[-0.03em] sm:text-[44px]">
          {a.cta.h}
        </h2>
        <p className="mt-4 max-w-[52ch] text-[16px] leading-relaxed text-ink-2 sm:text-[17px]">{a.cta.p}</p>
        <form onSubmit={submit} noValidate className="mt-8 max-w-[560px]">
          <ChannelField
            id="about-channel"
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
            describedBy={hint}
          />
          <p id={hint} role={bad ? "alert" : undefined} className={`mt-2.5 px-2 text-[14px] ${bad ? "text-bad" : "text-ink-3"}`}>
            {bad ? c.start.linkBad : c.start.linkExample}
          </p>
        </form>
        <div className="mt-6 flex flex-col gap-2 px-2 sm:flex-row sm:items-center sm:gap-6">
          <Link href={`/studio?mode=fresh&lang=${lang}`} prefetch={false} className="link inline-flex min-h-11 items-center self-start text-[15px] font-medium">
            {c.start.emptyToggle}
          </Link>
          <a href={botUrl} target="_blank" rel="noreferrer" className="link inline-flex min-h-11 items-center gap-2 self-start text-[15px] font-medium">
            <Send className="h-4 w-4 text-ink-3" aria-hidden />
            {a.cta.bot}
          </a>
        </div>
      </div>
    </section>
  );
}
