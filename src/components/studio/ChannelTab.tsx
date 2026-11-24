import type { ChannelAudit } from "@/lib/uslub/contract";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Led } from "../lamp/Led";
import { useCopy, useLang, fmt, num } from "../ui/lang";
import { isMachineEvidence, ownerText, weekday } from "../ui/format";
import { copyFor as mediaCopy, StyleRefs } from "@/components/media";
import { tgInitData, type PlanItemExtra } from "./api";
import { slotKey, useStudio } from "./store";

// Professional rejim only, loaded on demand: simple mode never downloads it.
const AuditFull = dynamic(() => import("./pro/ProDetails").then((m) => m.AuditFull), { ssr: false });
const SufficiencyPanel = dynamic(() => import("./pro/ProDetails").then((m) => m.SufficiencyPanel), { ssr: false });
const PlanRowDetails = dynamic(() => import("./pro/ProDetails").then((m) => m.PlanRowDetails), { ssr: false });

const KIND_ORDER = { problem: 0, opportunity: 1, strength: 2 } as const;

/**
 * Kanal. On a phone one column; on the desktop canvas (`wide`) what the channel is (numbers,
 * findings, voice) on the left and what to do about it (the week plan) on the right, with the
 * full audit across the bottom in Pro. Every section sizes itself from its own container.
 */
export function ChannelTab({ wide = false }: { wide?: boolean }) {
  const c = useCopy();
  const mode = useStudio((s) => s.mode);
  const pro = useStudio((s) => s.pro);
  const audit = useStudio((s) => s.audit);
  const sufficiency = useStudio((s) => s.sufficiency);
  const about = (
    <>
      {mode === "channel" ? <Numbers /> : <p className="text-[15px] leading-relaxed text-ink-2">{c.channel.freshNoStats}</p>}
      {mode === "fresh" && <Launch />}
      <Voice />
      <PictureStyle />
    </>
  );
  const todo = (
    <>
      <Plan />
      {pro && <StrategyDetails />}
      {pro && <SufficiencyPanel items={sufficiency} />}
    </>
  );
  if (!wide) {
    return (
      <div className="@container flex flex-col gap-12">
        {about}
        {todo}
        {pro && mode === "channel" && <AuditFull audit={audit} />}
      </div>
    );
  }
  return (
    <div className="@container flex flex-col gap-14">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-10 xl:gap-14">
        <div className="@container flex min-w-0 flex-col gap-12">{about}</div>
        <div className="@container flex min-w-0 flex-col gap-12">{todo}</div>
      </div>
      {pro && mode === "channel" && <AuditFull audit={audit} />}
    </div>
  );
}

