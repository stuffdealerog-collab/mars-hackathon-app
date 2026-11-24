"use client";

import { Check, Eye } from "lucide-react";
import { LAMP_ORDER, LAMPS } from "@/components/lamp/lamps";
import { easeOut, seg } from "./clock";

export const LINK = "t.me/kanalingiz";

/** Honest label: everything in these prototypes is sample data. */
export function Namuna() {
  return (
    <span className="namuna absolute right-[18px] top-[18px] z-30" style={{ background: "rgb(0 0 0 / .6)" }}>
      namuna
    </span>
  );
}

/** A thumb tap: a soft disc that swells and fades where the finger lands. */
export function Tap({ t, at, x, y }: { t: number; at: number; x: number; y: number }) {
  if (t < at || t > at + 0.5) return null;
  const p = seg(t, at, at + 0.5);
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute z-40 rounded-full"
      style={{
        left: x - 24,
        top: y - 24,
        width: 48,
        height: 48,
        background: "rgb(255 255 255 / .42)",
        transform: `scale(${0.45 + 0.85 * easeOut(p)})`,
        opacity: (1 - p) * 0.9,
      }}
    />
  );
}

/** The output object: a Telegram channel post in the brand's voice. */
export function PostCard({ style, className = "" }: { style?: React.CSSProperties; className?: string }) {
  return (
    <div
      className={`absolute rounded-[20px] p-3.5 ${className}`}
      style={{ background: "#1a1a1f", boxShadow: "inset 0 0 0 1px rgb(255 255 255 / .08), 0 30px 60px -18px rgb(0 0 0 / .95)", ...style }}
    >
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-full text-[15px] font-semibold" style={{ background: "linear-gradient(160deg,#FFD6A0,#B8642F)", color: "#1c0f06" }}>
          N
        </span>
        <div className="leading-tight">
          <div className="text-[14.5px] font-semibold">Nafis kiyim</div>
          <div className="tnum text-[12px]" style={{ color: "var(--ink-2)" }}>
            4 210 obunachi
          </div>
        </div>
      </div>
      <p className="mt-3 text-[15.5px] leading-[1.42]">Yangi kuzgi paltolar keldi — issiq, yengil va har kuni kiyishga qulay. 🧥</p>
      <p className="mt-2 text-[15.5px] leading-[1.42]">O‘lchamingizni yozing, ertagacha olib qo‘yamiz 🤍</p>
      <div className="mt-2.5 flex items-center justify-end gap-1.5 text-[12px]" style={{ color: "var(--ink-2)" }}>
        <Eye className="h-3.5 w-3.5" aria-hidden />
        <span>—</span>
        <span className="tnum">20:00</span>
      </div>
    </div>
  );
}

/** The owner's only job, in lime. Pressed at `press`, confirmed 0.2 s later. */
export function Approve({ t, from, press, style }: { t: number; from: number; press: number; style?: React.CSSProperties }) {
  const o = easeOut(seg(t, from, from + 0.35));
  const down = t >= press && t < press + 0.18;
  const done = t >= press + 0.2;
  return (
    <div className="btn-lime absolute" style={{ opacity: o, transform: `scale(${down ? 0.96 : 1})`, transition: "transform 120ms var(--ease-out)", ...style }}>
      {done ? <Check className="h-5 w-5" strokeWidth={3} aria-hidden /> : null}
      {done ? "Tasdiqlandi" : "Tasdiqlash"}
    </div>
  );
}

/** Closing card: the spectrum collapses into one line, then the promise. */
export function EndCard({ t, at, reduced }: { t: number; at: number; reduced: boolean }) {
  if (t < at) return null;
  const bg = seg(t, at, at + 0.45);
  const txt = easeOut(seg(t, at + 0.55, at + 1.15));
  const sub = seg(t, at + 1.05, at + 1.45);
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center" style={{ background: `rgb(0 0 0 / ${bg})` }}>
      <div className="flex gap-1" aria-hidden>
        {LAMP_ORDER.map((r, i) => {
          const p = seg(t, at + 0.25 + i * 0.05, at + 0.45 + i * 0.05);
          return <span key={r} className="h-1 w-6 rounded-full" style={{ background: LAMPS[r].hue, opacity: p, boxShadow: `0 0 10px ${LAMPS[r].hue}` }} />;
        })}
      </div>
      <p
        className="mt-7 text-center text-[36px] font-semibold leading-[1.04] tracking-[-0.03em]"
        style={{ opacity: txt, filter: reduced ? undefined : `blur(${(1 - txt) * 6}px)` }}
      >
        Bir havola.
        <br />
        Butun bo‘lim.
      </p>
      <p className="mt-5 text-[14px] font-medium" style={{ opacity: sub, color: "var(--ink-2)" }}>
        Mercat
      </p>
    </div>
  );
}

/** Link field that gets the link pasted into it, with the lime switch. */
export function LinkField({ t, typeFrom, typeTo, press, style, reduced }: { t: number; typeFrom: number; typeTo: number; press: number; style?: React.CSSProperties; reduced: boolean }) {
  const n = reduced ? (t >= typeFrom ? LINK.length : 0) : Math.round(seg(t, typeFrom, typeTo) * LINK.length);
  const down = t >= press && t < press + 0.18;
  return (
    <div className="field absolute" style={style}>
      <span className="flex-1 truncate text-[17px]">
        {n > 0 ? LINK.slice(0, n) : <span style={{ color: "var(--ink-3)" }}>t.me/kanalingiz</span>}
        {n > 0 && n < LINK.length && <span className="ml-px inline-block h-[18px] w-[2px] translate-y-[3px]" style={{ background: "var(--lime)" }} />}
      </span>
      <span className="btn-lime !min-h-[48px] !px-5 !text-[15px]" style={{ transform: `scale(${down ? 0.96 : 1})`, transition: "transform 120ms var(--ease-out)" }}>
        Yoqish
      </span>
    </div>
  );
}

/**
 * Fixed-size lamp tiles for the 340×604 stage. The lamp sizes live in
 * unlayered CSS, which beats Tailwind's layered utilities, so the override is
 * a scoped stylesheet with higher specificity instead of utility classes.
 */
export function TileFit({ h, pad }: { h: number; pad: string }) {
  return (
    <style>{`.sig-tile-${h}.lamp{min-height:${h}px;height:${h}px}.sig-tile-${h} .lamp__body{padding:${pad};gap:2px}`}</style>
  );
}
