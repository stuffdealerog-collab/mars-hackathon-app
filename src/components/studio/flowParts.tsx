"use client";

/* Status vocabulary and the phone step list, kept free of @xyflow so screens
   that do not draw the canvas never download it. FlowCanvas re-exports these. */
import type { Flow, NodeKind, NodeStatus } from "@/lib/uslub/contract";
import { Check, Hourglass, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { GRAD, kindMeta } from "../uslub/agents";
import { glowBg } from "../uslub/GlowCard";
import { Orb } from "../uslub/Orb";
import { layers } from "./store";

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

export function statusColor(s: NodeStatus) {
  return s === "done" ? "#3BE08A" : s === "needs_approval" ? "#FFB547" : s === "running" ? "#D7FF3A" : s === "error" ? "#FF4D5E" : "#5B5B64";
}

export function StatusIcon({ status, className = "h-3.5 w-3.5" }: { status: NodeStatus; className?: string }) {
  if (status === "running") return <Loader2 className={`${className} animate-spin text-lime`} />;
  if (status === "done") return <Check className={`${className} text-ok`} strokeWidth={3} />;
  if (status === "needs_approval") return <Hourglass className={`${className} text-wait`} />;
  return <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/30" />;
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
