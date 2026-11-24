"use client";

import type { Goal, PlanItem } from "@/lib/uslub/contract";
import { ChevronLeft, ChevronRight, LayoutList, Layers, Loader2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { CountMatrix } from "../uslub/DotMatrix";
import { GlowCard } from "../uslub/GlowCard";
import { Orb } from "../uslub/Orb";
import { GRAD } from "../uslub/agents";
import * as api from "./api";
import { useStudio } from "./store";

const GOAL: Record<Goal, { name: string; grad: [string, string]; chip: string }> = {
  reach: { name: "Qamrov", grad: GRAD.strategist, chip: "bg-cobalt/20 text-[#a9b8ff]" },
  trust: { name: "Ishonch", grad: GRAD.brand, chip: "bg-cream/15 text-cream" },
  sale: { name: "Sotuv", grad: GRAD.analyst, chip: "bg-lime/15 text-lime" },
};
const DAY = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];

function dayName(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  return Number.isNaN(d.getTime()) ? iso : DAY[d.getUTCDay()];
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[28px] bg-surface p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,.07)] sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-bold">{title}</h2>
        {hint && <span className="mono-label">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function ApprovalChip({ needs }: { needs: boolean }) {
  return needs ? (
    <span className="rounded-full bg-wait px-2.5 py-0.5 text-[11px] font-bold text-void">Tasdiq kerak</span>
  ) : (
    <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-bold text-fog">Avtopilot (beta)</span>
  );
}

function PlanCard({ item }: { item: PlanItem }) {
  const g = GOAL[item.goal];
  return (
    <GlowCard from={g.grad[0]} to={g.grad[1]} strength={0.9} className="flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[20px] font-bold leading-tight">{dayName(item.day)}</div>
          <div className="font-mono text-[13px] text-fog/80">
            {item.time} · {item.format}
          </div>
        </div>
        <ApprovalChip needs={item.needsApproval} />
      </div>
      <p className="mt-auto text-[19px] font-semibold leading-snug">{item.hook}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px]">
        <span className={`rounded-full px-2 py-0.5 font-bold ${g.chip}`}>{g.name}</span>
        <span className="rounded-full bg-black/30 px-2 py-0.5">{item.pillar}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-black/35 p-3 text-[12px]">
        <div>
          <div className="mono-label !text-[10px] !text-fog/60">Chaqiriq</div>
          <div className="font-semibold">{item.cta}</div>
        </div>
        <div>
          <div className="mono-label !text-[10px] !text-fog/60">O&apos;lchov</div>
          <div className="font-semibold">{item.metric}</div>
        </div>
      </div>
    </GlowCard>
  );
}

