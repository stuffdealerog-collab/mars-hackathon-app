"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Led } from "../lamp/Led";
import { WORK_LIGHT } from "../lamp/lamps";
import { decideIntro, forcedIntro, localIntro, Onboarding } from "@/components/onboarding";
import { fmt, useCopy, useInitLang, useLang, useTabTitle } from "../ui/lang";
import { LangSwitch, Logo, parseChannel, useStageVariant } from "../ui/parts";
import { ChannelSign } from "./ChannelSign";
import { CommandPalette } from "./CommandPalette";
import { AdminAskCard } from "./AdminAskCard";
import { askChannel } from "./admin-ask";
import { ChannelTab } from "./ChannelTab";
import { Panel, Strip, useLamps } from "./Department";
import { Hub, HUB_W, RAIL_W, StageLight, useDesktop, useHub, useHubRestore } from "./Hub";
import { PostsSplit, PostsTab } from "./Posts";
import { SpectrumIntro } from "./SpectrumIntro";
import { Start } from "./Start";
import { Toasts } from "./Toasts";
import { POSTS_PER_RUN, recentBrands, useStudio, type Step, type Tab } from "./store";

type Theme = "light" | "dark";

/** Exponential ease-out, the system's one curve (DESIGN.md, Motion). */
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/**
 * The Studio: one screen that answers "what is this and what do I do", a calm checklist
 * while it works, then two tabs: Kanal · Postlar.
 */
export function Studio({ bot, inTelegram = false, theme, langHint }: { bot: string; inTelegram?: boolean; theme?: Theme; langHint?: string | null }) {
  useInitLang(langHint);
  useTabTitle("studio");
  const phase = useStudio((s) => s.phase);
  const sample = useStudio((s) => s.sample);
  const entry = useStudio((s) => s.entry);
  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    // On the web an approval waits 4 s for "Bekor qilish"; inside Telegram it goes at once.
    useStudio.getState().configure({ bot, approveDelayMs: inTelegram ? 0 : 4000 });
    const st = useStudio.getState(); // read after configure: it sets `sample`
    // Sample mode shows the made-up bakery straight away: a link form there would only pretend.
    if (st.sample) {
      st.startChannel("namuna");
      return;
    }
    const p = new URLSearchParams(window.location.search);
    const brand = p.get("brand");
    if (brand) {
      void st.reopen(brand);
      return;
    }
    // The landing's "Boshlash" hands over the channel: the owner already pressed start.
    const channel = p.get("channel");
    const name = channel ? parseChannel(channel) : null;
    if (name) st.startChannel(name);
  }, [bot, inTelegram]);

  // Leaving the page: waiting approvals are sent (keepalive), unsaved edits of drafts ask first.
  // Coming back to the tab after publishing through the bot: the posts' status is re-read.
  useEffect(() => {
    const onHide = () => useStudio.getState().flushApprovals();
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const s = useStudio.getState();
      if (s.posts.some((p) => p.status === "draft" && s.edited[p.id] && !s.pendingApprove[p.id])) e.preventDefault();
    };
    const onBack = () => {
      if (document.visibilityState === "visible") void useStudio.getState().refreshPosts();
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("focus", onBack);
    document.addEventListener("visibilitychange", onBack);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("focus", onBack);
      document.removeEventListener("visibilitychange", onBack);
    };
  }, []);

  // Desktop web: the pro tool, sections in a glass hub over the lamp stage. Phones and the
  // Mini App keep the one-column Studio below.
  const desktop = useDesktop();
  useHubRestore();
  // Before the browser says how wide it is, draw the hub's silhouette (or the column's header):
  // no blank frame, no jump from a phone column to the studio.
  if (desktop === null && !inTelegram) return <StudioSkeleton theme={theme} />;
  if (desktop && !inTelegram) return <DesktopStudio theme={theme} />;

  return (
    <div data-theme={theme} className="flex min-h-dvh flex-col overflow-x-clip bg-paper text-ink">
      <header className="mx-auto flex w-full max-w-[760px] items-center justify-between gap-3 px-4 pb-2 pt-3 sm:px-6 sm:pt-5">
        <Logo href={inTelegram ? null : "/"} />
        <span className="flex items-center gap-2">
          <ProToggle />
          <LangSwitch />
        </span>
      </header>
      {sample && <SampleBanner />}
      <main className="mx-auto w-full max-w-[760px] flex-1 px-4 pb-20 sm:px-6">
        {phase === "start" && <Start key={`${entry.view}:${entry.channel}`} initialView={entry.view} initialChannel={entry.channel} />}
        {phase === "working" && <Working />}
        {phase === "reopening" && <Reopening />}
        {phase === "ready" && <Ready inTelegram={inTelegram} />}
      </main>
      {!inTelegram && <DeviceKeyLine />}
      <Toasts />
      <AdminAskCard variant="phone" />
    </div>
  );
}

