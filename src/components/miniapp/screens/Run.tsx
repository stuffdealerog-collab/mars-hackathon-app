import { useCallback, useEffect, useRef, useState } from "react";
import { Led, LedStrip } from "../../lamp/Led";
import { Mark } from "../../lamp/Mark";
import { Panel, useLamps } from "../../studio/Department";
import { SpectrumIntro } from "../../studio/SpectrumIntro";
import { POSTS_PER_RUN, useStudio, type Step } from "../../studio/store";
import { fmt, useCopy } from "../../ui/lang";
import { useMiniCopy } from "../copy";
import { PRIORITY, useBottomButtons } from "../nav";
import { TopBar } from "../Shell";
import { ledFit } from "../led-fit";
import { haptic } from "../tg";

type Copy = ReturnType<typeof useCopy>;

/** The step in plain words: what the department is doing right now. */
function stepLabel(step: Step, mode: "channel" | "fresh", c: Copy): string | null {
  const w = c.work;
  if (step.status === "skip") return null;
  const wait = step.status === "wait" || step.status === "fail";
  const run = step.status === "run";
  switch (step.key) {
    case "read": {
      const t = mode === "fresh" ? w.readDesc : w.readChannel;
      if (wait) return t.wait;
      if (run) return t.run;
      return mode === "channel" && step.n != null ? fmt(w.readChannel.done, { n: step.n }) : t.done.split(" · ")[0];
    }
    case "voice":
      return wait ? w.voice.wait : run ? w.voice.run : w.voice.done;
    case "photos":
      return wait ? w.photos.wait : run ? w.photos.run : w.photos.done;
    case "plan":
      if (wait) return w.plan.wait;
      if (run) return step.m ? fmt(w.plan.count, { n: step.n ?? 0, m: step.m }) : w.plan.run;
      return fmt(w.plan.done, { n: step.n ?? 0 });
    case "posts":
      if (wait) return fmt(w.posts.wait, { n: POSTS_PER_RUN });
      return run ? fmt(w.posts.run, { n: step.n ?? POSTS_PER_RUN }) : fmt(w.posts.done, { n: step.n ?? 0 });
    case "images":
      if (wait) return w.images.wait;
      return run ? fmt(w.images.run, { n: step.n ?? 0, m: step.m ?? POSTS_PER_RUN }) : fmt(w.images.done, { n: step.n ?? 0, m: step.m ?? 0 });
  }
}

/** Spektr plays once per app session: the first run's wow, not every retry. */
let spektrPlayed = false;

/** The run: the lamps light honestly as each employee works; one short caption. */
export function RunScreen({ active }: { active: boolean }) {
  const c = useCopy();
  const m = useMiniCopy();
  const steps = useStudio((s) => s.steps);
  const mode = useStudio((s) => s.mode);
  const problem = useStudio((s) => s.problem);
  const retry = useStudio((s) => s.retry);
  const reset = useStudio((s) => s.reset);
  const input = useStudio((s) => s.input);
  const sample = useStudio((s) => s.sample);
  const ledRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);
  const fixLink = !!problem && ["channel_invalid", "not_found", "invalid_input", "channel_mismatch"].includes(problem.code);

  const [intro, setIntro] = useState<{ gate: boolean } | null>(() => {
    if (spektrPlayed || typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
    spektrPlayed = true;
    return { gate: true };
  });
  const onBloom = useCallback(() => setIntro((i) => (i ? { gate: false } : i)), []);
  const onDone = useCallback(() => setIntro(null), []);
  useEffect(() => {
    if (!intro?.gate) return;
    const id = window.setTimeout(() => setIntro((i) => (i ? { gate: false } : i)), 2500);
    return () => clearTimeout(id);
  }, [intro?.gate]);
  const lamps = useLamps(!!intro?.gate);

  // An error is an outcome the owner should feel once.
  const hadProblem = useRef(false);
  useEffect(() => {
    if (problem && !hadProblem.current) haptic.error();
    hadProblem.current = !!problem;
  }, [problem]);

  const running = steps.find((s) => s.status === "run");
  const failed = steps.find((s) => s.status === "fail");
  const lastDone = [...steps].reverse().find((s) => s.status === "done");
  const now = running ?? failed ?? lastDone;
  const nowLabel = now ? stepLabel(now, mode, c) : null;
  const led = sample ? undefined : input.channel ? `@${input.channel}` : undefined;
  const fit = ledFit(led?.length ?? 0, 200); // the strip beside the clock

  useBottomButtons(
    "run",
    PRIORITY.base,
    active && !!problem,
    fixLink ? { text: c.error.startOver, onClick: reset } : { text: c.error.retry, onClick: () => (haptic.press(), retry()) },
    fixLink ? null : { text: c.error.startOver, onClick: reset },
  );

  return (
    <>
      <TopBar title={<Mark href={null} />} compact={false} pinned />
      <div className="ma-scroll">
        <div className="ma-pad ma-run">
          <div className="flex items-center gap-2.5">
            <div ref={ledRef} className="min-w-0 flex-1">
              <div className="ma-sign rounded-[12px]">
                <LedStrip text={led} dot={fit.dot} gap={fit.gap} run={fit.run} label={led} />
              </div>
            </div>
            <span className="ma-sign rounded-[12px] bg-stage px-3 py-[11px]" style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}>
              <Elapsed />
            </span>
          </div>

          <h1 className="ma-h1 mt-6">{problem ? c.error.title : c.dept.working}</h1>
          <p className="mt-2 min-h-6 text-[16px] leading-snug" aria-live="polite">
            {problem ? problem.message : nowLabel}
          </p>
          {!problem && <p className="mt-1 text-[14px] text-ink-3">{m.run.note}</p>}

          <div className="relative mt-5">
            <Panel ref={panelRef} lamps={lamps} />
            {intro && <SpectrumIntro fieldRef={ledRef} panelRef={panelRef} onBloom={onBloom} onDone={onDone} />}
          </div>
        </div>
      </div>
    </>
  );
}

/** The run's clock on the LED: m:ss, a measured number like the rest of the sign. */
function Elapsed() {
  const startedAt = useStudio((s) => s.startedAt);
  const problem = useStudio((s) => s.problem);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (problem) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [problem]);
  const s = Math.max(0, Math.round((now - startedAt) / 1000));
  return <Led text={`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`} dot={3} gap={1.3} grid={false} label={`${s} s`} />;
}