function PlanDeck({ items }: { items: PlanItem[] }) {
  const [i, setI] = useState(0);
  const reduce = useReducedMotion();
  const next = () => setI((v) => Math.min(items.length - 1, v + 1));
  const prev = () => setI((v) => Math.max(0, v - 1));
  return (
    <div>
      <div
        tabIndex={0}
        role="group"
        aria-roledescription="karta to'plami"
        aria-label={`${i + 1} / ${items.length}: ${items[i]?.hook ?? ""}`}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            e.preventDefault();
            next();
          }
          if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            e.preventDefault();
            prev();
          }
        }}
        className="relative mx-auto h-[400px] w-full max-w-[360px] outline-none [perspective:1200px]"
      >
        {items.map((item, n) => {
          const depth = n - i;
          if (depth < -1 || depth > 4) return null;
          const gone = depth < 0;
          return (
            <motion.div
              key={item.day + item.time + n}
              className="absolute inset-x-0 bottom-0 h-[340px] cursor-grab active:cursor-grabbing"
              style={{ zIndex: 50 - Math.abs(depth), transformOrigin: "50% 0%" }}
              initial={false}
              animate={
                gone
                  ? { y: 40, x: -60, opacity: 0, rotateX: 0, scale: 0.94 }
                  : {
                      y: -depth * 26,
                      x: 0,
                      scale: 1 - depth * 0.055,
                      rotateX: depth === 0 ? 0 : 10,
                      opacity: depth > 3 ? 0 : 1 - depth * 0.12,
                      filter: depth === 0 ? "brightness(1)" : `brightness(${1 - depth * 0.15})`,
                    }
              }
              transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 28 }}
              drag={depth === 0 ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.6}
              onDragEnd={(_, info) => {
                if (info.offset.x < -60) next();
                else if (info.offset.x > 60) prev();
              }}
              onClick={() => depth === 0 && next()}
              aria-hidden={depth !== 0}
            >
              <PlanCard item={item} />
            </motion.div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-center gap-3">
        <button type="button" onClick={prev} disabled={i === 0} aria-label="Oldingi" className="pill-ghost h-10 w-10 disabled:opacity-30">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex gap-1.5" aria-hidden>
          {items.map((it, n) => (
            <span
              key={n}
              className={`h-1.5 rounded-full transition-all ${n === i ? "w-5 bg-fog" : it.needsApproval ? "w-1.5 bg-wait/70" : "w-1.5 bg-white/25"}`}
            />
          ))}
        </div>
        <button type="button" onClick={next} disabled={i === items.length - 1} aria-label="Keyingi" className="pill-ghost h-10 w-10 disabled:opacity-30">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function StrategyView() {
  const strategy = useStudio((s) => s.strategy);
  const plan = useStudio((s) => s.plan);
  const audit = useStudio((s) => s.audit);
  const brand = useStudio((s) => s.brand);
  const source = useStudio((s) => s.sources.strategy);
  const reduce = useReducedMotion();
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState(false);

  const load = async () => {
    setBusy(true);
    const r = await api.buildStrategy(brand.id, audit ?? undefined);
    useStudio.setState({
      strategy: r.data.strategy,
      plan: r.data.plan,
      sources: { ...useStudio.getState().sources, strategy: r.source },
    });
    setBusy(false);
  };

  if (!strategy) {
    return (
      <div className="mx-auto max-w-xl py-10 text-center">
        <Orb kind="strategist" size={84} glow className="mx-auto" />
        <h1 className="mt-6 text-[28px] font-semibold tracking-tight">Strategiya</h1>
        <p className="mx-auto mt-2 max-w-md text-[15px] text-mute">
          Strateg brend xotirasi va kanal tahlilidan pozitsiya, auditoriya, kontent ustunlari va haftalik reja tuzadi.
        </p>
        <button type="button" onClick={load} disabled={busy} className="pill-lime mt-6 px-6 py-3 text-[15px]">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? "Tuzilmoqda…" : "Strategiya tuzish"}
        </button>
      </div>
    );
  }

  const live = source === "live";
  const goalMix = (["reach", "trust", "sale"] as Goal[]).map((g) => ({
    g,
    share: strategy.pillars.filter((p) => p.goal === g).reduce((a, p) => a + p.share, 0),
  }));
  const totalShare = Math.max(0.0001, goalMix.reduce((a, x) => a + x.share, 0));
  const needCount = plan?.items.filter((x) => x.needsApproval).length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <Orb kind="strategist" size={44} glow />
          <div>
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-[32px]">Strategiya</h1>
            <p className="mono-label mt-1">{brand.dna.name} · brend xotirasi va tahlil asosida</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider ${live ? "bg-ok/15 text-ok" : "bg-surface-3 text-mute"}`}>
            {live ? "Jonli ma'lumot" : "Namuna ma'lumot"}
          </span>
          <button type="button" onClick={load} disabled={busy} className="pill-ghost px-4 py-2 text-[13px]">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Qayta tuzish
          </button>
        </div>
      </div>

      <GlowCard from={GRAD.brand[0]} to={GRAD.brand[1]} strength={0.85} className="p-5 sm:p-7">
        <span className="mono-label !text-fog/80">Pozitsiya</span>
        <p className="mt-3 max-w-3xl text-[19px] font-semibold leading-snug sm:text-[24px]">{strategy.positioning}</p>
      </GlowCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Auditoriya" hint={`${strategy.audiences.length} guruh`}>
          <ul className="flex flex-col gap-2">
            {strategy.audiences.map((a) => (
              <li key={a.name} className="rounded-2xl bg-surface-2 p-4 text-[13px]">
                <div className="text-[15px] font-bold">{a.name}</div>
                <p className="mt-1 text-mute">{a.job}</p>
                <dl className="mt-3 grid gap-2 sm:grid-cols-3">
                  {[
                    ["Og'riq", a.pains],
                    ["Turtki", a.triggers],
                    ["Qayerda", a.whereTheyAre],
                  ].map(([k, v]) => (
                    <div key={k as string}>
                      <dt className="mono-label !text-[10px]">{k as string}</dt>
                      <dd className="mt-1 flex flex-wrap gap-1">
                        {(v as string[]).map((x) => (
                          <span key={x} className="rounded-md bg-surface-3 px-1.5 py-0.5">{x}</span>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </Section>

        <div className="flex flex-col gap-4">
          <Section title="Taklif">
            <p className="text-[15px] font-semibold leading-snug">{strategy.offer}</p>
            <div className="mono-label mb-1.5 mt-4">Dalillar</div>
            <ul className="flex flex-wrap gap-1.5 text-[13px]">
              {strategy.proofPoints.map((p) => (
                <li key={p} className="rounded-full bg-surface-2 px-3 py-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">{p}</li>
              ))}
            </ul>
          </Section>
          <Section title="Xavflar">
            <ul className="flex flex-col gap-1.5 text-[13px]">
              {strategy.risks.map((r) => (
                <li key={r} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-coral" />
                  {r}
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>

      <Section title="Kontent ustunlari" hint="Maqsadlar aralashmasi">
        <div className="flex h-3 overflow-hidden rounded-full bg-surface-3">
          {goalMix.map(({ g, share }) => (
            <motion.span
              key={g}
              initial={reduce ? false : { width: 0 }}
              animate={{ width: `${(share / totalShare) * 100}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
              style={{ background: `linear-gradient(90deg, ${GOAL[g].grad[0]}, ${GOAL[g].grad[1]})` }}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[12px]">
          {goalMix.map(({ g, share }) => (
            <span key={g} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: GOAL[g].grad[0] }} />
              {GOAL[g].name} <span className="font-mono text-mute">{Math.round((share / totalShare) * 100)}%</span>
            </span>
          ))}
        </div>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {strategy.pillars.map((p) => (
            <li key={p.name} className="rounded-2xl bg-surface-2 p-3.5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[14px] font-bold">{p.name}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${GOAL[p.goal].chip}`}>{GOAL[p.goal].name}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                  <span className="block h-full rounded-full" style={{ width: `${p.share * 100}%`, background: GOAL[p.goal].grad[0] }} />
                </span>
                <span className="font-mono text-[12px] text-mute">{Math.round(p.share * 100)}%</span>
              </div>
              {p.examples[0] && <p className="mt-2 text-[12px] text-mute">Masalan: {p.examples[0]}</p>}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Maqsadlar (KPI)">
        <ul className="grid gap-2 sm:grid-cols-3">
          {strategy.kpis.map((k) => {
            const pct = k.target > 0 && k.target < 1;
            return (
              <li key={k.metric} className="rounded-2xl bg-surface-2 p-4">
                <div className="mono-label">{k.metric}</div>
                <div className="mt-3 flex items-end gap-2">
                  <CountMatrix to={pct ? Math.round(k.target * 100) : k.target} suffix={pct ? "%" : ""} dot={4} gap={1.5} color="#D7FF3A" />
                </div>
                {k.baseline !== undefined && (
                  <div className="mt-2 font-mono text-[12px] text-mute">
                    hozir {pct ? `${Math.round(k.baseline * 100)}%` : k.baseline.toLocaleString("ru-RU")} → maqsad
                  </div>
                )}
                <p className="mt-2 text-[13px]">{k.how}</p>
              </li>
            );
          })}
        </ul>
      </Section>

      {plan && (
        <Section title="Haftalik reja" hint={`${plan.items.length} post · ${needCount} tasi tasdiq bilan`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="max-w-xl text-[13px] text-mute">{plan.rationale}</p>
            <div role="tablist" aria-label="Ko'rinish" className="flex shrink-0 gap-1 rounded-full bg-surface-2 p-1">
              <button
                type="button"
                role="tab"
                aria-selected={!list}
                onClick={() => setList(false)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold ${!list ? "bg-fog text-void" : "text-mute"}`}
              >
                <Layers className="h-3.5 w-3.5" /> Kartalar
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={list}
                onClick={() => setList(true)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold ${list ? "bg-fog text-void" : "text-mute"}`}
              >
                <LayoutList className="h-3.5 w-3.5" /> Ro&apos;yxat
              </button>
            </div>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            {list ? (
              <motion.ul key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-2">
                {plan.items.map((it, n) => (
                  <li key={n} className="grid grid-cols-[86px_1fr] items-start gap-3 rounded-2xl bg-surface-2 px-4 py-3 sm:grid-cols-[110px_1fr_auto]">
                    <div>
                      <div className="text-[13px] font-bold">{dayName(it.day)}</div>
                      <div className="font-mono text-[12px] text-mute">{it.time}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold">{it.hook}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                        <span className={`rounded-full px-2 py-0.5 font-bold ${GOAL[it.goal].chip}`}>{GOAL[it.goal].name}</span>
                        <span className="rounded-full bg-surface-3 px-2 py-0.5">{it.format}</span>
                        <span className="rounded-full bg-surface-3 px-2 py-0.5">{it.cta}</span>
                      </div>
                    </div>
                    <div className="col-start-2 sm:col-start-3">
                      <ApprovalChip needs={it.needsApproval} />
                    </div>
                  </li>
                ))}
              </motion.ul>
            ) : (
              <motion.div key="deck" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <PlanDeck items={plan.items} />
              </motion.div>
            )}
          </AnimatePresence>
        </Section>
      )}
    </div>
  );
}