/** Phones in a browser: whose Telegram key is on this device, and the way to forget it. */
function DeviceKeyLine() {
  const c = useCopy();
  const deviceKey = useStudio((s) => s.deviceKey);
  const signOutDevice = useStudio((s) => s.signOutDevice);
  if (!deviceKey) return null;
  return (
    <p className="mx-auto flex w-full max-w-[760px] flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-6 text-[13px] text-ink-3 sm:px-6">
      {fmt(c.hub.keyOwner, { id: deviceKey })}
      <button type="button" className="link text-ink-2" onClick={signOutDevice}>
        {c.hub.signOut}
      </button>
    </p>
  );
}

/** Desktop layout: the hub (sections, department, settings) + the working area beside it. */
function DesktopStudio({ theme }: { theme?: Theme }) {
  const phase = useStudio((s) => s.phase);
  const sample = useStudio((s) => s.sample);
  const entry = useStudio((s) => s.entry);
  const introGate = useStudio((s) => s.introGate);
  const lamps = useLamps(introGate);
  useStageVariant();
  const side = useHub((s) => s.side);
  const collapsed = useHub((s) => s.collapsed);
  const intro = useHub((s) => s.intro);
  const tab = useStudio((s) => s.tab);
  const pro = useStudio((s) => s.pro);
  const lang = useLang((s) => s.lang);
  const bot = useStudio((s) => s.bot);
  // The add-the-bot card (the hub's tool, the tour's last card) names the owner's channel.
  const brandName = useStudio((s) => s.brand?.dna.name);
  const brandChannel = useStudio((s) => s.brand?.channel);
  const typedChannel = useStudio((s) => s.input.channel);
  const channel = useMemo(() => askChannel({ name: brandName, channel: brandChannel, typed: typedChannel }), [brandName, brandChannel, typedChannel]);
  // The intro never opens by itself (the start screen's one line says what Mercat does; the
  // add-the-bot card comes at the first publish, AdminAskCard). ?intro=1 / ?intro=admin still
  // open it for previews and the demo; the hub's «Qanday ishlaydi» replays it.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const d = decideIntro({
      seen: localIntro.version(),
      returning: recentBrands().length > 0,
      withIntent: !!(p.get("brand") || p.get("channel")),
      force: forcedIntro(window.location.search),
    });
    if (d.show) useHub.setState({ intro: d.only ?? true });
  }, []);
  const gutter = (collapsed ? RAIL_W : HUB_W) + 36;
  return (
    <div data-theme={theme} className="desk relative min-h-dvh bg-stage text-ink">
      <StageLight lamps={lamps} />
      <Hub lamps={lamps} />
      {/* The canvas takes the width beside the hub: a pro tool, not a phone column. Reading
          screens (start, the run) keep a reading measure; the ready workspace spreads out. */}
      <main
        className="relative z-10 w-full overflow-x-clip px-10 pb-24 pt-6 transition-[padding] duration-300"
        style={side === "left" ? { paddingLeft: gutter + 8 } : { paddingRight: gutter + 8 }}
      >
        {/* The channel's numbers on an LED sign that runs under the glass to the window's edge. */}
        {phase === "ready" && <ChannelSign bleed={gutter + 8} side={side} />}
        <div className={phase === "ready" ? "mx-auto max-w-[1280px]" : "relative mx-auto max-w-[880px]"}>
          {/* The one work light over the headline and the department (start, the run). */}
          {phase !== "ready" && <div aria-hidden className="work-light" style={{ background: WORK_LIGHT }} />}
          {sample && <SampleBanner flush />}
          {phase === "start" && <Start key={`${entry.view}:${entry.channel}`} initialView={entry.view} initialChannel={entry.channel} />}
          {phase === "working" && <Working />}
          {phase === "reopening" && <Reopening />}
          {phase === "ready" && <Ready inTelegram={false} desktop />}
        </div>
      </main>
      <Toasts
        inset={side === "left" ? gutter : -gutter}
        // Postlar: never over the next post's buttons. Pro anchors under the queue (the canvas's
        // start), Oddiy beside its single column (the end).
        align={phase === "ready" && tab === "posts" ? (pro ? "start" : "end") : "center"}
        edge={(pro ? side === "left" : side === "right") ? gutter + 8 : 40}
      />
      <CommandPalette />
      <Onboarding
        open={!!intro}
        only={intro === "admin" ? "admin" : null}
        lang={lang}
        bot={bot}
        variant="desktop"
        channel={channel}
        onClose={(how) => {
          localIntro.mark();
          useHub.setState({ intro: false });
          // Finishing the intro on the start screen puts the owner in the link field.
          if (how === "done" && useStudio.getState().phase === "start") document.querySelector<HTMLInputElement>("main input")?.focus();
        }}
      />
      <AdminAskCard variant="desktop" />
    </div>
  );
}

