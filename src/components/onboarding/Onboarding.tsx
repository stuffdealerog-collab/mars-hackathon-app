import type { AgentRole } from "@/lib/uslub/contract";
import { Check, ChevronRight, Croissant, Link2, ShoppingBasket, Wheat, X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Led } from "../lamp/Led";
import { LampTile } from "../lamp/LampTile";
import { LAMP_ORDER, type LampState } from "../lamp/lamps";
import { COPY } from "../ui/copy";
import { fmt, parseChannel, type Lang } from "../ui/format";
import { INTRO_COPY, type IntroCopy } from "./copy";
import "./onboarding.css";

export const INTRO_STEPS = 4;

export type OnboardingProps = {
  open: boolean;
  /** "done": the last step's primary action; "skip": skipped or closed early. Both count as seen. */
  onClose: (how: "done" | "skip") => void;
  lang: Lang;
  /** "phone": full screen, swipe between steps; "desktop": a centred glass sheet, arrow keys. */
  variant: "phone" | "desktop";
  /** Controlled step (optional): the Mini App keeps it to drive Telegram's Back and Main buttons. */
  step?: number;
  onStepChange?: (step: number) => void;
  /** The host draws Next / Start itself (Telegram's MainButton): no button row inside. */
  hostPrimary?: boolean;
  /** For haptics: a step changed, or a swipe ran past the first or last step. */
  onFeedback?: (kind: "step" | "edge") => void;
};

