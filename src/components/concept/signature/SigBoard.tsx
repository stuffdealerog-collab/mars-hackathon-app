"use client";

import { memo } from "react";
import { ledLayout } from "@/components/lamp/Led";
import { useSigTime, type Beat, type SigProps } from "./clock";
import { Approve, EndCard, Namuna, Tap } from "./parts";

/* C — «Yugurgan satr»: the whole phone is the amber sign above a shop. The
   link is typed in dot by dot, then the board rewrites itself with what the
   department found, each rewrite a rain of dots, until the post is ready
   and the owner taps lime. */

export const LENGTH = 14;
export const POSTER = 5.6;

export const BEATS: Beat[] = [
  { t: 0.2, sound: "щелчок реле, гул платы", picture: "ссылка набирается точками" },
  { t: 2.25, sound: "дождь точек, сухой шорох (0.28 с)", picture: "ссылка осыпается" },
  { t: 2.55, sound: "щелчок, строка встаёт", picture: "OVOZ: SIZ, ILIQ" },
  { t: 4.5, sound: "шорох за 0.3 с до, затем щелчок", picture: "QAMROV 27%" },
  { t: 6.5, sound: "шорох за 0.3 с до, затем щелчок", picture: "7 POST ×4 YOZUV" },
  { t: 8.5, sound: "шорох за 0.3 с до, щелчок выше", picture: "MIJOZ: 10 JOY" },
  { t: 10.3, sound: "шорох, пауза, мягкий тон", picture: "POST TAYYOR." },
  { t: 11.9, sound: "нажатие и «динь»", picture: "лаймовая Tasdiqlash" },
  { t: 12.6, sound: "аккорд", picture: "«Bir havola. Butun bo‘lim.»" },
];

const DOT = 5.5;
const GAP = 1.9;
const STEP = DOT + GAP;
const R = DOT / 2;
const OX = 15;
const OY = 15;
const COLS = 42;
const CENTER_ROW = 36;

type Dot = { col: number; row: number; k: number };
type Phase = { lines: string[]; inAt: number; outAt: number; typed?: boolean };

const PHASES: Phase[] = [
  { lines: ["T.ME/", "KANAL", "INGIZ"], inAt: 0.05, outAt: 2.25, typed: true },
  { lines: ["OVOZ:", "SIZ,", "ILIQ"], inAt: 2.55, outAt: 4.2 },
  { lines: ["QAMROV", "27%"], inAt: 4.5, outAt: 6.2 },
  { lines: ["7 POST", "×4", "YOZUV"], inAt: 6.5, outAt: 8.2 },
  { lines: ["MIJOZ:", "10 JOY"], inAt: 8.5, outAt: 10.0 },
  { lines: ["POST", "TAYYOR."], inAt: 10.3, outAt: Infinity },
];

/** Lays phrase lines onto the board grid, centred, one char index per dot. */
function layout(lines: string[]): { dots: Dot[]; minCol: number; width: number } {
  const dots: Dot[] = [];
  const rows = lines.length * 7 + (lines.length - 1) * 3;
  const top = CENTER_ROW - Math.floor(rows / 2);
  let k = 0;
  let minCol = COLS;
  let maxCol = 0;
  lines.forEach((line, li) => {
    const glyphs = line.split("").map((c) => ledLayout(c, 1, 0));
    const lineW = glyphs.reduce((a, g) => a + g.width + 1, 0) - 1;
    let x = Math.floor((COLS - lineW) / 2);
    glyphs.forEach((g) => {
      g.dots.forEach(([cx, cy]) => dots.push({ col: x + cx - 0.5, row: top + li * 10 + cy - 0.5, k }));
      x += g.width + 1;
      k++;
    });
    minCol = Math.min(minCol, Math.floor((COLS - lineW) / 2));
    maxCol = Math.max(maxCol, Math.floor((COLS - lineW) / 2) + lineW);
  });
  return { dots, minCol, width: Math.max(1, maxCol - minCol) };
}

/* The board never shows two phrases at once: the old dots fall and are gone
   within FALL seconds, and the next phrase starts 0.3 s after the fall begins. */
const FALL = 0.28;
const LAYOUTS = PHASES.map((p) => layout(p.lines));
const hash = (c: number, r: number) => ((c * 73 + r * 151) % 97) / 97;

const Layer = memo(function Layer({ id, mode, reduced }: { id: number; mode: "in" | "out"; reduced: boolean }) {
  const { dots, minCol, width } = LAYOUTS[id];
  const typed = PHASES[id].typed;
  return (
    <svg
      aria-hidden
      className="absolute inset-0"
      width="100%"
      height="100%"
      style={{ overflow: "visible", filter: "drop-shadow(0 0 3px rgb(255 181 71 / .75))" }}
    >
      {dots.map((d) => {
        const h = hash(d.col, d.row);
        let animation: string;
        let delay: number;
        if (reduced) {
          animation = mode === "in" ? "sb-fade-in 260ms ease-out both" : "sb-fade-out 200ms ease-in both";
          delay = 0;
        } else if (mode === "in") {
          animation = "sb-on 170ms linear both";
          delay = typed ? 0.15 + d.k * 0.085 + h * 0.03 : 0.04 + ((d.col - minCol) / width) * 0.32 + h * 0.03;
        } else {
          animation = "sb-fall 220ms cubic-bezier(.55, 0, 1, .45) both";
          delay = h * (FALL - 0.22);
        }
        return (
          <circle
            key={`${d.col}-${d.row}`}
            cx={OX + d.col * STEP + R}
            cy={OY + d.row * STEP + R}
            r={R}
            fill="#FFB547"
            style={{ animation, animationDelay: `${delay}s`, ["--fy" as string]: `${8 + h * 12}px` }}
          />
        );
      })}
    </svg>
  );
});

const KEYFRAMES = `
@keyframes sb-on { 0% { opacity: 0 } 45% { opacity: 1; fill: #fff3d6 } 100% { opacity: 1 } }
@keyframes sb-fall { 0% { opacity: 1; transform: translateY(0) } 100% { opacity: 0; transform: translateY(var(--fy)) } }
@keyframes sb-fade-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes sb-fade-out { from { opacity: 1 } to { opacity: 0 } }
`;

export function SigBoard(props: SigProps) {
  const { reduced, runKey } = props;
  const t = useSigTime(props, LENGTH, POSTER);
  return (
    <div className="relative h-full w-full overflow-hidden bg-black text-[var(--ink)]">
      <style>{KEYFRAMES}</style>
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(circle at ${R}px ${R}px, rgb(255 181 71 / .09) ${R * 0.85}px, transparent ${R}px)`,
          backgroundSize: `${STEP}px ${STEP}px`,
          backgroundPosition: `${OX}px ${OY}px`,
        }}
      />
      <p className="sr-only">
        t.me/kanalingiz. Ovoz: siz, iliq. Qamrov 27%. 7 post, 4 yozuvda. Mijozlar: 10 joy. Post tayyor.
      </p>
      {PHASES.map((p, id) =>
        t >= p.inAt && t < p.outAt + FALL ? (
          <Layer key={`${runKey}-${id}-${t < p.outAt ? "in" : "out"}`} id={id} mode={t < p.outAt ? "in" : "out"} reduced={reduced} />
        ) : null,
      )}
      <Namuna />
      {t >= 10.9 && <Approve t={t} from={10.9} press={11.9} style={{ left: 18, right: 18, top: 486 }} />}
      {!reduced && <Tap t={t} at={11.9} x={170} y={512} />}
      <EndCard t={t} at={12.6} reduced={reduced} />
    </div>
  );
}
