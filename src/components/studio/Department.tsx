import type { AgentRole } from "@/lib/uslub/contract";
import { ChevronDown } from "lucide-react";
import dynamic from "next/dynamic";
import { forwardRef, useMemo, useState } from "react";
import { Led } from "../lamp/Led";
import { LampTile } from "../lamp/LampTile";
import { LAMP_ORDER, OWNER_LAMPS, roomLight, withOutcomes, type LampState } from "../lamp/lamps";
import { fmt, plural } from "../ui/format";
import { useCopy, useLang, type Lang } from "../ui/lang";
import { sampleAudit, sampleBrand, samplePlan, samplePosts } from "./sample";
import { SCRIPT_ORDER, splitScripts } from "./scripts";
import { POSTS_PER_RUN, useStudio, type Step, type StepKey } from "./store";
import { publisherOutcome, tashkentWhen, type Schedule } from "./week";

/**
 * The SMM-menejer's measured result from the queue: posts it put out ("2 post chiqdi", counted, never called "on time"), or
 * the next one waiting ("keyingisi: Juma 07:30"). Nothing until the queue has something (never a made-up number).
 */
export function publisherWords(schedule: Schedule, c: ReturnType<typeof useCopy>, lang: Lang): string | null {
  const o = publisherOutcome(schedule);
  if (o.out) return `${o.out} ${plural(c.lampResult.out, o.out, lang)}`;
  const w = o.next ? tashkentWhen(o.next) : null;
  if (!w) return null;
  const day = c.weekdays[w.weekday];
  return fmt(c.lampResult.next, { when: `${lang === "ru" ? day.toLowerCase() : day} ${w.time}` });
}

// Professional rejim only, loaded on demand.
const LampDrawer = dynamic(() => import("./pro/ProDetails").then((m) => m.LampDrawer), { ssr: false });

/**
 * `result`: what each lamp shows; `words`: the same in plain text (tooltips, aria labels);
 * `quiet`: why a lamp is dark on purpose (no pictures in the sample), said under its name;
 * `outcome`: a measured result for the owner, shown in place of `result` (lamps.ts withOutcomes).
 */
export type Lamps = {
  state: Record<AgentRole, LampState>;
  result: Partial<Record<AgentRole, React.ReactNode>>;
  words: Partial<Record<AgentRole, string>>;
  quiet?: Partial<Record<AgentRole, string>>;
  outcome?: Partial<Record<AgentRole, string>>;
};

/** True when a dark lamp is dark on purpose and says why (drawn dimmer, without its ember). */
export const isQuiet = (lamps: Lamps, r: AgentRole) => lamps.state[r] === "off" && !!lamps.quiet?.[r];

/** What the lamps are computed from: the run's state, the store's or the sample's. */
export type LampSnapshot = {
  steps: Step[];
  mode: "channel" | "fresh";
  sample: boolean;
  brand: ReturnType<typeof useStudio.getState>["brand"];
  audit: ReturnType<typeof useStudio.getState>["audit"];
  postsRead: number | null;
  plan: ReturnType<typeof useStudio.getState>["plan"];
  progress: ReturnType<typeof useStudio.getState>["planProgress"];
  posts: ReturnType<typeof useStudio.getState>["posts"];
  /** Measured results from the engine or autopilot, when there are any (store.outcomes). */
  outcomes?: Partial<Record<AgentRole, string>>;
};

/** The sample bakery after a finished run: what the landing's lit department shows. */
export function sampleSnapshot(lang: Lang): LampSnapshot {
  const done = (key: StepKey, n?: number): Step => ({ key, status: "done", n });
  return {
    steps: [done("read", 60), done("voice"), done("plan", 7), done("posts", POSTS_PER_RUN), { key: "images", status: "skip" }],
    mode: "channel",
    sample: true,
    brand: sampleBrand(lang),
    audit: sampleAudit(lang),
    postsRead: 60,
    plan: samplePlan(lang),
    progress: null,
    posts: samplePosts(lang),
  };
}

