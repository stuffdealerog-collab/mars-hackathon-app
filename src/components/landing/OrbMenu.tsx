"use client";

import type { AgentRole } from "@/lib/uslub/contract";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { AgentAvatar } from "@/components/uslub/AgentAvatar";
import { AGENT_ORDER, AGENTS, GRAD } from "@/components/uslub/agents";
import { glowBg } from "@/components/uslub/GlowCard";
import { Orb } from "@/components/uslub/Orb";

/** Radial orb menu: the owner in the centre, ten AI employees around. */
export function OrbMenu() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState<AgentRole>("brand");
  const a = AGENTS[active];
  const [from, to] = GRAD[active];
  const n = AGENT_ORDER.length;

  return (
    <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div className="relative mx-auto aspect-square w-full max-w-[460px]">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth=".35" strokeDasharray=".6 1.6" />
          <circle cx="50" cy="50" r="22" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth=".3" strokeDasharray=".6 1.6" />
        </svg>

        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
          <motion.span
            animate={reduce ? undefined : { scale: [1, 1.05, 1] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
            className="block"
          >
            <Orb kind="approval" size={86} glow />
          </motion.span>
          <span className="mono-label !text-fog">Siz</span>
        </div>

        <ul aria-label="AI xodimlar">
          {AGENT_ORDER.map((role, i) => {
            const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
            const x = 50 + 38 * Math.cos(angle);
            const y = 50 + 38 * Math.sin(angle);
            const on = role === active;
            return (
              <motion.li
                key={role}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${x}%`, top: `${y}%` }}
                initial={reduce ? false : { scale: 0.3 }}
                whileInView={{ scale: 1 }}
                viewport={{ once: true }}
                transition={{ type: "spring", stiffness: 260, damping: 18, delay: reduce ? 0 : i * 0.05 }}
              >
                <button
                  type="button"
                  onMouseEnter={() => setActive(role)}
                  onFocus={() => setActive(role)}
                  onClick={() => setActive(role)}
                  aria-pressed={on}
                  aria-label={AGENTS[role].name}
                  className="group relative grid place-items-center rounded-full"
                >
                  <motion.span animate={{ scale: on ? 1.18 : 1 }} transition={{ type: "spring", stiffness: 380, damping: 20 }} className="block">
                    <Orb kind={role} size={52} glow={on} />
                  </motion.span>
                  <span
                    className={`pointer-events-none absolute top-full mt-1.5 whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] transition-opacity ${
                      on ? "bg-fog text-void opacity-100" : "text-mute opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    {AGENTS[role].name}
                  </span>
                </button>
              </motion.li>
            );
          })}
        </ul>
      </div>

      <motion.article
          key={active}
          initial={reduce ? false : { y: 14, scale: 0.98 }}
          animate={{ y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 26 }}
          className="relative overflow-hidden rounded-[32px] p-6 shadow-[inset_0_0_0_1px_rgba(255,255,255,.1)]"
          style={{ background: glowBg(from, to, 0.8, "100% 0%") }}
        >
          <div className="flex items-center gap-4">
            <AgentAvatar kind={active} size={72} photo />
            <div>
              <h3 className="text-[22px] font-extrabold tracking-[-0.02em] text-fog">{a.name}</h3>
              <p className="mono-label !text-white/70">
                {a.ru} / {a.en}
              </p>
            </div>
          </div>
          <p className="mt-5 text-[16px] leading-relaxed text-fog">{a.does}</p>
          <div className="mt-5 rounded-2xl bg-black/45 px-4 py-3 text-[14px] text-white/85">
            <span className="mono-label mr-2">Bugun</span>
            {a.today}
          </div>
        </motion.article>
    </div>
  );
}
