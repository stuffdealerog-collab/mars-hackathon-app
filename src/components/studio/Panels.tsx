"use client";

import type { BrandDNA, RadarLead, VideoPlan } from "@/lib/uslub/contract";
import { CalendarDays, Globe, MapPin, MessagesSquare, MonitorPlay, Send, ShoppingBag, Sparkles, Store, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DotMatrix } from "../uslub/DotMatrix";
import { Orb } from "../uslub/Orb";

export function DnaCard({ dna, compact = false }: { dna: BrandDNA; compact?: boolean }) {
  const rows: [string, string][] = [
    ["Ohang", dna.tone],
    ["Murojaat", dna.address === "siz" ? "«Siz»" : dna.address === "sen" ? "«Sen»" : "Aralash"],
    ["Emoji", { none: "Yo'q", low: "Kam (1–2)", medium: "O'rtacha", high: "Ko'p" }[dna.emojiDensity]],
    ["Post uzunligi", `~${dna.avgPostLength} belgi`],
    ["Chaqiriq (CTA)", dna.ctaStyle],
  ];
  return (
    <div className="overflow-hidden rounded-[32px] bg-surface-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
      <div className="flex items-end justify-between gap-3 px-5 pb-4 pt-6" style={{ background: "radial-gradient(120% 140% at 50% 0%, #FBE3C2f0 0%, #E98A5Eb0 40%, #E98A5E00 80%)" }}>
        <div>
          <div className="text-[22px] font-bold tracking-tight text-void">{dna.name}</div>
          <div className="text-[13px] text-void/70">{dna.oneLiner}</div>
        </div>
        <span className="rounded-full bg-void px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-cream">Brend DNK</span>
      </div>
      <dl className="divide-y divide-edge text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[110px_1fr] gap-3 px-4 py-2">
            <dt className="mono-label pt-0.5">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
        {!compact && (
          <>
            <div className="grid grid-cols-[110px_1fr] gap-3 px-4 py-2">
              <dt className="mono-label pt-0.5">Auditoriya</dt>
              <dd className="font-medium">{dna.audience}</dd>
            </div>
            <div className="grid grid-cols-[110px_1fr] gap-3 px-4 py-2">
              <dt className="mono-label pt-0.5">Formatlar</dt>
              <dd className="flex flex-wrap gap-1">
                {dna.recurringFormats.map((f) => (
                  <span key={f} className="rounded-full bg-surface-3 px-2.5 py-0.5">{f}</span>
                ))}
              </dd>
            </div>
            <div className="grid grid-cols-[110px_1fr] gap-3 px-4 py-2">
              <dt className="mono-label pt-0.5">Heshteglar</dt>
              <dd className="text-lime">{dna.hashtags.join(" ")}</dd>
            </div>
            <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 font-bold text-ok">Qiling</div>
                <ul className="list-inside list-disc space-y-0.5">{dna.doList.map((d) => <li key={d}>{d}</li>)}</ul>
              </div>
              <div>
                <div className="mb-1 font-bold text-coral">Qilmang</div>
                <ul className="list-inside list-disc space-y-0.5">{dna.dontList.map((d) => <li key={d}>{d}</li>)}</ul>
              </div>
            </div>
          </>
        )}
      </dl>
    </div>
  );
}

const LEAD_ICON: Record<RadarLead["kind"], LucideIcon> = {
  telegram_channel: Send,
  telegram_group: MessagesSquare,
  instagram: Users,
  youtube: MonitorPlay,
  event: CalendarDays,
  marketplace: ShoppingBag,
  website: MapPin,
  other: Globe,
};
const LEAD_KIND: Record<RadarLead["kind"], string> = {
  telegram_channel: "Telegram kanal",
  telegram_group: "Telegram guruh",
  instagram: "Instagram",
  youtube: "YouTube",
  event: "Tadbir",
  marketplace: "Marketpleys",
  website: "Sayt / xarita",
  other: "Boshqa",
};

