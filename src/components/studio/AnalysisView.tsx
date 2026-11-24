"use client";

import type { ChannelAudit } from "@/lib/uslub/contract";
import { ExternalLink, Loader2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { CountMatrix, DotMatrix } from "../uslub/DotMatrix";
import { GlowCard } from "../uslub/GlowCard";
import { Orb } from "../uslub/Orb";
import { GRAD } from "../uslub/agents";
import * as api from "./api";
import { useStudio } from "./store";

const WEEKDAYS = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];
const FORMAT_NAME: Record<string, string> = { photo: "Rasm", album: "Albom", text: "Matn", video: "Video" };
const FORMAT_COLOR = ["#D7FF3A", "#5B7CFF", "#FF7A5C", "#E0359B", "#38E1FF"];

const FINDING: Record<ChannelAudit["findings"][number]["kind"], { name: string; cls: string }> = {
  strength: { name: "Kuchli tomon", cls: "bg-ok/15 text-ok" },
  problem: { name: "Muammo", cls: "bg-coral/15 text-coral" },
  opportunity: { name: "Imkoniyat", cls: "bg-lime/15 text-lime" },
};

function kfmt(n?: number) {
  if (n === undefined) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

function SampleChip({ live }: { live: boolean }) {
  return (
    <span className={`rounded-full px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider ${live ? "bg-ok/15 text-ok" : "bg-surface-3 text-mute"}`}>
      {live ? "Jonli ma'lumot" : "Namuna ma'lumot"}
    </span>
  );
}

function Kpi({ label, from, to, children }: { label: string; from: string; to: string; children: React.ReactNode }) {
  return (
    <GlowCard from={from} to={to} strength={0.55} className="flex min-h-[148px] flex-col justify-between p-4 sm:p-5">
      <span className="mono-label !text-fog/80">{label}</span>
      <div className="mt-4 overflow-hidden">{children}</div>
    </GlowCard>
  );
}

function KpiNumber({ to, suffix = "", decimals = 0, k = false }: { to?: number; suffix?: string; decimals?: number; k?: boolean }) {
  if (to === undefined) return <DotMatrix value="-" dot={5} />;
  if (k && to >= 1000) {
    const scaled = to / 1000;
    return <CountMatrix to={Number(scaled.toFixed(scaled >= 10 ? 0 : 1))} decimals={scaled >= 10 ? 0 : 1} suffix="k" dot={5} gap={2} />;
  }
  return <CountMatrix to={to} suffix={suffix} decimals={decimals} dot={5} gap={2} />;
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

export function AnalysisView() {
  const audit = useStudio((s) => s.audit);
  const brand = useStudio((s) => s.brand);
  const source = useStudio((s) => s.sources.audit);
  const reduce = useReducedMotion();
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    const r = await api.analyzeChannel(brand.channel ?? "");
    useStudio.setState({ audit: r.data, sources: { ...useStudio.getState().sources, audit: r.source } });
    setBusy(false);
  };

  if (!audit) {
    return (
      <div className="mx-auto max-w-xl py-10 text-center">
        <Orb kind="analyst" size={84} glow className="mx-auto" />
        <h1 className="mt-6 text-[28px] font-semibold tracking-tight">Tahlil</h1>
        <p className="mx-auto mt-2 max-w-md text-[15px] text-mute">
          Analitik kanalingizdagi so&apos;nggi postlarni o&apos;qiydi: qaysi soat, qaysi format va qaysi mavzu ko&apos;proq ko&apos;riladi, raqobatchilar
          bilan solishtiradi.
        </p>
        <button type="button" onClick={load} disabled={busy} className="pill-lime mt-6 px-6 py-3 text-[15px]">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? "Tahlil qilinmoqda…" : "Kanalni tahlil qilish"}
        </button>
        <p className="mono-label mt-4">{brand.channel}</p>
      </div>
    );
  }

  const live = source === "live";
  const [la, lb] = GRAD.analyst;
  const formats = Object.entries(audit.formatMix).sort((a, b) => b[1] - a[1]);
  const rows = [
    { channel: audit.channel, subscribers: audit.subscribers, avgViews: audit.avgViews, reachRate: audit.reachRate, postsPerWeek: audit.postsPerWeek, own: true },
    ...(audit.benchmark ?? []).map((b) => ({ ...b, own: false })),
  ];
  const maxSubs = Math.max(1, ...rows.map((r) => r.subscribers ?? 0));
  const maxViews = Math.max(1, ...rows.map((r) => r.avgViews ?? 0));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <Orb kind="analyst" size={44} glow />
          <div>
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-[32px]">Tahlil</h1>
            <p className="mono-label mt-1">
              {audit.channel} · {audit.postsAnalyzed} ta post tahlil qilindi
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SampleChip live={live} />
          <button type="button" onClick={load} disabled={busy} className="pill-ghost px-4 py-2 text-[13px]">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Qayta tahlil
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Obunachilar" from={la} to={lb}>
          <KpiNumber to={audit.subscribers} k />
        </Kpi>
        <Kpi label="O'rtacha ko'rish" from={GRAD.strategist[0]} to={GRAD.strategist[1]}>
          <KpiNumber to={audit.avgViews} k />
        </Kpi>
        <Kpi label="Qamrov" from={GRAD.copywriter[0]} to={GRAD.editor[0]}>
          <KpiNumber to={audit.reachRate !== undefined ? Math.round(audit.reachRate * 100) : undefined} suffix="%" />
        </Kpi>
        <Kpi label="Postlar / hafta" from={GRAD.translator[0]} to={GRAD.translator[1]}>
          <KpiNumber to={audit.postsPerWeek} decimals={audit.postsPerWeek % 1 ? 1 : 0} />
        </Kpi>
      </div>
      <p className="mono-label">Har bir raqam kanal ma&apos;lumotidan olinadi.</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Eng yaxshi vaqt" hint="Toshkent vaqti (UTC+5)">
          <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px]" role="img" aria-label={`Eng yaxshi soatlar: ${audit.bestHours.join(", ")}`}>
            {Array.from({ length: 24 }, (_, h) => {
              const hot = audit.bestHours.includes(h);
              return (
                <motion.span
                  key={h}
                  initial={reduce ? false : { opacity: 0, scaleY: 0.4 }}
                  animate={{ opacity: 1, scaleY: 1 }}
                  transition={{ delay: reduce ? 0 : h * 0.02 }}
                  className={`h-10 rounded-[4px] ${hot ? "bg-lime shadow-[0_0_14px_rgba(215,255,58,.6)]" : "bg-surface-3"}`}
                />
              );
            })}
          </div>
          <div className="mt-1.5 grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px]">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="text-center font-mono text-[9px] text-dim">
                {h % 3 === 0 ? h : ""}
              </span>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d, i) => {
              const on = audit.bestWeekdays.includes(i);
              return (
                <span
                  key={d}
                  className={`rounded-full px-3 py-1 font-mono text-[12px] ${on ? "bg-lime text-void" : "bg-surface-3 text-mute"}`}
                >
                  {d}
                </span>
              );
            })}
          </div>
        </Section>

        <Section title="Formatlar" hint={`${audit.postsAnalyzed} post`}>
          <div className="flex h-4 overflow-hidden rounded-full bg-surface-3">
            {formats.map(([f, share], i) => (
              <motion.span
                key={f}
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${share * 100}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 20, delay: reduce ? 0 : i * 0.08 }}
                style={{ background: FORMAT_COLOR[i % FORMAT_COLOR.length] }}
              />
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
            {formats.map(([f, share], i) => (
              <li key={f} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: FORMAT_COLOR[i % FORMAT_COLOR.length] }} />
                <span className="flex-1">{FORMAT_NAME[f] ?? f}</span>
                <span className="font-mono text-mute">{Math.round(share * 100)}%</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section title="Eng ko'p ko'rilgan postlar">
        <ul className="flex flex-col gap-2">
          {audit.topPosts.map((p, i) => (
            <li key={p.url + i} className="flex items-center gap-4 rounded-2xl bg-surface-2 px-4 py-3">
              <div className="w-[88px] shrink-0">
                {p.views !== undefined ? <DotMatrix value={kfmt(p.views)} dot={3} gap={1.5} color="#D7FF3A" /> : <span className="text-mute">—</span>}
                <div className="mono-label mt-1 !text-[9px]">ko&apos;rish</div>
              </div>
              <p className="min-w-0 flex-1 text-[14px]">{p.why}</p>
              <a href={p.url} target="_blank" rel="noreferrer" aria-label="Postni ochish" className="rounded-full p-2 text-mute hover:bg-surface-3 hover:text-fog">
                <ExternalLink className="h-4 w-4" />
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Topilmalar" hint="Har biri dalil bilan">
        <ul className="flex flex-col gap-2">
          {audit.findings.map((f, i) => (
            <li key={i} className="rounded-2xl bg-surface-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${FINDING[f.kind].cls}`}>{FINDING[f.kind].name}</span>
                <span className="text-[14px] font-semibold">{f.text}</span>
              </div>
              <span className="mt-2 inline-block rounded-lg bg-void px-2.5 py-1 font-mono text-[11px] text-mute shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
                {f.evidence}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {rows.length > 1 && (
        <Section title="Raqobatchilar bilan solishtirish">
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[480px] text-left text-[13px]">
              <thead>
                <tr className="mono-label">
                  <th className="py-2 pr-3 font-normal">Kanal</th>
                  <th className="py-2 pr-3 font-normal">Obunachi</th>
                  <th className="py-2 pr-3 font-normal">O&apos;rt. ko&apos;rish</th>
                  <th className="py-2 pr-3 font-normal">Qamrov</th>
                  <th className="py-2 font-normal">Post/hafta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {rows.map((r) => (
                  <tr key={r.channel} className={r.own ? "text-fog" : "text-fog/80"}>
                    <td className="py-2.5 pr-3 font-semibold">
                      {r.channel}
                      {r.own && <span className="ml-2 rounded-full bg-lime px-1.5 py-0.5 text-[10px] font-bold text-void">Siz</span>}
                    </td>
                    <td className="py-2.5 pr-3">
                      <Bar value={r.subscribers} max={maxSubs} own={r.own} label={kfmt(r.subscribers)} />
                    </td>
                    <td className="py-2.5 pr-3">
                      <Bar value={r.avgViews} max={maxViews} own={r.own} label={kfmt(r.avgViews)} />
                    </td>
                    <td className="py-2.5 pr-3 font-mono">{r.reachRate !== undefined ? `${Math.round(r.reachRate * 100)}%` : "—"}</td>
                    <td className="py-2.5 font-mono">{r.postsPerWeek}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}

function Bar({ value, max, own, label }: { value?: number; max: number; own: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
        <span className={`block h-full rounded-full ${own ? "bg-lime" : "bg-mute"}`} style={{ width: `${((value ?? 0) / max) * 100}%` }} />
      </span>
      <span className="font-mono">{label}</span>
    </div>
  );
}
