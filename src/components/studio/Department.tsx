import type { AgentRole, Script } from "@/lib/uslub/contract";
import { ChevronDown } from "lucide-react";
import { forwardRef, useMemo, useState } from "react";
import { Led } from "../lamp/Led";
import { LampTile } from "../lamp/LampTile";
import { LAMP_ORDER, type LampState } from "../lamp/lamps";
import { plural } from "../ui/format";
import { fmt, useCopy, useLang } from "../ui/lang";
import { useStudio, type StepKey } from "./store";

/** Roles that do nothing for the owner yet: their lamps stay dark with "tez orada". */
export const SOON_ROLES: readonly AgentRole[] = ["video", "radar"];
const SOON = SOON_ROLES;
const SCRIPTS: Script[] = ["uz_latn", "uz_cyrl", "ru", "en"];

export type Lamps = { state: Record<AgentRole, LampState>; soon: Set<AgentRole>; result: Partial<Record<AgentRole, React.ReactNode>> };

function Num({ n, word }: { n: number | string; word: string }) {
  return (
    <span className="flex flex-col items-start gap-1.5">
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
    if (gate) return { state, soon, result };

    state.brand = by(!!brand, "voice");
    if (brand) {
      const d = brand.dna;
      const first = d.tone.split(/[,.;]/)[0]?.trim();
      result.brand = (
        <span className="line-clamp-2 text-[14px] font-semibold leading-tight">
          {[d.address !== "n/a" ? c.channel.address[d.address] : null, first].filter(Boolean).join(", ")}
        </span>
      );
    }

    const read = mode === "fresh" ? !!brand : !!audit || postsRead != null;
    state.analyst = by(read, "read");
    const count = (forms: readonly string[], n: number) => <Num n={n} word={plural(forms, n, lang)} />;
    if (mode === "fresh" && brand) result.analyst = <span className="text-[14px] font-semibold leading-tight">{c.lampResult.described}</span>;
    else if (audit || postsRead != null) result.analyst = count(c.lampResult.postsRead, audit?.postsAnalyzed ?? postsRead ?? 0);

    state.strategist = by(!!plan, "plan");
    if (plan) result.strategist = count(c.lampResult.planned, plan.items.length);
    else if (progress?.m) result.strategist = <Num n={`${progress.n}/${progress.m}`} word={plural(c.lampResult.planned, progress.m, lang)} />;

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
    }

    const images = posts.map((p) => p.image).filter(Boolean);
    const ready = images.filter((i) => i!.status === "ready").length;
    const open = images.filter((i) => i!.status === "queued" || i!.status === "running").length;
    const imgStep = status("images");
    if (open) {
      state.designer = "warming";
      result.designer = <Num n={`${ready}/${posts.length}`} word={plural(c.lampResult.pictures, posts.length, lang)} />;
    } else if (ready) {
      state.designer = "on";
      result.designer = count(c.lampResult.pictures, ready);
    } else if (images.length) state.designer = "error";
    else if (imgStep === "skip") soon.add("designer");

    const published = posts.filter((p) => p.status === "published").length;
    if (published) {
      state.publisher = "on";
      result.publisher = count(c.lampResult.published, published);
    } else if (written) state.publisher = "you";

    return { state, soon, result };
  }, [gate, steps, mode, brand, audit, postsRead, plan, progress, posts, c, lang]);
}

/** The full panel: ten lamps in pipeline order. */
export const Panel = forwardRef<HTMLUListElement, { lamps: Lamps; size?: "sm" | "md"; showJob?: boolean; className?: string }>(function Panel(
  { lamps, size = "sm", showJob = false, className = "" },
  ref,
) {
  const c = useCopy();
  return (
    <ul ref={ref} aria-label={c.dept.label} className={`grid grid-cols-2 gap-2.5 sm:grid-cols-5 ${className}`}>
      {LAMP_ORDER.map((r) => {
        const soon = lamps.soon.has(r) && lamps.state[r] === "off";
        const st = lamps.state[r];
        return (
          <LampTile
            key={r}
            as="li"
            role={r}
            size={size}
            state={st}
            name={c.lamps[r].name}
            job={showJob ? c.lamps[r].job : undefined}
            // A dark lamp says nothing; only "tez orada" roles explain themselves.
            stateText={soon ? c.lampState.soon : st === "off" ? undefined : c.lampState[st]}
            className={soon ? "lamp--soon" : ""}
          >
            {st === "off" ? null : lamps.result[r]}
          </LampTile>
        );
      })}
    </ul>
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
