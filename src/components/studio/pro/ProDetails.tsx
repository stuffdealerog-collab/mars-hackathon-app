/**
 * Professional rejim: the same screens, denser. Loaded only when the owner (or a marketer)
 * turns Pro on, so simple mode never pays for it (see the dynamic imports in ChannelTab,
 * PostCard and Department).
 *
 * Every panel takes its data as props and sizes itself from its own container (`@container`),
 * so the same panel sits in the phone column, the desktop canvas, the hub or a Mini App sheet.
 */
import type { AgentRole, BrandProfile, ChannelAudit, ContentPlan, PostDraft, Script, Strategy } from "@/lib/uslub/contract";
import { X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect } from "react";
import { Led } from "../../lamp/Led";
import { lampVars } from "../../lamp/lamps";
import { isMachineEvidence, ownerText, plural } from "../../ui/format";
import { fmt, num, useCopy, useLang } from "../../ui/lang";
import type { PlanItemExtra, Sufficiency } from "../api";
import { useStudio, type Step } from "../store";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const SCRIPTS: Script[] = ["uz_latn", "uz_cyrl", "ru", "en"];

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4 @md:p-5">
      <p className="text-[13px] text-ink-2">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ Kanal */

/** Every measured number, the most viewed posts, every finding with its basis, the benchmark. */
export function AuditFull({ audit }: { audit: ChannelAudit | null }) {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  if (!audit) return null;
  const formats = Object.entries(audit.formatMix).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const fName = (k: string) => (c.pro.formats as Record<string, string>)[k] ?? k;
  return (
    <section aria-label={c.pro.auditTitle} className="@container flex flex-col gap-3">
      <h2 className="text-[20px] font-semibold tracking-[-0.01em]">{c.pro.auditTitle}</h2>
      <div className="grid grid-cols-2 gap-3">
        <Block title={c.pro.postsAnalyzed}>
          <Led text={num(audit.postsAnalyzed, lang)} dot={3} gap={1.2} grid={false} />
        </Block>
        {audit.bestHours.length > 0 && (
          <Block title={c.pro.bestHours}>
            <p className="tnum text-[16px] font-semibold">{audit.bestHours.slice(0, 3).map((h) => `${String(h).padStart(2, "0")}:00`).join(" · ")}</p>
          </Block>
        )}
        {audit.bestWeekdays.length > 0 && (
          <Block title={c.pro.bestDays}>
            <p className="text-[15px] font-semibold">{audit.bestWeekdays.slice(0, 3).map((d) => c.weekdays[(d + 1) % 7]).join(", ")}</p>
          </Block>
        )}
        {formats.length > 0 && (
          <Block title={c.pro.formatsTitle}>
            <ul className="flex flex-col gap-1 text-[14px]">
              {formats.slice(0, 4).map(([k, v]) => (
                <li key={k} className="flex justify-between gap-2">
                  <span>{fName(k)}</span>
                  <span className="tnum text-ink-2">{Math.round(v * 100)}%</span>
                </li>
              ))}
            </ul>
          </Block>
        )}
      </div>

      {audit.topPosts.length > 0 && (
        <Block title={c.pro.topPosts}>
          <ol className="flex flex-col gap-2">
            {audit.topPosts.slice(0, 5).map((p) => (
              <li key={p.url} className="flex items-baseline justify-between gap-3 text-[14px]">
                <a href={p.url} target="_blank" rel="noreferrer" className="link min-w-0 truncate">
                  {ownerText(p.why, lang) || p.url.replace(/^https?:\/\//, "")}
                </a>
                {p.views != null && <span className="tnum shrink-0 text-ink-2">{num(p.views, lang)} {c.pro.views}</span>}
              </li>
            ))}
          </ol>
        </Block>
      )}

      {audit.findings.length > 0 && (
        <Block title={c.pro.evidence}>
          <ul className="flex flex-col gap-3">
            {audit.findings.map((f, i) => (
              <li key={i} className="text-[14px] leading-relaxed">
                <span className={f.kind === "problem" ? "text-bad" : f.kind === "strength" ? "text-ok" : "text-ink-2"}>{c.channel.kind[f.kind]}</span>
                <span className="block">{ownerText(f.text, lang)}</span>
                {f.evidence && !isMachineEvidence(f.evidence) && <span className="block text-ink-2">{ownerText(f.evidence, lang)}</span>}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {audit.benchmark && audit.benchmark.length > 0 && (
        <Block title={c.pro.benchmark}>
          <table className="w-full text-left text-[14px]">
            <tbody>
              {audit.benchmark.map((b) => (
                <tr key={b.channel} className="border-t border-line first:border-0">
                  <td className="py-1.5 pr-3">{b.channel}</td>
                  <td className="tnum py-1.5 pr-3 text-ink-2">{b.subscribers != null ? num(b.subscribers, lang) : "—"}</td>
                  <td className="tnum py-1.5 text-right text-ink-2">{b.reachRate != null ? `${Math.round(b.reachRate * 100)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Block>
      )}
    </section>
  );
}

/** Brain v2: for each part of the plan, whether it rests on the channel's own data. */
export function SufficiencyPanel({ items }: { items: Sufficiency[] | null }) {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  if (!items?.length) return null;
  const tone = { data: "text-ok", benchmark: "text-led", prior: "text-ink-2", insufficient: "text-bad" } as const;
  return (
    <section aria-label={c.pro.sufficiencyTitle} className="@container">
      <h2 className="mb-3 text-[20px] font-semibold tracking-[-0.01em]">{c.pro.sufficiencyTitle}</h2>
      <ul className="card divide-y divide-line">
        {items.map((s) => (
          <li key={s.key} className="px-4 py-3 @md:px-5">
            <p className={`text-[13px] font-medium ${tone[s.status]}`}>{c.pro.basis[s.status]}</p>
            <p className="mt-0.5 text-[14px] leading-relaxed">{ownerText(s.text, lang)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One plan row's extras: the forecast range and the reasoning line. */
export function PlanRowDetails({ item }: { item: PlanItemExtra & { format?: string; brief?: string; metric?: string; hook: string } }) {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const fName = (k: string) => (c.pro.formats as Record<string, string>)[k] ?? k;
  return (
    <dl className="mt-1.5 grid gap-0.5 text-[13px] leading-snug text-ink-2">
      {item.forecast && (
        <div>
          <dd className="tnum inline text-ink">{fmt(c.pro.forecast, { low: num(item.forecast.low, lang), high: num(item.forecast.high, lang) })}</dd>
        </div>
      )}
      {item.format && (
        <div>
          <dt className="inline">{c.pro.format}: </dt>
          <dd className="inline">{fName(item.format)}</dd>
        </div>
      )}
      {item.brief && item.brief !== item.hook && (
        <div>
          <dt className="inline">{c.pro.brief}: </dt>
          <dd className="inline">{ownerText(item.brief.split("\n")[0], lang)}</dd>
        </div>
      )}
      {item.metric && (
        <div>
          <dt className="inline">{c.pro.metric}: </dt>
          <dd className="inline">{ownerText(item.metric, lang)}</dd>
        </div>
      )}
    </dl>
  );
}

/* ----------------------------------------------------------------- Postlar */

/** A post's insides: the plan slot it came from, every script side by side, how natural it reads. */
export function PostDetails({ post }: { post: PostDraft }) {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const slot = post.slot;
  const flagged = SCRIPTS.flatMap((s) => (post.neuroHits[s] ?? []).map((h) => h.phrase));
  return (
    <div className="@container mt-3 flex flex-col gap-3">
      {slot && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13.5px] leading-snug">
          <dt className="text-ink-2">{c.pro.goal}</dt>
          <dd>{c.channel.goal[slot.goal]}</dd>
          {slot.hook && (
            <>
              <dt className="text-ink-2">{c.pro.hook}</dt>
              <dd>{ownerText(slot.hook, lang)}</dd>
            </>
          )}
          {slot.cta && (
            <>
              <dt className="text-ink-2">{c.pro.cta}</dt>
              <dd>{ownerText(slot.cta, lang)}</dd>
            </>
          )}
        </dl>
      )}
      <p className="text-[13.5px]">
        <span className="tnum font-medium">{fmt(c.pro.natural, { n: post.humanScore })}</span>
        <span className="text-ink-2"> · {c.pro.flagged}: </span>
        <span className={flagged.length ? "text-bad" : "text-ink-2"}>{flagged.length ? [...new Set(flagged)].slice(0, 6).join(", ") : c.pro.none}</span>
      </p>
      <div>
        <p className="mb-2 text-[13px] text-ink-2">{c.pro.scriptsTitle}</p>
        <div className="grid gap-2.5 @xl:grid-cols-2">
          {SCRIPTS.filter((s) => post.variants[s]?.trim()).map((s) => (
            <div key={s} className="rounded-[16px] bg-glass p-3 shadow-[inset_0_0_0_1px_var(--hair)]">
              <p className="mb-1.5 text-[12.5px] font-medium text-ink-2">{c.posts.scriptNames[s]}</p>
              <p lang={s === "ru" ? "ru" : s === "en" ? "en" : "uz"} className="whitespace-pre-line text-[14px] leading-relaxed">
                {post.variants[s]}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ lamp drawer */

/** What the lamp details read: the run's results, nothing else. */
export type LampFacts = {
  brand: BrandProfile | null;
  audit: ChannelAudit | null;
  plan: ContentPlan | null;
  strategy: Strategy | null;
  posts: PostDraft[];
  steps: Step[];
};

/** The phone/desktop sheet around LampDetails: dim backdrop, Escape and a close button. */
export function LampDrawer({ role, onClose }: { role: AgentRole; onClose: () => void }) {
  const c = useCopy();
  const reduce = useReducedMotion() ?? false;
  const facts = useStudio();
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={c.lamps[role].name}>
      <motion.button
        type="button"
        aria-label={c.pro.close}
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      />
      <motion.div
        className="relative w-full max-w-[520px] overflow-hidden rounded-t-[28px] bg-glass pb-[max(16px,env(safe-area-inset-bottom))] shadow-[inset_0_0_0_1px_var(--hair-2)] sm:rounded-[28px]"
        initial={reduce ? false : { y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.36, ease: EASE_OUT }}
      >
        <LampDetails role={role} facts={facts} />
        <button type="button" onClick={onClose} aria-label={c.pro.close} className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full bg-black/25 text-white">
          <X className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </button>
      </motion.div>
    </div>
  );
}

/** What one employee did: its output in real numbers and how long it took. Any container. */
export function LampDetails({ role, facts: s }: { role: AgentRole; facts: LampFacts }) {
  const c = useCopy();
  const lang = useLang((l) => l.lang);
  const took = (key: string) => {
    const st = s.steps.find((x) => x.key === key);
    return st?.t0 && st.t1 ? fmt(c.pro.took, { s: Math.max(1, Math.round((st.t1 - st.t0) / 1000)) }) : null;
  };
  const rows: [string, string][] = [];
  const d = s.brand?.dna;
  if (role === "brand" && d) {
    rows.push([c.channel.voice.tone, d.tone], [c.channel.voice.length, fmt(c.channel.length, { n: d.avgPostLength })], [c.channel.voice.cta, d.ctaStyle]);
    if (d.products.length) rows.push(["", d.products.slice(0, 6).join(", ")]);
  }
  if (role === "analyst" && s.audit) {
    const a = s.audit;
    rows.push([c.pro.postsAnalyzed, num(a.postsAnalyzed, lang)]);
    if (a.subscribers != null) rows.push([c.channel.subscribers, num(a.subscribers, lang)]);
    if (a.avgViews != null) rows.push([c.channel.avgViews, num(Math.round(a.avgViews), lang)]);
    if (a.reachRate != null) rows.push([c.channel.reach, `${Math.round(a.reachRate * 100)}%`]);
  }
  if (role === "strategist" && s.plan) {
    rows.push([c.channel.planTitle, `${s.plan.items.length} ${plural(c.lampResult.planned, s.plan.items.length, lang)}`]);
    s.strategy?.pillars.forEach((p) => rows.push([ownerText(p.name, lang), `${Math.round(p.share * 100)}%`]));
  }
  if ((role === "copywriter" || role === "editor" || role === "translator") && s.posts.length) {
    rows.push([c.tabs.posts, String(s.posts.length)]);
    if (role === "editor") {
      const avg = Math.round(s.posts.reduce((x, p) => x + p.humanScore, 0) / s.posts.length);
      rows.push([fmt(c.pro.natural, { n: avg }), ""]);
    }
    if (role === "translator") rows.push([c.pro.scriptsTitle, SCRIPTS.filter((k) => s.posts.some((p) => p.variants[k]?.trim())).map((k) => c.posts.scriptNames[k]).join(", ")]);
  }
  if (role === "designer") {
    const imgs = s.posts.map((p) => p.image).filter(Boolean);
    rows.push([c.lampResult.pictures[2], `${imgs.filter((i) => i!.status === "ready").length}/${s.posts.length}`]);
  }
  if (role === "publisher") {
    rows.push([c.posts.approved, String(s.posts.filter((p) => p.status !== "draft").length)], [c.posts.published, String(s.posts.filter((p) => p.status === "published").length)]);
  }
  const stepOf: Partial<Record<AgentRole, string>> = { brand: "voice", analyst: "read", strategist: "plan", copywriter: "posts", editor: "posts", translator: "posts", designer: "images" };
  const time = stepOf[role] ? took(stepOf[role]!) : null;

  return (
    <div className="@container">
      {/* The lamp's own light at the top. */}
      <div className="lamp !min-h-[88px] !rounded-none" data-state="on" style={lampVars(role)}>
        <span className="lamp__glow" aria-hidden />
        <span className="lamp__filament" aria-hidden />
        <div className="relative flex w-full items-end justify-between gap-3 px-5 pb-3 pt-8">
          <div>
            <p className="text-[18px] font-semibold text-white [text-shadow:0_1px_10px_rgb(0_0_0/.35)]">{c.lamps[role].name}</p>
            <p className="text-[13px] text-white/90">{c.lamps[role].job}</p>
          </div>
          {time && <span className="tnum text-[13px] text-white/90">{time}</span>}
        </div>
      </div>
      <div className="px-5 pt-4">
        <p className="mb-2 text-[13px] text-ink-2">{c.pro.output}</p>
        {rows.length ? (
          <dl className="divide-y divide-line">
            {rows.map(([k, v], i) => (
              <div key={i} className="flex items-baseline justify-between gap-4 py-2.5 text-[15px]">
                <dt className="min-w-0 text-ink-2">{k}</dt>
                <dd className="tnum shrink-0 text-right">{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="py-2 text-[15px] text-ink-2">{c.lampState.soon}</p>
        )}
      </div>
    </div>
  );
}
