"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Script } from "@/lib/uslub/contract";
import { Led } from "../lamp/Led";
import { plural } from "../ui/format";
import { fmt, useCopy, useInitLang, useLang, type Lang } from "../ui/lang";
import { LangSwitch, Logo, parseChannel } from "../ui/parts";
import { ChannelTab } from "./ChannelTab";
import { Panel, SOON_ROLES, Strip, useLamps } from "./Department";
import { Hub, HUB_W, RAIL_W, StageLight, useDesktop, useHub, useHubRestore } from "./Hub";
import { PostCard } from "./PostCard";
import { SpectrumIntro } from "./SpectrumIntro";
import { Start } from "./Start";
import { POSTS_PER_RUN, slotKey, useStudio, type Step, type Tab } from "./store";

type Theme = "light" | "dark";

/** Exponential ease-out, the system's one curve (DESIGN.md, Motion). */
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/**
 * The Studio: one screen that answers "what is this and what do I do", a calm checklist
 * while it works, then three tabs: Kanal · Postlar · Video.
 */
export function Studio({ bot, inTelegram = false, theme, langHint }: { bot: string; inTelegram?: boolean; theme?: Theme; langHint?: string | null }) {
  useInitLang(langHint);
  const phase = useStudio((s) => s.phase);
  const sample = useStudio((s) => s.sample);
  const entry = useStudio((s) => s.entry);
  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    useStudio.getState().configure({ bot });
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
  }, [bot]);

  // Desktop web: the pro tool, sections in a glass hub over the lamp stage. Phones and the
  // Mini App keep the one-column Studio below.
  const desktop = useDesktop();
  useHubRestore();
  if (desktop && !inTelegram) return <DesktopStudio theme={theme} />;

  return (
    <div data-theme={theme} className="flex min-h-dvh flex-col bg-paper text-ink">
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
    </div>
  );
}

