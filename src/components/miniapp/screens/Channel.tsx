import type { ChannelAudit, PlanItem } from "@/lib/uslub/contract";
import { ChevronRight, Settings2 } from "lucide-react";
import { Led } from "../../lamp/Led";
import { Panel, Strip, useLamps } from "../../studio/Department";
import { slotKey, useStudio } from "../../studio/store";
import { isMachineEvidence, ownerText, weekday } from "../../ui/format";
import { fmt, num, useCopy, useLang } from "../../ui/lang";
import { useMiniCopy } from "../copy";
import { useNav } from "../nav";
import { Skel, TopBar, useCompact } from "../Shell";
import { haptic } from "../tg";

const KIND_ORDER = { problem: 0, opportunity: 1, strength: 2 } as const;

/** «Kanal»: what Mercat read, what to fix, how the owner writes, the week's plan. */
export function ChannelScreen({ onOpenPost }: { onOpenPost: (index: number) => void }) {
  const c = useCopy();
  const m = useMiniCopy();
  const brand = useStudio((s) => s.brand);
  const mode = useStudio((s) => s.mode);
  const pro = useStudio((s) => s.pro);
  const sample = useStudio((s) => s.sample);
  const postsRead = useStudio((s) => s.postsRead ?? s.audit?.postsAnalyzed ?? null);
  const openSheet = useNav((s) => s.openSheet);
  const lamps = useLamps();
  const { ref, compact } = useCompact(56);
  const name = brand?.dna.name || brand?.channel || "Mercat";
  const sub = [brand?.channel && brand.channel !== name ? brand.channel : null, mode === "channel" && postsRead != null ? fmt(c.work.readChannel.done, { n: postsRead }).split(" · ")[1] : null]
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
              <Settings2 className="h-[22px] w-[22px]" aria-hidden />
            </button>
          </div>

          <div className="mt-5">{pro ? <Panel lamps={lamps} /> : <Strip lamps={lamps} />}</div>

          {mode === "channel" ? <Numbers /> : <p className="mt-6 px-1 text-[15px] leading-relaxed text-ink-2">{c.channel.freshNoStats}</p>}
          {mode === "fresh" && <Launch />}
          <Voice />
          <Plan onOpenPost={onOpenPost} />
          {pro && <StrategyDetails />}
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
  const lang = useLang((s) => s.lang);
  const audit = useStudio((s) => s.audit);
  const problem = useStudio((s) => s.auditProblem);
  const reload = useStudio((s) => s.reloadAudit);

  if (!audit) {
    return (
      <>
        {problem ? (
          <div className="ma-group mt-6 flex flex-col items-start gap-3 p-4">
            <p className="text-[15px] leading-relaxed text-ink-2">{problem.message}</p>
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

  const cells: [string, string][] = [];
  if (audit.subscribers != null) cells.push([num(audit.subscribers, lang), c.channel.subscribers]);
  if (audit.avgViews != null) cells.push([num(Math.round(audit.avgViews), lang), c.channel.avgViews]);
  if (audit.reachRate != null) cells.push([`${num(audit.reachRate * 100, lang)}%`, c.channel.reach]);
  cells.push([num(audit.postsPerWeek, lang, 1), c.channel.perWeek]);

  return (
    <>
      {/* Measured numbers print on the amber LED, like a shop sign; nothing else does. */}
      <dl className="mt-6 grid grid-cols-2 gap-2.5">
        {cells.map(([v, k]) => (
          <div key={k} className="ma-group flex flex-col-reverse justify-end gap-2.5 px-4 pb-3.5 pt-4">
            <dt className="text-[13px] leading-snug text-ink-2">{k}</dt>
            <dd>
              <Led text={v} dot={3.2} gap={1.2} label={v} grid={false} />
            </dd>
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

function Findings({ audit }: { audit: ChannelAudit }) {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const list = [...audit.findings].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]).slice(0, 3);
  if (!list.length) return <p className="px-1 text-[15px] text-ink-2">{c.channel.findingsNone}</p>;
  return (
    <ol className="ma-group">
      {list.map((f, i) => (
        <li key={i} className="ma-row !block !py-3.5">
          <p className={`text-[13px] font-semibold ${f.kind === "strength" ? "text-ok" : f.kind === "problem" ? "text-bad" : "text-led"}`}>{c.channel.kind[f.kind]}</p>
          <p className="mt-1 text-[15.5px] leading-snug">{ownerText(f.text, lang)}</p>
          {f.evidence && !isMachineEvidence(f.evidence) && <p className="mt-1.5 text-[14px] leading-snug text-ink-2">{ownerText(f.evidence, lang)}</p>}
        </li>
      ))}
    </ol>
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

function Voice() {
  const c = useCopy();
  const brand = useStudio((s) => s.brand);
  const pro = useStudio((s) => s.pro);
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
  // Simple mode: the one line and the three rows an owner recognises; pro shows all five.
  const shown = pro ? rows : rows.slice(0, 3);
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

function Plan({ onOpenPost }: { onOpenPost: (index: number) => void }) {
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
    const index = posts.findIndex((p) => p.slot && slotKey(p.slot) === key);
    if (index >= 0) {
      haptic.tap();
      onOpenPost(index);
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
                <span className="w-[4.6rem] shrink-0 pt-0.5 text-[13.5px] leading-snug text-ink-2">
                  <span className="block">{d != null ? c.weekdays[d] : it.day}</span>
                  <span className="tnum block text-ink-3">{it.time}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] leading-snug">{ownerText(it.hook, lang)}</span>
                  {pro && (it.format || (it.brief && it.brief !== it.hook)) && (
                    <span className="mt-1 block text-[13px] leading-snug text-ink-2">
                      {[it.format, it.brief && it.brief !== it.hook ? ownerText(it.brief, lang) : null].filter(Boolean).join(" · ")}
                    </span>
                  )}
                  <span className={`mt-1 block text-[13px] ${has ? "text-ok" : "text-ink-3"}`}>
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

/** Professional rejim only: the strategist's reasoning behind the plan. */
function StrategyDetails() {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const strategy = useStudio((s) => s.strategy);
  if (!strategy) return null;
  const t = (s: string) => ownerText(s, lang);
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
        {strategy.offer && (
          <div className="ma-row !block">
            <p className="text-[13px] text-ink-2">{c.pro.offer}</p>
            <p className="mt-1 text-[15px] leading-snug">{t(strategy.offer)}</p>
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
