"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useDesk } from "./desk";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/**
 * Short confirmations at the bottom of the canvas: "Tasdiqlandi · Bekor qilish", copy done, a
 * failed approval with "Ko‘rish". Opaque glass, one action, polite live region.
 */
export function Toasts({ inset = 0 }: { inset?: number }) {
  const toasts = useDesk((s) => s.toasts);
  const dismiss = useDesk((s) => s.dismiss);
  const reduce = useReducedMotion() ?? false;
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[max(16px,env(safe-area-inset-bottom))] z-40 flex flex-col items-center gap-2 px-4"
      style={inset ? { paddingLeft: inset > 0 ? inset : undefined, paddingRight: inset < 0 ? -inset : undefined } : undefined}
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            role={t.tone === "bad" ? "alert" : "status"}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { duration: reduce ? 0.12 : 0.2, ease: EASE_OUT } }}
            exit={{ opacity: 0, y: reduce ? 0 : 4, transition: { duration: reduce ? 0.1 : 0.16, ease: EASE_OUT } }}
            className="pointer-events-auto flex min-h-12 max-w-[min(520px,100%)] items-center gap-4 rounded-full bg-glass-3 py-1.5 pl-5 pr-1.5 text-[15px] shadow-[inset_0_0_0_1px_var(--hair-2),0_18px_40px_-18px_rgb(0_0_0/.7)]"
          >
            <span className={t.tone === "bad" ? "text-bad" : "text-ink"}>{t.text}</span>
            {t.action ? (
              <button
                type="button"
                className="btn-2 !min-h-9 shrink-0 !px-4 !text-[14px]"
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            ) : (
              <span className="w-3" />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