/** Desktop layout: the hub (sections, department, settings) + the working area beside it. */
function DesktopStudio({ theme }: { theme?: Theme }) {
  const phase = useStudio((s) => s.phase);
  const sample = useStudio((s) => s.sample);
  const entry = useStudio((s) => s.entry);
  const lamps = useLamps();
  const { side, collapsed } = useHub();
  const gutter = (collapsed ? RAIL_W : HUB_W) + 36;
  return (
    <div data-theme={theme} className="relative min-h-dvh bg-stage text-ink">
      <StageLight lamps={lamps} />
      <Hub lamps={lamps} />
      <main
        className="relative z-10 mx-auto w-full max-w-[1040px] px-8 pb-24 pt-6 transition-[padding] duration-300"
        style={side === "left" ? { paddingLeft: gutter } : { paddingRight: gutter }}
      >
        {sample && <SampleBanner flush />}
        {phase === "start" && <Start key={`${entry.view}:${entry.channel}`} initialView={entry.view} initialChannel={entry.channel} />}
        {phase === "working" && <Working />}
        {phase === "reopening" && <Reopening />}
        {phase === "ready" && <Ready inTelegram={false} desktop />}
      </main>
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
  const head = useRef<HTMLHeadingElement>(null);
  const ledRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);
  // A wrong or private link will fail the same way again: the way forward is another link.
  const fixLink = !!problem && ["channel_invalid", "not_found", "invalid_input", "channel_mismatch"].includes(problem.code);

  // The first run opens with Spektr: the channel's light drops onto the panel and splits into
  // ten beams; the lamps stay dark until the beams land. Never under reduced motion.
  const [intro, setIntro] = useState<{ gate: boolean } | null>(() => {
    if (spektrPlayed || typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
    spektrPlayed = true;
    return { gate: true };
  });
  const onBloom = useCallback(() => setIntro((i) => (i ? { gate: false } : i)), []);
  const onDone = useCallback(() => setIntro(null), []);
  // Safety net: if the intro cannot animate (hidden tab, no rAF), never keep the lamps dark.
  useEffect(() => {
    if (!intro?.gate) return;
    const id = window.setTimeout(() => setIntro((i) => (i ? { gate: false } : i)), 2500);
    return () => clearTimeout(id);
  }, [intro?.gate]);
  const lamps = useLamps(!!intro?.gate);

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
        <span className="shrink-0 rounded-[12px] bg-stage px-3 py-[11px]" style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}>
          <ElapsedLed />
        </span>
      </div>

      <h1 ref={head} tabIndex={-1} className="mt-6 text-[28px] font-semibold leading-tight tracking-[-0.03em] outline-none sm:text-[34px]">
        {problem ? c.error.title : c.dept.working}
      </h1>
      <p className="mt-1.5 min-h-6 text-[16px] text-ink-2" aria-live="polite">
        {nowLabel}
        {!problem && <span className="text-ink-3"> · {c.work.note}</span>}
      </p>

      <div className="relative mt-5">
        <Panel ref={panelRef} lamps={lamps} />
        {intro && <SpectrumIntro fieldRef={ledRef} panelRef={panelRef} onBloom={onBloom} onDone={onDone} dark={SOON_ROLES} />}
      </div>

      {problem && (
        <div role="alert" className="mt-8 rounded-2xl border border-line bg-card p-4 sm:p-5">
          <p className="text-[16px] leading-relaxed">{problem.message}</p>
          <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
            {fixLink ? (
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
  const reset = useStudio((s) => s.reset);
  const sample = useStudio((s) => s.sample);
  const pro = useStudio((s) => s.pro);
  const lamps = useLamps();
  const reduce = useReducedMotion() ?? false;
  const tabs: { key: Tab; name: string }[] = [
    { key: "channel", name: c.tabs.channel },
    { key: "posts", name: c.tabs.posts },
    { key: "video", name: c.tabs.video },
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
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-[26px] font-semibold leading-tight tracking-[-0.02em] sm:text-[32px]">{name}</h1>
          {brand?.channel && brand.channel !== name && <p className="mt-0.5 text-[15px] text-ink-2">{brand.channel}</p>}
        </div>
        {!sample && (
          <button type="button" onClick={reset} className="link mt-1.5 shrink-0 text-[15px] text-ink-2">
            {c.channel.newChannel}
          </button>
        )}
      </div>

      {/* The department stays on screen: ten small lights, or the full panel in Professional rejim.
          On desktop the hub holds the lights and the sections, so only the pro panel shows here. */}
      {desktop ? pro && <Panel lamps={lamps} className="mt-6" /> : <div className="mt-4">{pro ? <Panel lamps={lamps} /> : <Strip lamps={lamps} />}</div>}

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
          className="pt-7"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -4 }}
          transition={{ duration: 0.22, ease: EASE_OUT }}
        >
          {tab === "channel" && <ChannelTab />}
          {tab === "posts" && <PostsTab inTelegram={inTelegram} />}
          {tab === "video" && <VideoTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

const SCRIPTS: Script[] = ["uz_latn", "uz_cyrl", "ru", "en"];
const SCRIPT_FOR: Record<Lang, Script> = { uz: "uz_latn", ru: "ru", en: "en" };

/** Posts the run asked for but did not get: how many, and one button to write them again. */
function MissedNote() {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const missed = useStudio((s) => s.missed);
  const writing = useStudio((s) => s.missed.some((it) => s.writingSlot[slotKey(it)]));
  const writeMissed = useStudio((s) => s.writeMissed);
  if (!missed.length) return null;
  return (
    <div className="card flex flex-wrap items-center gap-3 p-4">
      <p className="mr-auto text-[15px] text-ink-2">
        {missed.length} {plural(c.posts.missed, missed.length, lang)}.
      </p>
      <button type="button" className="btn-2" disabled={writing} onClick={() => void writeMissed()}>
        {writing ? c.channel.writingSlot : c.posts.rewrite}
      </button>
    </div>
  );
}

function PostsTab({ inTelegram }: { inTelegram: boolean }) {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const posts = useStudio((s) => s.posts);
  const picked = useStudio((s) => s.postScript);
  const setPostScript = useStudio((s) => s.setPostScript);
  const channelLangs = useStudio((s) => s.brand?.dna.languages) ?? [];
  const reduce = useReducedMotion() ?? false;
  if (!posts.length) return <p className="text-[15px] text-ink-2">{c.posts.none}</p>;

  // One switch for the whole list. The post language is the channel's own (from the brand),
  // not the page language; the page language is only a fallback when the brand has none.
  const available = SCRIPTS.filter((s) => posts.some((p) => p.variants[s]?.trim()));
  const own = channelLangs.find((s) => available.includes(s));
  const fallback = own ?? (available.includes(SCRIPT_FOR[lang]) ? SCRIPT_FOR[lang] : (available[0] ?? "uz_latn"));
  const script = picked && available.includes(picked) ? picked : fallback;

  return (
    <div className="flex flex-col gap-6">
      {available.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[14px] text-ink-2" id="post-lang">
            {c.posts.langLabel}
          </span>
          <div className="seg" role="group" aria-labelledby="post-lang">
            {available.map((s) => (
              <button key={s} type="button" aria-pressed={script === s} title={c.posts.scriptNames[s]} onClick={() => setPostScript(s)}>
                {c.posts.scripts[s]}
              </button>
            ))}
          </div>
        </div>
      )}
      <MissedNote />
      {/* Cards are dealt in one after another, once; later state changes do not replay it. */}
      {posts.map((p, i) => (
        <motion.div
          key={p.id}
          initial={reduce ? false : { opacity: 0, y: 18, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.42, ease: EASE_OUT, delay: Math.min(i, 6) * 0.07 }}
        >
          <PostCard post={p} script={p.variants[script]?.trim() ? script : "uz_latn"} inTelegram={inTelegram} />
        </motion.div>
      ))}
    </div>
  );
}

function VideoTab() {
  const c = useCopy();
  return (
    <div className="card p-5">
      <h2 className="text-[18px] font-semibold">{c.video.title}</h2>
      <p className="mt-2 text-[16px] leading-relaxed text-ink-2">{c.video.text}</p>
    </div>
  );
}