function Num({ n, word }: { n: number | string; word: string }) {
  return (
    <span className="flex flex-col items-start gap-2">
      <Led text={String(n)} dot={3.4} gap={1.3} color="currentColor" grid={false} label={`${n} ${word}`} />
      <span className="text-[12.5px] leading-none">{word}</span>
    </span>
  );
}

/**
 * Each lamp's state comes from real results first (a result held = lit), then from the
 * step that is running or failed. Nothing lights for show; `gate` keeps the panel dark
 * while the Spektr beams are still travelling.
 */
export function useLamps(gate = false): Lamps {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const steps = useStudio((s) => s.steps);
  const mode = useStudio((s) => s.mode);
  const sample = useStudio((s) => s.sample);
  const brand = useStudio((s) => s.brand);
  const audit = useStudio((s) => s.audit);
  const postsRead = useStudio((s) => s.postsRead);
  const plan = useStudio((s) => s.plan);
  const progress = useStudio((s) => s.planProgress);
  const posts = useStudio((s) => s.posts);
  const given = useStudio((s) => s.outcomes);
  const schedule = useStudio((s) => s.schedule);
  return useMemo(() => {
    // The queue's measured result lights the SMM-menejer, unless the engine said something itself.
    const out = publisherWords(schedule, c, lang);
    const outcomes = out && !given.publisher ? { ...given, publisher: out } : given;
    return lampsFrom({ steps, mode, sample, brand, audit, postsRead, plan, progress, posts, outcomes }, c, lang, gate);
  }, [gate, steps, mode, sample, brand, audit, postsRead, plan, progress, posts, given, schedule, c, lang]);
}