/** One quiet toggle for marketers: the same screens, denser. Remembered on this device. */
function ProToggle() {
  const c = useCopy();
  const pro = useStudio((s) => s.pro);
  const setPro = useStudio((s) => s.setPro);
  return (
    <span className="seg">
      <button type="button" aria-pressed={pro} title={c.pro.label} aria-label={c.pro.label} onClick={() => setPro(!pro)} className="!px-3.5">
        Pro
      </button>
    </span>
  );
}

function SampleBanner({ flush = false }: { flush?: boolean }) {
  const c = useCopy();
  return (
    <div className={flush ? "mb-2" : "mx-auto mt-2 w-full max-w-[760px] px-4 sm:px-6"}>
      <p className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border border-line bg-card px-4 py-2.5 text-[14px] text-ink-2">
        <span>{c.sample.banner}</span>
        <a href="/studio" className="link text-ink">
          {c.sample.cta}
        </a>
      </p>
    </div>
  );
}

function Reopening() {
  const c = useCopy();
  return (
    <p className="breathe pt-12 text-[16px] text-ink-2" role="status">
      {c.reopen.loading}
    </p>
  );
}

/* --------------------------------------------------------------- working */

function stepLabel(step: Step, mode: "channel" | "fresh", c: ReturnType<typeof useCopy>): string | null {
  const w = c.work;
  if (step.status === "skip") return null;
  // A failed step reads as the plain noun next to its cross, not as "…in progress".
  const wait = step.status === "wait" || step.status === "fail";
  const run = step.status === "run";
  switch (step.key) {
    case "read": {
      const t = mode === "fresh" ? w.readDesc : w.readChannel;
      if (wait) return t.wait;
      if (run) return t.run;
      return mode === "channel" && step.n != null ? fmt(w.readChannel.done, { n: step.n }) : t.done.split(" · ")[0];
    }
    case "voice":
      return wait ? w.voice.wait : run ? w.voice.run : w.voice.done;
    case "photos":
      return wait ? w.photos.wait : run ? w.photos.run : w.photos.done;
    case "plan":
      if (wait) return w.plan.wait;
      if (run) return step.m ? fmt(w.plan.count, { n: step.n ?? 0, m: step.m }) : w.plan.run;
      return fmt(w.plan.done, { n: step.n ?? 0 });
    case "posts":
      if (wait) return fmt(w.posts.wait, { n: POSTS_PER_RUN });
      return run ? fmt(w.posts.run, { n: step.n ?? POSTS_PER_RUN }) : fmt(w.posts.done, { n: step.n ?? 0 });
    case "images":
      if (wait) return w.images.wait;
      return run ? fmt(w.images.run, { n: step.n ?? 0, m: step.m ?? POSTS_PER_RUN }) : fmt(w.images.done, { n: step.n ?? 0, m: step.m ?? 0 });
  }
}

