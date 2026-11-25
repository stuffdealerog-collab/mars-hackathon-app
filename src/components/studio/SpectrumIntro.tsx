import type { AgentRole } from "@/lib/uslub/contract";
import { useLayoutEffect, useRef, useState } from "react";
import { LAMPS, OWNER_LAMPS } from "@/components/lamp/lamps";

/**
 * Signature moment B, «Spektr», on real data.
 *
 * The link field squeezes into one white-hot point. The point charges, drops
 * onto the panel and splits into a beam per employee. Every lamp
 * flashes once as its beam lands (a power-on lamp test), then the panel shows
 * the run's honest state: only the employees who are actually working glow.
 * Everything runs on WAAPI, so React does not re-render per frame.
 */

type Geo = { w: number; ox: number; oy: number; dx: number; dy: number; tiles: { x: number; y: number; w: number; h: number; hue: string; core: string; dark: boolean }[] };

const T = { squeeze: 380, charge: 300, chargeEnd: 700, drop: 980, split: 1000, beamIn: 330, bloom: 1300, end: 1900, back: 1650 };
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const EASE_IN = "cubic-bezier(0.7, 0, 0.84, 0)";
/** One shared empty list: a fresh `[]` default would re-measure (and replay) on every render. */
const NONE: readonly AgentRole[] = [];

