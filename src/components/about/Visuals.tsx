"use client";

import { Check, CornerLeftUp, Link2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { LedStrip } from "../lamp/Led";
import { LampTile } from "../lamp/LampTile";
import { OWNER_LAMPS } from "../lamp/lamps";
import { SamplePicture } from "../landing/SamplePicture";
import { keepNumbers, useCopy, useLang } from "../ui/lang";
import { parseChannel } from "../ui/parts";
import { POST_SCRIPTS, SAMPLE_POST, type PostScript } from "./copy";
import { useReveal, type Reveal } from "./motion";
import { useAbout } from "./useAbout";

const EASE = [0.16, 1, 0.3, 1] as const;

function Namuna() {
  const a = useAbout();
  return <span className="namuna">{a.sample}</span>;
}

/** A labelled sample block: the caption on the left, the dashed "namuna" chip on the right. */
function SampleHead({ label, className = "" }: { label?: string; className?: string }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      {label ? <p className="text-[14px] text-ink-2">{label}</p> : <span />}
      <Namuna />
    </div>
  );
}

/** Types `text` once the block plays; shows it whole when shown, empty while it waits off screen. */
function useTyped(text: string, phase: Reveal, stepMs = 55): string {
  const [n, setN] = useState(text.length);
  useEffect(() => {
    if (phase === "shown") return;
    if (phase === "waiting") {
      const frame = requestAnimationFrame(() => setN(0));
      return () => cancelAnimationFrame(frame);
    }
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) clearInterval(t);
    }, stepMs);
    return () => clearInterval(t);
  }, [phase, text, stepMs]);
  return phase === "shown" ? text : text.slice(0, n);
}

/** The link going in, as on the landing: the shop sign stays dark until there is a channel, then spells it. */
export function LinkVisual() {
  const a = useAbout();
  const c = useCopy();
  const ref = useRef<HTMLDivElement>(null);
  const phase = useReveal(ref, 0.7);
  const typed = useTyped("t.me/tandir_namuna", phase);
  const channel = parseChannel(typed);
  return (
    <div ref={ref} className="card p-4 sm:p-5">
      <SampleHead label={a.chapters.link.fieldLabel} />
      <LedStrip
        text={channel ? `@${channel}` : undefined}
        dot={2.5}
        gap={1}
        className="mt-3"
        label={channel ? `@${channel}` : undefined}
        offLabel={c.landing.ledOff}
      />
      <div aria-hidden className="chan-field mt-3 !min-h-[54px]">
        <Link2 className="h-5 w-5 shrink-0 text-ink-3" />
        <span className="min-w-0 flex-1 truncate text-[17px]">
          {typed}
          <span className="about-caret ml-px inline-block h-[1.1em] w-[2px] translate-y-[0.2em] bg-lime" />
        </span>
      </div>
    </div>
  );
}

