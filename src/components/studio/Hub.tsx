/**
 * Desktop Studio: the HUB. A glass panel floating over the lamp stage: the channel, the
 * sections, the department's lights, the tools for the post in focus, Oddiy/Pro and the
 * language. Dock it left or right (drag it across, or the button), fold it to a rail; both
 * are remembered. The glass shows only what is behind it: the light of working lamps.
 * Phones never render this: they keep the one-column Studio and the Mini App.
 */
import type { AgentRole } from "@/lib/uslub/contract";
import { INTRO_COPY } from "@/components/onboarding";
import { BarChart3, Check, ChevronRight, ChevronsLeft, ChevronsRight, CircleHelp, Clapperboard, ExternalLink, GripVertical, LogOut, Newspaper, PanelLeft, PanelRight, Plus } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { LampTile } from "../lamp/LampTile";
import { LAMPS, light, OWNER_LAMPS } from "../lamp/lamps";
import { fmt, LANGS, useCopy, useLang } from "../ui/lang";
import { LangSwitch, Logo } from "../ui/parts";
import { isQuiet, type Lamps } from "./Department";
import { recentBrands, useStudio, type RecentBrand, type Tab } from "./store";
import { Tools } from "./Tools";

const LampDrawer = dynamic(() => import("./pro/ProDetails").then((m) => m.LampDrawer), { ssr: false });

type Side = "left" | "right";
type Spot = { x: number; y: number };

const KEY = "mercat.hub";

/**
 * Where the hub sits and whether it is folded (remembered on this device), plus what the stage
 * behind it needs: where each mini-lamp is, the first-open lamp check and the SMM blink.
 */
export const useHub = create<{
  side: Side;
  collapsed: boolean;
  setSide: (s: Side) => void;
  setCollapsed: (c: boolean) => void;
  spots: Partial<Record<AgentRole, Spot>>;
  checking: boolean;
  /** The first-run intro is open (DesktopStudio shows it; the hub reopens it); "admin": only the add-the-bot card. */
  intro: boolean | "admin";
  blink: boolean;
}>((set, get) => {
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ side: get().side, collapsed: get().collapsed }));
    } catch {
      /* private mode */
    }
  };
  return {
    side: "left",
    collapsed: false,
    setSide: (side) => {
      set({ side });
      save();
    },
    setCollapsed: (collapsed) => {
      set({ collapsed });
      save();
    },
    spots: {},
    checking: false,
    intro: false,
    blink: false,
  };
});

export function useHubRestore() {
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as { side?: Side; collapsed?: boolean } | null;
      if (v) useHub.setState({ side: v.side === "right" ? "right" : "left", collapsed: !!v.collapsed });
    } catch {
      /* ignore */
    }
  }, []);
}

// 64rem: Tailwind's lg and the .desk guard in globals.css use the same unit.
const wide = () => window.matchMedia("(min-width: 64rem)");
/**
 * True on screens wide enough for the hub (Tailwind's lg); null before the browser has said
 * (server render and the first client frame), when the Studio draws its CSS-only skeleton.
 */