/** The same rules as a plain function of a snapshot (the landing feeds it the sample). */
export function lampsFrom(snap: LampSnapshot, c: ReturnType<typeof useCopy>, lang: Lang, gate = false): Lamps {
  const { steps, mode, sample, brand, audit, postsRead, plan, progress, posts, outcomes } = snap;
  {
    const status = (k: StepKey) => steps.find((s) => s.key === k)?.status;
    const by = (held: boolean, k: StepKey): LampState => (held ? "on" : status(k) === "run" ? "warming" : status(k) === "fail" ? "error" : "off");
    const state = Object.fromEntries(LAMP_ORDER.map((r) => [r, "off"])) as Record<AgentRole, LampState>;
    const result: Lamps["result"] = {};
    const words: Lamps["words"] = {};
    const quiet: NonNullable<Lamps["quiet"]> = {};
    if (gate) return { state, result, words, quiet };

    state.brand = by(!!brand, "voice");
    if (brand) {
      const d = brand.dna;
      const first = d.tone.split(/[,.;]/)[0]?.trim();
      words.brand = [d.address !== "n/a" ? c.channel.address[d.address] : null, first].filter(Boolean).join(", ");
      result.brand = (
        <span className="line-clamp-2 text-[14px] font-semibold leading-tight">
          {[d.address !== "n/a" ? c.channel.address[d.address] : null, first].filter(Boolean).join(", ")}
        </span>
      );
    }

    const read = mode === "fresh" ? !!brand : !!audit || postsRead != null;
    state.analyst = by(read, "read");
    const count = (forms: readonly string[], n: number) => <Num n={n} word={plural(forms, n, lang)} />;
    const say = (forms: readonly string[], n: number | string, by = Number(n)) => `${n} ${plural(forms, by, lang)}`;
    if (mode === "fresh" && brand) {
      result.analyst = <span className="text-[14px] font-semibold leading-tight">{c.lampResult.described}</span>;
      words.analyst = c.lampResult.described;
    } else if (audit || postsRead != null) {
      const n = audit?.postsAnalyzed ?? postsRead ?? 0;
      result.analyst = count(c.lampResult.postsRead, n);
      words.analyst = say(c.lampResult.postsRead, n);
    }

    state.strategist = by(!!plan, "plan");
    if (plan) {
      result.strategist = count(c.lampResult.planned, plan.items.length);
      words.strategist = say(c.lampResult.planned, plan.items.length);
    } else if (progress?.m) {
      result.strategist = <Num n={`${progress.n}/${progress.m}`} word={plural(c.lampResult.planned, progress.m, lang)} />;
      words.strategist = say(c.lampResult.planned, `${progress.n}/${progress.m}`, progress.m);
    }

    const written = posts.length > 0;
    state.copywriter = by(written, "posts");
    state.editor = by(written, "posts");
    state.translator = by(written, "posts");
    if (written) {
      result.copywriter = count(c.lampResult.written, posts.length);
      result.editor = <span className="text-[14px] font-semibold leading-tight">{c.lampResult.clean}</span>;
      // What it translated into, by name: no count to misread. English only when the channel
      // itself writes it (otherwise it waits under «Yana», scripts.ts).
      const available = SCRIPT_ORDER.filter((s) => posts.some((p) => p.variants[s]?.trim()));
      const into = splitScripts(available, brand?.dna.languages).main.filter((s) => s !== "uz_latn");
      result.translator = <span className="text-[14px] font-semibold leading-tight">{into.map((s) => c.posts.scripts[s]).join(" · ")}</span>;
      words.copywriter = say(c.lampResult.written, posts.length);
      words.editor = c.lampResult.clean;
      words.translator = into.map((s) => c.posts.scripts[s]).join(" · ");
    }

    const images = posts.map((p) => p.image).filter(Boolean);
    const ready = images.filter((i) => i!.status === "ready").length;
    const open = images.filter((i) => i!.status === "queued" || i!.status === "running").length;
    const imgStep = status("images");
    if (open) {
      state.designer = "warming";
      result.designer = <Num n={`${ready}/${posts.length}`} word={plural(c.lampResult.pictures, posts.length, lang)} />;
      words.designer = say(c.lampResult.pictures, `${ready}/${posts.length}`, posts.length);
    } else if (ready) {
      state.designer = "on";
      result.designer = count(c.lampResult.pictures, ready);
      words.designer = say(c.lampResult.pictures, ready);
    } else if (images.length) state.designer = "error";
    else if (imgStep === "run") state.designer = "warming"; // studying the channel's photos first
    // Pictures are a working feature: in the sample the Dizayner is dark because the sample draws
    // none, and it says so. A run that skipped pictures (a day limit) leaves it simply dark.
    else if (imgStep === "skip" && sample) quiet.designer = c.lampState.noPicturesSample;

    const published = posts.filter((p) => p.status === "published").length;
    if (published) {
      state.publisher = "on";
      result.publisher = count(c.lampResult.published, published);
      words.publisher = say(c.lampResult.published, published);
    } else if (written) state.publisher = "you";

    // The Videographer holds its scripts (its own tab lights it while it writes one).
    const scripts = posts.filter((p) => p.video?.plan).length;
    if (scripts) {
      state.video = "on";
      result.video = count(c.lampResult.scripts, scripts);
      words.video = say(c.lampResult.scripts, scripts);
    }

    return withOutcomes({ state, result, words, quiet }, outcomes);
  }
}

type PanelProps = {
  lamps: Lamps;
  size?: "sm" | "md";
  showJob?: boolean;
  className?: string;
  /** Computer screens: the lamps in one housing (two rows of four), each lit lamp's light on the room around it. */
  housing?: boolean;
  /** A valid link is typed: the embers heat to hot filaments (nobody works yet). */
  armed?: boolean;
  /** Start: lamps that never light there and print only a name stand shorter. */
  compact?: boolean;
  /** Lamps light by a plain 720 ms fade, without the flicker (the landing: nothing moves there). */
  calm?: boolean;
  /** Lit lamps open nothing (the landing's sample). */
  readOnly?: boolean;
  /** Drawn inside the stage, over the lamps (Spektr). */
  children?: React.ReactNode;
};

