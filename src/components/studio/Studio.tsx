"use client";

import type { NodeKind } from "@/lib/uslub/contract";
import {
  Activity,
  ArrowUp,
  BookOpen,
  Bot,
  Clapperboard,
  Clock3,
  Compass,
  Inbox,
  Link2,
  Radar,
  Send,
  Settings2,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AgentAvatar } from "../uslub/AgentAvatar";
import { AGENT_ORDER, AGENTS, GRAD, kindMeta, TG_BOT_URL } from "../uslub/agents";
import { DotMatrix } from "../uslub/DotMatrix";
import { GlowCard } from "../uslub/GlowCard";
import { Logo } from "../uslub/Girih";
import { Orb } from "../uslub/Orb";
import { AnalysisView } from "./AnalysisView";
import * as api from "./api";
import { FlowCanvas, RUNNING_HINT, STATUS_TEXT, StatusIcon, StepList } from "./FlowCanvas";
import { TEMPLATES } from "./mocks";
import { DnaCard, LeadList, Storyboard } from "./Panels";
import { PostReview } from "./PostReview";
import { StrategyView } from "./StrategyView";
import { KIND_SOURCE, RULES, useStudio, type InboxItem, type RuleKey, type View } from "./store";

const NAV: { key: View; name: string; icon: typeof Inbox }[] = [
  { key: "delegate", name: "Topshiriq", icon: Sparkles },
  { key: "analysis", name: "Tahlil", icon: Activity },
  { key: "strategy", name: "Strategiya", icon: Compass },
  { key: "team", name: "Jamoa", icon: Users },
  { key: "brand", name: "Brend xotirasi", icon: BookOpen },
  { key: "radar", name: "Mijoz radar", icon: Radar },
  { key: "video", name: "Videograf", icon: Clapperboard },
  { key: "rules", name: "Avtopilot", icon: Settings2 },
];

const RULE_NAME: Record<RuleKey, string> = Object.fromEntries(RULES.map((r) => [r.key, r.name.toLowerCase()])) as Record<RuleKey, string>;

function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 767px)");
    const on = () => setM(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return m;
}

const SOURCE_NAME: Record<string, string> = {
  brand: "Brend DNK",
  audit: "Tahlil",
  strategy: "Strategiya",
  posts: "Postlar",
  video: "Reels",
  radar: "Mijoz radar",
};

/** Node id -> true when that employee's output is sample data (honesty badge). */
function useSampleMap() {
  const flow = useStudio((s) => s.flow);
  const sources = useStudio((s) => s.sources);
  return useMemo(() => {
    const m: Record<string, boolean> = {};
    flow?.nodes.forEach((n) => {
      const key = KIND_SOURCE[n.kind];
      if (key && sources[key] && sources[key] !== "live") m[n.id] = true;
    });
    return m;
  }, [flow, sources]);
}

function SampleBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`rounded-full bg-white/8 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-mute ${className}`} title="Namuna ma'lumot — haqiqiy kanal ma'lumoti emas">
      namuna
    </span>
  );
}

/* ------------------------------------------------------------ delegate box */