export function useDesktop(): boolean | null {
  return useSyncExternalStore(
    (cb) => {
      const mq = wide();
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => wide().matches,
    () => null,
  );
}

export const HUB_W = 292;
export const RAIL_W = 76;

const NAV: { key: Tab; icon: typeof BarChart3 }[] = [
  { key: "posts", icon: Newspaper },
  { key: "channel", icon: BarChart3 },
  { key: "video", icon: Clapperboard },
];

/** In Oddiy a lamp leads to the section its work lives in. */
const ROLE_TAB: Partial<Record<AgentRole, Tab>> = {
  brand: "channel",
  analyst: "channel",
  strategist: "channel",
  copywriter: "posts",
  editor: "posts",
  translator: "posts",
  designer: "posts",
  publisher: "posts",
};

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export function Hub({ lamps }: { lamps: Lamps }) {
  const c = useCopy();
  const reduce = useReducedMotion() ?? false;
  // Selectors, not the whole store: spots change on every measure and would re-render the hub.
  const side = useHub((s) => s.side);
  const collapsed = useHub((s) => s.collapsed);
  const setSide = useHub((s) => s.setSide);
  const setCollapsed = useHub((s) => s.setCollapsed);
  const phase = useStudio((s) => s.phase);
  const tab = useStudio((s) => s.tab);
  const setTab = useStudio((s) => s.setTab);
  const drafts = useStudio((s) => s.posts.filter((p) => p.status === "draft").length);
  const pro = useStudio((s) => s.pro);
  const setPro = useStudio((s) => s.setPro);
  const handTick = useStudio((s) => s.handTick);
  const deviceKey = useStudio((s) => s.deviceKey);
  const signOutDevice = useStudio((s) => s.signOutDevice);
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const ready = phase === "ready";
  const w = collapsed ? RAIL_W : HUB_W;
  const DockIcon = side === "left" ? PanelRight : PanelLeft;
  const FoldIcon = (side === "left") === collapsed ? ChevronsRight : ChevronsLeft;
  const moveLabel = side === "left" ? c.hub.moveRight : c.hub.moveLeft;

  const aside = useRef<HTMLElement>(null);
  const grid = useRef<HTMLUListElement>(null);
  const [drawer, setDrawer] = useState<AgentRole | null>(null);
  const [dragTo, setDragTo] = useState<Side | null>(null);
  const [tip, setTip] = useState<{ role: AgentRole; x: number; y: number } | null>(null);
  // The footer gets its own glass only when the hub scrolls under it; otherwise it is clear.
  const [scrolls, setScrolls] = useState(false);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checking = useHub((s) => s.checking);
  const blink = useHub((s) => s.blink);

  // Where every mini-lamp is, so the stage can light exactly behind it. At most once a frame,
  // and the store changes only when a lamp actually moved.
  const raf = useRef(0);
  const measure = useCallback(() => {
    raf.current = 0;
    const ul = grid.current;
    if (!ul) return;
    const spots: Partial<Record<AgentRole, Spot>> = {};
    ul.querySelectorAll<HTMLElement>("[data-role]").forEach((el) => {
      const r = el.getBoundingClientRect();
      spots[el.dataset.role as AgentRole] = { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });
    const prev = useHub.getState().spots;
    const moved = OWNER_LAMPS.some((r) => prev[r]?.x !== spots[r]?.x || prev[r]?.y !== spots[r]?.y);
    if (moved) useHub.setState({ spots });
    const el = aside.current;
    if (el) setScrolls(el.scrollHeight > el.clientHeight + 1);
  }, []);
  useEffect(() => {
    const soon = () => {
      if (!raf.current) raf.current = requestAnimationFrame(measure);
    };
    measure();
    const ro = new ResizeObserver(soon);
    if (grid.current) ro.observe(grid.current);
    window.addEventListener("resize", soon);
    const el = aside.current;
    // Only the hub's own width animation moves the lamps; its children's transitions do not.
    const onEnd = (e: TransitionEvent) => {
      if (e.target === el) soon();
    };
    el?.addEventListener("transitionend", onEnd);
    el?.addEventListener("scroll", soon, { passive: true });
    return () => {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
      ro.disconnect();
      window.removeEventListener("resize", soon);
      el?.removeEventListener("transitionend", onEnd);
      el?.removeEventListener("scroll", soon);
    };
  }, [measure, side, collapsed]);

  // The lamp check: on the first open in this session the lights flash once, in pipeline order.
  useEffect(() => {
    if (reduce) return;
    try {
      if (sessionStorage.getItem("mercat.check")) return;
      sessionStorage.setItem("mercat.check", "1");
    } catch {
      return;
    }
    useHub.setState({ checking: true });
    const t = setTimeout(() => useHub.setState({ checking: false }), 1300);
    // A cancelled check must not stay on: the spots would hold the flash's last frame (dark).
    return () => {
      clearTimeout(t);
      useHub.setState({ checking: false });
    };
  }, [reduce]);

  // The owner's hand: every approve and publish makes the SMM-menejer blink twice.
  const lastTick = useRef(handTick);
  useEffect(() => {
    if (handTick === lastTick.current) return;
    lastTick.current = handTick;
    if (reduce) return;
    useHub.setState({ blink: true });
    const t = setTimeout(() => useHub.setState({ blink: false }), 950);
    return () => clearTimeout(t);
  }, [handTick, reduce]);

  const showTip = (role: AgentRole, el: HTMLElement, now: boolean) => {
    if (tipTimer.current) clearTimeout(tipTimer.current);
    const go = () => {
      const r = el.getBoundingClientRect();
      // Beside the glass, on the canvas side, so it never covers the other lamps.
      const hub = aside.current?.getBoundingClientRect();
      const x = hub ? (useHub.getState().side === "left" ? hub.right + 10 : hub.left - 10) : r.right + 10;
      setTip({ role, x, y: r.top + r.height / 2 });
    };
    if (now) go();
    else tipTimer.current = setTimeout(go, 300);
  };
  const hideTip = () => {
    if (tipTimer.current) clearTimeout(tipTimer.current);
    setTip(null);
  };

  const onLamp = (r: AgentRole) => {
    if (pro) {
      if (lamps.state[r] !== "off") setDrawer(r);
      return;
    }
    const to = ROLE_TAB[r];
    if (to && ready) setTab(to);
  };


  return (
    <>
      <motion.aside
        ref={aside}
        aria-label={c.hub.label}
        className="hub fixed bottom-3 top-3 z-30 flex flex-col transition-[width] duration-300 ease-out"
        // Width animates in CSS; motion's layout animation would scale the icons while it runs.
        style={{ width: w, [side]: 12 }}
        transition={{ duration: 0.36, ease: EASE_OUT }}
        // Drag the hub across the screen to dock it on the other side.
        drag={reduce ? false : "x"}
        dragSnapToOrigin
        dragElastic={0.12}
        dragMomentum={false}
        onDrag={(_, info) => {
          const to: Side = info.point.x > window.innerWidth / 2 ? "right" : "left";
          setDragTo(to !== side ? to : null);
        }}
        onDragEnd={(_, info) => {
          setDragTo(null);
          const next: Side = info.point.x > window.innerWidth / 2 ? "right" : "left";
          if (next !== side) setSide(next);
        }}
      >
        <div className={`flex items-center gap-1 px-3 pt-3 ${collapsed ? "flex-col" : ""}`}>
          <span className="grid h-9 w-5 cursor-grab place-items-center text-ink-3 active:cursor-grabbing" aria-hidden>
            <GripVertical className="h-4 w-4" strokeWidth={1.75} />
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <Logo href="/" />
            </span>
          )}
          <button type="button" className="hub-icon" aria-label={moveLabel} title={moveLabel} onClick={() => setSide(side === "left" ? "right" : "left")}>
            <DockIcon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
          </button>
          <button type="button" className="hub-icon" aria-label={collapsed ? c.hub.expand : c.hub.collapse} title={collapsed ? c.hub.expand : c.hub.collapse} onClick={() => setCollapsed(!collapsed)}>
            <FoldIcon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
          </button>
        </div>

        <ChannelChip collapsed={collapsed} side={side} />

        <nav aria-label={c.hub.label} className={`mt-3 flex flex-col gap-1 ${collapsed ? "px-2" : "px-2.5"}`}>
          {NAV.map(({ key, icon: Icon }) => {
            const active = ready && tab === key;
            const waiting = key === "posts" && ready && drafts > 0;
            return (
              <button
                key={key}
                type="button"
                disabled={!ready}
                title={phase === "start" ? c.hub.soonNav : !ready ? c.dept.working : c.tabs[key]}
                aria-label={collapsed ? c.tabs[key] : undefined}
                aria-current={active ? "page" : undefined}
                onClick={() => setTab(key)}
                className={`hub-nav relative ${collapsed ? "justify-center !px-0" : ""}`}
              >
                <Icon className="h-[19px] w-[19px] shrink-0" strokeWidth={1.75} aria-hidden />
                {!collapsed && <span className="flex-1 text-left">{c.tabs[key]}</span>}
                {!collapsed && key === "posts" && drafts > 0 && <span className="tnum text-[13px] text-ink-2">{drafts}</span>}
                {/* The only lime in the hub, and it is not a button: posts are waiting for the owner. */}
                {waiting && (
                  <span
                    // A new count of waiting posts breathes again (a few times, then still).
                    key={drafts}
                    aria-label={c.lampState.you}
                    role="img"
                    className={`hub-wait h-1.5 w-1.5 rounded-full bg-lime ${collapsed ? "absolute right-2 top-2" : ""}`}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* The department, always in view: a light per employee, lit only by real work. */}
        <div className={`mt-5 ${collapsed ? "px-2" : "px-4"}`}>
          {!collapsed &&
            (pro && ready ? (
              <button
                type="button"
                aria-current={tab === "dept" ? "page" : undefined}
                onClick={() => setTab("dept")}
                className="hub-nav mb-1.5 !min-h-9 w-full !px-1.5 !text-[13px]"
              >
                <span className="flex-1 text-left">{c.dept.title}</span>
                <ChevronRight className="h-4 w-4 text-ink-2" strokeWidth={1.75} aria-hidden />
              </button>
            ) : (
              <p className="mb-2 px-1.5 text-[13px] text-ink-2">{c.dept.title}</p>
            ))}
          <ul ref={grid} className={`grid gap-1.5 ${collapsed ? "grid-cols-2" : "grid-cols-4"}`}>
            {OWNER_LAMPS.map((r, i) => {
              const st = lamps.state[r];
              const quiet = isQuiet(lamps, r);
              const label = `${c.lamps[r].name}: ${quiet ? lamps.quiet?.[r] : c.lampState[st]}`;
              return (
                <li key={r} className="relative">
                  <LampTile
                    as="button"
                    role={r}
                    size="xs"
                    state={st}
                    data-role={r}
                    aria-label={label}
                    aria-haspopup={pro && st !== "off" ? "dialog" : undefined}
                    className={`w-full ${collapsed ? "!min-h-7" : "!min-h-10"} ${quiet ? "lamp--soon" : ""} transition-transform duration-150 active:scale-[0.96]`}
                    {...{ type: "button" }}
                    onClick={() => onLamp(r)}
                    onMouseEnter={(e) => showTip(r, e.currentTarget, false)}
                    onMouseLeave={hideTip}
                    onFocus={(e) => showTip(r, e.currentTarget, true)}
                    onBlur={hideTip}
                  />
                  {checking && <span aria-hidden className="lamp-flash" data-run="check" style={{ ["--i" as string]: i, background: `radial-gradient(closest-side, ${LAMPS[r].hue}, transparent)` }} />}
                  {blink && r === "publisher" && <span aria-hidden className="lamp-flash" data-run="blink" style={{ background: `radial-gradient(closest-side, ${LAMPS[r].hue}, transparent)` }} />}
                </li>
              );
            })}
          </ul>
        </div>

        <Tools collapsed={collapsed} />

        {/* Pinned to the bottom of the glass: density and language. Never lime. */}
        <div className={`sticky bottom-0 mt-auto flex flex-col gap-2.5 px-3 pb-3 pt-5 ${scrolls ? "bg-[rgb(30_28_25/.92)]" : ""}`}>
          {collapsed ? (
            <>
              <button
                type="button"
                className="hub-icon mx-auto !w-12 text-[12.5px] font-semibold"
                aria-pressed={pro}
                aria-label={c.pro.label}
                title={`${c.pro.label}: ${pro ? c.mode.pro : c.mode.simple}`}
                onClick={() => setPro(!pro)}
              >
                {pro ? c.mode.pro : c.mode.simpleShort}
              </button>
              <button type="button" className="hub-icon mx-auto" aria-label={INTRO_COPY[lang].again} title={INTRO_COPY[lang].again} onClick={() => useHub.setState({ intro: true })}>
                <CircleHelp className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
              </button>
              {deviceKey && (
                <button type="button" className="hub-icon mx-auto" aria-label={c.hub.signOut} title={`${fmt(c.hub.keyOwner, { id: deviceKey })} · ${c.hub.signOut}`} onClick={signOutDevice}>
                  <LogOut className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                </button>
              )}
              <button
                type="button"
                className="hub-icon mx-auto !w-12 text-[12.5px] font-semibold uppercase"
                aria-label={c.lang.label}
                title={c.lang.label}
                onClick={() => setLang(LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length])}
              >
                {lang}
              </button>
            </>
          ) : (
            <>
            <button type="button" className="hub-nav !min-h-9 !gap-2.5 !px-1.5 !text-[13.5px]" onClick={() => useHub.setState({ intro: true })}>
              <CircleHelp className="h-[17px] w-[17px] shrink-0" strokeWidth={1.75} aria-hidden />
              {INTRO_COPY[lang].again}
            </button>
            {deviceKey && (
              <div className="flex items-center justify-between gap-2 px-1 text-[12.5px]">
                <span className="truncate text-ink-3">{fmt(c.hub.keyOwner, { id: deviceKey })}</span>
                <button type="button" className="link shrink-0 text-ink-2" onClick={signOutDevice}>
                  {c.hub.signOut}
                </button>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <div className="seg" role="group" aria-label={c.pro.label}>
                <button type="button" aria-pressed={!pro} onClick={() => setPro(false)}>
                  {c.mode.simple}
                </button>
                <button type="button" aria-pressed={pro} onClick={() => setPro(true)}>
                  {c.mode.pro}
                </button>
              </div>
              <LangSwitch />
            </div>
            </>
          )}
        </div>
      </motion.aside>

      {/* Where the hub will land while it is dragged past the middle. */}
      {dragTo && typeof document !== "undefined" && createPortal(<div aria-hidden className="pointer-events-none fixed inset-y-3 z-40 w-[2px] rounded-full bg-[var(--hair-2)]" style={{ [dragTo]: 6 }} />, document.body)}

      {tip &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-50 max-w-[260px] -translate-y-1/2 rounded-[12px] bg-glass-3 px-3 py-2 text-[13px] leading-snug shadow-[inset_0_0_0_1px_var(--hair-2),0_12px_30px_-12px_rgb(0_0_0/.7)]"
            style={side === "left" ? { left: tip.x, top: tip.y } : { left: tip.x, top: tip.y, transform: "translate(-100%, -50%)" }}
          >
            <span className="font-semibold">{c.lamps[tip.role].name}</span>
            <span className="text-ink-2">
              {" "}
              · {isQuiet(lamps, tip.role) ? lamps.quiet?.[tip.role] : c.lampState[lamps.state[tip.role]]}
              {lamps.words[tip.role] ? ` · ${lamps.words[tip.role]}` : ""}
            </span>
          </div>,
          document.body,
        )}

      {drawer && <LampDrawer role={drawer} onClose={() => setDrawer(null)} fallback={lamps.words[drawer] ?? c.lampState[lamps.state[drawer]]} />}
    </>
  );
}

/**
 * The channel at the top of the hub: letter, name, @channel and a word for where it stands.
 * Opens a menu: a new channel, the channels opened on this device, the channel in Telegram.
 */
function ChannelChip({ collapsed, side }: { collapsed: boolean; side: Side }) {
  const c = useCopy();
  const brand = useStudio((s) => s.brand);
  const phase = useStudio((s) => s.phase);
  const sample = useStudio((s) => s.sample);
  const typed = useStudio((s) => s.input.channel);
  const newChannel = useStudio((s) => s.newChannel);
  const reopen = useStudio((s) => s.reopen);
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<RecentBrand[]>([]);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const name = brand?.dna.name || brand?.channel || (typed ? `@${typed}` : "");
  const channel = brand?.channel ?? (typed ? `@${typed}` : undefined);
  const status = sample ? c.hub.sample : phase === "ready" ? c.hub.live : c.hub.reading;
  const letter = name.replace(/^@/, "").slice(0, 1).toUpperCase() || "·";

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const items = () => Array.from(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    items()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      const list = items();
      const i = list.indexOf(document.activeElement as HTMLElement);
      if (e.key === "Escape") {
        e.preventDefault();
        close(true);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        list[(i + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length]?.focus();
      } else if (e.key === "Tab") close(false);
    };
    const onDown = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open, close]);

  if (!name) {
    return collapsed ? (
      <span aria-hidden className="mx-auto mt-3 grid h-9 w-9 place-items-center rounded-full bg-glass-2 text-ink-3 shadow-[inset_0_0_0_1px_var(--hair)]" />
    ) : (
      <p className="mx-3 mt-3 flex min-h-14 items-center px-2 text-[14px] text-ink-3">{c.hub.noChannel}</p>
    );
  }

  const toggle = () => {
    const r = btn.current?.getBoundingClientRect();
    if (r) setAt({ x: side === "left" ? r.left : r.right, y: r.bottom + 6 });
    setRecent(recentBrands());
    setOpen((o) => !o);
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        title={collapsed ? `${name} · ${status}` : undefined}
        className={`mt-3 flex items-center gap-3 rounded-[16px] text-left transition-colors duration-150 hover:bg-[rgb(255_255_255/.05)] ${collapsed ? "mx-auto p-1" : "mx-3 min-h-14 px-2"}`}
      >
        <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[15px] font-semibold text-white" style={{ background: "linear-gradient(160deg, #C86B3C, #6b3115)" }}>
          {letter}
        </span>
        {!collapsed && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold tracking-[-0.01em]">{name}</span>
            <span className="block truncate text-[12.5px] text-ink-2">
              {channel && channel !== name ? `${channel} · ` : ""}
              {status}
            </span>
          </span>
        )}
      </button>
      {open &&
        at &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label={name}
            className="fixed z-50 w-[264px] rounded-[16px] bg-glass-3 p-1.5 text-[14px] shadow-[inset_0_0_0_1px_var(--hair-2),0_20px_44px_-18px_rgb(0_0_0/.8)]"
            style={side === "left" ? { left: at.x, top: at.y } : { left: at.x, top: at.y, transform: "translateX(-100%)" }}
          >
            <button
              type="button"
              role="menuitem"
              className="flex min-h-10 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left hover:bg-[rgb(255_255_255/.06)] focus-visible:bg-[rgb(255_255_255/.08)]"
              onClick={() => {
                close(false);
                newChannel();
              }}
            >
              <Plus className="h-4 w-4 text-ink-2" strokeWidth={1.75} aria-hidden />
              {c.hub.newChannel}
            </button>
            {recent.length > 0 && (
              <>
                <p className="px-2.5 pb-1 pt-2.5 text-[12px] text-ink-3">{c.hub.recent}</p>
                {recent.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="menuitem"
                    className="flex min-h-10 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left hover:bg-[rgb(255_255_255/.06)] focus-visible:bg-[rgb(255_255_255/.08)]"
                    onClick={() => {
                      close(false);
                      if (r.id !== brand?.id) void reopen(r.id);
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    {r.id === brand?.id && <Check className="h-4 w-4 text-ink-2" strokeWidth={2} aria-hidden />}
                  </button>
                ))}
              </>
            )}
            {channel && !sample && (
              <a
                role="menuitem"
                href={`https://t.me/${channel.replace(/^@/, "")}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 flex min-h-10 w-full items-center gap-2.5 rounded-[10px] px-2.5 hover:bg-[rgb(255_255_255/.06)] focus-visible:bg-[rgb(255_255_255/.08)]"
                onClick={() => close(false)}
              >
                <ExternalLink className="h-4 w-4 text-ink-2" strokeWidth={1.75} aria-hidden />
                {c.hub.openTg}
              </a>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * The light behind the glass: a spot of each working lamp's colour exactly behind its mini-lamp,
 * added like light (plus-lighter). The spots stand still: anything moving under the glass would
 * make the backdrop blur recompute every frame for the whole run. Only the mini-lamp itself, above
 * the glass, breathes while it works. No lamp lit, no light.
 */
export function StageLight({ lamps }: { lamps: Lamps }) {
  const spots = useHub((s) => s.spots);
  const side = useHub((s) => s.side);
  const collapsed = useHub((s) => s.collapsed);
  // The light stays under the glass: nothing of it reaches the page beside the hub.
  const w = collapsed ? RAIL_W : HUB_W;
  const clip = side === "left" ? `inset(12px calc(100% - ${12 + w}px) 12px 12px round 24px)` : `inset(12px 12px 12px calc(100% - ${12 + w}px) round 24px)`;
  const checking = useHub((s) => s.checking);
  const blink = useHub((s) => s.blink);
  const level = (r: AgentRole) => (lamps.state[r] === "warming" ? 0.7 : lamps.state[r] === "on" || lamps.state[r] === "you" ? 1 : 0);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 isolate transition-[clip-path] duration-300 ease-out" style={{ clipPath: clip }}>
      {OWNER_LAMPS.map((r, i) => {
        const at = spots[r];
        if (!at) return null;
        const o = level(r);
        const run = checking ? "check" : blink && r === "publisher" ? "blink" : undefined;
        return (
          <span
            key={r}
            className="stage-spot"
            data-run={run}
            style={{
              left: at.x,
              top: at.y,
              ["--i" as string]: i,
              background: light(LAMPS[r].hue, 0.45),
              opacity: o,
              transition: o ? "opacity 720ms var(--ease-out)" : "opacity 1000ms var(--ease-in)",
            }}
          />
        );
      })}
    </div>
  );
}