/** Empty channel: how to get the first subscribers (the strategist's launch tactics). */
function Launch() {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const launch = useStudio((s) => s.launch);
  if (!launch?.tactics.length) return null;
  return (
    <Section id="launch-h" title={c.channel.launchTitle}>
      <ol className="flex flex-col gap-3">
        {launch.tactics.slice(0, 5).map((t, i) => (
          <li key={i} className="card p-4 @md:p-5">
            <p className="text-[16px] font-semibold leading-snug">{ownerText(t.title, lang)}</p>
            <p className="mt-1.5 text-[15px] leading-relaxed">{ownerText(t.how, lang)}</p>
            {t.why && <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{ownerText(t.why, lang)}</p>}
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** Professional rejim only: the strategist's reasoning behind the plan. */
function StrategyDetails() {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const strategy = useStudio((s) => s.strategy);
  if (!strategy) return null;
  const t = (s: string) => ownerText(s, lang);
  return (
    <Section id="strat-h" title={c.pro.label}>
      <div className="flex flex-col gap-3">
        {strategy.positioning && (
          <div className="card p-4 @md:p-5">
            <p className="text-[13px] text-ink-2">{c.pro.positioning}</p>
            <p className="mt-1.5 text-[15px] leading-relaxed">{t(strategy.positioning)}</p>
          </div>
        )}
        {strategy.offer && (
          <div className="card p-4 @md:p-5">
            <p className="text-[13px] text-ink-2">{c.pro.offer}</p>
            <p className="mt-1.5 text-[15px] leading-relaxed">{t(strategy.offer)}</p>
          </div>
        )}
        {strategy.pillars.length > 0 && (
          <div className="card p-4 @md:p-5">
            <p className="text-[13px] text-ink-2">{c.pro.pillars}</p>
            <ul className="mt-2 flex flex-col gap-1.5">
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
          <div className="card p-4 @md:p-5">
            <p className="text-[13px] text-ink-2">{c.pro.kpis}</p>
            <ul className="mt-2 flex flex-col gap-2">
              {strategy.kpis.map((k) => (
                <li key={k.metric} className="text-[15px] leading-snug">
                  {t(k.metric)}: <span className="tnum font-semibold">{k.baseline != null ? `${k.baseline} → ` : ""}{k.target}</span>
                  {k.how && <span className="block text-[13.5px] text-ink-2">{t(k.how)}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {strategy.risks.length > 0 && (
          <div className="card p-4 @md:p-5">
            <p className="text-[13px] text-ink-2">{c.pro.risks}</p>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-snug">
              {strategy.risks.map((r) => (
                <li key={r}>{t(r)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Section>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-4 text-[20px] font-semibold tracking-[-0.01em]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Numbers() {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const audit = useStudio((s) => s.audit);
  const problem = useStudio((s) => s.auditProblem);
  const reload = useStudio((s) => s.reloadAudit);

  if (!audit) {
    return (
      <Section id="find-h" title={c.channel.findingsTitle}>
        {problem ? (
          <div className="card flex flex-col items-start gap-3 p-4">
            <p className="text-[15px] leading-relaxed text-ink-2">{problem.message}</p>
            <button type="button" className="btn-2" onClick={() => void reload()}>
              {c.error.retry}
            </button>
          </div>
        ) : (
          <p className="breathe text-[15px] text-ink-2" role="status">
            {c.work.readChannel.run}
          </p>
        )}
      </Section>
    );
  }

  const cells: [string, string][] = [];
  if (audit.subscribers != null) cells.push([num(audit.subscribers, lang), c.channel.subscribers]);
  if (audit.avgViews != null) cells.push([num(Math.round(audit.avgViews), lang), c.channel.avgViews]);
  if (audit.reachRate != null) cells.push([`${num(audit.reachRate * 100, lang)}%`, c.channel.reach]);
  cells.push([num(audit.postsPerWeek, lang, 1), c.channel.perWeek]);

  return (
    <>
      {/* Measured numbers print on the amber LED, like a shop sign; nothing else does. */}
      <dl className="grid grid-cols-2 gap-2.5 @xl:grid-cols-4">
        {cells.map(([v, k]) => (
          <div key={k} className="card flex flex-col-reverse justify-end gap-2 px-4 pb-3.5 pt-4">
            <dt className="text-[13px] leading-snug text-ink-2">{k}</dt>
            <dd>
              <Led text={v} dot={3.4} gap={1.3} label={v} grid={false} />
            </dd>
          </div>
        ))}
      </dl>
      <Section id="find-h" title={c.channel.findingsTitle}>
        <Findings audit={audit} />
      </Section>
    </>
  );
}

function Findings({ audit }: { audit: ChannelAudit }) {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const list = [...audit.findings].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]).slice(0, 3);
  if (!list.length) return <p className="text-[15px] text-ink-2">{c.channel.findingsNone}</p>;
  return (
    <ol className="flex flex-col gap-3">
      {list.map((f, i) => (
        <Finding key={i} kind={f.kind} text={ownerText(f.text, lang)} evidence={f.evidence && !isMachineEvidence(f.evidence) ? ownerText(f.evidence, lang) : ""} />
      ))}
    </ol>
  );
}

/** One finding: the first sentence and its numbers; the rest of the explanation on a tap. */
function Finding({ kind, text, evidence }: { kind: "problem" | "opportunity" | "strength"; text: string; evidence: string }) {
  const c = useCopy();
  const pro = useStudio((s) => s.pro);
  const [open, setOpen] = useState(false);
  // No regex lookbehind: Telegram's webview on iOS before 16.4 cannot parse it.
  const m = text.match(/^([\s\S]+?[.!?])\s+([\s\S]+)$/);
  const head = m ? m[1] : text;
  const rest = m ? m[2] : "";
  const showAll = pro || open;
  return (
    <li className="card p-4 @md:p-5">
      <p className={`text-[14px] font-medium ${kind === "strength" ? "text-ok" : kind === "problem" ? "text-bad" : "text-ink-2"}`}>{c.channel.kind[kind]}</p>
      <p className="mt-1.5 text-[17px] font-medium leading-snug">{head}</p>
      {evidence && <p className="tnum mt-2 text-[14px] leading-relaxed text-ink-2">{evidence}</p>}
      {rest &&
        (showAll ? (
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{rest}</p>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="link mt-1 inline-flex min-h-11 items-center text-[14px] text-ink-2">
            {c.channel.more}
          </button>
        ))}
    </li>
  );
}

/**
 * The photos new pictures are modelled on (the images session's card). The run learns the style
 * itself before the first pictures; the card only re-learns when the owner adds or removes photos.
 */
function PictureStyle() {
  const lang = useLang((s) => s.lang);
  const brand = useStudio((s) => s.brand);
  const learning = useStudio((s) => s.styleLearning);
  const pro = useStudio((s) => s.pro);
  const sample = useStudio((s) => s.sample);
  const styleChanged = useStudio((s) => s.styleChanged);
  if (!brand || sample) return null;
  const t = mediaCopy(lang);
  return (
    <div className="card p-4 sm:p-5">
      {learning ? (
        <div role="status">
          <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{t.styleTitle}</h3>
          <p className="breathe mt-1 text-[13.5px] text-ink-2">{t.styleLearning}</p>
        </div>
      ) : (
        <StyleRefs
          key={brand.visual ? "learned" : "none"}
          brandId={brand.id}
          initial={brand.visual ?? null}
          lang={lang}
          pro={pro}
          autoLearn={false}
          initData={tgInitData()}
          onChange={styleChanged}
        />
      )}
    </div>
  );
}

function Voice() {
  const c = useCopy();
  const brand = useStudio((s) => s.brand);
  if (!brand) return null;
  const d = brand.dna;
  const rows: [string, string][] = [
    [c.channel.voice.address, c.channel.address[d.address] ?? "—"],
    [c.channel.voice.tone, d.tone],
    [c.channel.voice.length, d.avgPostLength ? fmt(c.channel.length, { n: Math.round(d.avgPostLength / 10) * 10 }) : "—"],
    [c.channel.voice.emoji, c.channel.emoji[d.emojiDensity] ?? "—"],
    [c.channel.voice.cta, d.ctaStyle],
  ].filter(([, v]) => v && v !== "—") as [string, string][];
  return (
    <Section id="voice-h" title={c.channel.voiceTitle}>
      {d.oneLiner && <p className="mb-4 text-[16px] leading-relaxed">{d.oneLiner}</p>}
      <dl className="card divide-y divide-line">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] gap-3 px-4 py-3 @md:px-5">
            <dt className="text-[14px] text-ink-2">{k}</dt>
            <dd className="text-[15px]">{v}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

function Plan() {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const mode = useStudio((s) => s.mode);
  const plan = useStudio((s) => s.plan);
  const posts = useStudio((s) => s.posts);
  const progress = useStudio((s) => s.planProgress);
  const planStep = useStudio((s) => s.steps.find((x) => x.key === "plan"));
  const rebuild = useStudio((s) => s.rebuildPlan);
  const setTab = useStudio((s) => s.setTab);
  const writeSlot = useStudio((s) => s.writeSlot);
  const writing = useStudio((s) => s.writingSlot);
  const pro = useStudio((s) => s.pro);
  const sample = useStudio((s) => s.sample);
  const brand = useStudio((s) => s.brand);
  const title = mode === "fresh" ? c.channel.planFreshTitle : c.channel.planTitle;

  if (!plan) {
    const running = planStep?.status === "run";
    return (
      <Section id="plan-h" title={title}>
        <div className="card flex flex-col items-start gap-3 p-4">
          {running ? (
            <p className="breathe text-[15px] text-ink-2" role="status">
              {progress?.m ? fmt(c.work.plan.count, { n: progress.n, m: progress.m }) : c.work.plan.run}
            </p>
          ) : (
            <>
              <p className="text-[15px] text-ink-2">{c.channel.planMissing}</p>
              <button type="button" className="btn-2" onClick={() => void rebuild()}>
                {c.channel.planRebuild}
              </button>
            </>
          )}
        </div>
      </Section>
    );
  }

  return (
    <Section id="plan-h" title={title}>
      <ol className="card divide-y divide-line">
        {plan.items.map((it, i) => {
          const d = weekday(it.day);
          const key = slotKey(it);
          const has = posts.some((p) => p.slot && slotKey(p.slot) === key);
          const busy = writing[key];
          return (
            <li key={i} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 px-4 py-3.5 @md:grid-cols-[8.5rem_minmax(0,1fr)] @md:px-5">
              <div className="text-[14px] leading-snug text-ink-2">
                <span className="block">{d != null ? c.weekdays[d] : it.day}</span>
                <span className="block text-ink-3">{it.time}</span>
              </div>
              <div className="min-w-0">
                <p className="text-[15px] leading-snug">{ownerText(it.hook, lang)}</p>
                {pro && <PlanRowDetails item={it as typeof it & PlanItemExtra} />}
                <p className="mt-1 text-[13.5px] text-ink-3">
                  {c.channel.goal[it.goal]}
                  {has ? (
                    <>
                      {" · "}
                      <button type="button" onClick={() => setTab("posts")} className="link text-ink-2">
                        {c.channel.planHasPost}
                      </button>
                    </>
                  ) : (
                    !sample &&
                    brand && (
                      <>
                        {" · "}
                        <button type="button" disabled={busy} onClick={() => void writeSlot(it)} className={`link text-ink-2 ${busy ? "breathe no-underline" : ""}`}>
                          {busy ? c.channel.writingSlot : c.channel.writeSlot}
                        </button>
                      </>
                    )
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
