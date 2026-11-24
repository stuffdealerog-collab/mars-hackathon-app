/**
 * Desktop Studio: the HUB. A glass panel floating over the lamp stage that holds every section
 * (Kanal, Postlar, Video), the department's lights, Pro and language. Dock it left or right
 * (drag it across, or the button), collapse it to an icon rail; both are remembered.
 * Phones never render this: they keep the one-column Studio and the Mini App.
 */
import { BarChart3, ChevronsLeft, ChevronsRight, Clapperboard, GripVertical, Newspaper, PanelLeft, PanelRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { LampTile } from "../lamp/LampTile";
import { LAMP_ORDER, LAMPS } from "../lamp/lamps";
import { fmt, useCopy } from "../ui/lang";
import { LangSwitch, Logo } from "../ui/parts";
import type { Lamps } from "./Department";
import { useStudio, type Tab } from "./store";

type Side = "left" | "right";

const KEY = "mercat.hub";

/** Where the hub sits and whether it is folded, remembered on this device. */
export const useHub = create<{ side: Side; collapsed: boolean; setSide: (s: Side) => void; setCollapsed: (c: boolean) => void }>((set, get) => {
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

/** True on screens wide enough for the hub (matches Tailwind's lg). */
export function useDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}

export const HUB_W = 292;
export const RAIL_W = 76;

const NAV: { key: Tab; icon: typeof BarChart3 }[] = [
  { key: "channel", icon: BarChart3 },
  { key: "posts", icon: Newspaper },
  { key: "video", icon: Clapperboard },
];

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export function Hub({ lamps }: { lamps: Lamps }) {
  const c = useCopy();
  const reduce = useReducedMotion() ?? false;
  const { side, collapsed, setSide, setCollapsed } = useHub();
  const phase = useStudio((s) => s.phase);
  const tab = useStudio((s) => s.tab);
  const setTab = useStudio((s) => s.setTab);
  const posts = useStudio((s) => s.posts.length);
  const brand = useStudio((s) => s.brand);
  const pro = useStudio((s) => s.pro);
  const setPro = useStudio((s) => s.setPro);
  const ready = phase === "ready";
  const working = LAMP_ORDER.filter((r) => lamps.state[r] !== "off").length;
  const w = collapsed ? RAIL_W : HUB_W;
  const DockIcon = side === "left" ? PanelRight : PanelLeft;
  const FoldIcon = (side === "left") === collapsed ? ChevronsRight : ChevronsLeft;

  return (
    <motion.aside
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
      onDragEnd={(_, info) => {
        const x = info.point.x;
        const next: Side = x > window.innerWidth / 2 ? "right" : "left";
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
        <button type="button" className="hub-icon" aria-label={c.hub.dock} title={c.hub.dock} onClick={() => setSide(side === "left" ? "right" : "left")}>
          <DockIcon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
        </button>
        <button type="button" className="hub-icon" aria-label={collapsed ? c.hub.expand : c.hub.collapse} title={collapsed ? c.hub.expand : c.hub.collapse} onClick={() => setCollapsed(!collapsed)}>
          <FoldIcon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
        </button>
      </div>

      {!collapsed && brand && (
        <div className="px-5 pt-4">
          <p className="truncate text-[17px] font-semibold tracking-[-0.01em]">{brand.dna.name || brand.channel}</p>
          {brand.channel && brand.channel !== brand.dna.name && <p className="truncate text-[13px] text-ink-2">{brand.channel}</p>}
        </div>
      )}

      <nav aria-label={c.hub.label} className="mt-4 flex flex-col gap-1 px-2.5">
        {NAV.map(({ key, icon: Icon }) => {
          const active = ready && tab === key;
          return (
            <button
              key={key}
              type="button"
              disabled={!ready}
              title={!ready ? c.hub.soonNav : c.tabs[key]}
              aria-current={active ? "page" : undefined}
              onClick={() => setTab(key)}
              className={`hub-nav ${collapsed ? "justify-center !px-0" : ""}`}
            >
              <Icon className="h-[19px] w-[19px] shrink-0" strokeWidth={1.75} aria-hidden />
              {!collapsed && <span className="flex-1 text-left">{c.tabs[key]}</span>}
              {!collapsed && key === "posts" && posts > 0 && <span className="tnum text-[13px] text-ink-3">{posts}</span>}
            </button>
          );
        })}
      </nav>

      {/* The department, always in view: ten lights, lit only by real work. */}
      <div className={`mt-6 px-4 ${collapsed ? "px-3" : ""}`}>
        {!collapsed && <p className="mb-2 text-[12.5px] text-ink-3">{c.dept.label}</p>}
        <ul className={`grid gap-1.5 ${collapsed ? "grid-cols-2" : "grid-cols-5"}`}>
          {LAMP_ORDER.map((r) => (
            <LampTile key={r} as="li" role={r} size="xs" state={lamps.state[r]} title={c.lamps[r].name} aria-label={`${c.lamps[r].name}: ${c.lampState[lamps.state[r]]}`} />
          ))}
        </ul>
        {!collapsed && working > 0 && <p className="tnum mt-2 text-[13px] text-ink-2">{fmt(c.dept.staff, { n: working })}</p>}
      </div>

      <div className="mt-auto flex flex-col gap-3 px-4 pb-4">
        {collapsed ? (
          <button type="button" className="hub-icon mx-auto !w-11 text-[12.5px] font-semibold" aria-pressed={pro} aria-label={c.pro.label} title={c.pro.label} onClick={() => setPro(!pro)}>
            Pro
          </button>
        ) : (
          <>
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
              <span className="text-[14px]">{c.pro.label}</span>
              <button type="button" role="switch" aria-checked={pro} className="switch" onClick={() => setPro(!pro)}>
                <span className="switch__knob" />
              </button>
            </label>
            <LangSwitch />
          </>
        )}
      </div>
    </motion.aside>
  );
}

/**
 * The stage behind the glass: a faint wash of the lit lamps' own colours near the hub.
 * Honest light: no lamp lit, no wash.
 */
export function StageLight({ lamps }: { lamps: Lamps }) {
  const side = useHub((s) => s.side);
  const lit = LAMP_ORDER.filter((r) => lamps.state[r] === "on" || lamps.state[r] === "you" || lamps.state[r] === "warming").slice(0, 5);
  const x = side === "left" ? 9 : 91;
  // Each lit lamp washes the stage behind the hub in its own colour (warming ones fainter), so the
  // glass has real light to frost. A faint neutral pool keeps the glass legible before any lamp is lit.
  const layers = [
    ...lit.map((r, i) => `radial-gradient(30% 26% at ${x}% ${10 + i * 19}%, ${LAMPS[r].hue}${lamps.state[r] === "warming" ? "1f" : "33"} 0%, transparent 72%)`),
    `radial-gradient(26% 60% at ${x}% 40%, rgb(255 255 255 / 0.035) 0%, transparent 75%)`,
  ].join(", ");
  return <div aria-hidden className="pointer-events-none fixed inset-0 z-0 transition-[background] duration-700" style={{ background: layers }} />;
}