export function SpectrumIntro({
  fieldRef,
  panelRef,
  onBloom,
  onDone,
  dark = NONE,
}: {
  fieldRef: React.RefObject<HTMLElement | null>;
  panelRef: React.RefObject<HTMLElement | null>;
  onBloom: () => void;
  onDone: () => void;
  /** Roles that stay dark through it: no beam, no flash. */
  dark?: readonly AgentRole[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const point = useRef<HTMLSpanElement>(null);
  const beams = useRef<(HTMLSpanElement | null)[]>([]);
  const flashes = useRef<(HTMLSpanElement | null)[]>([]);
  const [geo, setGeo] = useState<Geo | null>(null);

  // Measure where the field and the lamps are, relative to the panel's box.
  useLayoutEffect(() => {
    const host = box.current?.parentElement;
    const field = fieldRef.current;
    const panel = panelRef.current;
    if (!host || !field || !panel) return;
    const b = host.getBoundingClientRect();
    const f = field.getBoundingClientRect();
    const tiles = Array.from(panel.children).map((li, i) => {
      const r = li.getBoundingClientRect();
      // The panel draws OWNER_LAMPS in order: tile i is that list's role i.
      const role = OWNER_LAMPS[i];
      const l = LAMPS[role];
      return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height, hue: l.hue, core: l.core, dark: dark.includes(role) };
    });
    const id = requestAnimationFrame(() =>
      setGeo({ w: b.width, ox: f.left - b.left + f.width / 2, oy: f.top - b.top + f.height / 2, dx: b.width / 2, dy: -18, tiles }),
    );
    return () => cancelAnimationFrame(id);
  }, [fieldRef, panelRef, dark]);

  // Play the sequence once geometry is known.
  useLayoutEffect(() => {
    if (!geo) return;
    const field = fieldRef.current;
    const anims: Animation[] = [];
    const timers: number[] = [];
    if (field) {
      anims.push(
        // transform + opacity only: clip-path animates on the main thread in Telegram's webview.
        field.animate(
          [
            { transform: "scaleX(1)", opacity: 1, offset: 0 },
            { transform: "scaleX(0.04)", opacity: 0.6, offset: T.squeeze / T.end },
            { transform: "scaleX(0.04)", opacity: 0, offset: T.back / T.end },
            { transform: "scaleX(1)", opacity: 1, offset: 1 },
          ],
          { duration: T.end, easing: "linear" },
        ),
      );
    }
    const p = point.current;
    if (p) {
      const fromX = geo.ox - 8;
      const fromY = geo.oy - 8;
      const toX = geo.dx - 8;
      const toY = geo.dy - 8;
      anims.push(
        p.animate(
          [
            { transform: `translate(${fromX}px, ${fromY}px) scale(.2)`, opacity: 0, offset: 0 },
            { transform: `translate(${fromX}px, ${fromY}px) scale(.35)`, opacity: 1, offset: T.charge / T.split },
            { transform: `translate(${fromX}px, ${fromY - 22}px) scale(1.15)`, opacity: 1, offset: T.chargeEnd / T.split, easing: EASE_IN },
            { transform: `translate(${toX}px, ${toY}px) scale(.9)`, opacity: 1, offset: T.drop / T.split },
            { transform: `translate(${toX}px, ${toY}px) scale(1.6)`, opacity: 0, offset: 1 },
          ],
          { duration: T.split + 120, easing: "linear", fill: "forwards" },
        ),
      );
    }
    geo.tiles.forEach((t, i) => {
      if (t.dark) return;
      const beam = beams.current[i];
      const flash = flashes.current[i];
      const delay = T.split + i * 22;
      if (beam) {
        anims.push(
          beam.animate(
            [
              { transform: beam.dataset.rot + " scaleY(0)", opacity: 1 },
              { transform: beam.dataset.rot + " scaleY(1)", opacity: 1, offset: 0.55 },
              { transform: beam.dataset.rot + " scaleY(1)", opacity: 0 },
            ],
            { duration: T.beamIn * 2.2, delay, easing: EASE_OUT, fill: "both" },
          ),
        );
      }
      if (flash) {
        anims.push(
          flash.animate([{ opacity: 0 }, { opacity: 0.6, offset: 0.2 }, { opacity: 0.12, offset: 0.36 }, { opacity: 0.45, offset: 0.5 }, { opacity: 0 }], {
            duration: 520,
            delay: delay + T.beamIn * 0.6,
            easing: "linear",
            fill: "both",
          }),
        );
      }
    });
    timers.push(window.setTimeout(onBloom, T.bloom));
    timers.push(window.setTimeout(onDone, T.end + 400));
    return () => {
      anims.forEach((a) => a.cancel());
      timers.forEach(clearTimeout);
    };
  }, [geo, fieldRef, onBloom, onDone]);

  return (
    <div ref={box} aria-hidden className="pointer-events-none absolute inset-0 z-20 overflow-visible">
      {geo && (
        <>
          {geo.tiles.map((t, i) => {
            const cx = t.x + t.w / 2;
            const cy = t.y + t.h / 2;
            const len = Math.hypot(cx - geo.dx, cy - geo.dy);
            const ang = (Math.atan2(-(cx - geo.dx), cy - geo.dy) * 180) / Math.PI;
            const rot = `rotate(${ang.toFixed(2)}deg)`;
            if (t.dark) return null;
            return (
              <span key={`b${i}`}>
                <span
                  ref={(el) => {
                    beams.current[i] = el;
                  }}
                  data-rot={rot}
                  className="absolute w-[3px] origin-top rounded-full"
                  style={{
                    left: geo.dx - 1.5,
                    top: geo.dy,
                    height: len,
                    opacity: 0,
                    transform: `${rot} scaleY(0)`,
                    background: `linear-gradient(#fff, ${t.hue} 30%, ${t.hue})`,
                    boxShadow: `0 0 12px 1px ${t.hue}`,
                  }}
                />
                <span
                  ref={(el) => {
                    flashes.current[i] = el;
                  }}
                  className="absolute rounded-[22px]"
                  style={{
                    left: t.x,
                    top: t.y,
                    width: t.w,
                    height: t.h,
                    opacity: 0,
                    background: `radial-gradient(150% 100% at 50% -10%, ${t.core} 0%, ${t.hue} 30%, ${t.hue}4d 70%, transparent 90%)`,
                  }}
                />
              </span>
            );
          })}
          <span
            ref={point}
            className="absolute left-0 top-0 h-4 w-4 rounded-full bg-white"
            style={{ opacity: 0, boxShadow: "0 0 10px 3px #fff, 0 0 24px 8px rgb(255 236 210 / .45)" }}
          />
        </>
      )}
    </div>
  );
}
