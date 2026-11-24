"use client";

import type { Goal, PlanItem } from "@/lib/uslub/contract";
import { Hourglass, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { MOCK_AUDIT, MOCK_PLAN, MOCK_STRATEGY } from "../studio/brain-mocks";
import { CountMatrix } from "../uslub/DotMatrix";
import { GlowCard } from "../uslub/GlowCard";
import { GRAD } from "../uslub/agents";

const GOAL: Record<Goal, { name: string; color: string }> = {
  reach: { name: "Qamrov", color: "#5B7CFF" },
  trust: { name: "Ishonch", color: "#FF7AC6" },
  sale: { name: "Sotuv", color: "#D7FF3A" },
};

const FIND: Record<"strength" | "problem" | "opportunity", { name: string; color: string }> = {
  strength: { name: "Kuchli tomon", color: "#3be08a" },
  problem: { name: "Muammo", color: "#ff6b5b" },
  opportunity: { name: "Imkoniyat", color: "#d7ff3a" },
};

const WEEKDAY = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];

function Kpi({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[22px] bg-black/45 p-3.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.07)]">
      <div className="mono-label">{label}</div>
      <div className="mt-2.5 min-h-[34px]">{children}</div>
    </div>
  );
}

export function AuditWidget() {
  const a = MOCK_AUDIT;
  const [g1, g2] = GRAD.analyst;
  const hours = Array.from({ length: 16 }, (_, i) => i + 8);
  return (
    <GlowCard from={g1} to={g2} strength={0.5} className="p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[20px] font-bold tracking-tight">Tahlil</h3>
        <span className="mono-label text-fog/70">{a.channel} · {a.postsAnalyzed} post</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <Kpi label="Obunachi">
          <CountMatrix to={a.subscribers ?? 0} dot={3.4} gap={1.6} />
        </Kpi>
        <Kpi label="O'rtacha ko'rish">
          <CountMatrix to={a.avgViews ?? 0} dot={3.4} gap={1.6} />
        </Kpi>
        <Kpi label="Qamrov">
          <CountMatrix to={Math.round((a.reachRate ?? 0) * 100)} suffix="%" dot={3.4} gap={1.6} color="#D7FF3A" />
        </Kpi>
        <Kpi label="Post / hafta">
          <CountMatrix to={a.postsPerWeek} decimals={1} dot={3.4} gap={1.6} />
        </Kpi>
      </div>

      <div className="mt-4">
        <div className="mono-label">Eng yaxshi soatlar</div>
        <div className="mt-2 flex gap-[3px]" role="img" aria-label={`Eng yaxshi soatlar: ${a.bestHours.join(", ")}`}>
          {hours.map((h) => {
            const best = a.bestHours.includes(h);
            return (
              <div key={h} className="flex flex-1 flex-col items-center gap-1">
                <span
                  className="h-7 w-full rounded-[5px]"
                  style={{ background: best ? "#D7FF3A" : "rgba(255,255,255,.08)", boxShadow: best ? "0 0 14px rgba(215,255,58,.5)" : undefined }}
                />
                <span className={`font-mono text-[9px] ${best ? "text-fog" : "text-dim"}`}>{h}</span>
              </div>
            );
          })}
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {a.findings.slice(0, 3).map((f) => (
          <li key={f.text} className="rounded-[18px] bg-black/40 px-3.5 py-2.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]">
            <div className="flex items-start gap-2.5">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: FIND[f.kind].color }} aria-hidden />
              <div className="min-w-0">
                <p className="text-[14px] leading-snug">
                  <span className="sr-only">{FIND[f.kind].name}: </span>
                  {f.text}
                </p>
                <span className="mt-1.5 inline-block rounded-full bg-white/8 px-2 py-0.5 font-mono text-[10.5px] text-fog/75">
                  dalil: {f.evidence}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 overflow-x-auto">
        <div className="mono-label mb-1.5">Raqobatchilar bilan</div>
        <table className="w-full min-w-[360px] text-left text-[12.5px]">
          <thead className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
            <tr>
              <th className="py-1 font-normal">Kanal</th>
              <th className="py-1 text-right font-normal">Obunachi</th>
              <th className="py-1 text-right font-normal">Ko&apos;rish</th>
              <th className="py-1 text-right font-normal">Qamrov</th>
              <th className="py-1 text-right font-normal">Post/hafta</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {[{ channel: a.channel, subscribers: a.subscribers, avgViews: a.avgViews, reachRate: a.reachRate, postsPerWeek: a.postsPerWeek }, ...(a.benchmark ?? [])].map((b, i) => (
              <tr key={b.channel} className={`border-t border-white/8 ${i === 0 ? "font-bold text-fog" : "text-fog/80"}`}>
                <td className="py-1.5">{b.channel}</td>
                <td className="py-1.5 text-right">{b.subscribers?.toLocaleString("ru-RU") ?? "—"}</td>
                <td className="py-1.5 text-right">{b.avgViews?.toLocaleString("ru-RU") ?? "—"}</td>
                <td className="py-1.5 text-right">{b.reachRate !== undefined ? `${Math.round(b.reachRate * 100)}%` : "—"}</td>
                <td className="py-1.5 text-right">{b.postsPerWeek}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlowCard>
  );
}

function PlanCard({ item }: { item: PlanItem }) {
  const wd = WEEKDAY[(new Date(item.day + "T00:00:00Z").getUTCDay() + 6) % 7];
  const g = GOAL[item.goal];
  return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[12px] text-fog/80">
          {wd} · {item.time} · {item.format}
        </span>
        <span className="rounded-full px-2 py-0.5 font-mono text-[10.5px] font-bold text-black" style={{ background: g.color }}>
          {g.name}
        </span>
      </div>
      <p className="mt-3 text-[19px] font-bold leading-snug tracking-tight">{item.hook}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-fog/75">
        <span>{item.pillar}</span>
        {item.needsApproval ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-wait/15 px-2 py-0.5 font-semibold text-wait">
            <Hourglass className="h-3 w-3" /> Tasdiq kerak
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-ok/15 px-2 py-0.5 font-semibold text-ok">
            <ShieldCheck className="h-3 w-3" /> Avtopilot (beta)
          </span>
        )}
      </div>
    </div>
  );
}

/** Weekly plan as a stacked deck: the top card flips to the back on tap. */
export function PlanDeck() {
  const items = MOCK_PLAN.items;
  const [top, setTop] = useState(0);
  const reduce = useReducedMotion();
  const order = items.map((_, i) => (top + i) % items.length);
  const shown = order.slice(0, 4);
  return (
    <div>
      <div className="relative h-[230px]" style={{ perspective: 900 }}>
        <AnimatePresence initial={false}>
          {shown
            .map((idx, depth) => ({ idx, depth }))
            .reverse()
            .map(({ idx, depth }) => {
              const it = items[idx];
              const [c1, c2] = it.goal === "sale" ? GRAD.analyst : it.goal === "trust" ? GRAD.designer : GRAD.strategist;
              return (
                <motion.button
                  key={idx}
                  type="button"
                  onClick={() => depth === 0 && setTop((t) => (t + 1) % items.length)}
                  aria-label={depth === 0 ? "Keyingi karta" : undefined}
                  tabIndex={depth === 0 ? 0 : -1}
                  initial={reduce ? false : { opacity: 0, y: 40, scale: 0.9 }}
                  animate={{ opacity: 1 - depth * 0.18, y: depth * -16, scale: 1 - depth * 0.05, rotateX: depth * 4 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: 70, scale: 1.02, rotateX: -14 }}
                  transition={{ type: "spring", stiffness: 260, damping: 26 }}
                  className="absolute inset-x-0 bottom-0 h-[190px] rounded-[32px] p-5 text-left shadow-[inset_0_0_0_1px_rgba(255,255,255,.1),0_24px_50px_-24px_rgba(0,0,0,.9)]"
                  style={{
                    zIndex: 10 - depth,
                    transformOrigin: "50% 0%",
                    background: `radial-gradient(130% 110% at 0% 0%, ${c1}d9 0%, ${c2}99 40%, ${c2}00 80%), #0c0c0f`,
                  }}
                >
                  <PlanCard item={it} />
                </motion.button>
              );
            })}
        </AnimatePresence>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="font-mono text-[11px] text-mute">
          {String(top + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")} · kartani bosing
        </span>
        <span className="font-mono text-[11px] text-wait">
          {items.filter((i) => i.needsApproval).length} ta tasdiq kerak
        </span>
      </div>
    </div>
  );
}

export function StrategyWidget() {
  const s = MOCK_STRATEGY;
  const mix = (["reach", "trust", "sale"] as Goal[]).map((g) => ({
    g,
    share: s.pillars.filter((p) => p.goal === g).reduce((a, p) => a + p.share, 0),
  }));
  const [g1, g2] = GRAD.strategist;
  return (
    <GlowCard from={g1} to={g2} strength={0.5} className="p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[20px] font-bold tracking-tight">Strategiya</h3>
        <span className="mono-label text-fog/70">hafta: {MOCK_PLAN.weekOf}</span>
      </div>
      <p className="mt-3 text-[14.5px] leading-relaxed text-fog/90">«{s.positioning}»</p>

      <div className="mt-4">
        <div className="mono-label">Maqsadlar aralashmasi</div>
        <div className="mt-2 flex h-3 overflow-hidden rounded-full" role="img" aria-label={mix.map((m) => `${GOAL[m.g].name} ${Math.round(m.share * 100)}%`).join(", ")}>
          {mix.map((m) => (
            <span key={m.g} style={{ flexGrow: m.share, background: GOAL[m.g].color }} />
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-fog/75">
          {mix.map((m) => (
            <span key={m.g} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: GOAL[m.g].color }} />
              {GOAL[m.g].name} {Math.round(m.share * 100)}%
            </span>
          ))}
        </div>
      </div>

      <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
        {s.pillars.map((p) => (
          <li key={p.name} className="flex items-center justify-between gap-2 rounded-[16px] bg-black/40 px-3 py-2 text-[13px] shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]">
            <span className="min-w-0 truncate">{p.name}</span>
            <span className="font-mono text-[11px] text-fog/70">{Math.round(p.share * 100)}%</span>
          </li>
        ))}
      </ul>

      <div className="mt-5">
        <div className="mono-label mb-2">Haftalik reja</div>
        <PlanDeck />
      </div>
    </GlowCard>
  );
}
