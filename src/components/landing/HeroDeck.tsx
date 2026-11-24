"use client";

import type { AgentRole } from "@/lib/uslub/contract";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { GRAD } from "@/components/uslub/agents";
import { DotMatrix, useCountUp } from "@/components/uslub/DotMatrix";
import { Orb } from "@/components/uslub/Orb";

type Card = { kind: AgentRole; label: string; title: string; body: React.ReactNode };

const CARDS: Card[] = [
  {
    kind: "brand",
    label: "Brend xotirasi",
    title: "Brend DNK",
    body: (
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
        {[
          ["Ohang", "Iliq, sokin"],
          ["Murojaat", "«Siz»"],
          ["Emoji", "Kam"],
          ["Uzunlik", "~420 belgi"],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="mono-label !text-white/55">{k}</dt>
            <dd className="font-semibold text-fog">{v}</dd>
          </div>
        ))}
      </dl>
    ),
  },
  {
    kind: "analyst",
    label: "Analitik",
    title: "Kanal tahlili",
    body: (
      <div className="flex items-end justify-between gap-4">
        <div>
          <DotMatrix value="27%" dot={6} gap={3} label="27% qamrov" />
          <div className="mt-2 text-[13px] text-white/70">qamrov · 60 post tahlili</div>
        </div>
        <div className="flex h-14 items-end gap-1" aria-hidden>
          {[3, 2, 4, 6, 5, 9, 10, 8, 4].map((h, i) => (
            <span key={i} className="w-1.5 rounded-full bg-white/80" style={{ height: `${h * 10}%`, opacity: h > 7 ? 1 : 0.35 }} />
          ))}
        </div>
      </div>
    ),
  },
  {
    kind: "copywriter",
    label: "Kopirayter · Tarjimon",
    title: "Bir haftalik postlar",
    body: (
      <div className="flex items-end justify-between gap-4">
        <DotMatrix value="7" dot={7} gap={3} label="7 ta post" />
        <div className="flex flex-wrap justify-end gap-1.5 text-[12px]">
          {["Lotin", "Кирилл", "Рус", "Eng"].map((s) => (
            <span key={s} className="rounded-full bg-black/35 px-2.5 py-1 font-semibold text-fog">
              {s}
            </span>
          ))}
        </div>
      </div>
    ),
  },
  {
    kind: "radar",
    label: "Mijoz radar",
    title: "Mijozlaringiz qayerda",
    body: (
      <div className="flex items-end justify-between gap-4">
        <DotMatrix value="10" dot={6} gap={3} label="10 ta joy" />
        <ul className="space-y-1 text-right text-[12px] text-white/80">
          <li>Onalar guruhi</li>
          <li>Chegirma kanali</li>
          <li>Uzum Market</li>
        </ul>
      </div>
    ),
  },
  {
    kind: "video",
    label: "Videograf",
    title: "Reels ssenariysi",
    body: (
      <div className="flex items-end justify-between gap-4">
        <DotMatrix value="0:15" dot={6} gap={3} label="15 soniya" />
        <p className="max-w-[11rem] text-right text-[13px] leading-snug text-white/85">«Bitta palto — uch xil obraz»</p>
      </div>
    ),
  },
];

const PEEK = 50; // visible header height of a card behind the front one
const CARD_H = 250;

export function HeroDeck() {
  const reduce = useReducedMotion();
  const [order, setOrder] = useState<number[]>(CARDS.map((_, i) => i));
  const [ready, setReady] = useState(false);
  const seconds = useCountUp(ready ? 58 : 0, 2600);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), reduce ? 0 : 350);
    return () => clearTimeout(t);
  }, [reduce]);

  useEffect(() => {
    if (reduce || !ready) return;
    const id = setInterval(() => setOrder((o) => [...o.slice(1), o[0]]), 3200);
    return () => clearInterval(id);
  }, [reduce, ready]);

  const bringToFront = (idx: number) => setOrder((o) => [...o.filter((x) => x !== idx), idx]);
  const n = CARDS.length;

  return (
    <div className="relative mx-auto w-full max-w-[440px]">
      <div className="mb-4 flex items-center justify-between">
        <span className="mono-label">Bo&apos;lim ishlayapti</span>
        <span className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${seconds >= 58 ? "bg-ok" : "uslub-breathe bg-lime"}`} aria-hidden />
          <DotMatrix value={`0:${String(Math.round(seconds)).padStart(2, "0")}`} dot={3} gap={1.5} label="60 soniyadan kam" />
        </span>
      </div>
      <div className="relative" style={{ height: PEEK * (n - 1) + CARD_H, perspective: 1400 }}>
        {CARDS.map((c, idx) => {
          const pos = order.indexOf(idx); // 0 = back, n-1 = front
          const depth = n - 1 - pos;
          const [a, b] = GRAD[c.kind];
          const front = depth === 0;
          return (
            <motion.button
              key={c.kind}
              type="button"
              onClick={() => bringToFront(idx)}
              aria-label={`${c.title} kartasini oldinga chiqarish`}
              initial={reduce ? false : { y: 120 + idx * 8, rotateX: -28, scale: 0.86 }}
              animate={
                ready || reduce
                  ? { y: pos * PEEK, rotateX: front ? 0 : -6, scale: 1 - depth * 0.035 }
                  : { y: 120 + idx * 8, rotateX: -28, scale: 0.86 }
              }
              transition={{ type: "spring", stiffness: 170, damping: 22, delay: ready && !reduce ? 0 : 0 }}
              style={{
                zIndex: pos,
                height: CARD_H,
                transformOrigin: "50% 0%",
                background: `radial-gradient(140% 95% at 50% 0%, ${a} 0%, ${b} 42%, ${b}00 88%), #0c0c0f`,
                boxShadow: front
                  ? `inset 0 0 0 1px rgba(255,255,255,.14), 0 30px 80px -30px ${b}`
                  : "inset 0 0 0 1px rgba(255,255,255,.1), 0 -8px 30px -12px rgba(0,0,0,.8)",
              }}
              className="absolute inset-x-0 top-0 flex flex-col overflow-hidden rounded-[32px] px-5 pb-5 pt-3.5 text-left"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-[15px] font-bold text-[#0b0b0e]">{c.title}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#0b0b0e]/65">{c.label}</span>
              </span>
              <span className={`mt-auto block transition-opacity duration-300 ${front ? "opacity-100" : "opacity-0"}`}>
                <span className="mb-4 flex">
                  <Orb kind={c.kind} size={34} glow />
                </span>
                {c.body}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
