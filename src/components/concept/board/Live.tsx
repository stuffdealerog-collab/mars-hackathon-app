"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AgentRole } from "@/lib/uslub/contract";
import { LampTile } from "@/components/lamp/LampTile";
import { LAMP_ORDER, type LampState } from "@/components/lamp/lamps";
import { Led } from "@/components/lamp/Led";

/* Sample results ("namuna") for the fictional channel t.me/nafis_kiyim. */
export const SAMPLE_RESULT: Record<AgentRole, React.ReactNode> = {
  brand: <span className="text-[17px] font-semibold leading-tight">«siz», iliq</span>,
  analyst: <Led text="27%" dot={4} gap={1.6} color="#fff" grid={false} label="qamrov 27%" />,
  strategist: <span className="flex items-end gap-1.5"><Led text="7" dot={4} gap={1.6} color="#fff" grid={false} /><span className="text-[13px]">kunlik reja</span></span>,
  copywriter: <span className="flex items-end gap-1.5"><Led text="7" dot={4} gap={1.6} color="#fff" grid={false} /><span className="text-[13px]">post</span></span>,
  editor: <span className="flex items-end gap-1.5"><Led text="94" dot={4} gap={1.6} color="#fff" grid={false} /><span className="text-[13px]">inson bali</span></span>,
  translator: <span className="text-[15px] font-semibold leading-tight">Lotin, Кирилл,<br />Рус, Eng</span>,
  designer: <span className="text-[15px] font-semibold">3 muqova</span>,
  video: <span className="flex items-end gap-1.5"><Led text="15" dot={4} gap={1.6} color="#fff" grid={false} /><span className="text-[13px]">soniya Reels</span></span>,
  radar: <span className="flex items-end gap-1.5"><Led text="10" dot={4} gap={1.6} color="#fff" grid={false} /><span className="text-[13px]">joy</span></span>,
  publisher: <span className="text-[15px] font-semibold">20:00 da</span>,
};

function useInView<T extends Element>(threshold = 0.45) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, seen] as const;
}

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The board's one orchestrated moment: the department lights up in pipeline order. */
export function PanelDemo({ cols = "grid-cols-2 sm:grid-cols-5" }: { cols?: string }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const [state, setState] = useState<Record<string, LampState>>({});
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (reducedMotion()) {
      setState(Object.fromEntries(LAMP_ORDER.map((r) => [r, "on" as LampState])));
      return;
    }
    setState({});
    const timers: number[] = [];
    let t = 350;
    LAMP_ORDER.forEach((r, i) => {
      timers.push(window.setTimeout(() => setState((s) => ({ ...s, [r]: "warming" })), t));
      timers.push(window.setTimeout(() => setState((s) => ({ ...s, [r]: r === "publisher" ? "you" : "on" })), t + 650));
      t += Math.max(170, 420 - i * 30);
    });
    return () => timers.forEach(clearTimeout);
  }, [seen, run]);
  return (
    <div ref={ref}>
      <ul className={`grid gap-2.5 ${cols}`}>
        {LAMP_ORDER.map((r) => (
          <LampTile key={r} as="li" role={r} state={state[r] ?? "off"} size="md">
            {SAMPLE_RESULT[r]}
          </LampTile>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between gap-3 text-[13px] text-[var(--ink-2)]">
        <span className="flex items-center gap-2">
          <span className="namuna">namuna</span> t.me/nafis_kiyim
        </span>
        <button type="button" className="btn-quiet !min-h-9 !px-3.5 !text-[13px]" onClick={() => setRun((n) => n + 1)}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Yana yoqish
        </button>
      </div>
    </div>
  );
}

/** One lamp you can switch: warm-up on, slow cool-down off. */
export function LampSwitch() {
  const [on, setOn] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <LampTile role="editor" state={on ? "on" : "off"} size="lg">
        {SAMPLE_RESULT.editor}
      </LampTile>
      <button type="button" role="switch" aria-checked={on} className="btn-quiet" onClick={() => setOn((v) => !v)}>
        {on ? "O‘chirish (1000 ms, ease-in)" : "Yoqish (720 ms, miltillab)"}
      </button>
    </div>
  );
}

/** Ballistic number: settles with mass and a damped overshoot, never jumps. */
export function BallisticNumber({ to = 27, suffix = "%" }: { to?: number; suffix?: string }) {
  const [v, setV] = useState(0);
  const [run, setRun] = useState(0);
  const [ref, seen] = useInView<HTMLDivElement>();
  useEffect(() => {
    if (!seen) return;
    if (reducedMotion()) {
      setV(to);
      return;
    }
    // critically-under-damped spring: k=170, c=18, m=1
    let x = 0;
    let vel = 0;
    let last = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const a = 170 * (to - x) - 18 * vel;
      vel += a * dt;
      x += vel * dt;
      setV(x);
      if (Math.abs(to - x) > 0.05 || Math.abs(vel) > 0.05) raf = requestAnimationFrame(step);
      else setV(to);
    };
    setV(0);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [seen, run, to]);
  return (
    <div ref={ref} className="flex flex-col items-start gap-3">
      <div className="rounded-[18px] bg-[var(--glass)] p-4" style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}>
        <Led text={`${Math.max(0, Math.round(v))}${suffix}`} dot={7} gap={2.5} label={`${to}${suffix}`} />
      </div>
      <button type="button" className="btn-quiet !min-h-9 !px-3.5 !text-[13px]" onClick={() => setRun((n) => n + 1)}>
        <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Qayta
      </button>
    </div>
  );
}

const SCRIPTS = [
  { k: "lat", label: "Lotin", text: "Yangi kuzgi paltolar keldi — issiq, yengil va har kuni kiyishga qulay." },
  { k: "cyr", label: "Кирилл", text: "Янги кузги палтолар келди — иссиқ, енгил ва ҳар куни кийишга қулай." },
  { k: "ru", label: "Рус", text: "Пришли новые осенние пальто — тёплые, лёгкие и удобные на каждый день." },
  { k: "en", label: "Eng", text: "New autumn coats are in — warm, light and easy to wear every day." },
] as const;

export function ScriptSwitch() {
  const [k, setK] = useState<(typeof SCRIPTS)[number]["k"]>("lat");
  const cur = SCRIPTS.find((s) => s.k === k)!;
  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Yozuv" className="seg">
        {SCRIPTS.map((s) => (
          <button key={s.k} type="button" role="radio" aria-checked={k === s.k} onClick={() => setK(s.k)} className="seg__item">
            {s.label}
          </button>
        ))}
      </div>
      <p className="min-h-[66px] text-[15px] leading-[1.45]" lang={k === "ru" ? "ru" : k === "en" ? "en" : k === "cyr" ? "uz-Cyrl" : "uz"}>
        {cur.text}
      </p>
    </div>
  );
}

export function AutopilotSwitch({ label, hint, defaultOn = false }: { label: string; hint: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold">{label}</div>
        <div className="text-[13px] text-[var(--ink-2)]">{on ? "O‘zi chiqadi (beta)" : hint}</div>
      </div>
      <button type="button" role="switch" aria-checked={on} aria-label={`${label}: avtopilot`} className="switch" onClick={() => setOn((v) => !v)}>
        <span className="switch__knob" />
      </button>
    </div>
  );
}
