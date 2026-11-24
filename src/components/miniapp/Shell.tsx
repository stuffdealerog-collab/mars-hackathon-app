import { CheckCircle2, CircleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useNav } from "./nav";

/* ------------------------------------------------------------------ layer */

/** One full-screen layer of the stack. `covered` slides it back while a screen sits on top. */
export function Layer({ anim, covered, children, label }: { anim?: "in" | "out" | null; covered?: boolean; children: React.ReactNode; label?: string }) {
  return (
    <section className="ma-layer" data-anim={anim ?? undefined} data-covered={covered ? "true" : "false"} aria-label={label} inert={covered || anim === "out" ? true : undefined}>
      {children}
      <span className="ma-layer__dim" aria-hidden />
    </section>
  );
}

/* ----------------------------------------------------------------- top bar */

/**
 * In fullscreen, Telegram draws its Close and menu pills over our top edge; the compact title
 * sits between them once the large title has scrolled away (iOS large-title behaviour).
 */
export function useCompact(threshold = 44) {
  const ref = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const on = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setCompact(el.scrollTop > threshold));
    };
    el.addEventListener("scroll", on, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", on);
    };
  }, [threshold]);
  return { ref, compact };
}

export function TopBar({ title, compact, pinned = false }: { title: React.ReactNode; compact: boolean; pinned?: boolean }) {
  return (
    <div className="ma-topbar ma-chrome" data-compact={compact ? "true" : "false"} data-pinned={pinned ? "true" : "false"} aria-hidden={!compact && !pinned}>
      <div className="ma-topbar__bg" />
      <div className="ma-topbar__title">{title}</div>
    </div>
  );
}

/* ------------------------------------------------------------------- sheet */

/**
 * A bottom sheet: rises from the bottom, drag the handle down (or tap outside, or Back) to close.
 * The open sheet's buttons take over Telegram's bottom bar (see useBottomButtons).
 */
export function Sheet({ title, children, leaving }: { title?: string; children: React.ReactNode; leaving: boolean }) {
  const close = useNav((s) => s.closeSheet);
  const id = useId();
  const sheet = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);

  useEffect(() => {
    sheet.current?.focus({ preventScroll: true });
  }, []);

  const onDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, t: performance.now(), dy: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    sheet.current?.setAttribute("data-dragging", "");
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = sheet.current;
    if (!d || !el) return;
    // Rubber band upwards, follow the finger downwards.
    const raw = e.clientY - d.y;
    d.dy = raw > 0 ? raw : raw / 6;
    el.style.transform = `translateY(${d.dy}px)`;
  };
  const onUp = () => {
    const d = drag.current;
    const el = sheet.current;
    drag.current = null;
    if (!d || !el) return;
    el.removeAttribute("data-dragging");
    const velocity = d.dy / Math.max(1, performance.now() - d.t);
    if (d.dy > 110 || (d.dy > 24 && velocity > 0.55)) {
      el.style.transition = "transform 220ms cubic-bezier(0.7, 0, 0.84, 0)";
      el.style.transform = "translateY(100%)";
      setTimeout(() => useNav.setState({ sheet: null, sheetLeaving: false }), 200);
      return;
    }
    el.style.transition = "transform 320ms cubic-bezier(0.16, 1, 0.3, 1)";
    el.style.transform = "";
    setTimeout(() => {
      if (sheet.current) sheet.current.style.transition = "";
    }, 330);
  };

  return (
    <>
      <div className="ma-backdrop" data-leaving={leaving || undefined} onClick={close} aria-hidden />
      <div ref={sheet} role="dialog" aria-modal="true" aria-labelledby={title ? `${id}-t` : undefined} tabIndex={-1} className="ma-sheet outline-none" data-leaving={leaving || undefined}>
        <div className="ma-sheet__head ma-chrome" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <div className="ma-sheet__grab" aria-hidden />
          {title && (
            <h2 id={`${id}-t`} className="pb-1 text-center text-[17px] font-semibold tracking-[-0.01em]">
              {title}
            </h2>
          )}
        </div>
        <div className="ma-sheet__body">{children}</div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------- toast */

export function Toast() {
  const toast = useNav((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const id = toast.id;
    const t = setTimeout(() => {
      if (useNav.getState().toast?.id === id) useNav.setState({ toast: null });
    }, 2700);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return (
    <div key={toast.id} className="ma-toast ma-chrome" role={toast.tone === "bad" ? "alert" : "status"}>
      {toast.tone === "ok" && <CheckCircle2 className="h-5 w-5 shrink-0 text-ok" aria-hidden />}
      {toast.tone === "bad" && <CircleAlert className="h-5 w-5 shrink-0 text-bad" aria-hidden />}
      <span className="min-w-0">{toast.text}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- skeleton */

export function Skel({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <span aria-hidden className={`ma-skel block ${className}`} style={style} />;
}
