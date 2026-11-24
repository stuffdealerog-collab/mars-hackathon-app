import type { AgentRole, Script } from "@/lib/uslub/contract";
import { forwardRef, useMemo } from "react";
import { Led } from "../lamp/Led";
import { LampTile } from "../lamp/LampTile";
import { LAMP_ORDER, type LampState } from "../lamp/lamps";
import { useCopy } from "../ui/lang";
import { useStudio, type StepKey } from "./store";

/** Roles that do nothing for the owner yet: their lamps stay dark with "tez orada". */
const SOON: AgentRole[] = ["video", "radar"];
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
    if (mode === "fresh" && brand) result.analyst = <span className="text-[14px] font-semibold leading-tight">{c.lampResult.described}</span>;
    else if (audit || postsRead != null) result.analyst = <Num n={audit?.postsAnalyzed ?? postsRead ?? 0} word={c.lampResult.postsRead} />;

    state.strategist = by(!!plan, "plan");
    if (plan) result.strategist = <Num n={plan.items.length} word={c.lampResult.planned} />;
    else if (progress?.m) result.strategist = <Num n={`${progress.n}/${progress.m}`} word={c.lampResult.planned} />;

    const written = posts.length > 0;
    state.copywriter = by(written, "posts");
    state.editor = by(written, "posts");
    state.translator = by(written, "posts");
    if (written) {
      result.copywriter = <Num n={posts.length} word={c.lampResult.written} />;
      result.editor = <span className="text-[14px] font-semibold leading-tight">{c.lampResult.clean}</span>;
      const langs = SCRIPTS.filter((s) => posts.some((p) => p.variants[s]?.trim())).length;
      result.translator = <Num n={langs} word={c.lampResult.languages} />;
    }

    const images = posts.map((p) => p.image).filter(Boolean);
    const ready = images.filter((i) => i!.status === "ready").length;
    const open = images.filter((i) => i!.status === "queued" || i!.status === "running").length;
    const imgStep = status("images");
    if (open) {
      state.designer = "warming";
      result.designer = <Num n={`${ready}/${posts.length}`} word={c.lampResult.pictures} />;
    } else if (ready) {
      state.designer = "on";
      result.designer = <Num n={ready} word={c.lampResult.pictures} />;
    } else if (images.length) state.designer = "error";
    else if (imgStep === "skip") soon.add("designer");

    const published = posts.filter((p) => p.status === "published").length;
    if (published) {
      state.publisher = "on";
      result.publisher = <Num n={published} word={c.lampResult.published} />;
    } else if (written) state.publisher = "you";

    return { state, soon, result };
  }, [gate, steps, mode, brand, audit, postsRead, plan, progress, posts, c]);
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
            stateText={soon ? c.lampState.soon : c.lampState[st]}
            className={soon ? "opacity-60" : ""}
          >
            {st === "off" ? null : lamps.result[r]}
          </LampTile>
        );
      })}
    </ul>
  );
});

/** The department in one line: ten small lights, for the ready screen in simple mode. */
export function Strip({ lamps }: { lamps: Lamps }) {
  const c = useCopy();
  const working = LAMP_ORDER.filter((r) => lamps.state[r] !== "off" && !lamps.soon.has(r)).length;
  const total = LAMP_ORDER.filter((r) => !SOON.includes(r)).length;
  return (
    <div className="flex items-center gap-3">
      <ul aria-label={c.dept.label} className="grid flex-1 grid-cols-10 gap-1.5">
        {LAMP_ORDER.map((r) => (
          <LampTile
            key={r}
            as="li"
            role={r}
            size="xs"
            state={lamps.state[r]}
            aria-label={`${c.lamps[r].name}: ${lamps.soon.has(r) && lamps.state[r] === "off" ? c.lampState.soon : c.lampState[lamps.state[r]]}`}
            title={c.lamps[r].name}
          />
        ))}
      </ul>
      <span className="tnum shrink-0 text-[13px] text-ink-2">{c.dept.staff.replace("{n}", String(working)).replace("{m}", String(total))}</span>
    </div>
  );
}