/** One finding from the channel review, and how the owner writes in five plain lines. */
export function AnalysisVisual() {
  const a = useAbout();
  const c = useCopy();
  const l = c.landing;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="card p-5">
        <SampleHead label={l.exampleFindingLabel} />
        <p className="mt-3 text-[19px] font-semibold leading-snug tracking-[-0.01em]">{keepNumbers(l.exampleFinding)}</p>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{l.exampleFix}</p>
      </div>
      <div className="card p-5">
        <SampleHead label={a.chapters.analysis.voiceTitle} />
        <dl className="mt-3 grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-[15px] leading-snug">
          {a.chapters.analysis.voice.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-3">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/** Two sample weeks side by side: the same department plans a shop for orders and a blog for growth. */
export function PlanVisual() {
  const a = useAbout();
  const p = a.chapters.plan;
  return (
    <div>
      <SampleHead className="mb-2 px-1" />
      <div className="grid gap-3 sm:grid-cols-2">
        {[p.shop, p.blog].map((w) => (
          <div key={w.title} className="card p-5">
            <p className="text-[17px] font-semibold tracking-[-0.01em]">{w.title}</p>
            <p className="mt-0.5 text-[14px] text-ink-2">{w.goal}</p>
            <ol className="mt-4 flex flex-col gap-3">
              {w.rows.map(([day, time, topic]) => (
                <li key={topic} className="grid grid-cols-[2.6rem_3.2rem_minmax(0,1fr)] items-baseline gap-x-1 text-[15px] leading-snug">
                  <span className="text-ink-3">{day}</span>
                  <span className="tnum text-ink-2">{time}</span>
                  <span>{topic}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}

const DEFAULT_SCRIPT = { uz: "uz_latn", ru: "ru", en: "en" } as const;

/** The sample post in the four post languages, its ending marked: the channel's own way of closing a post. */
export function PostVisual() {
  const a = useAbout();
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const [picked, setPicked] = useState<PostScript | null>(null);
  const script = picked ?? DEFAULT_SCRIPT[lang];
  const text = SAMPLE_POST[script];
  const cut = text.lastIndexOf("\n\n");
  const body = text.slice(0, cut + 2);
  const ending = text.slice(cut + 2);
  const meta = POST_SCRIPTS.find((s) => s.id === script)!;
  return (
    <div className="max-w-[440px]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="seg" role="group" aria-label={a.chapters.posts.scriptLabel}>
          {POST_SCRIPTS.map((s) => (
            <button key={s.id} type="button" lang={s.lang} aria-pressed={s.id === script} onClick={() => setPicked(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        <Namuna />
      </div>
      <article className="tgpost">
        <SamplePicture label={c.landing.examplePicture} />
        <div className="px-4 pb-2.5 pt-3">
          <div className="mb-2 flex items-center gap-2.5">
            <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full text-[14px] font-semibold text-white" style={{ background: "linear-gradient(160deg, #C86B3C, #6b3115)" }}>
              {c.landing.examplePostName.slice(0, 1)}
            </span>
            <span className="text-[14.5px] font-semibold" style={{ color: "color-mix(in oklab, #E08A55 70%, var(--ink))" }}>
              {c.landing.examplePostName}
            </span>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={script}
              lang={meta.lang}
              className="post-text"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14, ease: EASE }}
            >
              {keepNumbers(body)}
              <span className="about-ending">{keepNumbers(ending)}</span>
            </motion.p>
          </AnimatePresence>
          <p className="mt-1.5 text-right text-[12px] text-ink-3">07:30</p>
        </div>
      </article>
      <p className="mt-2.5 flex items-start gap-2 px-1 text-[14px] leading-snug text-ink-2">
        <CornerLeftUp className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />
        {a.chapters.posts.ending}
      </p>
    </div>
  );
}

/**
 * The owner's turn, drawn as the week the Studio shows: posts the owner has approved, and one still waiting for them
 * (the lime dot: the owner's hand). Approvals land one after another when the block comes into view.
 */
export function ApproveVisual() {
  const a = useAbout();
  const c = useCopy();
  const ref = useRef<HTMLDivElement>(null);
  const phase = useReveal(ref, 0.6);
  const rows = a.chapters.plan.shop.rows;
  const [done, setDone] = useState(2);
  useEffect(() => {
    if (phase === "shown") return;
    if (phase === "waiting") {
      const frame = requestAnimationFrame(() => setDone(0));
      return () => cancelAnimationFrame(frame);
    }
    const t1 = setTimeout(() => setDone(1), 450);
    const t2 = setTimeout(() => setDone(2), 1050);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [phase]);
  const approvedCount = phase === "shown" ? 2 : done;
  return (
    <div ref={ref} className="grid gap-3 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <div className="card p-5">
        <SampleHead label={a.chapters.approve.ready} />
        <ol className="mt-4 flex flex-col">
          {rows.map(([day, time, topic], i) => {
            const approved = i < approvedCount;
            return (
              <li key={topic} className="flex min-h-[52px] items-center justify-between gap-3 border-t border-line py-2.5 first:border-t-0 first:pt-0">
                <span className="min-w-0 text-[15px] leading-snug">
                  <span className="tnum text-ink-3">
                    {day} {time}
                  </span>{" "}
                  {topic}
                </span>
                {/* Both states hold the same place, so a row never shifts when it is approved. */}
                <span className="relative grid shrink-0 justify-items-end text-[13.5px] font-medium">
                  <span className={`col-start-1 row-start-1 inline-flex items-center gap-1 text-ok transition-opacity duration-200 ${approved ? "opacity-100" : "opacity-0"}`}>
                    <Check className="h-4 w-4" aria-hidden />
                    {c.posts.approved}
                  </span>
                  <span className={`col-start-1 row-start-1 inline-flex items-center gap-1.5 text-ink-2 transition-opacity duration-200 ${approved ? "opacity-0" : "opacity-100"}`}>
                    <span className="lamp__you" aria-hidden />
                    {a.panel.waiting}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="card p-5">
        <p className="text-[14px] text-ink-2">{a.chapters.approve.rewriteLabel}</p>
        <ul className="mt-3 flex flex-col gap-2 text-[17px] leading-snug">
          {a.chapters.approve.rewrites.map((r) => (
            <li key={r}>«{r}»</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * A message from the bot, drawn close to Telegram's own bubble with its inline buttons under it. It arrives when it
 * scrolls into view, the way a message comes in.
 */
export function BotMessage({ lines, buttons, time }: { lines: string[]; buttons: string[]; time: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const phase = useReveal(ref, 0.5);
  const hidden = phase === "waiting";
  return (
    <div ref={ref}>
      <SampleHead className="mb-2 max-w-[460px] px-1" />
      <motion.div
        className="flex max-w-[460px] items-end gap-2.5"
        initial={false}
        animate={hidden ? { opacity: 0, y: 14 } : { opacity: 1, y: 0 }}
        transition={hidden ? { duration: 0 } : { duration: 0.42, ease: EASE }}
      >
        <span aria-hidden className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-glass-3">
          <span className="absolute left-1/2 top-[9px] h-[2px] w-[11px] -translate-x-1/2 rounded-full bg-[#FFD6A0] shadow-[0_0_6px_1px_#FFD6A0]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="rounded-[18px_18px_18px_6px] bg-glass-2 px-3.5 pb-2 pt-2.5 shadow-[inset_0_0_0_1px_var(--hair)]">
            <p className="text-[13.5px] font-semibold text-ink-2">Mercat</p>
            <p className="post-text mt-0.5 !text-[15px] !leading-[1.45]">{keepNumbers(lines.join("\n"))}</p>
            <p className="mt-1 text-right text-[12px] text-ink-3">{time}</p>
          </div>
          {buttons.length > 0 && (
            <div aria-hidden className="mt-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${buttons.length}, minmax(0, 1fr))` }}>
              {buttons.map((b) => (
                <span key={b} className="rounded-[12px] bg-glass-2 py-2 text-center text-[14px] font-medium text-ink-2 shadow-[inset_0_0_0_1px_var(--hair)]">
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

/** The Videographer at work: its lamp, a script in four lines, and the part that is not ready yet. */
export function VideoVisual() {
  const a = useAbout();
  const c = useCopy();
  const ref = useRef<HTMLDivElement>(null);
  const phase = useReveal(ref, 0.5);
  const v = a.chapters.video;
  return (
    <div ref={ref} className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
      <LampTile role="video" size="md" state={phase === "waiting" ? "off" : "on"} name={c.lamps.video.name} job={c.video.script} className="sm:self-start" />
      <div className="card p-5">
        <SampleHead label={c.video.script} />
        <dl className="mt-3 grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-[15px] leading-snug">
          {v.script.map(([k, t]) => (
            <div key={k} className="contents">
              <dt className="text-ink-3">{k}</dt>
              <dd>{keepNumbers(t)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 flex items-center gap-2.5 border-t border-line pt-3.5 text-[14px] text-ink-2">
          <span aria-hidden className="h-[3px] w-[18px] shrink-0 rounded-full bg-[#0f0e0c] shadow-[inset_0_0_0_1px_var(--hair-2)]" />
          {v.soon}
        </p>
      </div>
    </div>
  );
}

/** Where it runs: the Mini App in Telegram and the Studio on a computer, drawn small from the same pieces. */
export function WhereVisual() {
  const a = useAbout();
  const c = useCopy();
  const w = a.chapters.where;
  return (
    <div className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)] items-end gap-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6">
      <figure className="m-0">
        <div aria-hidden className="mx-auto flex aspect-[9/16] w-full flex-col gap-2 rounded-[26px] bg-stage p-2.5 shadow-[inset_0_0_0_1.5px_var(--hair-2)]">
          <span className="mx-auto mt-0.5 h-1 w-10 shrink-0 rounded-full bg-glass-3" />
          <div className="grid shrink-0 grid-cols-8 gap-[3px]">
            {OWNER_LAMPS.map((r) => (
              <LampTile key={r} role={r} size="xs" state="on" className="!min-h-[14px] !rounded-[4px]" />
            ))}
          </div>
          <div className="tgpost min-h-0 flex-1 !rounded-[14px_14px_14px_5px]">
            <SamplePicture label="" />
            <p className="line-clamp-3 px-2 pt-1.5 text-[9.5px] leading-snug">{keepNumbers(SAMPLE_POST.uz_latn)}</p>
          </div>
          <span className="grid h-7 shrink-0 place-items-center rounded-full bg-glass-2 text-[10.5px] font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--hair)]">
            {c.posts.approve}
          </span>
        </div>
        <figcaption className="mt-2.5 text-center text-[13.5px] text-ink-2">{w.phone}</figcaption>
      </figure>
      <figure className="m-0">
        <div aria-hidden className="flex aspect-[16/10] w-full gap-2 rounded-[14px] bg-stage p-2 shadow-[inset_0_0_0_1.5px_var(--hair-2)]">
          <div className="flex w-[30%] flex-col gap-1.5 rounded-[10px] bg-glass p-1.5 shadow-[inset_0_0_0_1px_var(--hair)]">
            <span className="h-2 w-2/3 rounded-full bg-glass-3" />
            <span className="h-2 w-1/2 rounded-full bg-glass-3" />
            <div className="mt-1 grid grid-cols-4 gap-1">
              {OWNER_LAMPS.map((r) => (
                <LampTile key={r} role={r} size="xs" state="on" className="!min-h-[12px] !rounded-[4px]" />
              ))}
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <LedStrip text="@TANDIR_NAMUNA" dot={2} gap={1} className="!h-7 !px-2" label="" />
            <div className="flex flex-1 gap-1.5">
              <div className="flex-1 rounded-[8px] bg-glass p-1.5 shadow-[inset_0_0_0_1px_var(--hair)]">
                <span className="block h-1.5 w-3/4 rounded-full bg-glass-3" />
                <span className="mt-1 block h-1.5 w-1/2 rounded-full bg-glass-3" />
                <span className="mt-1 block h-1.5 w-2/3 rounded-full bg-glass-3" />
              </div>
              <div className="tgpost flex-1 !rounded-[8px_8px_8px_3px] p-1.5">
                <p className="line-clamp-5 text-[7px] leading-tight">{keepNumbers(SAMPLE_POST.uz_latn)}</p>
              </div>
            </div>
          </div>
        </div>
        <figcaption className="mt-2.5 text-center text-[13.5px] text-ink-2">{w.desk}</figcaption>
      </figure>
    </div>
  );
}
