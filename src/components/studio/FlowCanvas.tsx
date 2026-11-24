"use client";

import "@xyflow/react/dist/style.css";
import type { Flow, NodeKind, NodeStatus } from "@/lib/uslub/contract";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { Check, Hourglass, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo } from "react";
import { GRAD, kindMeta } from "../uslub/agents";
import { glowBg } from "../uslub/GlowCard";
import { Orb } from "../uslub/Orb";
import { layers } from "./store";

export type AgentNodeData = { kind: NodeKind; label: string; status: NodeStatus; preview?: string; sample?: boolean };
type AgentNodeT = Node<AgentNodeData, "agent">;

export const STATUS_TEXT: Record<NodeStatus, string> = {
  idle: "Navbatda",
  running: "Ishlayapti",
  done: "Tayyor",
  error: "Xato",
  needs_approval: "Tasdiq kutmoqda",
};

export const RUNNING_HINT: Partial<Record<NodeKind, string>> = {
  brand: "Kanal postlarini o'qiyapti…",
  analyst: "Raqamlarni sanayapti…",
  strategist: "Reja tuzyapti…",
  copywriter: "Yozyapti…",
  editor: "Neyro-so'zlarni qidiryapti…",
  translator: "4 yozuvga o'giryapti…",
  designer: "Muqova chizyapti…",
  video: "Ssenariy yozyapti…",
  radar: "Internetdan qidiryapti…",
  publisher: "Joylayapti…",
  approval: "Sizni kutyapti",
};

function statusColor(s: NodeStatus) {
  return s === "done" ? "#3BE08A" : s === "needs_approval" ? "#FFB547" : s === "running" ? "#D7FF3A" : s === "error" ? "#FF4D5E" : "#5B5B64";
}

export function StatusIcon({ status, className = "h-3.5 w-3.5" }: { status: NodeStatus; className?: string }) {
  if (status === "running") return <Loader2 className={`${className} animate-spin text-lime`} />;
  if (status === "done") return <Check className={`${className} text-ok`} strokeWidth={3} />;
  if (status === "needs_approval") return <Hourglass className={`${className} text-wait`} />;
  return <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/30" />;
}

