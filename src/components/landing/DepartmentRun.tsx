"use client";

import type { AgentRole } from "@/lib/uslub/contract";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { AGENTS } from "@/components/uslub/agents";
import { AgentAvatar } from "@/components/uslub/AgentAvatar";

const STEPS: { role: AgentRole; result: string }[] = [
  { role: "brand", result: "Brend DNK tayyor: iliq ohang, «siz», kam emoji" },
  { role: "strategist", result: "7 kunlik reja, 3 ta format" },
  { role: "copywriter", result: "7 ta post sizning ovozingizda" },
  { role: "editor", result: "9 ta neyro-so'z olib tashlandi · inson bali 92" },
  { role: "translator", result: "Lotin, kirill, rus, ingliz — 4 yozuv" },
  { role: "designer", result: "7 ta muqova brend ranglarida" },
  { role: "video", result: "15 soniyalik Reels ssenariysi" },
  { role: "radar", result: "Mijozlaringiz turgan 10 joy" },
  { role: "publisher", result: "Tasdig'ingizni kutmoqda" },
];

const STEP_GAP = 900; // ms between starts
const STEP_LEN = 1300; // ms each employee works
const HOLD = 3200; // ms to hold the finished board
const TOTAL = STEP_GAP * (STEPS.length - 1) + STEP_LEN;
const FAKE_SECONDS = 58; // what the counter shows at the end

export function DepartmentRun() {
  const reduce = useReducedMotion();
  const [t, setT] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const start = performance.now();
    const id = window.setInterval(() => {
      const elapsed = (performance.now() - start) % (TOTAL + HOLD);
      setT(elapsed);
    }, 80);
    return () => window.clearInterval(id);
  }, [reduce]);

  const now = reduce ? TOTAL : t;
  const seconds = Math.min(FAKE_SECONDS, Math.round((Math.min(now, TOTAL) / TOTAL) * FAKE_SECONDS));
  const doneCount = STEPS.filter((_, i) => now >= i * STEP_GAP + STEP_LEN).length;
  const finished = doneCount === STEPS.length;

  return (
    <div className="girih-night relative overflow-hidden rounded-[28px] bg-night p-4 text-white shadow-[0_30px_80px_-40px_rgba(14,20,48,.9)] sm:p-6">
      <div className="flex items-center gap-3 rounded-2xl bg-night-2/90 px-4 py-3 ring-1 ring-white/10">
        <span className="h-2 w-2 shrink-0 rounded-full bg-turq" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[15px] text-white/90">t.me/nafis_kiyim</span>
        <span
          className="font-display text-[15px] tabular-nums text-saffron"
          aria-label={`${seconds} soniya`}
        >
          0:{String(seconds).padStart(2, "0")}
        </span>
      </div>

      <ol className="mt-4 flex flex-col gap-1.5" aria-label="Bo'lim ishlamoqda">
        {STEPS.map((s, i) => {
          const begin = i * STEP_GAP;
          const state = now < begin ? "idle" : now < begin + STEP_LEN ? "running" : "done";
          const a = AGENTS[s.role];
          return (
            <motion.li
              key={s.role}
              animate={{ opacity: state === "idle" ? 0.38 : 1 }}
              transition={{ duration: 0.35 }}
              className={`flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors duration-300 ${
                state === "running" ? "bg-white/[0.07]" : ""
              }`}
            >
              <span className="relative">
                <AgentAvatar kind={s.role} size={34} />
                {state === "running" && !reduce && (
                  <motion.span
                    className="absolute -inset-1 rounded-full ring-2 ring-saffron"
                    initial={{ opacity: 0.9, scale: 0.9 }}
                    animate={{ opacity: 0, scale: 1.25 }}
                    transition={{ duration: 0.9, repeat: Infinity }}
                    aria-hidden
                  />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold leading-tight">{a.name}</span>
                <span className="relative block h-[18px] overflow-hidden text-[13px] leading-[18px] text-white/65">
                  <AnimatePresence initial={false} mode="wait">
                    {state === "done" ? (
                      <motion.span
                        key="done"
                        className="block truncate"
                        initial={{ y: 14, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        {s.result}
                      </motion.span>
                    ) : state === "running" ? (
                      <motion.span key="run" className="block text-saffron/90" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        ishlamoqda…
                      </motion.span>
                    ) : (
                      <motion.span key="idle" className="block" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        navbatda
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
              </span>
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors duration-300 ${
                  state === "done" ? (s.role === "publisher" ? "bg-saffron text-night" : "bg-turq text-white") : "bg-white/5"
                }`}
                aria-hidden
              >
                {state === "done" && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              </span>
            </motion.li>
          );
        })}
      </ol>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-4 text-[13px]">
        <span className="text-white/60">
          {doneCount}/{STEPS.length} xodim tayyor
        </span>
        <AnimatePresence>
          {finished && (
            <motion.span
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-full bg-saffron px-3 py-1 font-semibold text-night"
            >
              Tasdiqlash uchun 9 ta natija
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
