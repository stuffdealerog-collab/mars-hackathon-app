"use client";

import { Check, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Script } from "@/lib/uslub/contract";
import { fmt, useCopy, useInitLang, useLang, type Lang } from "../ui/lang";
import { LangSwitch, Logo, parseChannel } from "../ui/parts";
import { ChannelTab } from "./ChannelTab";
import { PostCard } from "./PostCard";
import { Start } from "./Start";
import { POSTS_PER_RUN, useStudio, type Step, type Tab } from "./store";

type Theme = "light" | "dark";

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

  return (
    <div data-theme={theme} className="flex min-h-dvh flex-col bg-paper text-ink">
      <header className="mx-auto flex w-full max-w-[760px] items-center justify-between gap-3 px-4 pb-2 pt-3 sm:px-6 sm:pt-5">
        <Logo href={inTelegram ? null : "/"} />
        <LangSwitch />
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

function SampleBanner() {
  const c = useCopy();
  return (
    <div className="mx-auto mt-2 w-full max-w-[760px] px-4 sm:px-6">
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

function Elapsed() {
  const c = useCopy();
  const startedAt = useStudio((s) => s.startedAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.round((now - startedAt) / 1000));
  return <span className="tnum">{fmt(c.work.seconds, { s })}</span>;
}

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

function Working() {
  const c = useCopy();
  const steps = useStudio((s) => s.steps);
  const mode = useStudio((s) => s.mode);
  const problem = useStudio((s) => s.problem);
  const retry = useStudio((s) => s.retry);
  const reset = useStudio((s) => s.reset);
  const input = useStudio((s) => s.input);
  const head = useRef<HTMLHeadingElement>(null);
  // A wrong or private link will fail the same way again: the way forward is another link.
  const fixLink = !!problem && ["channel_invalid", "not_found", "invalid_input", "channel_mismatch"].includes(problem.code);

  useEffect(() => {
    head.current?.focus();
  }, []);

  return (
    <div className="pt-6 sm:pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 ref={head} tabIndex={-1} className="text-[28px] font-semibold leading-tight tracking-[-0.02em] outline-none sm:text-[34px]">
          {problem ? c.error.title : c.work.title}
        </h1>
        {!problem && (
          <span className="shrink-0 text-[15px] text-ink-3">
            <Elapsed />
          </span>
        )}
      </div>
      {input.channel && <p className="mt-1 text-[16px] text-ink-2">@{input.channel}</p>}
      {!problem && <p className="mt-3 text-[15px] text-ink-2">{c.work.note}</p>}

      <ol className="mt-7 flex flex-col gap-3.5" aria-live="polite">
        {steps.map((s) => {
          const label = stepLabel(s, mode, c);
          if (!label) return null;
          return (
            <li key={s.key} className={`flex items-center gap-3 text-[16px] ${s.status === "wait" ? "text-ink-3" : "text-ink"}`}>
              <StepIcon status={s.status} />
              <span>{label}</span>
            </li>
          );
        })}
      </ol>

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

function StepIcon({ status }: { status: Step["status"] }) {
  const box = "grid h-6 w-6 shrink-0 place-items-center rounded-full";
  if (status === "done") return <span className={`${box} bg-ok text-paper`}><Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /></span>;
  if (status === "fail") return <span className={`${box} bg-bad text-paper`}><X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /></span>;
  if (status === "run") return <span className={`${box} text-ink-2`}><Loader2 className="h-5 w-5 animate-spin [animation-duration:1.6s]" aria-hidden /></span>;
  return <span className={`${box} border border-line-2`} aria-hidden />;
}

/* ----------------------------------------------------------------- ready */

function Ready({ inTelegram }: { inTelegram: boolean }) {
  const c = useCopy();
  const tab = useStudio((s) => s.tab);
  const setTab = useStudio((s) => s.setTab);
  const brand = useStudio((s) => s.brand);
  const posts = useStudio((s) => s.posts);
  const reset = useStudio((s) => s.reset);
  const sample = useStudio((s) => s.sample);
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

      <div role="tablist" aria-label="Mercat" onKeyDown={onKey} className="sticky top-0 z-10 -mx-4 mt-5 flex gap-1 border-b border-line bg-paper px-4 sm:mx-0 sm:px-0">
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

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="pt-7">
        {tab === "channel" && <ChannelTab />}
        {tab === "posts" && <PostsTab inTelegram={inTelegram} />}
        {tab === "video" && <VideoTab />}
      </div>
    </div>
  );
}

const SCRIPTS: Script[] = ["uz_latn", "uz_cyrl", "ru", "en"];
const SCRIPT_FOR: Record<Lang, Script> = { uz: "uz_latn", ru: "ru", en: "en" };

function PostsTab({ inTelegram }: { inTelegram: boolean }) {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const posts = useStudio((s) => s.posts);
  const picked = useStudio((s) => s.postScript);
  const setPostScript = useStudio((s) => s.setPostScript);
  if (!posts.length) return <p className="text-[15px] text-ink-2">{c.posts.none}</p>;

  // One switch for the whole list; it follows the page language until the owner picks.
  const available = SCRIPTS.filter((s) => posts.some((p) => p.variants[s]?.trim()));
  const fallback = available.includes(SCRIPT_FOR[lang]) ? SCRIPT_FOR[lang] : (available[0] ?? "uz_latn");
  const script = picked && available.includes(picked) ? picked : fallback;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[15px] leading-relaxed text-ink-2">{c.posts.intro}</p>
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
      {posts.map((p) => (
        <PostCard key={p.id} post={p} script={p.variants[script]?.trim() ? script : "uz_latn"} inTelegram={inTelegram} />
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
