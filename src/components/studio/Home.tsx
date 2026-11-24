"use client";

import type { AgentRole, NodeKind, NodeStatus } from "@/lib/uslub/contract";
import { ArrowUp, Check, ChevronDown, Link2, PencilLine, Send } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { DnaCard, dnaRows } from "@/components/lamp/Dna";
import { LampTile } from "@/components/lamp/LampTile";
import { LAMP_ORDER, LAMPS, type LampState } from "@/components/lamp/lamps";
import { Led, LedStrip } from "@/components/lamp/Led";
import { DeckStack } from "@/components/lamp/DeckStack";
import { TgPost } from "@/components/lamp/TgPost";
import { StepList } from "./flowParts";
import { TEMPLATES } from "./mocks";
import { SpectrumIntro } from "./SpectrumIntro";
import { KIND_SOURCE, useStudio, type InboxItem, type RuleKey, type View } from "./store";

const FlowCanvas = dynamic(() => import("./FlowCanvas").then((m) => m.FlowCanvas), {
  ssr: false,
  loading: () => <div className="h-[460px] rounded-[28px] bg-[var(--glass)]" />,
});

const RULE_WHY: Record<RuleKey, string> = {
  routine: "Oddiy post",
  promo: "Aksiya bor, siz tasdiqlaysiz",
  prices: "Narx bor, siz tasdiqlaysiz",
  video: "Video, siz tasdiqlaysiz",
  first: "Birinchi beshta postdan biri",
};

const noSubscribe = () => () => {};

const TO_LAMP: Record<NodeStatus, LampState> = {
  idle: "off",
  running: "warming",
  done: "on",
  needs_approval: "you",
  error: "error",
};

const LAMP_VIEW: Partial<Record<AgentRole, View>> = {
  brand: "brand",
  analyst: "analysis",
  strategist: "strategy",
  radar: "radar",
  video: "video",
  publisher: "rules",
};

/** Lamp state per employee, from the run's node statuses. */
function useLampStates(gate: boolean) {
  const flow = useStudio((s) => s.flow);
  const status = useStudio((s) => s.status);
  const inbox = useStudio((s) => s.inbox);
  return useMemo(() => {
    const out = {} as Record<AgentRole, LampState>;
    LAMP_ORDER.forEach((r) => (out[r] = "off"));
    if (!flow || gate) return out;
    flow.nodes.forEach((n) => {
      if (n.kind === "input" || n.kind === "approval") return;
      out[n.kind] = TO_LAMP[status[n.id] ?? "idle"];
    });
    if (flow.nodes.some((n) => n.kind === "publisher")) {
      if (inbox.some((i) => i.state === "waiting")) out.publisher = "you";
      else if (inbox.some((i) => i.state === "published")) out.publisher = "on";
    }
    return out;
  }, [flow, status, inbox, gate]);
}

function Num({ n, word }: { n: number | string; word: string }) {
  return (
    <span className="flex flex-col items-start gap-1.5">
      <Led text={String(n)} dot={3.6} gap={1.4} color="currentColor" grid={false} label={`${n} ${word}`} />
      <span className="text-[12.5px] leading-none">{word}</span>
    </span>
  );
}

function useResults() {
  const brand = useStudio((s) => s.brand);
  const audit = useStudio((s) => s.audit);
  const plan = useStudio((s) => s.plan);
  const posts = useStudio((s) => s.posts);
  const leads = useStudio((s) => s.leads);
  const video = useStudio((s) => s.video);
  return useMemo(() => {
    const r: Partial<Record<AgentRole, React.ReactNode>> = {};
    const d = brand.dna;
    r.brand = <span className="line-clamp-2 text-[15px] font-semibold leading-tight">{d.address !== "n/a" ? `«${d.address}», ` : ""}{d.tone.split(/[,.;]/)[0]}</span>;
    if (audit) r.analyst = audit.reachRate ? <Num n={`${Math.round(audit.reachRate * 100)}%`} word="qamrov" /> : <Num n={audit.postsAnalyzed} word="post" />;
    if (plan) r.strategist = <Num n={plan.items.length} word="kunlik reja" />;
    if (posts.length) {
      r.copywriter = <Num n={posts.length} word="post" />;
      const avg = Math.round(posts.reduce((a, p) => a + p.humanScore, 0) / posts.length);
      r.editor = <Num n={avg} word="inson bali" />;
      r.translator = <span className="text-[15px] font-semibold leading-tight">4 yozuv</span>;
    }
    if (video) r.video = <Num n={video.scenes.reduce((a, s) => a + s.seconds, 0)} word="soniya" />;
    if (leads.length) r.radar = <Num n={leads.length} word="joy" />;
    r.publisher = <span className="truncate text-[14px] font-semibold">{brand.channel || "Telegram"}</span>;
    return r;
  }, [brand, audit, plan, posts, leads, video]);
}