function AgentNode({ data, selected }: NodeProps<AgentNodeT>) {
  const meta = kindMeta(data.kind);
  const [a, b] = GRAD[data.kind];
  const st = data.status;
  const strength = st === "idle" ? 0.22 : st === "running" ? 1 : st === "needs_approval" ? 0.75 : 0.55;
  const glowFrom = st === "needs_approval" ? "#FFB547" : a;
  return (
    <motion.div
      initial={{ scale: 0.92 }}
      animate={{ scale: st === "running" ? 1.05 : 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
      className={`relative w-[220px] cursor-pointer rounded-[24px] px-3 pb-3 pt-3 text-white transition-[opacity,box-shadow] duration-500 ${st === "idle" ? "opacity-70" : "opacity-100"} ${
        selected ? "ring-2 ring-lime/70 ring-offset-4 ring-offset-void" : ""
      }`}
      style={{
        background: glowBg(glowFrom, b, strength, "50% -10%"),
        boxShadow:
          st === "running"
            ? `inset 0 0 0 1px rgba(255,255,255,.22), 0 0 0 1px ${a}55, 0 18px 60px -10px ${a}aa, 0 0 90px -20px ${b}`
            : `inset 0 0 0 1px rgba(255,255,255,${st === "idle" ? 0.07 : 0.14})`,
      }}
    >
      {data.kind !== "input" && <Handle type="target" position={Position.Left} />}
      <div className="flex items-center gap-2.5">
        <Orb kind={data.kind} size={34} glow={st === "running"} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-bold leading-tight tracking-tight">{meta.name}</div>
          <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: statusColor(st) }}>
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${st === "running" ? "uslub-breathe" : ""}`} style={{ background: statusColor(st) }} />
            {STATUS_TEXT[st]}
          </div>
        </div>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={st}
          initial={{ y: 4 }}
          animate={{ y: 0 }}
          exit={{ y: -4 }}
          transition={{ duration: 0.2 }}
          className="mt-2.5 truncate rounded-xl bg-black/35 px-2.5 py-1.5 text-[12px] text-white/85 backdrop-blur"
        >
          {st === "running" ? RUNNING_HINT[data.kind] ?? data.label : data.label}
        </motion.div>
      </AnimatePresence>
      {data.sample && (st === "done" || st === "needs_approval") && (
        <span className="absolute right-3 top-3 rounded-full bg-black/45 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-white/60">
          namuna
        </span>
      )}
      {data.kind !== "publisher" && <Handle type="source" position={Position.Right} />}
    </motion.div>
  );
}

const nodeTypes = { agent: AgentNode };

export function layoutFlow(flow: Flow, status: Record<string, NodeStatus>, selected?: string | null, sample?: Record<string, boolean>) {
  const cols = layers(flow);
  const nodes: AgentNodeT[] = [];
  cols.forEach((col, x) => {
    col.forEach((id, y) => {
      const n = flow.nodes.find((f) => f.id === id)!;
      nodes.push({
        id,
        type: "agent",
        position: { x: x * 280, y: (y - (col.length - 1) / 2) * 124 },
        data: { kind: n.kind, label: n.label, status: status[id] ?? "idle", sample: sample?.[id] },
        selected: selected === id,
      });
    });
  });
  const edges: Edge[] = flow.edges.map((e) => {
    const s = status[e.from];
    const t = status[e.to];
    const live = t === "running" || (s === "done" && t === "idle");
    const done = s === "done" && (t === "done" || t === "needs_approval");
    return {
      id: `${e.from}-${e.to}`,
      source: e.from,
      target: e.to,
      type: "default",
      className: live ? "uslub-edge-live" : "",
      style: {
        stroke: live ? "#D7FF3A" : done ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.18)",
        strokeWidth: live ? 2 : 1.6,
        strokeDasharray: "2 6",
        strokeLinecap: "round",
        filter: live ? "drop-shadow(0 0 6px rgba(215,255,58,.9))" : undefined,
      },
    };
  });
  return { nodes, edges };
}

function Inner({
  flow,
  status,
  selected,
  onSelect,
  interactive,
  follow,
  sample,
}: {
  flow: Flow;
  status: Record<string, NodeStatus>;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  interactive: boolean;
  follow?: boolean;
  sample?: Record<string, boolean>;
}) {
  const { nodes, edges } = useMemo(() => layoutFlow(flow, status, selected, sample), [flow, status, selected, sample]);
  const rf = useReactFlow();
  useEffect(() => {
    const t = setTimeout(() => rf.fitView({ padding: 0.18, duration: 500 }), 60);
    return () => clearTimeout(t);
  }, [flow.id, flow.nodes.length, rf]);

  // Camera follows the employees who are working right now (cinematic, legible at any width).
  const runningKey = flow.nodes.filter((n) => status[n.id] === "running").map((n) => n.id).join(",");
  const anyStarted = flow.nodes.some((n) => status[n.id] && status[n.id] !== "idle");
  const allSettled = anyStarted && !flow.nodes.some((n) => status[n.id] === "running");
  useEffect(() => {
    if (!follow) return;
    if (runningKey) {
      const ids = new Set(runningKey.split(","));
      flow.edges.forEach((e) => {
        if (ids.has(e.to)) ids.add(e.from);
      });
      const t = setTimeout(
        () => rf.fitView({ nodes: [...ids].map((id) => ({ id })), padding: 0.35, duration: 800, maxZoom: 1.05, minZoom: 0.45 }),
        40,
      );
      return () => clearTimeout(t);
    }
    if (allSettled) {
      const t = setTimeout(() => rf.fitView({ padding: 0.12, duration: 900 }), 300);
      return () => clearTimeout(t);
    }
  }, [runningKey, allSettled, follow, flow.edges, rf]);
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.18 }}
      minZoom={0.3}
      maxZoom={1.6}
      nodesDraggable={interactive}
      nodesConnectable={false}
      elementsSelectable
      panOnDrag={interactive}
      zoomOnScroll={false}
      zoomOnPinch={interactive}
      preventScrolling={false}
      onNodeClick={(_, n) => onSelect?.(n.id)}
      onPaneClick={() => onSelect?.(null)}
      proOptions={{ hideAttribution: true }}
      style={{ background: "transparent" }}
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1.1} color="rgba(255,255,255,.1)" />
      {interactive && <Controls showInteractive={false} position="bottom-right" />}
    </ReactFlow>
  );
}

export function FlowCanvas(props: {
  flow: Flow;
  status: Record<string, NodeStatus>;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  interactive?: boolean;
  follow?: boolean;
  sample?: Record<string, boolean>;
  className?: string;
}) {
  return (
    <div className={`uslub-flow relative overflow-hidden bg-[#08080a] shadow-[inset_0_0_0_1px_rgba(255,255,255,.07)] ${props.className ?? "h-[460px] rounded-[32px]"}`}>
      <ReactFlowProvider>
        <Inner {...props} interactive={props.interactive ?? true} />
      </ReactFlowProvider>
    </div>
  );
}

/** Small screens: the same graph as a vertical list of steps. */
export function StepList({
  flow,
  status,
  onSelect,
  sample,
}: {
  flow: Flow;
  status: Record<string, NodeStatus>;
  onSelect?: (id: string) => void;
  sample?: Record<string, boolean>;
}) {
  const order = layers(flow).flat();
  return (
    <ol className="flex flex-col gap-2">
      {order.map((id) => {
        const n = flow.nodes.find((x) => x.id === id)!;
        const s = status[id] ?? "idle";
        const meta = kindMeta(n.kind);
        const [a, b] = GRAD[n.kind];
        const strength = s === "idle" ? 0.18 : s === "running" ? 0.95 : s === "needs_approval" ? 0.7 : 0.5;
        return (
          <motion.li key={id} layout>
            <button
              type="button"
              onClick={() => onSelect?.(id)}
              className={`flex w-full items-center gap-3 rounded-[22px] px-3 py-2.5 text-left text-white transition-[opacity,box-shadow] duration-500 ${s === "idle" ? "opacity-60" : ""}`}
              style={{
                background: glowBg(s === "needs_approval" ? "#FFB547" : a, b, strength, "0% 50%"),
                boxShadow: s === "running" ? `inset 0 0 0 1px rgba(255,255,255,.2), 0 10px 40px -12px ${a}` : "inset 0 0 0 1px rgba(255,255,255,.08)",
              }}
            >
              <Orb kind={n.kind} size={34} glow={s === "running"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-bold">{meta.name}</span>
                <span className="block truncate text-[12px] text-white/70">
                  {s === "running" ? RUNNING_HINT[n.kind] ?? n.label : n.label}
                  {sample?.[id] && (s === "done" || s === "needs_approval") ? " · namuna" : ""}
                </span>
              </span>
              <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: statusColor(s) }}>
                <StatusIcon status={s} className="h-3 w-3" />
                {STATUS_TEXT[s]}
              </span>
            </button>
          </motion.li>
        );
      })}
    </ol>
  );
}