/** Spektr plays once per page: the first run's wow, not every retry. */
let spektrPlayed = false;

function Working() {
  const c = useCopy();
  const steps = useStudio((s) => s.steps);
  const mode = useStudio((s) => s.mode);
  const problem = useStudio((s) => s.problem);
  const retry = useStudio((s) => s.retry);
  const reset = useStudio((s) => s.reset);
  const input = useStudio((s) => s.input);
  const sample = useStudio((s) => s.sample);
  const bot = useStudio((s) => s.bot);
  const head = useRef<HTMLHeadingElement>(null);
  const ledRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);
  // A wrong or private link will fail the same way again: the way forward is another link.
  const fixLink = !!problem && ["channel_invalid", "not_found", "invalid_input", "channel_mismatch"].includes(problem.code);

  // The first run opens with Spektr: the channel's light drops onto the panel and splits into
  // a beam per lamp; the lamps stay dark until the beams land. Never under reduced motion.
  const [intro, setIntro] = useState<{ gate: boolean } | null>(() => {
    if (spektrPlayed || typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
    spektrPlayed = true;
    return { gate: true };
  });
  const onBloom = useCallback(() => {
    setIntro((i) => (i ? { gate: false } : i));
    // The bloom: every available lamp's light on the room flares to its peak for 0.9 s in the
    // lamps' real colours, then settles to the working ones. Opacity only, from and back to the
    // value CSS gives it, so nothing jumps.
    panelRef.current
      ?.closest(".panel-stage")
      ?.querySelectorAll<HTMLElement>(".room-light:not([data-soon])")
      .forEach((el) => el.animate([{ opacity: 1, offset: 0.3 }, { opacity: 1, offset: 0.55 }], { duration: 900, easing: "ease-out" }));
  }, []);
  const onDone = useCallback(() => setIntro(null), []);
  // Safety net: if the intro cannot animate (hidden tab, no rAF), never keep the lamps dark.
  useEffect(() => {
    if (!intro?.gate) return;
    const id = window.setTimeout(() => setIntro((i) => (i ? { gate: false } : i)), 2500);
    return () => clearTimeout(id);
  }, [intro?.gate]);
  const lamps = useLamps(!!intro?.gate);
  // The hub and its spots wait for the beams too (DesktopStudio reads the gate from the store).
  useEffect(() => {
    useStudio.setState({ introGate: !!intro?.gate });
  }, [intro?.gate]);
  useEffect(() => () => useStudio.setState({ introGate: false }), []);
  const desktop = useDesktop();

  useEffect(() => {
    head.current?.focus({ preventScroll: true });
  }, []);

  const running = steps.find((s) => s.status === "run");
  const failed = steps.find((s) => s.status === "fail");
  const lastDone = [...steps].reverse().find((s) => s.status === "done");
  const now = running ?? failed ?? lastDone;
  const nowLabel = now ? stepLabel(now, mode, c) : null;
  // What is being read: the owner's channel, or the sample, said plainly.
  const source = sample ? c.sample.chip : input.channel ? `@${input.channel}` : c.work.readDesc.wait;

  return (
    <div className="pt-4 sm:pt-8">
      {/* Spektr's light starts from this pill: the thing Mercat is reading. */}
      <div className="flex items-center justify-between gap-3">
        <span ref={ledRef} className="inline-flex min-h-10 min-w-0 items-center truncate rounded-full bg-glass-2 px-4 text-[15px] font-medium shadow-[inset_0_0_0_1px_var(--hair-2)]">
          {source}
        </span>
        <span className="led-well shrink-0 rounded-[12px] bg-[var(--led-well,var(--stage))] px-3 py-[11px]" style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}>
          <ElapsedLed />
        </span>
      </div>

      <h1
        ref={head}
        tabIndex={-1}
        className="mt-6 text-[28px] font-semibold leading-tight tracking-[-0.03em] outline-none sm:text-[34px] lg:mt-8 lg:text-[44px] lg:leading-[1.05] lg:tracking-[-0.035em] [@media(min-width:64rem)_and_(max-height:819px)]:text-[34px]"
      >
        {problem ? (problem.limit ? c.limit.title : c.error.title) : c.dept.working}
      </h1>
      <p className="mt-1.5 min-h-6 text-[16px] text-ink-2 lg:mt-2.5 lg:text-[17px]" aria-live="polite">
        {nowLabel}
        {!problem && <span className="text-ink-3"> · {c.work.note}</span>}
      </p>

      {/* Computer screens: 48 px of air above the housing (its top row lights the wall there). */}
      <div className="relative mt-5 lg:mt-12">
        <Panel ref={panelRef} lamps={lamps} housing={!!desktop} />
        {intro && <SpectrumIntro fieldRef={ledRef} panelRef={panelRef} onBloom={onBloom} onDone={onDone} />}
      </div>

      {problem && (
        <div role="alert" className="relative mt-8 rounded-2xl border border-line bg-card p-4 sm:p-5 lg:mt-[140px]">
          <p className="text-[16px] leading-relaxed">{problem.message}</p>
          <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
            {problem.limit ? (
              // A day limit: retrying today fails the same way. A guest can carry on in the bot.
              <>
                {problem.limit === "anonymous" && (
                  <a className="btn" href={`https://t.me/${bot}`} target="_blank" rel="noreferrer">
                    {c.limit.openBot}
                  </a>
                )}
                <button type="button" className={problem.limit === "anonymous" ? "btn-2" : "btn"} onClick={reset}>
                  {c.error.startOver}
                </button>
              </>
            ) : fixLink ? (
              <button type="button" className="btn" onClick={reset}>
                {c.error.startOver}
              </button>
            ) : (
              <>
                <button type="button" className="btn" onClick={retry}>
                  {c.error.retry}
                </button>
                <button type="button" className="btn-2" onClick={reset}>
                  {c.error.startOver}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** The run's clock on the LED: m:ss, a measured number like the rest of the sign. */
function ElapsedLed() {
  const startedAt = useStudio((s) => s.startedAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.round((now - startedAt) / 1000));
  return <Led text={`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`} dot={3} gap={1.3} grid={false} label={`${s} s`} />;
}

/* ----------------------------------------------------------------- ready */

function Ready({ inTelegram, desktop = false }: { inTelegram: boolean; desktop?: boolean }) {
  const c = useCopy();
  const tab = useStudio((s) => s.tab);
  const setTab = useStudio((s) => s.setTab);
  const brand = useStudio((s) => s.brand);
  const posts = useStudio((s) => s.posts);
  const newChannel = useStudio((s) => s.newChannel);
  const sample = useStudio((s) => s.sample);
  const pro = useStudio((s) => s.pro);
  const lamps = useLamps();
  const reduce = useReducedMotion() ?? false;
  const tabs: { key: Tab; name: string }[] = [
    { key: "channel", name: c.tabs.channel },
    { key: "posts", name: c.tabs.posts },
  ];
  const name = brand?.dna.name || brand?.channel;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = tabs.findIndex((t) => t.key === tab);
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    setTab(next.key);
    document.getElementById(`tab-${next.key}`)?.focus();
  };

  return (
    <div className="pt-4 sm:pt-8">
      <ReadyProblem />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-[26px] font-semibold leading-tight tracking-[-0.02em] sm:text-[32px]">{name}</h1>
          {brand?.channel && brand.channel !== name && <p className="mt-0.5 text-[15px] text-ink-2">{brand.channel}</p>}
        </div>
        {!sample && (
          <button type="button" onClick={newChannel} className="link mt-1.5 shrink-0 text-[15px] text-ink-2">
            {c.channel.newChannel}
          </button>
        )}
      </div>

      {/* The department stays on screen: a row of small lights, or the full panel in Professional rejim.
          On desktop the hub holds the lights; the full panel lives in Bo‘lim. */}
      {desktop ? null : <div className="mt-4">{pro ? <Panel lamps={lamps} /> : <Strip lamps={lamps} />}</div>}

      <div
        role="tablist"
        aria-label="Mercat"
        onKeyDown={onKey}
        className={desktop ? "sr-only" : "sticky top-0 z-10 -mx-4 mt-5 flex gap-1 border-b border-line bg-paper px-4 sm:mx-0 sm:px-0"}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            id={`tab-${t.key}`}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            aria-controls={`panel-${t.key}`}
            tabIndex={tab === t.key ? 0 : -1}
            onClick={() => setTab(t.key)}
            className={`-mb-px min-h-12 border-b-2 px-3 text-[16px] transition-colors ${tab === t.key ? "border-ink font-semibold text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
          >
            {t.name}
            {t.key === "posts" && posts.length > 0 && <span className="tnum ml-1.5 text-ink-3">{posts.length}</span>}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          id={`panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
          className="@container pt-7"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -4 }}
          transition={{ duration: 0.22, ease: EASE_OUT }}
        >
          {tab === "channel" && <ChannelTab wide={desktop} />}
          {tab === "posts" && (desktop && pro ? <PostsSplit lamps={lamps} /> : <PostsTab inTelegram={inTelegram} column={desktop} />)}
          {tab === "dept" && <DeptTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** A failed "Postini yozish" or plan in ready: said above the work, dismissed by the owner. */
function ReadyProblem() {
  const c = useCopy();
  const problem = useStudio((s) => s.problem);
  const bot = useStudio((s) => s.bot);
  if (!problem) return null;
  // A day limit is not a failure: a calm card, not the red one.
  return (
    <div
      role="alert"
      className={`mb-6 flex flex-wrap items-center gap-3 rounded-[16px] px-4 py-3 text-[15px] shadow-[inset_0_0_0_1px_var(--hair)] ${problem.limit ? "bg-glass" : "bg-[var(--bad-soft)]"}`}
    >
      <p className="mr-auto leading-relaxed">{problem.message}</p>
      {problem.limit === "anonymous" && (
        <a className="btn !min-h-9 !px-4 !text-[14px]" href={`https://t.me/${bot}`} target="_blank" rel="noreferrer">
          {c.limit.openBot}
        </a>
      )}
      <button type="button" className="btn-2 !min-h-9 !px-4 !text-[14px]" onClick={() => useStudio.setState({ problem: null })}>
        {c.problem.dismiss}
      </button>
    </div>
  );
}

/** CSS only, until the first client frame knows the width: the hub at 1024+, the header below. */
function StudioSkeleton({ theme }: { theme?: Theme }) {
  return (
    <div data-theme={theme} className="min-h-dvh bg-paper text-ink lg:bg-stage" aria-busy="true">
      <div aria-hidden className="hub fixed bottom-3 left-3 top-3 z-30 hidden w-[292px] lg:block" />
      <div aria-hidden className="mx-auto h-[60px] w-full max-w-[760px] px-4 sm:px-6 lg:hidden" />
    </div>
  );
}

/**
 * Bo‘lim (Pro): the whole department, each lamp opening what it did, and the work log: every
 * step of the run, its state and how long it took.
 */
function DeptTab() {
  const c = useCopy();
  const lamps = useLamps();
  const steps = useStudio((s) => s.steps);
  const mode = useStudio((s) => s.mode);
  const newChannel = useStudio((s) => s.newChannel);
  const sample = useStudio((s) => s.sample);
  const rows = steps.map((s) => ({ s, label: stepLabel(s, mode, c) })).filter((r) => r.label);
  return (
    <div className="flex flex-col gap-10">
      <Panel lamps={lamps} size="md" showJob housing />
      {rows.length > 0 && (
        <section aria-labelledby="log-h" className="relative">
          <h2 id="log-h" className="mb-4 text-[20px] font-semibold tracking-[-0.01em]">
            {c.dept.log}
          </h2>
          <ol className="card divide-y divide-line">
            {rows.map(({ s, label }) => (
              <li key={s.key} className="flex items-baseline justify-between gap-4 px-4 py-3 text-[15px] @md:px-5">
                <span className={s.status === "fail" ? "text-bad" : s.status === "done" ? "text-ink" : "text-ink-2"}>{label}</span>
                <span className="tnum shrink-0 text-[13px] text-ink-3">{s.t0 && s.t1 ? fmt(c.pro.took, { s: Math.max(1, Math.round((s.t1 - s.t0) / 1000)) }) : ""}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {!sample && (
        <button type="button" className="btn-2 self-start" onClick={newChannel}>
          {c.hub.newChannel}
        </button>
      )}
    </div>
  );
}
