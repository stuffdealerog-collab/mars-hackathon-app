import type { AgentRole, Script } from "@/lib/uslub/contract";
import { ChevronDown } from "lucide-react";
import dynamic from "next/dynamic";
import { forwardRef, useMemo, useState } from "react";
import { Led } from "../lamp/Led";
import { LampTile } from "../lamp/LampTile";
import { LAMP_ORDER, lampVars, type LampState } from "../lamp/lamps";
import { plural } from "../ui/format";
import { fmt, useCopy, useLang } from "../ui/lang";
import { useStudio, type StepKey } from "./store";

// Professional rejim only, loaded on demand.
const LampDrawer = dynamic(() => import("./pro/ProDetails").then((m) => m.LampDrawer), { ssr: false });

/** Roles that do nothing for the owner yet: their lamps stay dark with "tez orada". */
export const SOON_ROLES: readonly AgentRole[] = ["video", "radar"];
const SOON = SOON_ROLES;
const SCRIPTS: Script[] = ["uz_latn", "uz_cyrl", "ru", "en"];

/** `result`: what each lamp shows; `words`: the same in plain text (tooltips, aria labels). */
export type Lamps = {
  state: Record<AgentRole, LampState>;
  soon: Set<AgentRole>;
  result: Partial<Record<AgentRole, React.ReactNode>>;
  words: Partial<Record<AgentRole, string>>;
};

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
  const brand = useStudio((s) => s.brand);
  const audit = useStudio((s) => s.audit);
  const postsRead = useStudio((s) => s.postsRead);
  const plan = useStudio((s) => s.plan);
  const progress = useStudio((s) => s.planProgress);
  const posts = useStudio((s) => s.posts);

  return useMemo(() => {
    const status = (k: StepKey) => steps.find((s) => s.key === k)?.status;
    const by = (held: boolean, k: StepKey): LampState => (held ? "on" : status(k) === "run" ? "warming" : status(k) === "fail" ? "error" : "off");
    const state = Object.fromEntries(LAMP_ORDER.map((r) => [r, "off"])) as Record<AgentRole, LampState>;
    const soon = new Set<AgentRole>(SOON);
    const result: Lamps["result"] = {};
    const words: Lamps["words"] = {};
    if (gate) return { state, soon, result, words };

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
      // What it translated into, by name: no count to misread.
      const into = SCRIPTS.filter((s) => s !== "uz_latn" && posts.some((p) => p.variants[s]?.trim()));
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
    else if (imgStep === "skip") soon.add("designer");

    const published = posts.filter((p) => p.status === "published").length;
    if (published) {
      state.publisher = "on";
      result.publisher = count(c.lampResult.published, published);
      words.publisher = say(c.lampResult.published, published);
    } else if (written) state.publisher = "you";

    return { state, soon, result, words };
  }, [gate, steps, mode, brand, audit, postsRead, plan, progress, posts, c, lang]);
}

type PanelProps = {
  lamps: Lamps;
  size?: "sm" | "md";
  showJob?: boolean;
  className?: string;
  /** Computer screens: the ten lamps in one housing, each lit lamp's light on the room around it. */
  housing?: boolean;
  /** A valid link is typed: the embers heat to hot filaments (nobody works yet). */
  armed?: boolean;
  /** Start: lamps that never light there and print only a name stand shorter. */
  compact?: boolean;
  /** Drawn inside the stage, over the lamps (Spektr). */
  children?: React.ReactNode;
};

/** The full panel: ten lamps in pipeline order. */
export const Panel = forwardRef<HTMLUListElement, PanelProps>(function Panel({ lamps, size = "sm", showJob = false, className = "", housing = false, armed = false, compact = false, children }, ref) {
  const c = useCopy();
  const pro = useStudio((s) => s.pro);
  const [open, setOpen] = useState<AgentRole | null>(null);
  const list = (
      <ul ref={ref} aria-label={c.dept.label} className={`grid grid-cols-2 gap-2.5 sm:grid-cols-5 ${className}`}>
        {LAMP_ORDER.map((r, i) => {
          const soon = lamps.soon.has(r) && lamps.state[r] === "off";
          const st = lamps.state[r];
          // In Professional rejim a lit lamp opens what that employee did.
          const tappable = pro && st !== "off";
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
                // A dark lamp says nothing; only "tez orada" roles explain themselves.
                stateText={soon ? c.lampState.soon : st === "off" ? undefined : c.lampState[st]}
                className={`w-full ${soon ? "lamp--soon" : ""} ${tappable ? "cursor-pointer transition-transform duration-150 active:scale-[0.97]" : ""}`}
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
        <div className="panel-stage" data-armed={armed || undefined} data-compact={compact || undefined}>
          {/* Each lit lamp's own light on the room, next to its tile: the top row on the wall above
              the housing, the bottom row on the floor below. Never averaged, never a rainbow. */}
          {LAMP_ORDER.map((r, i) => {
            const st = lamps.state[r];
            return (
              <span
                key={r}
                aria-hidden
                className="room-light"
                data-row={i < 5 ? "top" : "bottom"}
                data-on={st === "warming" ? "warm" : st === "on" || st === "you" ? "on" : undefined}
                data-soon={lamps.soon.has(r) || undefined}
                style={{ ...lampVars(r), ["--k" as string]: i % 5, background: "var(--room)" }}
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
 * The department in one line: ten small lights for the ready screen. Tap to open the full
 * panel with every lamp's result; tap again to fold it.
 */
export function Strip({ lamps }: { lamps: Lamps }) {
  const c = useCopy();
  const [open, setOpen] = useState(false);
  const working = LAMP_ORDER.filter((r) => lamps.state[r] !== "off").length;
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center gap-3 rounded-[14px] text-left"
      >
        <ul aria-hidden className="grid flex-1 grid-cols-10 gap-1.5">
          {LAMP_ORDER.map((r) => (
            <LampTile key={r} as="li" role={r} size="xs" state={lamps.state[r]} />
          ))}
        </ul>
        <span className="tnum flex shrink-0 items-center gap-1 text-[13px] text-ink-2">
          {fmt(c.dept.staff, { n: working })}
          <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${open ? "rotate-180" : ""}`} strokeWidth={1.75} aria-hidden />
        </span>
      </button>
      {open && <Panel lamps={lamps} className="mt-3" />}
    </div>
  );
}