function DelegateBox({ compact }: { compact: boolean }) {
  const run = useStudio((s) => s.run);
  const running = useStudio((s) => s.running);
  const [task, setTask] = useState("");
  const [link, setLink] = useState("");
  const start = (t: string) => {
    if (!t.trim() || running) return;
    void run(t.trim());
  };
  return (
    <div className="flex flex-col gap-3">
      {!compact && (
        <GlowCard from="#5B7CFF" to="#7C3AED" strength={0.9} at="85% 0%" className="p-6 sm:p-9">
          <div className="pointer-events-none absolute -right-10 -top-10 hidden gap-3 opacity-90 md:flex" aria-hidden>
            {(["brand", "analyst", "strategist", "copywriter", "video", "radar"] as NodeKind[]).map((k, i) => (
              <motion.span
                key={k}
                initial={{ y: -30, scale: 0.6 }}
                animate={{ y: [0, -6, 0], scale: 1 }}
                transition={{ y: { duration: 3 + i * 0.4, repeat: Infinity, ease: "easeInOut" }, scale: { type: "spring", delay: 0.1 * i } }}
                className="mt-24"
                style={{ marginTop: 40 + (i % 3) * 34 }}
              >
                <Orb kind={k} size={58 - (i % 2) * 12} icon={false} glow />
              </motion.span>
            ))}
          </div>
          <div className="mono-label !text-white/70">Bir havola</div>
          <h1 className="mt-3 max-w-xl text-[32px] font-bold leading-[1.04] tracking-[-0.03em] sm:text-[48px]">
            Butun marketing bo&apos;limi — bitta havoladan
          </h1>
          <p className="mt-3 max-w-lg text-[15px] text-white/75">
            Telegram kanalingizni bering. Bo&apos;lim kanalni o&apos;qiydi, raqamlarni tahlil qiladi, reja tuzadi, postlarni 4 yozuvda
            yozadi va mijozlaringiz qayerdaligini topadi. Siz faqat tasdiqlaysiz.
          </p>
          <form
            className="mt-6 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              start(`${link.trim() || "t.me/nafis_kiyim"} — butun marketingni yo'lga qo'ying`);
            }}
          >
            <label className="flex flex-1 items-center gap-2 rounded-full bg-black/55 px-5 py-3.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.14)] backdrop-blur focus-within:shadow-[inset_0_0_0_1px_rgba(215,255,58,.7)]">
              <Link2 className="h-5 w-5 text-lime" />
              <span className="sr-only">Telegram kanal havolasi</span>
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="t.me/sizning_kanalingiz"
                className="w-full bg-transparent text-[16px] text-fog outline-none placeholder:text-white/40"
              />
            </label>
            <button type="submit" disabled={running} className="pill-lime px-7 py-3.5 text-[15px]">
              Bo&apos;limni ishga tushirish
            </button>
          </form>
        </GlowCard>
      )}

      <form
        className="rounded-[28px] bg-surface p-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)] focus-within:shadow-[inset_0_0_0_1px_rgba(215,255,58,.5)]"
        onSubmit={(e) => {
          e.preventDefault();
          start(task);
        }}
      >
        <label className="sr-only" htmlFor="task">Topshiriq</label>
        <div className="flex items-end gap-2">
          <textarea
            id="task"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                start(task);
              }
            }}
            rows={compact ? 1 : 2}
            placeholder="Topshiriq bering… masalan: Black Friday uchun 1 haftalik kontent va Reels"
            className="min-h-[46px] flex-1 resize-none bg-transparent px-3 py-3 text-[15px] text-fog outline-none placeholder:text-dim"
          />
          <button type="submit" aria-label="Topshiriqni berish" disabled={!task.trim() || running} className="pill-lime h-11 w-11 shrink-0">
            <ArrowUp className="h-5 w-5" />
          </button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto px-1 pb-1 pt-2 [scrollbar-width:none]">
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTask(t.task);
                start(t.task);
              }}
              title={t.hint}
              disabled={running}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors disabled:opacity-40 ${
                t.key === "bir-havola" ? "bg-lime/15 text-lime shadow-[inset_0_0_0_1px_rgba(215,255,58,.35)] hover:bg-lime/25" : "bg-surface-2 text-mute hover:text-fog"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------ run header */

function RunHeader() {
  const flow = useStudio((s) => s.flow);
  const status = useStudio((s) => s.status);
  const running = useStudio((s) => s.running);
  const elapsed = useStudio((s) => s.elapsed);
  const notice = useStudio((s) => s.notice);
  if (!flow) return null;
  const total = flow.nodes.length;
  const done = Object.values(status).filter((s) => s === "done" || s === "needs_approval").length;
  const working = flow.nodes.filter((n) => status[n.id] === "running");
  const secs = Math.floor(elapsed);
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0 self-end">
        <div className="mono-label">{running ? "Bo'lim ishlayapti" : "Natijalar tasdiqlash qutisida"}</div>
        <h2 className="mt-1 truncate text-[22px] font-bold tracking-[-0.02em] sm:text-[28px]">{flow.title}</h2>
        <div className="mt-1 h-5 text-[13px] text-mute" aria-live="polite">
          {running && working.length > 0
            ? working.map((n) => `${kindMeta(n.kind).name}: ${RUNNING_HINT[n.kind] ?? "ishlayapti"}`).join(" · ")
            : !running
              ? "Hech narsa sizsiz joylanmaydi."
              : ""}
        </div>
        {notice && <div className="mt-1 rounded-2xl bg-wait/10 px-3 py-2 text-[13px] text-wait shadow-[inset_0_0_0_1px_rgba(255,181,71,.25)]">{notice}</div>}
      </div>
      <div className="flex gap-2">
        <div className="rounded-[22px] bg-surface px-4 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
          <div className="mono-label mb-2">Xodimlar</div>
          <DotMatrix value={`${done}/${total}`} dot={4} gap={2} color="#F3F3F5" />
        </div>
        <div
          className="rounded-[22px] px-4 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,.1)]"
          style={{ background: running ? "radial-gradient(120% 120% at 50% 0%, #D7FF3A55, #0e0e11 70%)" : "#0e0e11" }}
        >
          <div className="mono-label mb-2">Vaqt</div>
          <DotMatrix value={`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`} dot={4} gap={2} color={running ? "#D7FF3A" : "#F3F3F5"} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ node panel */

function NodePanel() {
  const flow = useStudio((s) => s.flow);
  const selected = useStudio((s) => s.selected);
  const status = useStudio((s) => s.status);
  const select = useStudio((s) => s.select);
  const setView = useStudio((s) => s.setView);
  const brand = useStudio((s) => s.brand);
  const posts = useStudio((s) => s.posts);
  const leads = useStudio((s) => s.leads);
  const video = useStudio((s) => s.video);
  const audit = useStudio((s) => s.audit);
  const plan = useStudio((s) => s.plan);
  const inbox = useStudio((s) => s.inbox);
  const sampleMap = useSampleMap();
  const node = flow?.nodes.find((n) => n.id === selected);
  if (!node) return null;
  const st = status[node.id] ?? "idle";
  const meta = kindMeta(node.kind);
  const ready = st === "done" || st === "needs_approval";
  const [a, b] = GRAD[node.kind];
  let body: React.ReactNode = <p className="text-[13px] text-mute">{st === "running" ? RUNNING_HINT[node.kind] : "Navbat kelganda shu yerda natija chiqadi."}</p>;
  if (ready || node.kind === "input") {
    const k: NodeKind = node.kind;
    if (k === "input") body = <p className="text-[14px]">{flow!.title}</p>;
    else if (k === "brand") body = <DnaCard dna={brand.dna} compact />;
    else if (k === "analyst" && audit)
      body = (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              ["Obunachi", audit.subscribers ? (audit.subscribers >= 1000 ? `${(audit.subscribers / 1000).toFixed(1)}k` : `${audit.subscribers}`) : "—"],
              ["Qamrov", audit.reachRate ? `${Math.round(audit.reachRate * 100)}%` : "—"],
            ].map(([l, v]) => (
              <div key={l} className="rounded-2xl bg-surface-2 p-3">
                <div className="mono-label mb-2">{l}</div>
                <DotMatrix value={v} dot={3.5} gap={1.6} color="#D7FF3A" />
              </div>
            ))}
          </div>
          <ul className="space-y-1.5 text-[13px]">
            {audit.findings.slice(0, 3).map((f) => (
              <li key={f.text} className="rounded-xl bg-surface-2 px-3 py-2">{f.text}</li>
            ))}
          </ul>
          <button type="button" onClick={() => setView("analysis")} className="pill-ghost px-4 py-2 text-[13px]">To&apos;liq tahlil</button>
        </div>
      );
    else if (k === "strategist")
      body = plan ? (
        <div className="space-y-1.5 text-[13px]">
          {plan.items.map((it) => (
            <div key={it.day + it.time} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
              <span className="font-mono text-[11px] text-lime">{it.time}</span>
              <span className="min-w-0 flex-1 truncate">{it.hook}</span>
              {it.needsApproval && <span className="h-1.5 w-1.5 rounded-full bg-wait" />}
            </div>
          ))}
          <button type="button" onClick={() => setView("strategy")} className="pill-ghost mt-1 px-4 py-2 text-[13px]">Strategiyani ochish</button>
        </div>
      ) : (
        <p className="text-[13px] text-mute">Reja tayyor.</p>
      );
    else if (k === "copywriter" || k === "editor" || k === "translator")
      body = (
        <ul className="space-y-2 text-[13px]">
          {posts.map((p) => (
            <li key={p.id} className="rounded-2xl bg-surface-2 px-3 py-2.5">
              <div className="font-bold">{p.brief}</div>
              <div className="line-clamp-2 text-mute">{k === "translator" ? p.variants.ru : p.variants.uz_latn}</div>
              {k === "editor" && <div className="mt-1 font-mono text-[11px] text-ok">INSON BALI {p.humanScore}</div>}
            </li>
          ))}
        </ul>
      );
    else if (k === "radar") body = <LeadList leads={leads} limit={3} />;
    else if (k === "video" && video) body = <p className="text-[16px] font-semibold leading-snug">«{video.hook}»</p>;
    else if (k === "designer")
      body = (
        <div className="grid grid-cols-3 gap-2">
          {(["strategist", "copywriter", "radar"] as NodeKind[]).map((c, i) => (
            <GlowCard key={c} from={GRAD[c][0]} to={GRAD[c][1]} className="aspect-square !rounded-2xl p-2 text-[10px] font-bold">{posts[i]?.brief ?? "Muqova"}</GlowCard>
          ))}
        </div>
      );
    else if (k === "approval") body = <p className="text-[13px]">{inbox.filter((i) => i.state === "waiting").length} ta ish tasdig&apos;ingizni kutmoqda.</p>;
    else if (k === "publisher") body = <p className="text-[13px]">Tasdiqlangan postlarni {brand.channel} kanaliga joylaydi. Instagram va YouTube — tez kunda.</p>;
  }
  return (
    <motion.aside
      initial={{ x: 24 }}
      animate={{ x: 0 }}
      exit={{ x: 24 }}
      className="absolute inset-y-3 right-3 z-10 flex w-[min(360px,calc(100%-24px))] flex-col overflow-hidden rounded-[28px] bg-surface shadow-[inset_0_0_0_1px_rgba(255,255,255,.1),0_30px_80px_-20px_rgba(0,0,0,.9)]"
    >
      <div className="flex items-center gap-3 px-4 pb-4 pt-5" style={{ background: `radial-gradient(120% 140% at 50% 0%, ${a}cc 0%, ${b}66 40%, transparent 80%)` }}>
        <Orb kind={node.kind} size={42} glow={st === "running"} />
        <div className="min-w-0 flex-1">
          <div className="text-[17px] font-bold tracking-tight">{meta.name}</div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-white/75">
            {STATUS_TEXT[st]}
            {sampleMap[node.id] && ready && <SampleBadge className="!bg-black/40 !text-white/70" />}
          </div>
        </div>
        <button type="button" aria-label="Yopish" onClick={() => select(null)} className="rounded-full bg-black/30 p-2 hover:bg-black/50">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">{body}</div>
    </motion.aside>
  );
}

