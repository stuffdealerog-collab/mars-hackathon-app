"use client";

import type { NodeKind } from "@/lib/uslub/contract";
import {
  ArrowUp,
  Bot,
  CircleCheck,
  Clapperboard,
  Clock3,
  Inbox,
  Link2,
  Radar,
  Send,
  Settings2,
  Sparkles,
  Users,
  BookOpen,
  X,
} from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AgentAvatar } from "../uslub/AgentAvatar";
import { AGENT_ORDER, AGENTS, kindMeta, TG_BOT_URL } from "../uslub/agents";
import { Logo } from "../uslub/Girih";
import * as api from "./api";
import { FlowCanvas, STATUS_TEXT, StatusIcon, StepList } from "./FlowCanvas";
import { TEMPLATES } from "./mocks";
import { DnaCard, LeadList, Storyboard } from "./Panels";
import { PostReview } from "./PostReview";
import { RULES, useStudio, type InboxItem, type RuleKey, type View } from "./store";

const NAV: { key: View; name: string; icon: typeof Inbox }[] = [
  { key: "delegate", name: "Topshiriq", icon: Sparkles },
  { key: "team", name: "Jamoa", icon: Users },
  { key: "brand", name: "Brend xotirasi", icon: BookOpen },
  { key: "radar", name: "Mijoz radar", icon: Radar },
  { key: "video", name: "Videograf", icon: Clapperboard },
  { key: "rules", name: "Avtopilot qoidalari", icon: Settings2 },
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
        <div className="girih-night relative overflow-hidden rounded-3xl bg-night p-5 text-white sm:p-7">
          <h1 className="max-w-2xl font-display text-[26px] font-semibold leading-[1.15] sm:text-[38px]">
            Bir havola — butun marketing bo&apos;limi
          </h1>
          <p className="mt-2 max-w-xl text-[15px] text-white/70">
            Telegram kanalingiz havolasini bering. Bir daqiqada: Brend DNK, 4 yozuvda haftalik postlar, mijozlaringiz turgan
            10 joy va Reels ssenariysi. Hech narsa sizsiz joylanmaydi.
          </p>
          <form
            className="mt-5 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              start(`${link.trim() || "t.me/nafis_kiyim"} — butun marketingni yo'lga qo'ying`);
            }}
          >
            <label className="flex flex-1 items-center gap-2 rounded-2xl bg-white px-4 py-3 text-ink">
              <Link2 className="h-5 w-5 text-lapis" />
              <span className="sr-only">Telegram kanal havolasi</span>
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="t.me/nafis_kiyim"
                className="w-full bg-transparent text-[16px] outline-none placeholder:text-stone/70"
              />
            </label>
            <button
              type="submit"
              disabled={running}
              className="rounded-2xl bg-saffron px-6 py-3 text-[15px] font-extrabold text-ink transition hover:brightness-105 disabled:opacity-60"
            >
              Bo&apos;limni ishga tushirish
            </button>
          </form>
        </div>
      )}

      <form
        className="rounded-2xl border border-sand bg-white p-2 shadow-[0_1px_0_rgba(19,21,28,.04)] focus-within:border-lapis"
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
            className="min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] outline-none placeholder:text-stone/70"
          />
          <button
            type="submit"
            aria-label="Topshiriqni berish"
            disabled={!task.trim() || running}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-lapis text-white transition hover:bg-lapis-deep disabled:opacity-30"
          >
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
              className={`shrink-0 rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors ${
                t.key === "bir-havola" ? "border-saffron bg-saffron-soft hover:bg-saffron/30" : "border-sand hover:border-ink/30"
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
  if (!flow) return null;
  const total = flow.nodes.length;
  const done = Object.values(status).filter((s) => s === "done" || s === "needs_approval").length;
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[13px] text-stone">{running ? "Bo'lim ishlayapti" : "Natijalar tasdiqlash qutisida"}</div>
        <h2 className="truncate font-display text-[20px] font-semibold sm:text-[24px]">{flow.title}</h2>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <div className="text-[12px] text-stone">Xodimlar</div>
          <div className="text-[18px] font-extrabold tabular-nums">
            {done}/{total}
          </div>
        </div>
        <div className="rounded-2xl bg-ink px-4 py-2 text-right text-white">
          <div className="text-[11px] text-white/60">Vaqt</div>
          <div className="font-display text-[22px] font-semibold tabular-nums">
            0:{String(Math.floor(elapsed)).padStart(2, "0")}
          </div>
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
  const brand = useStudio((s) => s.brand);
  const posts = useStudio((s) => s.posts);
  const leads = useStudio((s) => s.leads);
  const video = useStudio((s) => s.video);
  const inbox = useStudio((s) => s.inbox);
  const node = flow?.nodes.find((n) => n.id === selected);
  if (!node) return null;
  const st = status[node.id] ?? "idle";
  const meta = kindMeta(node.kind);
  const ready = st === "done" || st === "needs_approval";
  let body: React.ReactNode = <p className="text-[13px] text-stone">Navbat kelganda shu yerda natija chiqadi.</p>;
  if (ready || node.kind === "input") {
    const k: NodeKind = node.kind;
    if (k === "input") body = <p className="text-[14px]">{flow!.title}</p>;
    else if (k === "brand") body = <DnaCard dna={brand.dna} compact />;
    else if (k === "strategist")
      body = (
        <ol className="space-y-1.5 text-[13px]">
          {["Du: e'lon va sana", "Se: yangi trikotaj", "Ch: mijoz obrazi", "Pa: razmer maslahati", "Ju: Black Friday boshlandi", "Sh: Reels", "Ya: oxirgi kun eslatmasi"].map((d) => (
            <li key={d} className="rounded-lg bg-shell px-2.5 py-1.5">{d}</li>
          ))}
        </ol>
      );
    else if (k === "copywriter" || k === "editor" || k === "translator")
      body = (
        <ul className="space-y-2 text-[13px]">
          {posts.map((p) => (
            <li key={p.id} className="rounded-lg bg-shell px-2.5 py-2">
              <div className="font-bold">{p.brief}</div>
              <div className="line-clamp-2 text-stone">{k === "translator" ? p.variants.ru : p.variants.uz_latn}</div>
              {k === "editor" && <div className="mt-1 text-[12px]">Inson bali: <b>{p.humanScore}</b></div>}
            </li>
          ))}
        </ul>
      );
    else if (k === "radar") body = <LeadList leads={leads} limit={3} />;
    else if (k === "video" && video) body = <p className="font-display text-[15px] leading-snug">«{video.hook}»</p>;
    else if (k === "designer")
      body = (
        <div className="grid grid-cols-3 gap-2">
          {["bg-lapis", "bg-saffron", "bg-turq"].map((c, i) => (
            <div key={c} className={`girih-night aspect-square rounded-lg ${c} p-1.5 text-[10px] font-bold text-white`}>{posts[i]?.brief ?? "Muqova"}</div>
          ))}
        </div>
      );
    else if (k === "approval") body = <p className="text-[13px]">{inbox.filter((i) => i.state === "waiting").length} ta ish tasdig&apos;ingizni kutmoqda.</p>;
    else if (k === "publisher") body = <p className="text-[13px]">Tasdiqlangan postlarni {brand.channel} kanaliga joylaydi. Instagram va YouTube — tez kunda.</p>;
  }
  return (
    <motion.aside
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      className="absolute inset-y-3 right-3 z-10 flex w-[min(340px,calc(100%-24px))] flex-col overflow-hidden rounded-2xl bg-paper shadow-[0_24px_60px_-20px_rgba(0,0,0,.6)]"
    >
      <div className="flex items-center gap-3 border-b border-sand px-4 py-3">
        <AgentAvatar kind={node.kind} size={36} />
        <div className="min-w-0 flex-1">
          <div className="font-bold">{meta.name}</div>
          <div className="flex items-center gap-1 text-[12px] text-stone">{STATUS_TEXT[st]}</div>
        </div>
        <button type="button" aria-label="Yopish" onClick={() => select(null)} className="rounded-lg p-1.5 hover:bg-shell">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">{body}</div>
    </motion.aside>
  );
}

/* ------------------------------------------------------------ inbox */

function itemBadge(i: InboxItem) {
  if (i.state === "published") return <span className="rounded-full bg-turq-soft px-2 py-0.5 text-[11px] font-bold text-[#0e6f64]">Joylandi</span>;
  if (i.state === "approved") return <span className="rounded-full bg-lapis-soft px-2 py-0.5 text-[11px] font-bold text-lapis">Tasdiqlandi</span>;
  if (i.state === "scheduled")
    return <span className="rounded-full bg-shell px-2 py-0.5 text-[11px] font-bold text-stone">Avtopilot · jadvalda (beta)</span>;
  return <span className="rounded-full bg-saffron-soft px-2 py-0.5 text-[11px] font-bold text-[#8a5a10]">Tasdiq kutmoqda</span>;
}

function InboxList() {
  const inbox = useStudio((s) => s.inbox);
  const running = useStudio((s) => s.running);
  const flow = useStudio((s) => s.flow);
  const review = useStudio((s) => s.review);
  const setView = useStudio((s) => s.setView);
  const waiting = inbox.filter((i) => i.state === "waiting").length;
  return (
    <section aria-labelledby="inbox-h" className="flex flex-col rounded-2xl border border-sand bg-white">
      <div className="flex items-center justify-between border-b border-sand px-4 py-3">
        <h2 id="inbox-h" className="flex items-center gap-2 font-bold">
          <Inbox className="h-4 w-4 text-saffron" /> Tasdiqlash qutisi
        </h2>
        {waiting > 0 && <span className="rounded-full bg-saffron px-2 py-0.5 text-[12px] font-extrabold text-ink">{waiting}</span>}
      </div>
      {inbox.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-stone">
          {running ? "Xodimlar ishlayapti. Tayyor bo'lgan ishlar shu yerga tushadi." : flow ? "Bu topshiriqda joylanadigan ish yo'q." : "Topshiriq bering — tayyor postlar va videolar shu yerga tushadi. Siz tasdiqlamaguningizcha hech narsa joylanmaydi."}
        </p>
      ) : (
        <ul className="divide-y divide-sand">
          <AnimatePresence initial={true}>
            {inbox.map((i, n) => (
              <motion.li key={i.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: n * 0.08 }}>
                <button
                  type="button"
                  onClick={() => (i.type === "post" && i.postId ? review(i.postId) : setView("video"))}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-paper"
                >
                  <AgentAvatar kind={i.type === "video" ? "video" : "copywriter"} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{i.title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      {itemBadge(i)}
                      {i.state === "waiting" && i.reasons.length > 0 && (
                        <span className="text-[11px] text-stone">sabab: {i.reasons.map((r) => RULE_NAME[r]).join(", ")}</span>
                      )}
                    </span>
                  </span>
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
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
  const sources = useStudio((s) => s.sources);
  const post = posts.find((p) => p.id === reviewing);
  const item = inbox.find((i) => i.postId === reviewing);
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === "Escape" && review(null);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [review]);
  return (
    <AnimatePresence>
      {post && item && (
        <motion.div className="fixed inset-0 z-50 flex justify-end bg-ink/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => review(null)}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Postni ko'rib chiqish"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="uslub flex h-full w-full max-w-[640px] flex-col overflow-y-auto bg-paper p-4 sm:p-6"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-[13px] text-stone">Kopirayter → Muharrir → Tarjimon</div>
                <h2 className="font-display text-[20px] font-semibold">{post.brief}</h2>
              </div>
              <button type="button" aria-label="Yopish" onClick={() => review(null)} className="rounded-lg p-2 hover:bg-shell">
                <X className="h-5 w-5" />
              </button>
            </div>
            <PostReview
              post={post}
              state={item.state}
              reasons={item.reasons.map((r) => RULE_NAME[r])}
              demo={sources.posts !== "live" || item.url === undefined}
              onChange={(s, t, score) => updatePost(post.id, s, t, score)}
              onApprove={() => setItem(item.id, { state: "approved" })}
              onPublish={async (script) => {
                const r = await api.publishPost(post.id, script, brand.channel ?? "");
                if (r.data.ok) setItem(item.id, { state: "published", url: r.data.url });
              }}
            />
            {item.url && (
              <a href={item.url} target="_blank" rel="noreferrer" className="mt-3 text-[13px] font-semibold text-lapis underline">
                Kanalda ko&apos;rish
              </a>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------ views */

function DelegateView() {
  const flow = useStudio((s) => s.flow);
  const status = useStudio((s) => s.status);
  const selected = useStudio((s) => s.selected);
  const select = useStudio((s) => s.select);
  const running = useStudio((s) => s.running);
  const posts = useStudio((s) => s.posts);
  const leads = useStudio((s) => s.leads);
  const video = useStudio((s) => s.video);
  const setView = useStudio((s) => s.setView);
  const mobile = useIsMobile();
  return (
    <div className="flex flex-col gap-5">
      <DelegateBox compact={!!flow} />
      {flow && <RunHeader />}
      <div className={`grid gap-5 ${flow ? "lg:grid-cols-[minmax(0,1fr)_340px]" : "lg:grid-cols-[minmax(0,1fr)_340px]"}`}>
        <div className="flex min-w-0 flex-col gap-3">
          {flow ? (
            <>
              <div className="flex items-baseline justify-between">
                <h3 className="font-bold">Bo&apos;limingiz qanday ishlaydi</h3>
                <span className="text-[12px] text-stone">Xodimni bosing — natijasi ochiladi</span>
              </div>
              {mobile ? (
                <StepList flow={flow} status={status} onSelect={(id) => select(id)} />
              ) : (
                <div className="relative">
                  <FlowCanvas flow={flow} status={status} selected={selected} onSelect={select} className="h-[520px] rounded-3xl" />
                  <AnimatePresence>{selected && <NodePanel />}</AnimatePresence>
                </div>
              )}
              {mobile && selected && (
                <div className="relative min-h-[320px]">
                  <NodePanel />
                </div>
              )}
              {!running && (posts.length > 0 || leads.length > 0 || video) && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { k: "brand" as View, n: "Brend DNK", v: "tayyor" },
                    { k: "delegate" as View, n: `${posts.length} ta post`, v: "4 yozuvda" },
                    { k: "radar" as View, n: `${leads.length} ta joy`, v: "mijozlaringiz" },
                    { k: "video" as View, n: video ? "Reels" : "—", v: video ? `${video.scenes.reduce((a, s) => a + s.seconds, 0)} soniya` : "" },
                  ].map((c) => (
                    <button key={c.n} type="button" onClick={() => setView(c.k)} className="rounded-2xl border border-sand bg-white px-3 py-2.5 text-left hover:border-ink/30">
                      <div className="flex items-center gap-1.5 text-[15px] font-extrabold"><CircleCheck className="h-4 w-4 text-turq" />{c.n}</div>
                      <div className="text-[12px] text-stone">{c.v}</div>
                    </button>
                  ))}
                </motion.div>
              )}
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
    <section className="rounded-2xl border border-sand bg-white p-4">
      <h3 className="font-bold">Sizning marketing bo&apos;limingiz</h3>
      <p className="mt-1 text-[13px] text-stone">9 ta xodim. Topshiriq bersangiz, Strateg ishni ular orasida taqsimlaydi.</p>
      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {AGENT_ORDER.map((r) => (
          <li key={r} className="flex items-center gap-2.5 rounded-xl bg-paper px-2.5 py-2">
            <AgentAvatar kind={r} size={32} />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-bold">{AGENTS[r].name}</span>
              <span className="block truncate text-[11px] text-stone">{AGENTS[r].en}</span>
            </span>
          </li>
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
    <button type="button" onClick={() => setView("rules")} className="rounded-2xl border border-dashed border-sand px-4 py-3 text-left text-[13px] hover:border-ink/30">
      <span className="flex items-center gap-2 font-bold"><Bot className="h-4 w-4 text-lapis" /> Avtopilot</span>
      <span className="mt-0.5 block text-stone">
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
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-turq" : "bg-sand"}`}
    >
      <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 32 }} className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow ${on ? "right-1" : "left-1"}`} />
    </button>
  );
}

function RulesView() {
  const autopilot = useStudio((s) => s.autopilot);
  const setRule = useStudio((s) => s.setRule);
  return (
    <div className="max-w-2xl">
      <Header title="Avtopilot qoidalari" sub="Qaysi ishlar o'zi joylanadi, qaysilari sizning tasdig'ingizni kutadi." />
      <ul className="divide-y divide-sand overflow-hidden rounded-2xl border border-sand bg-white">
        {RULES.map((r) => (
          <li key={r.key} className="flex items-center gap-4 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="font-bold">{r.name}</div>
              <div className="text-[13px] text-stone">{r.hint}</div>
            </div>
            <span className={`hidden text-[12px] font-semibold sm:inline ${autopilot[r.key] ? "text-turq" : "text-[#8a5a10]"}`}>
              {autopilot[r.key] ? "Avtopilot" : "Tasdiq bilan"}
            </span>
            <Toggle on={autopilot[r.key]} onChange={(v) => setRule(r.key, v)} label={`${r.name}: avtopilot`} />
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-start gap-2 text-[13px] text-stone">
        <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
        Jadval bo&apos;yicha joylash — beta. Hozir qoidalar shu brauzerda saqlanadi; avtomatik jadval hackathondan keyin ulanadi.
      </p>
    </div>
  );
}

function Header({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[24px] font-semibold sm:text-[30px]">{title}</h1>
        {sub && <p className="mt-1 max-w-2xl text-[14px] text-stone">{sub}</p>}
      </div>
      {children}
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
        {AGENT_ORDER.map((r) => {
          const a = AGENTS[r];
          const st = statusOf(r);
          return (
            <li key={r} className="flex gap-3 rounded-2xl border border-sand bg-white p-4">
              <AgentAvatar kind={r} size={52} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{a.name}</span>
                  {st && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-night px-2 py-0.5 text-[11px] text-white">
                      <StatusIcon status={st} className="h-3 w-3" /> {STATUS_TEXT[st]}
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-stone">{a.ru} · {a.en}</div>
                <p className="mt-1.5 text-[13px]">{a.does}</p>
                <p className="mt-2 rounded-lg bg-paper px-2.5 py-1.5 text-[12px]"><b>Bugun:</b> {a.today}</p>
              </div>
            </li>
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
      <Header title="Brend xotirasi" sub="Biznesingiz haqida bir marta yozing — barcha xodimlar shundan foydalanadi." />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex flex-col gap-4">
          <label className="block">
            <span className="mb-1.5 block text-[14px] font-bold">Bilimlar bazasi</span>
            <span className="mb-2 block text-[13px] text-stone">Mahsulotlar, narxlar, manzil, ish vaqti, tarixingiz.</span>
            <textarea
              value={brand.knowledge}
              onChange={(e) => setKnowledge(e.target.value)}
              rows={8}
              className="w-full rounded-2xl border border-sand bg-white p-3.5 text-[14px] leading-relaxed outline-none focus:border-lapis"
            />
          </label>
          <div>
            <div className="mb-2 text-[14px] font-bold">Manbalar</div>
            <ul className="divide-y divide-sand overflow-hidden rounded-2xl border border-sand bg-white text-[14px]">
              <li className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Send className="h-4 w-4 text-lapis" />
                <span className="font-semibold">Telegram kanal</span>
                <input value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Telegram kanal" className="min-w-0 flex-1 rounded-lg border border-sand bg-paper px-2.5 py-1.5 outline-none focus:border-lapis" />
                <span className="rounded-full bg-turq-soft px-2 py-0.5 text-[11px] font-bold text-[#0e6f64]">Ulangan</span>
              </li>
              {["Instagram", "YouTube"].map((s) => (
                <li key={s} className="flex items-center gap-3 px-4 py-3 text-stone">
                  <span className="h-4 w-4 rounded-full border-2 border-sand" />
                  <span className="flex-1 font-semibold">{s}</span>
                  <span className="rounded-full bg-shell px-2 py-0.5 text-[11px] font-bold">Tez kunda</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-center gap-3">
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
              className="rounded-xl bg-lapis px-4 py-2.5 text-[14px] font-bold text-white hover:bg-lapis-deep disabled:opacity-50"
            >
              {busy ? "O'qilmoqda…" : "Brend DNK ni yangilash"}
            </button>
            {note && <span className="text-[13px] text-stone">{note}</span>}
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
      <Header title="Mijoz radar" sub="Mijozlaringiz qayerda — va u yerda nima qilish kerak.">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await api.findLeads(brand.id);
            useStudio.setState({ leads: r.data, sources: { ...useStudio.getState().sources, radar: r.source } });
            setBusy(false);
          }}
          className="rounded-xl bg-clay px-4 py-2.5 text-[14px] font-bold text-white hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Qidirilmoqda…" : leads.length ? "Qayta qidirish" : "Mijozlarni topish"}
        </button>
      </Header>
      {leads.length ? <LeadList leads={leads} /> : <p className="rounded-2xl border border-dashed border-sand p-6 text-[14px] text-stone">Hali qidirilmagan. «Mijozlarni topish» ni bosing yoki «Mijoz qidirish» topshirig&apos;ini bering.</p>}
    </div>
  );
}

function VideoView() {
  const video = useStudio((s) => s.video);
  const brand = useStudio((s) => s.brand);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <Header title="Videograf" sub="Reels va TikTok: birinchi 2 soniya, kadrlar, ovoz va subtitrlar.">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await api.planVideo(brand.id, "Yangi palto uchun 15 soniyalik Reels");
            useStudio.setState({ video: r.data, sources: { ...useStudio.getState().sources, video: r.source } });
            setBusy(false);
          }}
          className="rounded-xl bg-lapis px-4 py-2.5 text-[14px] font-bold text-white hover:bg-lapis-deep disabled:opacity-50"
        >
          {busy ? "Yozilmoqda…" : video ? "Yangi ssenariy" : "Ssenariy yozish"}
        </button>
      </Header>
      {video ? <Storyboard plan={video} /> : <p className="rounded-2xl border border-dashed border-sand p-6 text-[14px] text-stone">Hali ssenariy yo&apos;q. «Ssenariy yozish» ni bosing yoki «Reels» topshirig&apos;ini bering.</p>}
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
    setTimeout(() => void run(task), 400);
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

  const live = Object.values(sources).some((s) => s === "live");
  const waiting = useMemo(() => inbox.filter((i) => i.state === "waiting").length, [inbox]);

  return (
    <div className="uslub flex min-h-dvh flex-col md:flex-row">
      <aside className="sticky top-0 z-30 border-b border-sand bg-paper/95 backdrop-blur md:h-dvh md:w-[232px] md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-3 md:py-5">
          <Link href="/" aria-label="Bosh sahifa"><Logo /></Link>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold md:hidden ${live ? "bg-turq-soft text-[#0e6f64]" : "bg-shell text-stone"}`}>
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
                className={`relative flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-[14px] font-semibold transition-colors ${on ? "text-ink" : "text-stone hover:text-ink"}`}
              >
                {on && <motion.span layoutId="nav-on" className="absolute inset-0 rounded-xl bg-white shadow-[0_1px_2px_rgba(19,21,28,.08)] ring-1 ring-sand" />}
                <Icon className="relative h-4 w-4" />
                <span className="relative whitespace-nowrap">{n.name}</span>
                {n.key === "delegate" && waiting > 0 && (
                  <span className="relative rounded-full bg-saffron px-1.5 text-[11px] font-extrabold text-ink">{waiting}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto hidden px-4 pb-5 md:absolute md:bottom-0 md:block md:w-full">
          <div className="rounded-2xl border border-sand bg-white p-3 text-[13px]">
            <div className="font-bold">{brand.dna.name}</div>
            <div className="text-stone">{brand.channel}</div>
            <div className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${live ? "bg-turq-soft text-[#0e6f64]" : "bg-shell text-stone"}`}>
              {live ? "Jonli ma'lumot" : "Namuna ma'lumot"}
            </div>
          </div>
          <a href={TG_BOT_URL} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2 px-1 text-[13px] font-semibold text-lapis">
            <Send className="h-4 w-4" /> Telegram bot
          </a>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        {view === "delegate" && <DelegateView />}
        {view === "team" && <TeamView />}
        {view === "brand" && <BrandView />}
        {view === "radar" && <RadarView />}
        {view === "video" && <VideoView />}
        {view === "rules" && <RulesView />}
      </main>
      <ReviewDrawer />
    </div>
  );
}
