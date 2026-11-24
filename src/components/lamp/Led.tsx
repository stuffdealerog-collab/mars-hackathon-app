/**
 * LED readout — the running-line sign above a Tashkent shop, drawn as a 5×7
 * dot matrix. Used ONLY for measured numbers and the channel's real facts.
 * Unlit dots are a CSS pattern (one element), lit dots are SVG circles.
 * Server-safe: no hooks.
 */

const G: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["###..", "#..#.", "#...#", "#...#", "#...#", "#..#.", "###.."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".####"],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
  ".": [".", ".", ".", ".", ".", ".", "#"],
  ",": [".", ".", ".", ".", ".", "#", "#"],
  ":": [".", "#", ".", ".", ".", "#", "."],
  "·": [".", ".", ".", "#", ".", ".", "."],
  "'": ["#", "#", ".", ".", ".", ".", "."],
  "‘": ["#", "#", ".", ".", ".", ".", "."],
  "%": ["##..#", "##.#.", "...#.", "..#..", ".#...", ".#.##", "#..##"],
  "@": [".###.", "#...#", "#.###", "#.#.#", "#.###", "#....", ".###."],
  "/": ["....#", "...#.", "...#.", "..#..", ".#...", ".#...", "#...."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  "—": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  _: [".....", ".....", ".....", ".....", ".....", ".....", "#####"],
  "×": [".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "....."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "!": ["#", "#", "#", "#", "#", ".", "#"],
  "→": [".....", "..#..", "...#.", "#####", "...#.", "..#..", "....."],
  " ": ["..", "..", "..", "..", "..", "..", ".."],
};

export function ledLayout(text: string, dot: number, gap: number) {
  const step = dot + gap;
  const chars = text
    .toUpperCase()
    .split("")
    .map((c) => G[c] ?? G[" "]);
  let x = 0;
  const dots: [number, number][] = [];
  chars.forEach((g) => {
    const w = g[0].length;
    g.forEach((row, ry) => {
      for (let rx = 0; rx < w; rx++) if (row[rx] === "#") dots.push([x + rx * step + dot / 2, ry * step + dot / 2]);
    });
    x += w * step + step;
  });
  return { dots, width: Math.max(0, x - step - gap), height: 7 * step - gap, step };
}

export function Led({
  text,
  dot = 4,
  gap = 2,
  color = "var(--led, #FFB547)",
  glow = true,
  className = "",
  label,
  grid = true,
}: {
  text: string | number;
  dot?: number;
  gap?: number;
  color?: string;
  glow?: boolean;
  className?: string;
  label?: string;
  /** draw the unlit dot grid behind the lit dots */
  grid?: boolean;
}) {
  const t = String(text);
  const { dots, width, height, step } = ledLayout(t, dot, gap);
  const r = dot / 2;
  return (
    <span
      role="img"
      aria-label={label ?? t}
      className={`led ${className}`}
      style={{
        display: "inline-block",
        width,
        height,
        backgroundImage: grid ? `radial-gradient(circle at ${r}px ${r}px, var(--led-off, rgb(255 181 71 / .1)) ${r * 0.9}px, transparent ${r}px)` : undefined,
        backgroundSize: `${step}px ${step}px`,
      }}
    >
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden style={{ display: "block", overflow: "visible" }}>
        <g fill={color} style={glow ? { filter: `drop-shadow(0 0 ${Math.max(1.5, dot * 0.7)}px ${color})` } : undefined}>
          {dots.map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
          ))}
        </g>
      </svg>
    </span>
  );
}

/** A full-width LED strip: the unlit dot grid always, lit text only when there is a fact to show. */
export function LedStrip({
  text,
  dot = 4,
  gap = 2,
  className = "",
  label,
  run = false,
}: {
  text?: string;
  dot?: number;
  gap?: number;
  className?: string;
  label?: string;
  /** scroll the text through the strip, like a shop's running line */
  run?: boolean;
}) {
  const step = dot + gap;
  const r = dot / 2;
  const h = 7 * step - gap;
  return (
    <div
      role="img"
      aria-label={text ? (label ?? text) : "LED o‘chiq: hali havola yo‘q"}
      className={`flex items-center overflow-hidden rounded-[12px] bg-[var(--led-well,var(--stage))] px-3 ${className}`}
      style={{ boxShadow: "inset 0 0 0 1px var(--hair)", height: h + 22 }}
    >
      <span
        aria-hidden
        className="block w-full overflow-hidden"
        style={{
          height: h,
          backgroundImage: `radial-gradient(circle at ${r}px ${r}px, var(--led-off) ${r * 0.9}px, transparent ${r}px)`,
          backgroundSize: `${step}px ${step}px`,
        }}
      >
        {text ? (
          <span
            className={`whitespace-nowrap ${run ? "led-run" : "inline-block"}`}
            style={run ? ({ "--led-run": `${Math.max(6, text.length * 0.55)}s` } as React.CSSProperties) : undefined}
          >
            <Led text={text} dot={dot} gap={gap} grid={false} />
          </span>
        ) : null}
      </span>
    </div>
  );
}