const OUT_MS = 260;
const REDUCE = "(prefers-reduced-motion: reduce)";
const onReduce = (cb: () => void) => {
  const mq = window.matchMedia(REDUCE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const useReducedMotion = () => useSyncExternalStore(onReduce, () => window.matchMedia(REDUCE).matches, () => false);

/**
 * The first-run intro: four short screens in the lamp world, each a small live demo with one
 * headline and one line. Skippable at every step; shown once by the host (see `seen.ts`).
 */
export function Onboarding({ open, onClose, lang, variant, step: stepProp, onStepChange, hostPrimary = false, onFeedback }: OnboardingProps) {
  const t = INTRO_COPY[lang];
  const still = useReducedMotion();
  const titleId = useId();
  const [inner, setInner] = useState(0);
  const step = Math.min(INTRO_STEPS - 1, Math.max(0, stepProp ?? inner));
  const last = step === INTRO_STEPS - 1;

  // Stay mounted for the exit; start from the first step on every open.
  const [rendered, setRendered] = useState(open);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setRendered(true);
      setInner(0);
    }
  }
  useEffect(() => {
    if (open || !rendered) return;
    const id = setTimeout(() => setRendered(false), OUT_MS);
    return () => clearTimeout(id);
  }, [open, rendered]);

  const go = (to: number) => {
    const n = Math.min(INTRO_STEPS - 1, Math.max(0, to));
    if (n === step) {
      onFeedback?.("edge");
      return;
    }
    onFeedback?.("step");
    if (onStepChange) onStepChange(n);
    else setInner(n);
  };
  const next = () => (last ? onClose("done") : go(step + 1));

  const sheetRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const goRef = useRef(go);
  const nextRef = useRef(next);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    goRef.current = go;
    nextRef.current = next;
    closeRef.current = onClose;
  });

  // Focus moves into the intro and comes back where it was; Tab stays inside on the desktop.
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus({ preventScroll: true });
    return () => before?.focus?.({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable]");
      if (typing) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goRef.current(step + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goRef.current(step - 1);
      } else if (e.key === "Escape" && variant === "desktop") {
        e.preventDefault();
        closeRef.current("skip");
      } else if (e.key === "Tab" && variant === "desktop" && sheetRef.current) {
        const f = Array.from(sheetRef.current.querySelectorAll<HTMLElement>("button:not([disabled])")).filter((b) => !b.closest("[inert]"));
        if (!f.length) return;
        const first = f[0];
        const end = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === sheetRef.current)) {
          e.preventDefault();
          end.focus();
        } else if (!e.shiftKey && document.activeElement === end) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step, variant]);

  // Swipe: the track follows the finger (written straight to the style, no per-frame state).
  const drag = useRef<{ x: number; y: number; t: number; id: number; on: boolean; dx: number } | null>(null);
  const setShift = (px: number, animate: boolean) => {
    const el = trackRef.current;
    if (!el) return;
    el.style.transition = animate ? "" : "none";
    el.style.transform = `translate3d(calc(${-step * 100}% + ${px}px), 0, 0)`;
  };
  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && variant === "desktop") return;
    drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, on: false, dx: 0 };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.on) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      d.on = true;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    d.dx = dx;
    const edge = (step === 0 && dx > 0) || (last && dx < 0);
    setShift(still ? 0 : edge ? dx / 3 : dx, false);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.on) return;
    // A cancelled touch (the system took the gesture) only springs back; its coordinates mean nothing.
    const dx = e.type === "pointercancel" ? 0 : d.dx;
    const w = trackRef.current?.parentElement?.clientWidth ?? 1;
    const fast = Math.abs(dx) / Math.max(1, performance.now() - d.t) > 0.45;
    setShift(0, true);
    if (Math.abs(dx) > w * 0.18 || (fast && Math.abs(dx) > 24)) go(dx < 0 ? step + 1 : step - 1);
  };

  if (!rendered) return null;

  return (
    <div className={`ob ob--${variant}`} data-state={open ? "open" : "closing"} data-still={still || undefined}>
      {variant === "desktop" && <div className="ob__scrim" aria-hidden onClick={() => onClose("skip")} />}
      <div ref={sheetRef} className="ob__sheet" role="dialog" aria-modal="true" aria-labelledby={`${titleId}-${step}`} tabIndex={-1}>
        {/* Progress lives in the dots; the top row only lets you out. */}
        <div className="ob__top">
          {variant === "desktop" ? (
            <button type="button" className="ob__close" aria-label={t.close} onClick={() => onClose("skip")}>
              <X className="h-5 w-5" strokeWidth={1.8} aria-hidden />
            </button>
          ) : (
            <button type="button" className="ob__skip" onClick={() => onClose("skip")} disabled={last && hostPrimary} data-hidden={last || undefined}>
              {t.skip}
            </button>
          )}
        </div>

        <div className="ob__viewport" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <div ref={trackRef} className="ob__track" style={{ transform: `translate3d(${-step * 100}%, 0, 0)` }}>
            {t.steps.map((s, i) => {
              const on = i === step;
              return (
                <section key={i} className="ob__pane" data-active={on || undefined} aria-hidden={!on} inert={!on ? true : undefined}>
                  <div className="ob__stage" role="img" aria-label={t.alt[i]}>
                    <Demo key={on ? "on" : "off"} i={i} active={on && open} still={still} lang={lang} t={t} />
                  </div>
                  <div className="ob__text">
                    <h2 id={`${titleId}-${i}`} className="ob__title">
                      {s.title}
                    </h2>
                    <p className="ob__line">{s.line}</p>
                    {i === INTRO_STEPS - 1 && (
                      <>
                        <p className="ob__admin">{t.admin}</p>
                        <p className="ob__pro">{variant === "desktop" ? t.pro.desktop : t.pro.phone}</p>
                      </>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        <div className="ob__foot">
          <div className="ob__dots" role="group" aria-label={fmt(t.of, { i: step + 1, n: INTRO_STEPS })}>
            {t.steps.map((_, i) => (
              <button
                key={i}
                type="button"
                className="ob__dot"
                aria-label={fmt(t.of, { i: i + 1, n: INTRO_STEPS })}
                aria-current={i === step ? "step" : undefined}
                onClick={() => go(i)}
              />
            ))}
          </div>
          {!hostPrimary && (
            <div className="ob__btns">
              {step > 0 && variant === "desktop" && (
                <button type="button" className="btn-2 ob__btn" onClick={() => go(step - 1)}>
                  {t.back}
                </button>
              )}
              <button type="button" className={`${last ? "btn" : "btn-2"} ob__btn ob__btn--main`} onClick={next}>
                {last ? t.start : t.next}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ demos */

type DemoProps = { active: boolean; still: boolean; lang: Lang; t: IntroCopy };

function Demo({ i, ...p }: DemoProps & { i: number }) {
  if (i === 0) return <LampsDemo {...p} />;
  if (i === 1) return <LinkDemo {...p} />;
  if (i === 2) return <ResultDemo {...p} />;
  return <ApproveDemo {...p} />;
}

/** Ticks while `active`: a small clock for the demos (nothing runs under reduced motion). */
function useTicks(active: boolean, still: boolean, ms: number, max: number) {
  const [n, setN] = useState(still ? max : 0);
  useEffect(() => {
    if (!active || still) return;
    const id = setInterval(() => setN((v) => (v >= max ? v : v + 1)), ms);
    return () => clearInterval(id);
  }, [active, still, ms, max]);
  return n;
}

/** Roles that do nothing for the owner yet stay dark here too, as in the product. */
const SOON: AgentRole[] = ["video", "radar"];
const WORKING = LAMP_ORDER.filter((r) => !SOON.includes(r));

/** 1 · The ten lamps: each lights while its employee works, one after another. */
function LampsDemo({ active, still, lang }: DemoProps) {
  const c = COPY[lang];
  // One tick per employee; a pause with everything lit, then the panel goes dark and starts over.
  const HOLD = 4;
  const [k, setK] = useState(still ? WORKING.length : 0);
  useEffect(() => {
    if (!active || still) return;
    const id = setInterval(() => setK((v) => (v >= WORKING.length + HOLD ? 0 : v + 1)), 520);
    return () => clearInterval(id);
  }, [active, still]);
  const now = WORKING[Math.min(k, WORKING.length - 1)];
  const state = (r: AgentRole): LampState => {
    if (SOON.includes(r)) return "off";
    const at = WORKING.indexOf(r);
    if (at < k) return "on";
    return at === k ? "warming" : "off";
  };
  return (
    <div className="ob-lamps">
      <ul className="ob-lamps__grid" aria-hidden>
        {LAMP_ORDER.map((r) => (
          <LampTile key={r} as="li" role={r} size="xs" state={state(r)} className={`ob-lamp ${SOON.includes(r) ? "ob-lamp--soon" : ""}`} />
        ))}
      </ul>
      <p className="ob-lamps__now" aria-hidden>
        <span className="ob-lamps__name">{c.lamps[now].name}</span>
        <span className="ob-lamps__job">{c.lamps[now].job}</span>
      </p>
    </div>
  );
}

const HANDLE = "t.me/tandir_non";

/** 2 · The link is typed; the shop sign above reads the channel name as soon as it is one. */
function LinkDemo({ active, still, t }: DemoProps) {
  const n = useTicks(active, still, 85, HANDLE.length + 6);
  const typed = HANDLE.slice(0, Math.max(0, n - 6));
  const name = parseChannel(typed);
  const sign = name && typed.length >= 7 ? `@${name}` : "";
  return (
    <div className="ob-link">
      <div className="ob-sign ob-sign--strip">
        <span className="ob-sign__grid" />
        {sign && <Led text={sign} dot={2.7} gap={1.1} grid={false} className="ob-sign__text" />}
      </div>
      <div className="ob-field">
        <Link2 className="h-5 w-5 shrink-0 text-ink-3" aria-hidden />
        <span className="ob-field__value">
          {typed || <span className="text-ink-3">t.me/…</span>}
          {!still && <span className="ob-caret" />}
        </span>
      </div>
      <div className="ob-row" data-lit={n >= HANDLE.length + 6 || undefined}>
        <span>{t.empty}</span>
        <ChevronRight className="h-5 w-5 shrink-0 text-ink-3" aria-hidden />
      </div>
    </div>
  );
}

const PICS = [
  { Icon: Croissant, a: "#FFB547", b: "#A8501A" },
  { Icon: Wheat, a: "#FFD6A0", b: "#B8642F" },
  { Icon: ShoppingBasket, a: "#FF8A3D", b: "#9A2E1A" },
];

/** A post picture in the channel's own palette (all three share it: one style). */
function Picture({ k }: { k: number }) {
  const { Icon, a, b } = PICS[k % PICS.length];
  return (
    <span className="ob-pic" style={{ background: `radial-gradient(120% 90% at 30% 20%, ${a} 0%, ${b} 70%, #2a120a 100%)` }}>
      <Icon className="ob-pic__icon" strokeWidth={1.4} aria-hidden />
    </span>
  );
}

/** 3 · Real numbers on the sign, the week plan, posts with pictures. */
function ResultDemo({ active, still, t }: DemoProps) {
  const n = useTicks(active, still, 60, 14);
  const subs = Math.round((12480 * Math.min(n, 10)) / 10);
  const views = Math.round((740 * Math.min(n, 10)) / 10);
  const group = (v: number) => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const planned = [0, 2, 3, 4, 5];
  return (
    <div className="ob-result">
      <div className="ob-sign ob-sign--numbers">
        <span className="ob-num">
          <Led text={group(subs)} dot={3} gap={1.2} grid={false} />
          <span className="ob-num__label">{t.demo.subscribers}</span>
        </span>
        <span className="ob-num">
          <Led text={group(views)} dot={3} gap={1.2} grid={false} />
          <span className="ob-num__label">{t.demo.views}</span>
        </span>
      </div>
      <div className="ob-week" aria-hidden>
        {t.demo.week.map((d, i) => (
          <span key={d} className="ob-week__day" data-post={planned.includes(i) || undefined} style={{ ["--d" as string]: `${300 + i * 70}ms` }}>
            {d}
            <span className="ob-week__dot" />
          </span>
        ))}
      </div>
      <div className="ob-posts">
        {t.demo.posts.map((p, i) => (
          <span key={i} className="ob-post" style={{ ["--d" as string]: `${650 + i * 110}ms` }}>
            <Picture k={i} />
            <span className="ob-post__text">{p.text}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** 4 · The owner approves; only then the bot posts, and the SMM lamp lights. */
function ApproveDemo({ active, still, t }: DemoProps) {
  // 0 waiting · 1 pressed · 2 approved · 3 posted
  const n = useTicks(active, still, 520, 4);
  const phase = still ? 3 : Math.max(0, n - 1);
  const post = t.demo.posts[0];
  return (
    <div className="ob-approve">
      <div className="ob-tgpost">
        <Picture k={0} />
        <p className="ob-tgpost__text">{post.text}</p>
        <span className="ob-tgpost__when">{post.when}</span>
      </div>
      <div className="ob-approve__row">
        <span className="ob-approve__btn" data-phase={phase}>
          {phase >= 2 ? (
            <>
              <Check className="h-[18px] w-[18px]" strokeWidth={2.4} aria-hidden />
              {t.demo.approved}
            </>
          ) : (
            t.demo.approve
          )}
        </span>
        <span className="ob-approve__posted" data-on={phase >= 3 || undefined}>
          <LampTile role="publisher" size="xs" state={phase >= 3 ? "on" : "off"} className="ob-approve__lamp" />
          {t.demo.published}
        </span>
      </div>
    </div>
  );
}
