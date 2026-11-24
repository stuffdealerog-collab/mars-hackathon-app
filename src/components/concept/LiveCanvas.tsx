"use client";

import type { NodeStatus } from "@/lib/uslub/contract";
import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { FlowCanvas, StepList } from "../studio/FlowCanvas";
import { TEMPLATES } from "../studio/mocks";
import { layers } from "../studio/store";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Mini canvas that replays a template run, layer by layer, on a loop. */
export function LiveCanvas() {
  const [tpl, setTpl] = useState(0);
  const [round, setRound] = useState(0);
  const [status, setStatus] = useState<Record<string, NodeStatus>>({});
  const flow = TEMPLATES[tpl].flow;

  useEffect(() => {
    let alive = true;
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    (async () => {
      const order = layers(flow);
      const finalOf = (id: string): NodeStatus => {
        const k = flow.nodes.find((n) => n.id === id)!.kind;
        return k === "approval" ? "needs_approval" : k === "publisher" ? "idle" : "done";
      };
      if (reduce) {
        setStatus(Object.fromEntries(flow.nodes.map((n) => [n.id, finalOf(n.id)])));
        return;
      }
      setStatus(Object.fromEntries(flow.nodes.map((n) => [n.id, "idle" as NodeStatus])));
      await sleep(700);
      for (const layer of order) {
        if (!alive) return;
        const ids = layer.filter((id) => flow.nodes.find((n) => n.id === id)!.kind !== "publisher");
        if (!ids.length) continue;
        setStatus((s) => ({ ...s, ...Object.fromEntries(ids.map((id) => [id, "running" as NodeStatus])) }));
        await sleep(1000);
        if (!alive) return;
        setStatus((s) => ({ ...s, ...Object.fromEntries(ids.map((id) => [id, finalOf(id)])) }));
        await sleep(250);
      }
      await sleep(3200);
      if (alive) setRound((r) => r + 1);
    })();
    return () => {
      alive = false;
    };
  }, [flow, round]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {TEMPLATES.map((t, i) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setTpl(i);
              setRound((r) => r + 1);
            }}
            aria-pressed={tpl === i}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
              tpl === i
                ? "bg-fog text-void"
                : "bg-white/6 text-fog/80 shadow-[inset_0_0_0_1px_rgba(255,255,255,.1)] hover:bg-white/10"
            }`}
          >
            {t.name}
          </button>
        ))}
        <button type="button" onClick={() => setRound((r) => r + 1)} className="pill-ghost ml-auto px-3.5 py-1.5 text-[13px]">
          <RotateCcw className="h-3.5 w-3.5" /> Qayta ishga tushirish
        </button>
      </div>
      <p className="text-[14px] text-mute">
        <b className="text-fog">{TEMPLATES[tpl].name}:</b> {TEMPLATES[tpl].hint}. Topshiriq: «{TEMPLATES[tpl].task}»
      </p>
      <div className="hidden md:block">
        <FlowCanvas flow={flow} status={status} interactive={false} className="h-[440px] rounded-[36px]" />
      </div>
      <div className="md:hidden">
        <StepList flow={flow} status={status} />
      </div>
    </div>
  );
}