/* ------------------------------------------------------------ inbox */

function itemBadge(i: InboxItem) {
  const base = "rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em]";
  if (i.state === "published") return <span className={`${base} bg-ok/15 text-ok`}>Joylandi</span>;
  if (i.state === "approved") return <span className={`${base} bg-lime/15 text-lime`}>Tasdiqlandi</span>;
  if (i.state === "scheduled") return <span className={`${base} bg-white/8 text-mute`}>Avtopilot · beta</span>;
  return <span className={`${base} bg-wait/15 text-wait`}>Tasdiq kerak</span>;
}

function InboxList() {
  const inbox = useStudio((s) => s.inbox);
  const running = useStudio((s) => s.running);
  const flow = useStudio((s) => s.flow);
  const review = useStudio((s) => s.review);
  const setView = useStudio((s) => s.setView);
  const sources = useStudio((s) => s.sources);
  const waiting = inbox.filter((i) => i.state === "waiting").length;
  return (
    <section aria-labelledby="inbox-h" className="flex flex-col overflow-hidden rounded-[28px] bg-surface shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
      <div className="flex items-center justify-between px-5 pb-3 pt-4">
        <h2 id="inbox-h" className="flex items-center gap-2 text-[16px] font-bold tracking-tight">
          <Inbox className="h-4 w-4 text-wait" /> Tasdiqlash qutisi
        </h2>
        {waiting > 0 && <DotMatrix value={waiting} dot={3} gap={1.4} color="#FFB547" label={`${waiting} ta kutmoqda`} />}
      </div>
      {inbox.length === 0 ? (
        <p className="px-5 pb-5 text-[13px] leading-relaxed text-mute">
          {running
            ? "Xodimlar ishlayapti. Tayyor bo'lgan ishlar shu yerga tushadi."
            : flow
              ? "Bu topshiriqda joylanadigan ish yo'q."
              : "Topshiriq bering — tayyor postlar va videolar shu yerga tushadi. Siz tasdiqlamaguningizcha hech narsa joylanmaydi."}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5 px-2 pb-2">
          {inbox.map((i, n) => (
            <motion.li key={i.id} initial={{ y: 10, scale: 0.98 }} animate={{ y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 320, damping: 26, delay: n * 0.07 }}>
              <button
                type="button"
                onClick={() => (i.type === "post" && i.postId ? review(i.postId) : setView("video"))}
                className="flex w-full items-start gap-3 rounded-[20px] bg-surface-2 px-3 py-3 text-left transition-colors hover:bg-surface-3"
              >
                <Orb kind={i.type === "video" ? "video" : "copywriter"} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{i.title}</span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {itemBadge(i)}
                    {sources[i.type === "video" ? "video" : "posts"] !== "live" && <SampleBadge />}
                    {i.state === "waiting" && i.reasons.length > 0 && <span className="text-[11px] text-dim">{i.reasons.map((r) => RULE_NAME[r]).join(", ")}</span>}
                  </span>
                </span>
              </button>
            </motion.li>
          ))}
        </ul>
      )}
    </section>
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

function OutputDeck() {
  const posts = useStudio((s) => s.posts);
  const leads = useStudio((s) => s.leads);
  const video = useStudio((s) => s.video);
  const audit = useStudio((s) => s.audit);
  const setView = useStudio((s) => s.setView);
  const sources = useStudio((s) => s.sources);
  const sampled = (["brand", "audit", "strategy", "posts", "radar", "video"] as const).filter((k) => sources[k] && sources[k] !== "live");
  const cards: { k: View; kind: NodeKind; n: string; v: string; big: string }[] = [
    { k: "brand", kind: "brand", n: "Brend DNK", v: "ovoz va qoidalar", big: "DNK" },
    ...(audit ? [{ k: "analysis" as View, kind: "analyst" as NodeKind, n: "Qamrov", v: "kanal tahlili", big: audit.reachRate ? `${Math.round(audit.reachRate * 100)}%` : "OK" }] : []),
    ...(posts.length ? [{ k: "delegate" as View, kind: "copywriter" as NodeKind, n: "Postlar", v: "4 yozuvda", big: `${posts.length}` }] : []),
    ...(leads.length ? [{ k: "radar" as View, kind: "radar" as NodeKind, n: "Joylar", v: "mijozlaringiz", big: `${leads.length}` }] : []),
    ...(video ? [{ k: "video" as View, kind: "video" as NodeKind, n: "Reels", v: "soniya", big: `${video.scenes.reduce((a, s) => a + s.seconds, 0)}` }] : []),
  ];
  return (
    <div className="flex flex-col gap-2">
    {sampled.length > 0 && (
      <p className="flex flex-wrap items-center gap-2 text-[12px] text-mute">
        <SampleBadge />
        Bu bo&apos;limlar hozircha namuna ma&apos;lumot ko&apos;rsatmoqda: {sampled.map((k) => SOURCE_NAME[k]).join(", ")}.
      </p>
    )}
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {cards.map((c, i) => (
        <motion.button
          key={c.n}
          type="button"
          onClick={() => setView(c.k)}
          initial={{ y: 30, rotateX: -25, scale: 0.9 }}
          animate={{ y: 0, rotateX: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 20, delay: i * 0.08 }}
          style={{ transformPerspective: 800 }}
          className="text-left"
        >
          <GlowCard from={GRAD[c.kind][0]} to={GRAD[c.kind][1]} strength={0.85} className="h-[132px] !rounded-[26px] p-3.5 transition-transform hover:-translate-y-1">
            <div className="text-[14px] font-bold">{c.n}</div>
            <div className="text-[11px] text-white/70">{c.v}</div>
            <div className="absolute bottom-3.5 left-3.5">
              <DotMatrix value={c.big} dot={4.2} gap={1.8} />
            </div>
          </GlowCard>
        </motion.button>
      ))}
    </div>
    </div>
  );
}

function DelegateView() {
  const flow = useStudio((s) => s.flow);
  const status = useStudio((s) => s.status);
  const selected = useStudio((s) => s.selected);
  const select = useStudio((s) => s.select);
  const running = useStudio((s) => s.running);
  const posts = useStudio((s) => s.posts);
  const mobile = useIsMobile();
  const sampleMap = useSampleMap();
  return (
    <div className="flex flex-col gap-5">
      <DelegateBox compact={!!flow} />
      {flow && <RunHeader />}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-3">
          {flow ? (
            <>
              <div className="flex items-baseline justify-between">
                <h3 className="text-[16px] font-bold tracking-tight">Bo&apos;limingiz qanday ishlaydi</h3>
                <span className="mono-label hidden sm:inline">Xodimni bosing — natija ochiladi</span>
              </div>
              {mobile ? (
                <StepList flow={flow} status={status} onSelect={(id) => select(id)} sample={sampleMap} />
              ) : (
                <div className="relative">
                  <FlowCanvas flow={flow} status={status} selected={selected} onSelect={select} follow sample={sampleMap} className="h-[480px] rounded-[36px]" />
                  <AnimatePresence>{selected && <NodePanel />}</AnimatePresence>
                </div>
              )}
              {mobile && selected && (
                <div className="relative min-h-[360px]">
                  <NodePanel />
                </div>
              )}
              {!running && posts.length + 1 > 0 && Object.values(status).some((s) => s === "done") && <OutputDeck />}
            </>
          ) : (
            <TeamStrip />
          )}
        </div>
        <div className="flex flex-col gap-3">
          <InboxList />
          <RulesMini />
        </div>
      </div>
    </div>
  );
}

function TeamStrip() {
  return (
    <section className="rounded-[28px] bg-surface p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
      <h3 className="text-[18px] font-bold tracking-tight">Sizning marketing bo&apos;limingiz</h3>
      <p className="mt-1 text-[13px] text-mute">10 ta xodim. Topshiriq bersangiz, Strateg ishni ular orasida taqsimlaydi.</p>
      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {AGENT_ORDER.map((r, i) => (
          <motion.li
            key={r}
            initial={{ y: 12, scale: 0.9 }}
            animate={{ y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 20, delay: i * 0.04 }}
            className="flex flex-col items-center gap-2 rounded-[22px] bg-surface-2 px-2 py-3 text-center"
          >
            <Orb kind={r} size={44} />
            <span className="text-[12px] font-bold leading-tight">{AGENTS[r].name}</span>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

function RulesMini() {
  const autopilot = useStudio((s) => s.autopilot);
  const setView = useStudio((s) => s.setView);
  const auto = RULES.filter((r) => autopilot[r.key]).map((r) => r.name.toLowerCase());
  return (
    <button type="button" onClick={() => setView("rules")} className="rounded-[24px] bg-surface/60 px-5 py-4 text-left text-[13px] shadow-[inset_0_0_0_1px_rgba(255,255,255,.07)] hover:bg-surface">
      <span className="flex items-center gap-2 font-bold"><Bot className="h-4 w-4 text-lime" /> Avtopilot <span className="mono-label">beta</span></span>
      <span className="mt-1 block text-mute">
        {auto.length ? `Avtomatik: ${auto.join(", ")}.` : "Hammasi tasdiq orqali."} Aksiya, narx, video va birinchi postlar — faqat tasdiq bilan.
      </span>
    </button>
  );
}

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

export function Studio() {
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
    setTimeout(() => void run(task), 500);
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
    <div className="uslub flex min-h-dvh flex-col md:flex-row">
      <aside className="sticky top-0 z-30 bg-void/85 backdrop-blur-xl md:h-dvh md:w-[236px] md:shrink-0 md:shadow-[inset_-1px_0_0_rgba(255,255,255,.06)]">
        <div className="flex items-center justify-between px-4 py-3 md:px-5 md:py-6">
          <Link href="/" aria-label="Bosh sahifa"><Logo light /></Link>
          <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase md:hidden ${live ? "bg-ok/15 text-ok" : "bg-white/6 text-mute"}`}>
            {live ? "Jonli" : "Namuna"}
          </span>
        </div>
        <nav aria-label="Studiya" className="flex gap-1 overflow-x-auto px-2 pb-2 [scrollbar-width:none] md:flex-col md:px-3">
          {NAV.map((n) => {
            const Icon = n.icon;
            const on = view === n.key;
            return (
              <button
                key={n.key}
                type="button"
                onClick={() => setView(n.key)}
                aria-current={on ? "page" : undefined}
                className={`relative flex shrink-0 items-center gap-2.5 rounded-full px-3.5 py-2 text-[14px] font-semibold transition-colors ${on ? "text-void" : "text-mute hover:text-fog"}`}
              >
                {on && <motion.span layoutId="nav-on" transition={{ type: "spring", stiffness: 420, damping: 34 }} className="absolute inset-0 rounded-full bg-fog" />}
                <Icon className="relative h-4 w-4" />
                <span className="relative whitespace-nowrap">{n.name}</span>
                {n.key === "delegate" && waiting > 0 && (
                  <span className="relative rounded-full bg-wait px-1.5 text-[11px] font-extrabold text-void">{waiting}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="hidden px-4 pb-5 md:absolute md:bottom-0 md:block md:w-full">
          <div className="rounded-[22px] bg-surface p-3.5 text-[13px] shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
            <div className="flex items-center gap-2">
              <Orb kind="brand" size={26} icon={false} />
              <div className="min-w-0">
                <div className="truncate font-bold">{brand.dna.name}</div>
                <div className="truncate text-[12px] text-mute">{brand.channel}</div>
              </div>
            </div>
            <div className={`mt-2.5 inline-block rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${live ? "bg-ok/15 text-ok" : "bg-white/6 text-mute"}`}>
              {live ? "Jonli ma'lumot" : "Namuna ma'lumot"}
            </div>
          </div>
          <a href={TG_BOT_URL} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-2 px-2 text-[13px] font-semibold text-lime">
            <Send className="h-4 w-4" /> Telegram bot
          </a>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-9 lg:py-8">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={view} initial={{ y: 8 }} animate={{ y: 0 }} exit={{ y: -8 }} transition={{ type: "spring", stiffness: 380, damping: 32 }}>
            {view === "delegate" && <DelegateView />}
            {view === "analysis" && <AnalysisView />}
            {view === "strategy" && <StrategyView />}
            {view === "team" && <TeamView />}
            {view === "brand" && <BrandView />}
            {view === "radar" && <RadarView />}
            {view === "video" && <VideoView />}
            {view === "rules" && <RulesView />}
          </motion.div>
        </AnimatePresence>
      </main>
      <ReviewDrawer />
    </div>
  );
}
