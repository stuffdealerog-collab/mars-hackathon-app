"use client";

import type { NodeKind } from "@/lib/uslub/contract";
import { Activity, BookOpen, Clapperboard, Clock3, Compass, Home as HomeIcon, Radar, Send, Settings2, Users, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Mark } from "../lamp/Mark";
import { AgentAvatar } from "../uslub/AgentAvatar";
import { AGENT_ORDER, AGENTS, GRAD, TG_BOT_URL } from "../uslub/agents";
import { GlowCard } from "../uslub/GlowCard";
import { Orb } from "../uslub/Orb";
import { AnalysisView } from "./AnalysisView";
import * as api from "./api";
import { STATUS_TEXT, StatusIcon } from "./FlowCanvas";
import { Home } from "./Home";
import { TEMPLATES } from "./mocks";
import { DnaCard, LeadList, Storyboard } from "./Panels";
import { PostReview } from "./PostReview";
import { StrategyView } from "./StrategyView";
import { RULES, useStudio, type RuleKey, type View } from "./store";

const NAV: { key: View; name: string; icon: typeof HomeIcon }[] = [
  { key: "delegate", name: "Bo‘lim", icon: HomeIcon },
  { key: "analysis", name: "Tahlil", icon: Activity },
  { key: "strategy", name: "Strategiya", icon: Compass },
  { key: "brand", name: "Brend xotirasi", icon: BookOpen },
  { key: "radar", name: "Mijoz radar", icon: Radar },
  { key: "video", name: "Videograf", icon: Clapperboard },
  { key: "rules", name: "Avtopilot", icon: Settings2 },
  { key: "team", name: "Jamoa", icon: Users },
];

const RULE_NAME: Record<RuleKey, string> = Object.fromEntries(RULES.map((r) => [r.key, r.name.toLowerCase()])) as Record<RuleKey, string>;

function SampleBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`rounded-full bg-white/8 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-mute ${className}`} title="Namuna ma'lumot — haqiqiy kanal ma'lumoti emas">
      namuna
    </span>
  );
}

