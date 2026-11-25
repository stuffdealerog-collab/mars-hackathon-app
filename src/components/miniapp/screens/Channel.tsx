import type { ChannelAudit, PlanItem } from "@/lib/uslub/contract";
import { Check, ChevronRight, Settings } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Led } from "../../lamp/Led";
import { StyleRefs } from "../../media";
import * as api from "../../studio/api";
import { Strip, useLamps } from "../../studio/Department";
import { topFindings } from "../../studio/findings";
import { QuestionsCard } from "../../studio/Questions";
import { slotKey, useStudio } from "../../studio/store";
import type { PlanItemExtra } from "../../studio/api";
import { isMachineEvidence, ownerText, plural, weekday } from "../../ui/format";
import { fmt, num, useCopy, useLang } from "../../ui/lang";
import { useMiniCopy } from "../copy";
import { isLimit } from "../limits";
import { ledFit, useWidth } from "../measure";
import { useNav } from "../nav";
import { Skel, TopBar, useCompact } from "../Shell";
import { haptic } from "../tg";

// Pro rejim depth from the Studio, loaded only when Pro is on.
const AuditFull = dynamic(() => import("../../studio/pro/ProDetails").then((m) => m.AuditFull), { ssr: false });
const SufficiencyPanel = dynamic(() => import("../../studio/pro/ProDetails").then((m) => m.SufficiencyPanel), { ssr: false });
const PlanRowDetails = dynamic(() => import("../../studio/pro/ProDetails").then((m) => m.PlanRowDetails), { ssr: false });