/* ---------------------------------------------------------------- input */

function TaskBox({ fieldRef, compact }: { fieldRef: React.RefObject<HTMLFormElement | null>; compact: boolean }) {
  const run = useStudio((s) => s.run);
  const running = useStudio((s) => s.running);
  // Pre-filled with the pasted channel so the field the Spektr beams leave from shows what was sent.
  // Read hydration-safely: the page is prerendered without a query string.
  const search = useSyncExternalStore(noSubscribe, () => window.location.search, () => "");
  const fromUrl = new URLSearchParams(search).get("channel")?.slice(0, 64) ?? "";
  const [typed, setTyped] = useState<string | null>(null);
  const v = typed ?? fromUrl;
  const setV = (x: string) => setTyped(x);
  const start = (t: string) => {
    if (!t.trim() || running) return;
    const isLink = /^(?:https?:\/\/)?(?:t\.me\/|@)?[A-Za-z][A-Za-z0-9_]{3,31}\/?$/.test(t.trim()) && !/\s/.test(t.trim());
    void run(isLink ? `t.me/${t.trim().replace(/^(?:https?:\/\/)?(?:t\.me\/|@)/, "").replace(/\/$/, "")} — butun marketingni yo'lga qo'ying` : t.trim());
  };
  return (
    <div className="flex flex-col gap-3">
      <form
        ref={fieldRef}
        className="field"
        onSubmit={(e) => {
          e.preventDefault();
          start(v);
        }}
      >
        <Link2 className="h-5 w-5 shrink-0 text-[var(--ink-3)]" aria-hidden />
        <label htmlFor="task" className="sr-only">
          Kanal havolasi yoki topshiriq
        </label>
        <input id="task" value={v} onChange={(e) => setV(e.target.value)} placeholder="Kanal havolasi yoki topshiriq" autoComplete="off" autoCapitalize="none" />
        <button type="submit" disabled={!v.trim() || running} className="btn-lime !min-h-[50px] shrink-0 !px-5" aria-label="Topshiriqni berish">
          {compact ? <ArrowUp className="h-5 w-5" aria-hidden /> : "Yoqish"}
        </button>
      </form>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" aria-label="Tayyor topshiriqlar">
        {TEMPLATES.map((t) => (
          <button
            key={t.key}
            type="button"
            title={t.hint}
            disabled={running}
            onClick={() => {
              setV(t.task);
              start(t.task);
            }}
            className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3.5 text-[13.5px] font-medium text-[var(--ink-2)] transition-colors duration-200 hover:text-[var(--ink)] disabled:opacity-40"
            style={{ boxShadow: "inset 0 0 0 1px var(--hair-2)" }}
          >
            {t.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- deck */

export function ApprovalDeck({ inTelegram }: { inTelegram: boolean }) {
  const inbox = useStudio((s) => s.inbox);
  const posts = useStudio((s) => s.posts);
  const video = useStudio((s) => s.video);
  const brand = useStudio((s) => s.brand);
  const sources = useStudio((s) => s.sources);
  const setItem = useStudio((s) => s.setItem);
  const review = useStudio((s) => s.review);
  const setView = useStudio((s) => s.setView);
  const running = useStudio((s) => s.running);
  const [leaving, setLeaving] = useState<string | null>(null);
  const waiting = inbox.filter((i) => i.state === "waiting");
  const ready = inbox.filter((i) => i.state === "approved");
  const sample = (i: InboxItem) => sources[i.type === "video" ? "video" : "posts"] !== "live";
  const postOf = (i: InboxItem) => (i.type === "post" ? posts.find((p) => p.id === i.postId) : undefined);
  const hitsOf = (i: InboxItem) => postOf(i)?.neuroHits.uz_latn ?? [];
  /** The draft as the owner will see it, with any cliché the editor still flags underlined. */
  const bodyOf = (i: InboxItem): React.ReactNode => {
    if (i.type === "video") return video?.hook ?? i.title;
    const text = postOf(i)?.variants.uz_latn ?? i.title;
    const hit = hitsOf(i).find((h) => h.index >= 0 && text.slice(h.index, h.index + h.phrase.length) === h.phrase);
    if (!hit) return text;
    return (
      <>
        {text.slice(0, hit.index)}
        <span className="neuro" title="Muharrir: neyro-so‘z">{hit.phrase}</span>
        {text.slice(hit.index + hit.phrase.length)}
      </>
    );
  };
  const approve = (i: InboxItem) => {
    if (leaving) return;
    setLeaving(i.id);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => {
      setItem(i.id, { state: "approved" });
      setLeaving(null);
    }, reduce ? 0 : 320);
  };

  if (inbox.length === 0) {
    return (
      <div className="rounded-[22px] p-5" style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}>
        <p className="text-[16px] font-semibold">Tasdiqlash navbati bo‘sh</p>
        <p className="mt-1 text-[14px] leading-relaxed text-[var(--ink-2)]">
          {running ? "Xodimlar ishlayapti. Tayyor postlar shu yerga tushadi." : "Kanal havolasini bering: tayyor postlar shu yerga tushadi. Siz tasdiqlamaguningizcha hech narsa joylanmaydi."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {waiting.length > 0 ? (
        <>
          <div aria-live="polite">
            <DeckStack
              key={waiting[0].id}
              why={waiting[0].type === "video" ? "Video, siz tasdiqlaysiz" : RULE_WHY[waiting[0].reasons[0] ?? "routine"]}
              depth={Math.min(2, waiting.length - 1)}
              leaving={leaving === waiting[0].id}
            >
              <TgPost name={brand.dna.name || brand.channel || "Kanal"} text={<span className="line-clamp-6">{bodyOf(waiting[0])}</span>} time="qoralama" sample={sample(waiting[0])} />
            </DeckStack>
            {hitsOf(waiting[0]).length > 0 && (
              <p className="mt-2.5 px-1 text-[13px] leading-snug text-[var(--ink-2)]">
                Muharrir {hitsOf(waiting[0]).length} ta neyro-so‘zni belgiladi. Qalam bilan oching: bitta tegishda almashtiriladi.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-lime flex-1" onClick={() => approve(waiting[0])}>
              <Check className="h-[18px] w-[18px]" aria-hidden /> Tasdiqlash
            </button>
            <button
              type="button"
              className="btn-quiet"
              aria-label="Tahrirlash"
              onClick={() => (waiting[0].type === "post" && waiting[0].postId ? review(waiting[0].postId) : setView("video"))}
            >
              <PencilLine className="h-[18px] w-[18px]" aria-hidden />
            </button>
          </div>
          <p className="tnum text-center text-[12.5px] text-[var(--ink-3)]">{waiting.length} ta ish sizni kutmoqda</p>
        </>
      ) : (
        <p className="flex items-center gap-2 text-[15px] font-semibold">
          <Check className="h-5 w-5 text-[var(--lime)]" aria-hidden /> Hammasi tasdiqlandi
        </p>
      )}
      {ready.length > 0 && (
        <ul className="divide-y divide-[var(--hair)] rounded-[20px] bg-[var(--glass)]" style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }} aria-label="Joylashga tayyor">
          {ready.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1 truncate text-[14px]">{i.title}</span>
              <button
                type="button"
                className="btn-quiet !min-h-9 !px-3.5 !text-[13.5px]"
                onClick={() => (i.type === "post" && i.postId ? review(i.postId) : setView("video"))}
              >
                <Send className="h-3.5 w-3.5" aria-hidden /> {inTelegram ? "Joylash" : "Telegramda joylash"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- home */

export function Home({ inTelegram = false }: { inTelegram?: boolean }) {
  const flow = useStudio((s) => s.flow);
  const status = useStudio((s) => s.status);
  const running = useStudio((s) => s.running);
  const elapsed = useStudio((s) => s.elapsed);
  const brand = useStudio((s) => s.brand);
  const audit = useStudio((s) => s.audit);
  const sources = useStudio((s) => s.sources);
  const notice = useStudio((s) => s.notice);
  const inbox = useStudio((s) => s.inbox);
  const setView = useStudio((s) => s.setView);
  const review = useStudio((s) => s.review);
  const posts = useStudio((s) => s.posts);
  const select = useStudio((s) => s.select);
  const fieldRef = useRef<HTMLFormElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);
  const deckRef = useRef<HTMLDivElement>(null);
  const [intro, setIntro] = useState<{ k: number; gate: boolean } | null>(null);
  const [layer2, setLayer2] = useState(false);
  const lastFlow = useRef<string | null>(null);

  // A new run starts: play the Spektr intro once, holding the lamps dark until the beams land.
  useEffect(() => {
    if (!flow || !running) return;
    const key = `${flow.id}-${flow.title}`;
    if (lastFlow.current === key) return;
    lastFlow.current = key;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setTimeout(() => setIntro({ k: Date.now(), gate: true }), 0);
    return () => clearTimeout(id);
  }, [flow, running]);

  // When the department finishes, bring the approval deck into view.
  const waiting = inbox.filter((i) => i.state === "waiting").length;
  useEffect(() => {
    if (!running && waiting > 0) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      deckRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
    }
  }, [running, waiting]);

  // Safety net: if the intro cannot animate (hidden tab, no rAF), never keep the lamps dark.
  useEffect(() => {
    if (!intro?.gate) return;
    const id = window.setTimeout(() => setIntro((i) => (i ? { ...i, gate: false } : i)), 2500);
    return () => clearTimeout(id);
  }, [intro?.gate]);

  const lamps = useLampStates(!!intro?.gate);
  const onBloom = useCallback(() => setIntro((i) => (i ? { ...i, gate: false } : i)), []);
  const onDone = useCallback(() => setIntro(null), []);
  const results = useResults();
  // Per-lamp "namuna" only when the run mixes live and sample data; an all-sample run says so once, above.
  const sampleKinds = useMemo(() => {
    const m = new Set<NodeKind>();
    const used = Object.values(sources).filter(Boolean);
    if (!used.some((v) => v === "live")) return m;
    LAMP_ORDER.forEach((r) => {
      const k = KIND_SOURCE[r];
      if (k && sources[k] && sources[k] !== "live") m.add(r);
    });
    return m;
  }, [sources]);

  const usedSources = Object.values(sources).filter(Boolean);
  const allSample = !!flow && usedSources.length > 1 && !usedSources.some((v) => v === "live");
  const channel = brand.channel?.replace(/^@/, "") ?? "";
  const led = audit
    ? `@${channel || audit.channel.replace(/^@/, "")}  ${audit.subscribers ? `${audit.subscribers.toLocaleString("ru-RU").replace(/ /g, " ")} OBUNACHI  ` : ""}${audit.reachRate ? `QAMROV ${Math.round(audit.reachRate * 100)}%  ` : ""}${audit.bestHours[0] !== undefined ? `ENG YAXSHI SOAT ${String(audit.bestHours[0]).padStart(2, "0")}:00` : ""}`
    : flow && channel
      ? `@${channel}`
      : undefined;
  const secs = Math.floor(elapsed);
  const staff = flow ? flow.nodes.filter((n) => n.kind !== "input" && n.kind !== "approval") : [];
  const inTask = new Set(staff.map((n) => n.kind));
  const done = staff.filter((n) => status[n.id] === "done" || status[n.id] === "needs_approval").length;

  const openLamp = (r: AgentRole) => {
    if ((r === "copywriter" || r === "editor" || r === "translator") && posts[0]) return review(posts[0].id);
    if (inTelegram) return;
    const v = LAMP_VIEW[r];
    if (v) setView(v);
  };

  return (
    <div className="relative grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12">
      <div className="flex min-w-0 flex-col gap-5">
        {!flow && (
          <div>
            <h1 className="text-balance text-[32px] font-semibold leading-[1.02] tracking-[-0.03em] sm:text-[44px]">Topshiriq bering</h1>
            <p className="mt-2 max-w-[48ch] text-[15px] leading-relaxed text-[var(--ink-2)]">
              Kanal havolasini qo‘ying, bo‘lim butunlay ishga tushadi. Yoki bitta ish yozing: «Black Friday uchun bir haftalik kontent».
            </p>
          </div>
        )}
        <TaskBox fieldRef={fieldRef} compact={!!flow} />

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <LedStrip text={led} dot={3} gap={1.3} run={!!led && led.length > 10} className="min-w-0 flex-1" label={led ? led.toLowerCase() : undefined} />
            {flow && (
              <span className="rounded-[12px] bg-[var(--stage)] px-3 py-2.5" style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}>
                <Led text={`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`} dot={3} gap={1.3} label={`${secs} soniya`} grid={false} />
              </span>
            )}
          </div>
          {flow && (
            // Space is reserved for this line so the panel never moves under the Spektr beams.
            <p className="flex min-h-[38px] items-start gap-2 px-1 text-[13px] leading-snug text-[var(--ink-2)]">
              {(notice || allSample || (sources.audit && sources.audit !== "live")) && (
                <>
                  <span className="namuna shrink-0">namuna</span>
                  <span>{notice ?? (allSample ? "Natijalar namuna: haqiqiy kanal hali o‘qilmadi." : "Raqamlar namuna: kanal hali o‘qilmadi.")}</span>
                </>
              )}
            </p>
          )}
        </div>

        {flow && (
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{running ? "Bo‘lim ishlayapti" : "Bo‘lim tayyor"}</h1>
            <span className="tnum text-[13px] text-[var(--ink-2)]" aria-live="polite">
              {done}/{staff.length} xodim
            </span>
          </div>
        )}

        <div className="relative">
          <ul ref={panelRef} className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5" aria-label="Bo‘lim xodimlari">
            {LAMP_ORDER.map((r) => {
              const st = lamps[r];
              const lit = st === "on" || st === "you";
              return (
                <li key={r} className="relative">
                  <LampTile
                    as="button"
                    role={r}
                    state={st}
                    size="md"
                    note={flow && !inTask.has(r) ? "bu ishda yo‘q" : undefined}
                    className={`w-full ${flow && !inTask.has(r) ? "opacity-55" : ""}`}
                    aria-label={`${LAMPS[r].name}: ${flow && !inTask.has(r) ? "bu ishda yo‘q" : lit ? "natijani ochish" : st === "warming" ? "ishlayapti" : "kutmoqda"}`}
                    aria-disabled={!lit || undefined}
                    onClick={() => lit && openLamp(r)}
                  >
                    {lit ? results[r] ?? null : null}
                  </LampTile>
                  {lit && sampleKinds.has(r) && <span className="namuna pointer-events-none absolute right-2.5 top-2.5 !h-5 !px-2 !text-[11px]">namuna</span>}
                </li>
              );
            })}
          </ul>
          {intro && <SpectrumIntro key={intro.k} fieldRef={fieldRef} panelRef={panelRef} onBloom={onBloom} onDone={onDone} />}
        </div>

        {!flow && (
          <DnaCard rows={dnaRows(brand.dna)} sample={sources.brand !== "live"} title={`${brand.dna.name}: ovoz`} className="sm:max-w-[420px]" />
        )}

        {flow && (
          <section aria-labelledby="layer2-h" className="rounded-[22px]" style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}>
            <button
              type="button"
              aria-expanded={layer2}
              onClick={() => setLayer2((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
            >
              <span>
                <span id="layer2-h" className="block text-[16px] font-semibold">Bo‘limingiz qanday ishlaydi</span>
                <span className="block text-[13px] text-[var(--ink-2)]">Kim kimga ish uzatadi: xodimlar sxemasi</span>
              </span>
              <ChevronDown className={`h-5 w-5 shrink-0 text-[var(--ink-2)] transition-transform duration-300 ${layer2 ? "rotate-180" : ""}`} aria-hidden />
            </button>
            {layer2 && (
              <div className="px-3 pb-3">
                <div className="hidden md:block">
                  <FlowCanvas
                    flow={flow}
                    status={status}
                    selected={null}
                    onSelect={(id) => {
                      select(id);
                      const kind = flow.nodes.find((n) => n.id === id)?.kind;
                      if (kind && kind !== "input" && kind !== "approval") openLamp(kind);
                    }}
                    follow
                    className="h-[460px] rounded-[18px]"
                  />
                </div>
                <div className="md:hidden">
                  <StepList flow={flow} status={status} />
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      <aside
        ref={deckRef}
        aria-labelledby="deck-h"
        className={`flex scroll-mt-28 flex-col gap-4 lg:sticky lg:top-24 lg:order-none lg:self-start ${!running && waiting > 0 ? "order-first" : ""}`}
      >
        <div className="flex items-baseline justify-between">
          <h2 id="deck-h" className="text-[22px] font-semibold tracking-[-0.02em]">
            Tasdiqlash
          </h2>
          {!inTelegram && (
            <button type="button" onClick={() => setView("rules")} className="inline-flex min-h-11 items-center text-[13.5px] text-[var(--ink-2)] underline decoration-[var(--hair-2)] underline-offset-4 hover:text-[var(--ink)]">
              Avtopilot qoidalari
            </button>
          )}
        </div>
        <ApprovalDeck inTelegram={inTelegram} />
        <p className="text-[12.5px] leading-relaxed text-[var(--ink-3)]">
          Hech narsa siz «Joylash»ni bosmaguningizcha kanalga chiqmaydi. Narx, aksiya, video va birinchi beshta post alohida belgilanadi.
        </p>
      </aside>
    </div>
  );
}
