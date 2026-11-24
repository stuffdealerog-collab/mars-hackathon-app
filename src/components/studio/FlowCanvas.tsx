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
import { AgentAvatar } from "../uslub/AgentAvatar";
import { kindMeta } from "../uslub/agents";
import { layers } from "./store";

export type AgentNodeData = { kind: NodeKind; label: string; status: NodeStatus; preview?: string };
type AgentNodeT = Node<AgentNodeData, "agent">;

export const STATUS_TEXT: Record<NodeStatus, string> = {
  idle: "Navbatda",
  running: "Ishlayapti",
  done: "Tayyor",
  error: "Xato",
  needs_approval: "Tasdiq kutmoqda",
};

const STATUS_RING: Record<NodeStatus, string> = {
  idle: "border-white/10",
  running: "border-[#8ea2f0] shadow-[0_0_0_4px_rgba(39,71,200,.35),0_0_32px_rgba(39,71,200,.55)]",
  done: "border-turq shadow-[0_0_0_3px_rgba(22,163,148,.25)]",
  error: "border-clay",
  needs_approval: "border-saffron shadow-[0_0_0_4px_rgba(242,169,59,.3),0_0_28px_rgba(242,169,59,.4)]",
};

export function StatusIcon({ status, className = "h-3.5 w-3.5" }: { status: NodeStatus; className?: string }) {
  if (status === "running") return <Loader2 className={`${className} animate-spin text-[#a9b8f5]`} />;
  if (status === "done") return <Check className={`${className} text-turq`} strokeWidth={3} />;
  if (status === "needs_approval") return <Hourglass className={`${className} text-saffron`} />;
  return <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/30" />;
}

function AgentNode({ data, selected }: NodeProps<AgentNodeT>) {
  const meta = kindMeta(data.kind);
  const dim = data.status === "idle";
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: dim ? 0.62 : 1, scale: data.status === "running" ? 1.04 : 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className={`w-[210px] cursor-pointer rounded-2xl border-2 bg-night-2 px-3 py-2.5 text-white transition-[border-color,box-shadow] duration-500 ${
        STATUS_RING[data.status]
      } ${selected ? "outline outline-2 outline-offset-4 outline-white/40" : ""}`}
    >
      {data.kind !== "input" && <Handle type="target" position={Position.Left} />}
      <div className="flex items-center gap-2.5">
        <AgentAvatar kind={data.kind} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold leading-tight">{meta.name}</div>
          <div className="flex items-center gap-1.5 text-[11px] text-white/60">
            <StatusIcon status={data.status} className="h-3 w-3" />
            <span>{STATUS_TEXT[data.status]}</span>
          </div>
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={data.status === "done" || data.status === "needs_approval" ? "out" : "label"}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.25 }}
          className={`mt-2 truncate rounded-lg px-2 py-1 text-[12px] ${
            data.status === "done" ? "bg-turq/15 text-[#9be6dc]" : data.status === "needs_approval" ? "bg-saffron/15 text-[#ffd38f]" : "bg-white/5 text-white/70"
          }`}
        >
          {data.label}
        </motion.div>
      </AnimatePresence>
      {data.kind !== "publisher" && <Handle type="source" position={Position.Right} />}
    </motion.div>
  );
}

const nodeTypes = { agent: AgentNode };

export function layoutFlow(flow: Flow, status: Record<string, NodeStatus>, selected?: string | null) {
  const cols = layers(flow);
  const nodes: AgentNodeT[] = [];
  cols.forEach((col, x) => {
    col.forEach((id, y) => {
      const n = flow.nodes.find((f) => f.id === id)!;
      nodes.push({
        id,
        type: "agent",
        position: { x: x * 270, y: (y - (col.length - 1) / 2) * 118 },
        data: { kind: n.kind, label: n.label, status: status[id] ?? "idle" },
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
        stroke: done ? "#16A394" : live ? "#8ea2f0" : "rgba(255,255,255,.18)",
        strokeWidth: done || live ? 2.2 : 1.5,
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
}: {
  flow: Flow;
  status: Record<string, NodeStatus>;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  interactive: boolean;
}) {
  const { nodes, edges } = useMemo(() => layoutFlow(flow, status, selected), [flow, status, selected]);
  const rf = useReactFlow();
  useEffect(() => {
    const t = setTimeout(() => rf.fitView({ padding: 0.18, duration: 500 }), 60);
    return () => clearTimeout(t);
  }, [flow.id, flow.nodes.length, rf]);
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
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="rgba(255,255,255,.12)" />
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
  className?: string;
}) {
  return (
    <div className={`uslub-flow girih-night relative overflow-hidden bg-night ${props.className ?? "h-[460px]"}`}>
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
}: {
  flow: Flow;
  status: Record<string, NodeStatus>;
  onSelect?: (id: string) => void;
}) {
  const order = layers(flow).flat();
  return (
    <ol className="girih-night flex flex-col gap-2 rounded-2xl bg-night p-3">
      {order.map((id) => {
        const n = flow.nodes.find((x) => x.id === id)!;
        const s = status[id] ?? "idle";
        const meta = kindMeta(n.kind);
        return (
          <motion.li key={id} layout>
            <button
              type="button"
              onClick={() => onSelect?.(id)}
              className={`flex w-full items-center gap-3 rounded-xl border-2 bg-night-2 px-3 py-2 text-left text-white transition-[border-color,box-shadow,opacity] duration-500 ${STATUS_RING[s]} ${
                s === "idle" ? "opacity-60" : ""
              }`}
            >
              <AgentAvatar kind={n.kind} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold">{meta.name}</span>
                <span className="block truncate text-[12px] text-white/60">{n.label}</span>
              </span>
              <span className="flex items-center gap-1 text-[11px] text-white/70">
                <StatusIcon status={s} />
                {STATUS_TEXT[s]}
              </span>
            </button>
          </motion.li>
        );
      })}
    </ol>
  );
}