/** «Kanal»: what Mercat read, what to fix, how the owner writes, the week's plan. */
export function ChannelScreen({ onOpenPost }: { onOpenPost: (id: string) => void }) {
  const c = useCopy();
  const m = useMiniCopy();
  const lang = useLang((s) => s.lang);
  const brand = useStudio((s) => s.brand);
  const mode = useStudio((s) => s.mode);
  const pro = useStudio((s) => s.pro);
  const sample = useStudio((s) => s.sample);
  const audit = useStudio((s) => s.audit);
  const sufficiency = useStudio((s) => s.sufficiency);
  // The audit's own count first: it is the number the channel sign shows (posts read can be fewer).
  const postsRead = useStudio((s) => s.audit?.postsAnalyzed ?? s.postsRead ?? null);
  const openSheet = useNav((s) => s.openSheet);
  const lamps = useLamps();
  const { ref, compact } = useCompact(56);
  const name = brand?.dna.name || brand?.channel || "Mercat";
  const sub = [brand?.channel && brand.channel !== name ? brand.channel : null, mode === "channel" && postsRead != null ? `${postsRead} ${plural(c.lampResult.postsRead, postsRead, lang)}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <TopBar title={name} compact={compact} />
      <div ref={ref} className="ma-scroll">
        <div className="ma-pad">
          <div className="flex items-start gap-3">
            <span aria-hidden className="mt-0.5 grid h-12 w-12 shrink-0 place-items-center rounded-full text-[19px] font-semibold text-white" style={{ background: "linear-gradient(160deg, #C86B3C, #6b3115)" }}>
              {name.replace(/^@/, "").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="ma-h1 truncate !text-[26px]">{name}</h1>
              <p className="mt-0.5 flex items-center gap-2 truncate text-[14px] text-ink-2">
                {sample && <span className="namuna">{m.sample}</span>}
                <span className="truncate">{sub}</span>
              </p>
            </div>
            <button
              type="button"
              className="ma-iconbtn -mr-2"
              aria-label={m.settingsLabel}
              onClick={() => {
                haptic.tap();
                openSheet({ name: "settings" });
              }}
            >
              <Settings className="h-[22px] w-[22px]" strokeWidth={1.8} aria-hidden />
            </button>
          </div>

          {/* The department in one line; a tap unfolds every lamp (Pro adds depth below, not more light). */}
          <div className="mt-4">
            <Strip lamps={lamps} />
          </div>

          {mode === "channel" ? <Numbers /> : <p className="mt-6 px-1 text-[15px] leading-relaxed text-ink-2">{c.channel.freshNoStats}</p>}
          <div className="mt-6 empty:hidden">
            <QuestionsCard variant="mini" />
          </div>
          {mode === "fresh" && <Launch />}
          <Style />
          {/* «Qanday yozasiz» is a marketer's table: Pro only. */}
          {pro && <Voice />}
          <Plan onOpenPost={onOpenPost} />
          {pro && <StrategyDetails />}
          {pro && (
            <div className="ma-pro mt-8 flex flex-col gap-8">
              <AuditFull audit={audit} />
              <SufficiencyPanel items={sufficiency} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="ma-h2">
      {children}
    </h2>
  );
}

function Numbers() {
  const c = useCopy();
  const m = useMiniCopy();
  const lang = useLang((s) => s.lang);
  const audit = useStudio((s) => s.audit);
  const problem = useStudio((s) => s.auditProblem);
  const reload = useStudio((s) => s.reloadAudit);

  if (!audit) {
    return (
      <>
        {problem ? (
          <div className="ma-group mt-6 flex flex-col items-start gap-3 p-4">
            <p className="text-[15px] leading-relaxed text-ink-2">{isLimit(problem.code) ? m.limit.note : problem.message}</p>
            <button type="button" className="btn-2 !min-h-11" onClick={() => void reload()}>
              {c.error.retry}
            </button>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-2.5" role="status" aria-label={c.work.readChannel.run}>
            {[0, 1, 2, 3].map((i) => (
              <Skel key={i} className="h-[86px] !rounded-[18px]" />
            ))}
          </div>
        )}
      </>
    );
  }

  // A million and up reads as "1,2M" (the sign's own letters); below that every digit is shown.
  const big = (n: number) => (n >= 1_000_000 ? `${num(n / 1_000_000, lang, 1)}M` : num(n, lang));
  const cells: [string, string][] = [];
  if (audit.subscribers != null) cells.push([big(audit.subscribers), c.channel.subscribers]);
  if (audit.avgViews != null) cells.push([big(Math.round(audit.avgViews)), c.channel.avgViews]);
  if (audit.reachRate != null) cells.push([`${num(audit.reachRate * 100, lang)}%`, c.channel.reach]);
  // "2 поста в неделю", "5 постов в неделю"; a fraction (1,5) takes the fraction form.
  const perWeek = Math.round(audit.postsPerWeek * 10) / 10;
  cells.push([num(audit.postsPerWeek, lang, 1), Number.isInteger(perWeek) ? plural(c.channel.perWeekForms, perWeek, lang) : c.channel.perWeekFraction]);

  return (
    <>
      {/* Measured numbers print on the amber LED, like a shop sign; nothing else does. */}
      <dl className="mt-6 grid grid-cols-2 gap-2.5">
        {cells.map(([v, k]) => (
          <div key={k} className="ma-group ma-sign flex flex-col-reverse justify-end gap-2.5 px-4 pb-3.5 pt-4">
            <dt className="text-[13px] leading-snug text-ink-2">{k}</dt>
            <FitLed text={v} />
          </div>
        ))}
      </dl>
      <section aria-labelledby="ma-find">
        <H2 id="ma-find">{c.channel.findingsTitle}</H2>
        <Findings audit={audit} />
      </section>
    </>
  );
}

/** A measured number on the sign, sized to its cell so every digit shows (123 456 on a 360 px phone). */
function FitLed({ text }: { text: string }) {
  const { ref, width } = useWidth<HTMLElement>();
  const fit = ledFit(text, width, { dot: 3.2, gap: 1.2 }, false); // numbers never run: always fit
  return (
    <dd ref={ref} className="min-w-0">
      {width > 0 && <Led text={text} dot={fit.dot} gap={fit.gap} label={text} grid={false} />}
    </dd>
  );
}

function Findings({ audit }: { audit: ChannelAudit }) {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const list = topFindings(audit);
  if (!list.length) return <p className="px-1 text-[15px] text-ink-2">{c.channel.findingsNone}</p>;
  return (
    <ol className="ma-group">
      {list.map((f, i) => (
        <Finding key={i} kind={f.kind} text={ownerText(f.text, lang)} evidence={f.evidence && !isMachineEvidence(f.evidence) ? ownerText(f.evidence, lang) : ""} />
      ))}
    </ol>
  );
}

/** One finding: its first sentence and the numbers behind it; the advice opens on a tap. */
function Finding({ kind, text, evidence }: { kind: "problem" | "opportunity" | "strength"; text: string; evidence: string }) {
  const c = useCopy();
  const m = useMiniCopy();
  const pro = useStudio((s) => s.pro);
  const [open, setOpen] = useState(false);
  // No regex lookbehind: Telegram's webview on iOS before 16.4 cannot parse it.
  const parts = text.match(/^([\s\S]+?[.!?])\s+([\s\S]+)$/);
  const head = parts ? parts[1] : text;
  const rest = parts ? parts[2] : "";
  const dot = kind === "strength" ? "bg-ok" : kind === "problem" ? "bg-bad" : "bg-led";
  const showAll = pro || open;
  const body = (
    <>
      <span className="flex items-center gap-2 text-[13px] text-ink-2">
        <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
        {c.channel.kind[kind]}
      </span>
      <span className="mt-1 block text-[16px] font-semibold leading-snug">{head}</span>
      {evidence && <span className="tnum mt-1 block text-[14px] leading-snug text-ink-2">{evidence}</span>}
      {rest && showAll && <span className="mt-1.5 block text-[14.5px] leading-snug text-ink-2">{rest}</span>}
      {rest && !showAll && <span className="mt-1 block text-[13.5px] font-medium text-ink-3">{m.more}</span>}
    </>
  );
  return (
    <li>
      {rest && !showAll ? (
        <button
          type="button"
          className="ma-row ma-press !block !py-3.5"
          onClick={() => {
            haptic.tap();
            setOpen(true);
          }}
        >
          {body}
        </button>
      ) : (
        <div className="ma-row !block !py-3.5">{body}</div>
      )}
    </li>
  );
}

/** Empty channel: how to get the first subscribers. */
function Launch() {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const launch = useStudio((s) => s.launch);
  if (!launch?.tactics.length) return null;
  return (
    <section aria-labelledby="ma-launch">
      <H2 id="ma-launch">{c.channel.launchTitle}</H2>
      <ol className="ma-group">
        {launch.tactics.slice(0, 5).map((t, i) => (
          <li key={i} className="ma-row !block !py-3.5">
            <p className="text-[15.5px] font-semibold leading-snug">{ownerText(t.title, lang)}</p>
            <p className="mt-1 text-[15px] leading-snug text-ink-2">{ownerText(t.how, lang)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The picture style: the channel's (and the owner's) reference photos and palette. */
function Style() {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const brand = useStudio((s) => s.brand);
  const pro = useStudio((s) => s.pro);
  const sample = useStudio((s) => s.sample);
  useBrandVisual();
  if (!brand || sample) return null;
  return (
    <section aria-labelledby="ma-style">
      <H2 id="ma-style">{c.lamps.designer.name}</H2>
      <div className="ma-group px-4 py-3.5">
        <StyleRefs
          key={brand.id}
          brandId={brand.id}
          initial={brand.visual ?? null}
          lang={lang}
          pro={pro}
          autoLearn={false}
          authorization={api.authHeader()}
          onChange={(visual) => {
            const b = useStudio.getState().brand;
            if (b?.id === brand.id) useStudio.setState({ brand: { ...b, visual } });
          }}
        />
      </div>
    </section>
  );
}

/** The store learns the style but does not keep the answer yet: read it once so StyleRefs and the refs line have it. */
function useBrandVisual() {
  const id = useStudio((s) => s.brand?.id);
  const has = useStudio((s) => !!s.brand?.visual);
  const sample = useStudio((s) => s.sample);
  useEffect(() => {
    if (!id || has || sample) return;
    let gone = false;
    const init = api.tgInitData();
    void fetch(`/api/uslub/visual?brandId=${encodeURIComponent(id)}&lang=${useLang.getState().lang}`, {
      headers: init ? { authorization: `tma ${init}` } : undefined,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { visual?: import("@/lib/uslub/contract").VisualStyle | null } | null) => {
        const b = useStudio.getState().brand;
        if (!gone && j?.visual && b?.id === id && !b.visual) useStudio.setState({ brand: { ...b, visual: j.visual } });
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [id, has, sample]);
}

function Voice() {
  const c = useCopy();
  const brand = useStudio((s) => s.brand);
  if (!brand) return null;
  const d = brand.dna;
  const rows = (
    [
      [c.channel.voice.address, c.channel.address[d.address] ?? "—"],
      [c.channel.voice.tone, d.tone],
      [c.channel.voice.length, d.avgPostLength ? fmt(c.channel.length, { n: Math.round(d.avgPostLength / 10) * 10 }) : "—"],
      [c.channel.voice.emoji, c.channel.emoji[d.emojiDensity] ?? "—"],
      [c.channel.voice.cta, d.ctaStyle],
    ] as [string, string][]
  ).filter(([, v]) => v && v !== "—");
  const shown = rows;
  return (
    <section aria-labelledby="ma-voice">
      <H2 id="ma-voice">{c.channel.voiceTitle}</H2>
      {d.oneLiner && <p className="mb-3 px-1 text-[15.5px] leading-relaxed">{d.oneLiner}</p>}
      <dl className="ma-group">
        {shown.map(([k, v]) => (
          <div key={k} className="ma-row !items-start">
            <dt className="w-[34%] shrink-0 text-[14px] leading-snug text-ink-2">{k}</dt>
            <dd className="min-w-0 flex-1 text-[15px] leading-snug">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Plan({ onOpenPost }: { onOpenPost: (id: string) => void }) {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const mode = useStudio((s) => s.mode);
  const plan = useStudio((s) => s.plan);
  const posts = useStudio((s) => s.posts);
  const progress = useStudio((s) => s.planProgress);
  const planStep = useStudio((s) => s.steps.find((x) => x.key === "plan"));
  const rebuild = useStudio((s) => s.rebuildPlan);
  const writeSlot = useStudio((s) => s.writeSlot);
  const writing = useStudio((s) => s.writingSlot);
  const pro = useStudio((s) => s.pro);
  const sample = useStudio((s) => s.sample);
  const brand = useStudio((s) => s.brand);
  const m = useMiniCopy();
  const title = mode === "fresh" ? c.channel.planFreshTitle : c.channel.planTitle;

  if (!plan) {
    const running = planStep?.status === "run";
    return (
      <section aria-labelledby="ma-plan">
        <H2 id="ma-plan">{title}</H2>
        <div className="ma-group flex flex-col items-start gap-3 p-4">
          {running ? (
            <p className="breathe text-[15px] text-ink-2" role="status">
              {progress?.m ? fmt(c.work.plan.count, { n: progress.n, m: progress.m }) : c.work.plan.run}
            </p>
          ) : (
            <>
              <p className="text-[15px] text-ink-2">{c.channel.planMissing}</p>
              <button
                type="button"
                className="btn-2 !min-h-11"
                onClick={() => {
                  haptic.tap();
                  void rebuild();
                }}
              >
                {c.channel.planRebuild}
              </button>
            </>
          )}
        </div>
      </section>
    );
  }

  const open = (it: PlanItem) => {
    const key = slotKey(it);
    const found = posts.find((p) => p.slot && slotKey(p.slot) === key);
    if (found) {
      haptic.tap();
      onOpenPost(found.id);
      return;
    }
    if (sample || !brand || writing[key]) return;
    haptic.press();
    void writeSlot(it);
  };

  return (
    <section aria-labelledby="ma-plan">
      <H2 id="ma-plan">{title}</H2>
      <ol className="ma-group">
        {plan.items.map((it, i) => {
          const d = weekday(it.day);
          const key = slotKey(it);
          const has = posts.some((p) => p.slot && slotKey(p.slot) === key);
          const busy = writing[key];
          const canWrite = !has && !sample && !!brand;
          return (
            <li key={i}>
              <button type="button" className="ma-row ma-press !items-start" onClick={() => open(it)} disabled={!has && !canWrite} aria-busy={busy || undefined}>
                <span className="w-[3.1rem] shrink-0 pt-0.5 leading-snug">
                  <span className="block text-[14.5px] font-semibold" title={d != null ? c.weekdays[d] : undefined}>
                    {d != null ? m.weekdaysShort[d] : it.day}
                  </span>
                  <span className="tnum block text-[13px] text-ink-3">{it.time}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] leading-snug">{ownerText(it.hook, lang)}</span>
                  {/* Where the time comes from: the strategist's guidance, said as given. */}
                  {it.timeLabel && <span className="mt-0.5 block text-[13px] leading-snug text-ink-3">{ownerText(it.timeLabel, lang)}</span>}
                  {pro && <PlanRowDetails item={it as PlanItem & PlanItemExtra} />}
                  <span className="mt-1 flex items-center gap-1 text-[13px] text-ink-3">
                    {has && <Check className="h-3.5 w-3.5 text-ink-2" aria-hidden />}
                    {has ? c.channel.planHasPost : busy ? <span className="breathe">{c.channel.writingSlot}</span> : c.channel.goal[it.goal]}
                  </span>
                </span>
                {(has || canWrite) && (
                  <span className="flex shrink-0 items-center gap-0.5 self-center text-[13.5px] font-medium text-ink-2">
                    {!has && !busy && c.channel.writeSlot}
                    <ChevronRight className="h-[18px] w-[18px] text-ink-3" aria-hidden />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Pro rejim only: the strategist's reasoning behind the plan. */
function StrategyDetails() {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const strategy = useStudio((s) => s.strategy);
  if (!strategy) return null;
  const t = (s: string) => ownerText(s, lang);
  // An empty offer, or one the engine refused ("BLOCKED: …"), is not shown at all.
  const offer = strategy.offer?.trim() && !/^BLOCKED/i.test(strategy.offer.trim()) ? strategy.offer : null;
  return (
    <section aria-labelledby="ma-strat">
      <H2 id="ma-strat">{c.pro.label}</H2>
      <div className="ma-group">
        {strategy.positioning && (
          <div className="ma-row !block">
            <p className="text-[13px] text-ink-2">{c.pro.positioning}</p>
            <p className="mt-1 text-[15px] leading-snug">{t(strategy.positioning)}</p>
          </div>
        )}
        {offer && (
          <div className="ma-row !block">
            <p className="text-[13px] text-ink-2">{c.pro.offer}</p>
            <p className="mt-1 text-[15px] leading-snug">{t(offer)}</p>
          </div>
        )}
        {strategy.pillars.length > 0 && (
          <div className="ma-row !block">
            <p className="text-[13px] text-ink-2">{c.pro.pillars}</p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {strategy.pillars.map((p) => (
                <li key={p.name} className="flex items-baseline justify-between gap-3 text-[15px]">
                  <span className="min-w-0">{t(p.name)}</span>
                  <span className="tnum shrink-0 text-ink-2">{Math.round(p.share * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {strategy.kpis.length > 0 && (
          <div className="ma-row !block">
            <p className="text-[13px] text-ink-2">{c.pro.kpis}</p>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {strategy.kpis.map((k) => (
                <li key={k.metric} className="text-[15px] leading-snug">
                  {t(k.metric)}:{" "}
                  <span className="tnum font-semibold">
                    {k.baseline != null ? `${k.baseline} → ` : ""}
                    {k.target}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {strategy.risks.length > 0 && (
          <div className="ma-row !block">
            <p className="text-[13px] text-ink-2">{c.pro.risks}</p>
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-[15px] leading-snug">
              {strategy.risks.map((r) => (
                <li key={r}>{t(r)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
