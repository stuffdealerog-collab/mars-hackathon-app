"use client";

import { Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { STAGE_H, STAGE_W, type Beat, type SigProps } from "./clock";

const Q = "(prefers-reduced-motion: reduce)";
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(Q);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

/**
 * A 9:16 phone-ish stage with a Play/Replay control and the beat timeline
 * (sound cues for the edit). Autoplays once when half visible; out of view it
 * stops. With reduced motion it never autoplays and shows the poster frame.
 */
export function SigFrame({
  title,
  length,
  beats,
  children,
}: {
  title: string;
  length: number;
  beats: Beat[];
  children: (p: SigProps) => React.ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const anim = useRef<Animation | null>(null);
  const auto = useRef(false);
  const [runKey, setRunKey] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [scale, setScale] = useState(1);
  const reduced = useSyncExternalStore(subscribe, () => window.matchMedia(Q).matches, () => false);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / STAGE_W));
    ro.observe(el);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          if (!auto.current && !reduced) {
            auto.current = true;
            setRunKey((k) => k + 1);
            setPlaying(true);
          }
        } else setPlaying(false);
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, [reduced]);

  useEffect(() => {
    const el = headRef.current;
    if (!el || runKey === 0) return;
    anim.current?.cancel();
    anim.current = el.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
      duration: length * 1000,
      easing: "linear",
      fill: "forwards",
    });
  }, [runKey, length]);

  useEffect(() => {
    const a = anim.current;
    if (!a) return;
    if (playing) a.play();
    else a.pause();
  }, [playing]);

  // Beats closer than ~0.6 s drop their number below the track so labels never collide.
  const low = beats.reduce<boolean[]>((acc, b, i) => {
    acc.push(i > 0 && !acc[i - 1] && b.t - beats[i - 1].t < 0.65);
    return acc;
  }, []);

  const replay = () => {
    auto.current = true;
    setRunKey((k) => k + 1);
    setPlaying(true);
  };

  return (
    <figure className="flex w-full flex-col gap-5">
      <div
        ref={boxRef}
        role="group"
        aria-label={`${title}: ${length} soniyalik animatsiya, namuna`}
        className="lw relative mx-auto w-full max-w-[340px] overflow-hidden rounded-[34px]"
        style={{ aspectRatio: "9 / 16", background: "#000" }}
      >
        <div className="absolute left-0 top-0 origin-top-left" style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})` }}>
          {children({ runKey, playing, reduced })}
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[34px] shadow-[inset_0_0_0_1px_rgba(255,255,255,.13)]" />
      </div>

      <figcaption className="mx-auto w-full max-w-[340px]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[17px] font-semibold tracking-[-0.01em]">{title}</div>
            <div className="tnum text-[13px]" style={{ color: "var(--ink-2)" }}>
              {length} с, 9:16
            </div>
          </div>
          <button type="button" onClick={replay} className="btn-quiet !min-h-[40px] !px-4 !text-[14px]">
            {runKey ? <RotateCcw className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
            {runKey ? "Ещё раз" : "Запустить"}
          </button>
        </div>
        {reduced && runKey === 0 && (
          <p className="mt-2 text-[13px]" style={{ color: "var(--ink-2)" }}>
            Анимация отключена системной настройкой — нажмите «Запустить», покажу щадящую версию.
          </p>
        )}

        <div className="relative mt-5 h-7" aria-hidden>
          <div className="absolute inset-x-0 top-1/2 h-px" style={{ background: "var(--hair-2)" }} />
          <div ref={headRef} className="absolute inset-x-0 top-1/2 -mt-px h-[2px] origin-left" style={{ background: "var(--ink)", transform: "scaleX(0)" }} />
          {beats.map((b, i) => (
            <span key={b.t} className="absolute top-0 h-7 w-px" style={{ left: `${(b.t / length) * 100}%`, background: "var(--ink-3)" }}>
              <span className={`tnum absolute left-1 text-[10px] leading-none ${low[i] ? "top-[19px]" : "-top-1"}`} style={{ color: "var(--ink-2)" }}>
                {i + 1}
              </span>
            </span>
          ))}
        </div>
        <ol className="mt-3 space-y-2 text-[13px] leading-snug">
          {beats.map((b, i) => (
            <li key={b.t} className="grid grid-cols-[1.4rem_2.6rem_1fr] gap-1">
              <span className="tnum" style={{ color: "var(--ink-3)" }}>
                {i + 1}
              </span>
              <span className="tnum" style={{ color: "var(--ink-2)" }}>
                {b.t.toFixed(1)} с
              </span>
              <span>
                {b.sound}
                <span style={{ color: "var(--ink-2)" }}> — {b.picture}</span>
              </span>
            </li>
          ))}
        </ol>
      </figcaption>
    </figure>
  );
}
