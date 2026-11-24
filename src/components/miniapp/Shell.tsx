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

/**
 * iOS edge swipe: drag from the left edge to go back, the screen beneath sliding out from
 * under it, as in every native navigation stack. Released past a third (or flicked), it pops.
 */
export function EdgeBack({ routeKey }: { routeKey: number }) {
  const strip = useRef<HTMLSpanElement>(null);
  const drag = useRef<{ x: number; t: number; dx: number; top: HTMLElement; under: HTMLElement | null; w: number } | null>(null);

  const style = (el: HTMLElement | null, transform: string, transition = "none") => {
    if (!el) return;
    el.style.transition = transition;
    el.style.transform = transform;
  };
  const dim = (el: HTMLElement | null, opacity: string, transition = "none") => {
    const d = el?.querySelector<HTMLElement>(":scope > .ma-layer__dim");
    if (!d) return;
    d.style.transition = transition;
    d.style.opacity = opacity;
  };

  const onDown = (e: React.PointerEvent) => {
    const top = strip.current?.closest<HTMLElement>(".ma-layer");
    if (!top) return;
    const under = top.previousElementSibling?.classList.contains("ma-layer") ? (top.previousElementSibling as HTMLElement) : null;
    drag.current = { x: e.clientX, t: performance.now(), dx: 0, top, under, w: top.clientWidth };
    top.style.animation = "none";
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    d.dx = Math.max(0, e.clientX - d.x);
    const k = Math.min(1, d.dx / d.w);
    style(d.top, `translateX(${d.dx}px)`);
    style(d.under, `translateX(${-26 * (1 - k)}%)`);
    dim(d.under, String(0.42 * (1 - k)));
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const v = d.dx / Math.max(1, performance.now() - d.t);
    const ease = "cubic-bezier(0.2, 0.8, 0.2, 1)";
    if (d.dx > d.w / 3 || (d.dx > 30 && v > 0.5)) {
      style(d.top, "translateX(100%)", `transform 220ms ${ease}`);
      style(d.under, "translateX(0)", `transform 220ms ${ease}`);
      dim(d.under, "0", `opacity 220ms ${ease}`);
      setTimeout(() => {
        useNav.setState({ stack: useNav.getState().stack.filter((s) => s.key !== routeKey) });
        if (d.under) {
          d.under.style.transition = "none";
          d.under.style.transform = "";
          dim(d.under, "");
          requestAnimationFrame(() => {
            if (d.under) d.under.style.transition = "";
          });
        }
      }, 220);
      return;
    }
    style(d.top, "translateX(0)", `transform 260ms ${ease}`);
    style(d.under, "translateX(-26%)", `transform 260ms ${ease}`);
    dim(d.under, "0.42", `opacity 260ms ${ease}`);
    setTimeout(() => {
      [d.top, d.under].forEach((el) => {
        if (!el) return;
        el.style.transition = "";
        el.style.transform = "";
      });
      dim(d.under, "");
    }, 270);
  };

  return <span ref={strip} aria-hidden className="ma-edge" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />;
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