function ReviewDrawer() {
  const reviewing = useStudio((s) => s.reviewing);
  const review = useStudio((s) => s.review);
  const posts = useStudio((s) => s.posts);
  const inbox = useStudio((s) => s.inbox);
  const setItem = useStudio((s) => s.setItem);
  const updatePost = useStudio((s) => s.updatePost);
  const brand = useStudio((s) => s.brand);
  const [note, setNote] = useState<{ text: string; href?: string } | null>(null);
  const post = posts.find((p) => p.id === reviewing);
  const item = inbox.find((i) => i.postId === reviewing);
  const inTelegram = typeof window !== "undefined" && !!api.tgInitData();
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === "Escape" && review(null);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [review]);
  return (
    <AnimatePresence>
      {post && item && (
        <motion.div
          className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => {
            review(null);
            setNote(null);
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Postni ko'rib chiqish"
            initial={{ x: 60 }}
            animate={{ x: 0 }}
            exit={{ x: 60 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="uslub flex h-full w-full max-w-[660px] flex-col overflow-y-auto p-4 shadow-[-30px_0_80px_-20px_rgba(0,0,0,.9)] sm:p-7"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5">
                  {(["copywriter", "editor", "translator"] as NodeKind[]).map((k) => (
                    <Orb key={k} kind={k} size={22} icon={false} />
                  ))}
                  <span className="mono-label ml-1">Kopirayter → Muharrir → Tarjimon</span>
                </div>
                <h2 className="mt-2 text-[24px] font-bold tracking-[-0.02em]">{post.brief}</h2>
              </div>
              <button type="button" aria-label="Yopish" onClick={() => review(null)} className="pill-ghost h-10 w-10">
                <X className="h-5 w-5" />
              </button>
            </div>
            <PostReview
              post={post}
              state={item.state}
              reasons={item.reasons.map((r) => RULE_NAME[r])}
              publishLabel={inTelegram ? "Kanalga joylash" : "Telegram orqali joylash"}
              onChange={(s, t, score) => updatePost(post.id, s, t, score)}
              onApprove={() => setItem(item.id, { state: "approved" })}
              onPublish={async (script) => {
                const r = await api.publishPost(post.id, script, brand.channel ?? "");
                if (r.ok) {
                  setItem(item.id, { state: "published", url: r.url });
                  setNote({ text: "Kanalga joylandi.", href: r.url });
                } else if (r.needsTelegram) {
                  window.open(api.BOT_PUBLISH_URL(post.id), "_blank", "noopener");
                  setNote({ text: "Xavfsizlik uchun joylash Telegram bot orqali tasdiqlanadi. Botda «E'lon qilish» ni bosing.", href: api.BOT_PUBLISH_URL(post.id) });
                } else {
                  setNote({ text: r.error ?? "Joylab bo'lmadi. Bot kanalingizda admin ekanini tekshiring.", href: "addAdminUrl" in r ? r.addAdminUrl : undefined });
                }
              }}
            />
            {note && (
              <motion.p initial={{ y: 6 }} animate={{ y: 0 }} className="mt-4 rounded-2xl bg-surface-2 px-4 py-3 text-[13px] text-fog shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
                {note.text}{" "}
                {note.href && (
                  <a href={note.href} target="_blank" rel="noreferrer" className="font-semibold text-lime underline underline-offset-4">
                    Ochish
                  </a>
                )}
              </motion.p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------ views */

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${on ? "bg-lime" : "bg-surface-3"}`}
    >
      <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 32 }} className={`absolute top-1 h-6 w-6 rounded-full shadow ${on ? "right-1 bg-void" : "left-1 bg-fog"}`} />
    </button>
  );
}

function Header({ title, sub, sample, children }: { title: string; sub?: string; sample?: boolean; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-3 text-[30px] font-bold tracking-[-0.03em] sm:text-[40px]">
          {title}
          {sample && <SampleBadge className="!text-[10px]" />}
        </h1>
        {sub && <p className="mt-1 max-w-2xl text-[14px] text-mute">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function RulesView() {
  const autopilot = useStudio((s) => s.autopilot);
  const setRule = useStudio((s) => s.setRule);
  return (
    <div className="max-w-2xl">
      <Header title="Avtopilot qoidalari" sub="Qaysi ishlar o'zi joylanadi, qaysilari sizning tasdig'ingizni kutadi." />
      <ul className="flex flex-col gap-2">
        {RULES.map((r) => (
          <li key={r.key} className="flex items-center gap-4 rounded-[24px] bg-surface px-5 py-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,.07)]">
            <div className="min-w-0 flex-1">
              <div className="font-bold">{r.name}</div>
              <div className="text-[13px] text-mute">{r.hint}</div>
            </div>
            <span className={`hidden font-mono text-[10px] uppercase tracking-[0.08em] sm:inline ${autopilot[r.key] ? "text-lime" : "text-wait"}`}>
              {autopilot[r.key] ? "Avtopilot" : "Tasdiq bilan"}
            </span>
            <Toggle on={autopilot[r.key]} onChange={(v) => setRule(r.key, v)} label={`${r.name}: avtopilot`} />
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-start gap-2 text-[13px] text-mute">
        <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
        Jadval bo&apos;yicha joylash — beta. Hozir qoidalar shu sahifada saqlanadi; avtomatik jadval hackathondan keyin ulanadi.
      </p>
    </div>
  );
}

function TeamView() {
  const flow = useStudio((s) => s.flow);
  const status = useStudio((s) => s.status);
  const statusOf = (role: string) => {
    const n = flow?.nodes.find((x) => x.kind === role);
    return n ? status[n.id] : undefined;
  };
  return (
    <div>
      <Header title="Jamoa" sub="Har bir xodimning bitta vazifasi bor. Bugun nima qilganini shu yerda ko'rasiz." />
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {AGENT_ORDER.map((r, i) => {
          const a = AGENTS[r];
          const st = statusOf(r);
          const [g1, g2] = GRAD[r];
          return (
            <motion.li key={r} initial={{ y: 16 }} animate={{ y: 0 }} transition={{ type: "spring", stiffness: 240, damping: 22, delay: i * 0.04 }}>
              <GlowCard from={g1} to={g2} strength={0.7} className="h-full p-5">
                <div className="flex items-start gap-3">
                  <AgentAvatar kind={r} size={64} photo />
                  <div className="min-w-0">
                    <div className="text-[18px] font-bold tracking-tight">{a.name}</div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-white/70">{a.ru} · {a.en}</div>
                    {st && (
                      <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 font-mono text-[10px] uppercase text-white">
                        <StatusIcon status={st} className="h-3 w-3" /> {STATUS_TEXT[st]}
                      </span>
                    )}
                  </div>
                </div>
                <p className="mt-3 text-[13px] text-white/85">{a.does}</p>
                <p className="mt-3 rounded-2xl bg-black/40 px-3 py-2 text-[12px] text-white/85 backdrop-blur"><span className="mono-label !text-lime">Bugun</span> {a.today}</p>
              </GlowCard>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

function BrandView() {
  const brand = useStudio((s) => s.brand);
  const setKnowledge = useStudio((s) => s.setKnowledge);
  const [channel, setChannel] = useState(brand.channel ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  return (
    <div>
      <Header title="Brend xotirasi" sub="Biznesingiz haqida bir marta yozing — barcha xodimlar shundan foydalanadi." sample={useStudio.getState().sources.brand !== "live"} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_440px]">
        <div className="flex flex-col gap-4">
          <label className="block">
            <span className="mono-label mb-2 block">Bilimlar bazasi</span>
            <textarea
              value={brand.knowledge}
              onChange={(e) => setKnowledge(e.target.value)}
              rows={8}
              placeholder="Mahsulotlar, narxlar, manzil, ish vaqti, tarixingiz"
              className="w-full rounded-[24px] bg-surface p-4 text-[14px] leading-relaxed text-fog shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)] outline-none focus:shadow-[inset_0_0_0_1px_rgba(215,255,58,.5)]"
            />
          </label>
          <div>
            <div className="mono-label mb-2">Manbalar</div>
            <ul className="flex flex-col gap-2 text-[14px]">
              <li className="flex flex-wrap items-center gap-3 rounded-[22px] bg-surface px-4 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
                <Orb kind="publisher" size={28} />
                <span className="font-semibold">Telegram kanal</span>
                <input value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Telegram kanal" className="min-w-0 flex-1 rounded-full bg-surface-2 px-3.5 py-1.5 text-fog outline-none focus:shadow-[inset_0_0_0_1px_rgba(215,255,58,.5)]" />
                <span className="rounded-full bg-ok/15 px-2 py-0.5 font-mono text-[10px] uppercase text-ok">Ulangan</span>
              </li>
              {["Instagram", "YouTube"].map((s) => (
                <li key={s} className="flex items-center gap-3 rounded-[22px] bg-surface/50 px-4 py-3 text-mute shadow-[inset_0_0_0_1px_rgba(255,255,255,.05)]">
                  <span className="h-7 w-7 rounded-full border border-dashed border-white/20" />
                  <span className="flex-1 font-semibold">{s}</span>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-[10px] uppercase">Tez kunda</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await api.createBrand({ channel, knowledge: brand.knowledge });
                useStudio.setState({ brand: r.data, sources: { ...useStudio.getState().sources, brand: r.source } });
                setNote(r.source === "live" ? "Brend DNK yangilandi." : "Namuna rejimi: DNK namunadan olindi.");
                setBusy(false);
              }}
              className="pill-lime px-5 py-2.5 text-[14px]"
            >
              {busy ? "Kanal o'qilmoqda…" : "Brend DNK ni yangilash"}
            </button>
            {note && <span className="text-[13px] text-mute">{note}</span>}
          </div>
        </div>
        <DnaCard dna={brand.dna} />
      </div>
    </div>
  );
}

function RadarView() {
  const leads = useStudio((s) => s.leads);
  const brand = useStudio((s) => s.brand);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <Header title="Mijoz radar" sub="Mijozlaringiz qayerda — va u yerda nima qilish kerak." sample={leads.length > 0 && useStudio.getState().sources.radar !== "live"}>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await api.findLeads(brand.id);
            useStudio.setState({ leads: r.data, sources: { ...useStudio.getState().sources, radar: r.source } });
            setBusy(false);
          }}
          className="pill-lime px-5 py-2.5 text-[14px]"
        >
          {busy ? "Internetdan qidirilmoqda…" : leads.length ? "Qayta qidirish" : "Mijozlarni topish"}
        </button>
      </Header>
      {leads.length ? (
        <LeadList leads={leads} />
      ) : (
        <p className="rounded-[24px] border border-dashed border-white/15 p-6 text-[14px] text-mute">Hali qidirilmagan. «Mijozlarni topish» ni bosing yoki «Mijoz qidirish» topshirig&apos;ini bering.</p>
      )}
    </div>
  );
}

function VideoView() {
  const video = useStudio((s) => s.video);
  const brand = useStudio((s) => s.brand);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <Header title="Videograf" sub="Reels va TikTok: birinchi 2 soniya, kadrlar, ovoz va subtitrlar." sample={!!video && useStudio.getState().sources.video !== "live"}>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await api.planVideo(brand.id, "Yangi mahsulot uchun 15 soniyalik Reels");
            useStudio.setState({ video: r.data, sources: { ...useStudio.getState().sources, video: r.source } });
            setBusy(false);
          }}
          className="pill-lime px-5 py-2.5 text-[14px]"
        >
          {busy ? "Yozilmoqda…" : video ? "Yangi ssenariy" : "Ssenariy yozish"}
        </button>
      </Header>
      {video ? (
        <Storyboard plan={video} />
      ) : (
        <p className="rounded-[24px] border border-dashed border-white/15 p-6 text-[14px] text-mute">Hali ssenariy yo&apos;q. «Ssenariy yozish» ni bosing yoki «Reels» topshirig&apos;ini bering.</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ shell */

export function Studio({ inTelegram = false, theme = "dark" }: { inTelegram?: boolean; theme?: "light" | "dark" }) {
  const view = useStudio((s) => s.view);
  const setView = useStudio((s) => s.setView);
  const run = useStudio((s) => s.run);
  const sources = useStudio((s) => s.sources);
  const brand = useStudio((s) => s.brand);
  const inbox = useStudio((s) => s.inbox);
  const flow = useStudio((s) => s.flow);
  const status = useStudio((s) => s.status);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const sp = new URLSearchParams(window.location.search);
    const demo = sp.get("demo");
    const channel = sp.get("channel")?.slice(0, 64);
    const t = TEMPLATES.find((x) => x.key === demo);
    if (!t) return;
    const task = demo === "bir-havola" && channel ? `${channel} — butun marketingni yo'lga qo'ying` : t.task;
    // No cleanup on purpose: the started-ref guard already makes this run once,
    // and a cleanup would cancel it under React's double-invoked dev effects.
    window.setTimeout(() => void run(task), 350);
  }, [run]);

  // Approval and publisher nodes follow the owner's decisions in the inbox.
  useEffect(() => {
    if (!flow || inbox.length === 0) return;
    const ok = flow.nodes.find((n) => n.kind === "approval");
    const pub = flow.nodes.find((n) => n.kind === "publisher");
    const waiting = inbox.some((i) => i.state === "waiting");
    const published = inbox.some((i) => i.state === "published");
    const next = { ...status };
    if (ok && status[ok.id] === "needs_approval" && !waiting) next[ok.id] = "done";
    if (pub && published && status[pub.id] !== "done") next[pub.id] = "done";
    if (JSON.stringify(next) !== JSON.stringify(status)) useStudio.setState({ status: next });
  }, [inbox, flow, status]);

  const live = sources.brand === "live";
  const waiting = useMemo(() => inbox.filter((i) => i.state === "waiting").length, [inbox]);

  return (
    <div className="lw flex min-h-dvh flex-col" data-theme={theme === "light" ? "light" : undefined}>
      <header className="sticky top-0 z-30 border-b border-[var(--hair)] bg-[color-mix(in_oklab,var(--stage)_86%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-3 px-4 pt-3 sm:px-8">
          <Mark href={inTelegram ? null : "/"} />
          <div className="flex min-w-0 items-center gap-2">
            {brand.channel && <span className="truncate text-[13.5px] text-[var(--ink-2)]">{brand.channel}</span>}
            {live ? (
              <span className="rounded-full px-2.5 py-1 text-[12px] font-medium text-[var(--ink)]" style={{ boxShadow: "inset 0 0 0 1px var(--hair-2)" }}>
                jonli
              </span>
            ) : (
              <span className="namuna">namuna</span>
            )}
            {!inTelegram && (
              <a href={TG_BOT_URL} target="_blank" rel="noreferrer" aria-label="Telegram bot" className="btn-quiet !min-h-9 !px-3">
                <Send className="h-4 w-4" aria-hidden />
              </a>
            )}
          </div>
        </div>
        {inTelegram ? (
          <div className="h-3" />
        ) : (
        <nav aria-label="Studiya" className="mx-auto flex w-full max-w-[1180px] gap-1 overflow-x-auto px-3 py-2.5 [scrollbar-width:none] sm:px-7">
          {NAV.map((n) => {
            const Icon = n.icon;
            const on = view === n.key;
            return (
              <button
                key={n.key}
                type="button"
                onClick={() => setView(n.key)}
                aria-current={on ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-[14px] font-medium transition-colors duration-200 ${
                  on ? "bg-[var(--glass-3)] text-[var(--ink)]" : "text-[var(--ink-2)] hover:text-[var(--ink)]"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden />
                <span className="whitespace-nowrap">{n.name}</span>
                {n.key === "delegate" && waiting > 0 && (
                  <span className="tnum rounded-full bg-[var(--lime)] px-1.5 text-[11.5px] font-semibold text-[var(--lime-ink)]">{waiting}</span>
                )}
              </button>
            );
          })}
        </nav>
        )}
      </header>
      <main className="mx-auto w-full min-w-0 max-w-[1180px] flex-1 px-4 py-6 sm:px-8 lg:py-10">
        {view === "delegate" || inTelegram ? (
          <Home inTelegram={inTelegram} />
        ) : (
          <div className="uslub-legacy">
            {view === "analysis" && <AnalysisView />}
            {view === "strategy" && <StrategyView />}
            {view === "team" && <TeamView />}
            {view === "brand" && <BrandView />}
            {view === "radar" && <RadarView />}
            {view === "video" && <VideoView />}
            {view === "rules" && <RulesView />}
          </div>
        )}
      </main>
      <ReviewDrawer />
    </div>
  );
}
