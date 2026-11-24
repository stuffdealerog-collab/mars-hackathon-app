import type { ChannelAudit } from "@/lib/uslub/contract";
import { useCopy, useLang, fmt, num } from "../ui/lang";
import { weekday } from "../ui/format";
import { useStudio } from "./store";

const KIND_ORDER = { problem: 0, opportunity: 1, strength: 2 } as const;

export function ChannelTab() {
  const c = useCopy();
  const mode = useStudio((s) => s.mode);
  return (
    <div className="flex flex-col gap-12">
      {mode === "channel" ? <Numbers /> : <p className="text-[15px] leading-relaxed text-ink-2">{c.channel.freshNoStats}</p>}
      <Voice />
      <Plan />
    </div>
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
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
        {cells.map(([v, k]) => (
          <div key={k} className="flex flex-col-reverse justify-end bg-card px-4 py-3.5">
            <dt className="mt-0.5 text-[13.5px] leading-snug text-ink-2">{k}</dt>
            <dd className="tnum text-[22px] font-semibold leading-tight tracking-[-0.01em]">{v}</dd>
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
  const list = [...audit.findings].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]).slice(0, 3);
  if (!list.length) return <p className="text-[15px] text-ink-2">{c.channel.findingsNone}</p>;
  return (
    <ol className="flex flex-col gap-3">
      {list.map((f, i) => (
        <li key={i} className="card p-4 sm:p-5">
          <p className={`text-[14px] font-medium ${f.kind === "strength" ? "text-ok" : f.kind === "problem" ? "text-bad" : "text-ink-2"}`}>{c.channel.kind[f.kind]}</p>
          <p className="mt-1.5 text-[16px] leading-relaxed">{f.text}</p>
          {f.evidence && <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{f.evidence}</p>}
        </li>
      ))}
    </ol>
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
          <div key={k} className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] gap-3 px-4 py-3 sm:px-5">
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
  const mode = useStudio((s) => s.mode);
  const plan = useStudio((s) => s.plan);
  const posts = useStudio((s) => s.posts);
  const progress = useStudio((s) => s.planProgress);
  const planStep = useStudio((s) => s.steps.find((x) => x.key === "plan"));
  const rebuild = useStudio((s) => s.rebuildPlan);
  const setTab = useStudio((s) => s.setTab);
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
          const has = posts.some((p) => p.slot && p.slot.day === it.day && p.slot.time === it.time);
          return (
            <li key={i} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 px-4 py-3.5 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:px-5">
              <div className="text-[14px] leading-snug text-ink-2">
                <span className="block">{d != null ? c.weekdays[d] : it.day}</span>
                <span className="tnum block text-ink-3">{it.time}</span>
              </div>
              <div className="min-w-0">
                <p className="text-[15px] leading-snug">{it.hook}</p>
                <p className="mt-1 text-[13.5px] text-ink-3">
                  {c.channel.goal[it.goal]}
                  {has && (
                    <>
                      {" · "}
                      <button type="button" onClick={() => setTab("posts")} className="link text-ink-2">
                        {c.channel.planHasPost}
                      </button>
                    </>
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