export function LeadList({ leads, limit }: { leads: RadarLead[]; limit?: number }) {
  return (
    <ul className="divide-y divide-edge overflow-hidden rounded-[28px] bg-surface-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
      {leads.slice(0, limit ?? leads.length).map((l, i) => {
        const Icon = LEAD_ICON[l.kind] ?? Store;
        return (
          <li key={i} className="grid grid-cols-[36px_1fr] gap-3 px-4 py-3 sm:grid-cols-[36px_1fr_minmax(0,240px)]">
            <span className="relative grid h-9 w-9 place-items-center"><Orb kind="radar" size={36} icon={false} className="absolute inset-0" /><Icon className="relative h-4 w-4 text-white" /></span>
            <div className="min-w-0">
              <div className="text-[14px] font-bold">
                {l.url ? <a className="underline decoration-white/30 underline-offset-4 hover:decoration-lime" href={l.url} target="_blank" rel="noreferrer">{l.name}</a> : l.name}
              </div>
              <div className="mono-label mt-0.5">{LEAD_KIND[l.kind]}{l.audienceHint ? `, ${l.audienceHint}` : ""}</div>
              <p className="mt-1 text-[13px]">{l.why}</p>
            </div>
            <div className="col-start-2 rounded-2xl bg-lime/10 px-3 py-2 text-[13px] text-fog shadow-[inset_0_0_0_1px_rgba(215,255,58,.25)] sm:col-start-3 sm:self-start">
              <span className="font-bold text-lime">Qadam: </span>
              {l.action}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function Storyboard({ plan }: { plan: VideoPlan }) {
  const total = plan.scenes.reduce((s, x) => s + x.seconds, 0);
  const starts = plan.scenes.map((_, i) => plan.scenes.slice(0, i).reduce((a, x) => a + x.seconds, 0));
  return (
    <div className="grid gap-5 md:grid-cols-[220px_1fr]">
      <div className="mx-auto w-[200px] md:mx-0">
        <div className="relative aspect-[9/16] overflow-hidden rounded-[32px] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.12),0_30px_80px_-20px_rgba(255,45,85,.45)]" style={{ background: "radial-gradient(120% 70% at 50% 0%, #FF9F1Cf0 0%, #FF2D55b0 40%, #FF2D5500 80%), #0c0c0f" }}>
          {plan.videoUrl ? (
            <video src={plan.videoUrl} controls playsInline className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col justify-between p-4">
              <span className="self-start rounded-full bg-surface-2/10 px-2 py-0.5 text-[10px]">Render tez kunda</span>
              <p className="text-[19px] font-bold leading-snug tracking-tight">{plan.hook}</p>
              <span className="flex items-end gap-2"><DotMatrix value={`${total}`} dot={3} gap={1.5} /><span className="font-mono text-[10px] uppercase text-white/70">soniya, 9:16</span></span>
            </div>
          )}
        </div>
      </div>
      <div>
        <div className="mb-3 flex h-2 gap-1 overflow-hidden rounded-full" aria-hidden>
          {plan.scenes.map((s, i) => (
            <span key={i} style={{ flexGrow: s.seconds, background: i % 2 ? "#FF2D55" : "#FF9F1C" }} className="rounded-full" />
          ))}
        </div>
        <ol className="space-y-2">
          {plan.scenes.map((s, i) => {
            const from = starts[i];
            const to = from + s.seconds;
            return (
              <li key={i} className="grid grid-cols-[64px_1fr] gap-3 rounded-[22px] bg-surface-2 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,.07)]">
                <span className="font-mono text-[12px] font-bold tabular-nums text-lime">
                  {from}–{to} s
                </span>
                <div className="text-[13px]">
                  <div className="font-semibold">{s.visual}</div>
                  <div className="text-mute">Ovoz: «{s.voiceover}»</div>
                  <div className="mt-1.5 inline-block rounded-full bg-fog px-2 py-0.5 text-[11px] font-bold text-void">{s.caption}</div>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 flex items-center gap-1.5 text-[13px] text-mute">
          <Sparkles className="h-4 w-4 text-wait" /> Musiqa: {plan.musicMood}
        </p>
      </div>
    </div>
  );
}
