"use client";

import type { BrandDNA, RadarLead, VideoPlan } from "@/lib/uslub/contract";
import { CalendarDays, Globe, MapPin, MessagesSquare, MonitorPlay, Send, ShoppingBag, Sparkles, Store, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export function DnaCard({ dna, compact = false }: { dna: BrandDNA; compact?: boolean }) {
  const rows: [string, string][] = [
    ["Ohang", dna.tone],
    ["Murojaat", dna.address === "siz" ? "«Siz»" : dna.address === "sen" ? "«Sen»" : "Aralash"],
    ["Emoji", { none: "Yo'q", low: "Kam (1–2)", medium: "O'rtacha", high: "Ko'p" }[dna.emojiDensity]],
    ["Post uzunligi", `~${dna.avgPostLength} belgi`],
    ["Chaqiriq (CTA)", dna.ctaStyle],
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-sand bg-white">
      <div className="girih flex items-end justify-between gap-3 bg-lapis-soft px-4 py-3">
        <div>
          <div className="font-display text-[18px] font-semibold">{dna.name}</div>
          <div className="text-[13px] text-stone">{dna.oneLiner}</div>
        </div>
        <span className="rounded-full bg-lapis px-2.5 py-1 text-[11px] font-bold text-white">Brend DNK</span>
      </div>
      <dl className="divide-y divide-sand text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[110px_1fr] gap-3 px-4 py-2">
            <dt className="text-stone">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
        {!compact && (
          <>
            <div className="grid grid-cols-[110px_1fr] gap-3 px-4 py-2">
              <dt className="text-stone">Auditoriya</dt>
              <dd className="font-medium">{dna.audience}</dd>
            </div>
            <div className="grid grid-cols-[110px_1fr] gap-3 px-4 py-2">
              <dt className="text-stone">Formatlar</dt>
              <dd className="flex flex-wrap gap-1">
                {dna.recurringFormats.map((f) => (
                  <span key={f} className="rounded-md bg-shell px-2 py-0.5">{f}</span>
                ))}
              </dd>
            </div>
            <div className="grid grid-cols-[110px_1fr] gap-3 px-4 py-2">
              <dt className="text-stone">Heshteglar</dt>
              <dd className="text-lapis">{dna.hashtags.join(" ")}</dd>
            </div>
            <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 font-bold text-turq">Qiling</div>
                <ul className="list-inside list-disc space-y-0.5">{dna.doList.map((d) => <li key={d}>{d}</li>)}</ul>
              </div>
              <div>
                <div className="mb-1 font-bold text-clay">Qilmang</div>
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
    <ul className="divide-y divide-sand overflow-hidden rounded-2xl border border-sand bg-white">
      {leads.slice(0, limit ?? leads.length).map((l, i) => {
        const Icon = LEAD_ICON[l.kind] ?? Store;
        return (
          <li key={i} className="grid grid-cols-[36px_1fr] gap-3 px-4 py-3 sm:grid-cols-[36px_1fr_minmax(0,240px)]">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-clay-soft text-clay">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="text-[14px] font-bold">
                {l.url ? <a className="underline decoration-sand underline-offset-4 hover:decoration-ink" href={l.url} target="_blank" rel="noreferrer">{l.name}</a> : l.name}
              </div>
              <div className="text-[12px] text-stone">{LEAD_KIND[l.kind]}{l.audienceHint ? `, ${l.audienceHint}` : ""}</div>
              <p className="mt-1 text-[13px]">{l.why}</p>
            </div>
            <div className="col-start-2 rounded-xl bg-saffron-soft px-3 py-2 text-[13px] sm:col-start-3 sm:self-start">
              <span className="font-bold">Qadam: </span>
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
        <div className="girih-night relative aspect-[9/16] overflow-hidden rounded-[22px] border-4 border-ink bg-night text-white">
          {plan.videoUrl ? (
            <video src={plan.videoUrl} controls playsInline className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col justify-between p-4">
              <span className="self-start rounded-full bg-white/10 px-2 py-0.5 text-[10px]">Render tez kunda</span>
              <p className="font-display text-[17px] font-semibold leading-snug">{plan.hook}</p>
              <span className="text-[11px] text-white/60">{total} soniya · 9:16</span>
            </div>
          )}
        </div>
      </div>
      <div>
        <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-shell" aria-hidden>
          {plan.scenes.map((s, i) => (
            <span key={i} style={{ flexGrow: s.seconds }} className={i % 2 ? "bg-lapis/70" : "bg-lapis"} />
          ))}
        </div>
        <ol className="space-y-2">
          {plan.scenes.map((s, i) => {
            const from = starts[i];
            const to = from + s.seconds;
            return (
              <li key={i} className="grid grid-cols-[64px_1fr] gap-3 rounded-xl border border-sand bg-white px-3 py-2.5">
                <span className="text-[12px] font-bold tabular-nums text-lapis">
                  {from}–{to} s
                </span>
                <div className="text-[13px]">
                  <div className="font-semibold">{s.visual}</div>
                  <div className="text-stone">Ovoz: «{s.voiceover}»</div>
                  <div className="mt-1 inline-block rounded bg-ink px-1.5 py-0.5 text-[11px] font-bold text-white">{s.caption}</div>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 flex items-center gap-1.5 text-[13px] text-stone">
          <Sparkles className="h-4 w-4 text-saffron" /> Musiqa: {plan.musicMood}
        </p>
      </div>
    </div>
  );
}