/** Lamps per row in the housing (and the room light's columns): two rows of four. */
const PER_ROW = 4;

/** The full panel: the owner's lamps in pipeline order. */
export const Panel = forwardRef<HTMLUListElement, PanelProps>(function Panel(
  { lamps, size = "sm", showJob = false, className = "", housing = false, armed = false, compact = false, calm = false, readOnly = false, children },
  ref,
) {
  const c = useCopy();
  const pro = useStudio((s) => s.pro);
  const [open, setOpen] = useState<AgentRole | null>(null);
  const list = (
      <ul ref={ref} aria-label={c.dept.label} className={`grid grid-cols-2 gap-2.5 sm:grid-cols-4 ${className}`}>
        {OWNER_LAMPS.map((r, i) => {
          const quiet = isQuiet(lamps, r);
          const st = lamps.state[r];
          // In Professional rejim a lit lamp opens what that employee did.
          const tappable = pro && !readOnly && st !== "off";
          return (
            // --i staggers the embers when they arm (set here: LampTile's style holds its colours).
            <li key={r} className="flex" style={{ ["--i" as string]: i }}>
              <LampTile
                as={tappable ? "button" : "div"}
                role={r}
                size={size}
                state={st}
                name={c.lamps[r].name}
                job={showJob ? c.lamps[r].job : undefined}
                // A dark lamp says nothing, unless it is dark on purpose and says why.
                stateText={quiet ? lamps.quiet?.[r] : st === "off" ? undefined : c.lampState[st]}
                result={st === "off" ? undefined : lamps.outcome?.[r]}
                className={`w-full ${quiet ? "lamp--soon" : ""} ${tappable ? "cursor-pointer transition-transform duration-150 active:scale-[0.97]" : ""}`}
                {...(tappable ? { type: "button", onClick: () => setOpen(r), "aria-haspopup": "dialog" } : {})}
              >
                {st === "off" ? null : lamps.result[r]}
              </LampTile>
            </li>
          );
        })}
      </ul>
  );
  return (
    <>
      {housing ? (
        <div className="panel-stage" data-armed={armed || undefined} data-compact={compact || undefined} data-calm={calm || undefined}>
          {/* Each lit lamp's own light on the room, next to its tile: the top row on the wall above
              the housing, the bottom row on the floor below. Never averaged, never a rainbow. */}
          {OWNER_LAMPS.map((r, i) => {
            const st = lamps.state[r];
            return (
              <span
                key={r}
                aria-hidden
                className="room-light"
                data-row={i < PER_ROW ? "top" : "bottom"}
                data-on={st === "warming" ? "warm" : st === "on" || st === "you" ? "on" : undefined}
                data-soon={isQuiet(lamps, r) || undefined}
                style={{ ["--k" as string]: i % PER_ROW, background: roomLight(r) }}
              />
            );
          })}
          <div className="panel-housing">{list}</div>
          {children}
        </div>
      ) : (
        <>
          {list}
          {children}
        </>
      )}
      {open && <LampDrawer role={open} onClose={() => setOpen(null)} fallback={lamps.words[open] ?? c.lampState[lamps.state[open]]} />}
    </>
  );
});

/**
 * The department in one line: a small light per employee for the ready screen. Tap to open the
 * full panel with every lamp's result; tap again to fold it.
 */
export function Strip({ lamps }: { lamps: Lamps }) {
  const c = useCopy();
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-label={c.dept.label}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center gap-3 rounded-[14px] text-left"
      >
        <ul aria-hidden className="grid flex-1 grid-cols-8 gap-1.5">
          {OWNER_LAMPS.map((r) => (
            <LampTile key={r} as="li" role={r} size="xs" state={lamps.state[r]} />
          ))}
        </ul>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-2 transition-transform duration-300 ${open ? "rotate-180" : ""}`} strokeWidth={1.75} aria-hidden />
      </button>
      {open && <Panel lamps={lamps} className="mt-3" />}
    </div>
  );
}
