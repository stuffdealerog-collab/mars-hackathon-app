import type { AgentRole } from "@/lib/uslub/contract";

/**
 * "Chiroqlar yonadi" — the department is a panel of lamps.
 * Each employee owns one light. In pipeline order the hues run warm-white →
 * amber → coral → rose → magenta → violet → indigo → blue → teal, so a fully
 * lit panel reads as one spectrum. Lime is never a lamp: it belongs to the owner.
 * Names and jobs live in the UI copy (uz / ru / en): src/components/ui/copy.ts.
 */
export interface Lamp {
  role: AgentRole;
  hue: string; // the light
  core: string; // hot centre of the bulb
  deep: string; // where the light falls into the dark
}

export const LAMP_ORDER: AgentRole[] = [
  "brand",
  "analyst",
  "strategist",
  "copywriter",
  "editor",
  "translator",
  "designer",
  "video",
  "radar",
  "publisher",
];

export const LAMPS: Record<AgentRole, Lamp> = {
  brand: { role: "brand", hue: "#FFD6A0", core: "#FFF7EA", deep: "#B8642F" },
  analyst: { role: "analyst", hue: "#FFB547", core: "#FFEBC2", deep: "#A8501A" },
  strategist: { role: "strategist", hue: "#FF8A3D", core: "#FFD6B8", deep: "#9A2E1A" },
  copywriter: { role: "copywriter", hue: "#FF6152", core: "#FFC9BF", deep: "#931D38" },
  editor: { role: "editor", hue: "#FF4580", core: "#FFC0D5", deep: "#7E1258" },
  translator: { role: "translator", hue: "#E04BC9", core: "#F8C2EE", deep: "#561A86" },
  designer: { role: "designer", hue: "#9E62FF", core: "#DECBFF", deep: "#341C98" },
  video: { role: "video", hue: "#6273FF", core: "#CBD1FF", deep: "#1A2788" },
  radar: { role: "radar", hue: "#2F9CFF", core: "#BEE3FF", deep: "#0C4A8C" },
  publisher: { role: "publisher", hue: "#25D0C2", core: "#BDFFF7", deep: "#0A6B74" },
};

export type LampState = "off" | "warming" | "on" | "you" | "error";

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
export const rgba = (hex: string, a: number) => `rgba(${rgb(hex).join(", ")}, ${a})`;
const mixRgb = (a: string, b: string, t: number) => {
  const [x, y] = [rgb(a), rgb(b)];
  return x.map((v, i) => v * (1 - t) + y[i] * t);
};
const mix = (a: string, b: string, t: number) => `rgb(${mixRgb(a, b, t).map(Math.round).join(", ")})`;
/** How much dimmer a tile's glow is than its bulb, so the words on it read (0.15 = 15% toward black). */
const GLOW_DIM = 0.15;
const dimBy = (k: number) => (c: number[], a = 1) => {
  const [r, g, b] = c.map((v) => Math.round(v * (1 - k)));
  return a === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;
};
const dim = dimBy(GLOW_DIM);
/** Computer screens: the warmer stage made lit tiles read brighter; their glow sits 8% lower. */
const deskDim = dimBy(GLOW_DIM + 0.08);
/** Computer screens: the hub's 40 px mini-lamps, glass with a falloff, a fifth dimmer than the bulb. */
const miniDim = dimBy(0.2);

/** Soft light that falls off over nine steps: two stops leave a visible disc edge. */
const FALL = [
  [0, 1],
  [12, 0.82],
  [25, 0.6],
  [38, 0.4],
  [52, 0.24],
  [66, 0.12],
  [80, 0.05],
  [90, 0.015],
  [100, 0],
] as const;
export const light = (hex: string, a: number, size = "closest-side", at = "50% 50%") =>
  `radial-gradient(${size} at ${at}, ${FALL.map(([p, k]) => `${rgba(hex, +(a * k).toFixed(3))} ${p}%`).join(", ")})`;

/**
 * Per-lamp CSS variables. Mixed colours are computed here, not with CSS color-mix():
 * older Android WebViews (Telegram on Huawei / old MIUI) drop the whole background otherwise.
 * Computed once per lamp for the module: some thirty tiles read them on every render.
 */
const varsOf = (role: AgentRole) => {
  const l = LAMPS[role];
  return {
    "--hue": l.hue,
    "--core": l.core,
    "--deep": l.deep,
    "--mid": mix(l.hue, l.deep, 0.45),
    "--deep-a": rgba(l.deep, 0.55),
    "--hue-a": rgba(l.hue, 0.7),
    "--hue-b": rgba(l.hue, 0.22),
    // The glow behind a tile's words: the same stops, GLOW_DIM toward black.
    "--g-core": dim(rgb(l.core)),
    "--g-hue": dim(rgb(l.hue)),
    "--g-mid": dim(mixRgb(l.hue, l.deep, 0.45)),
    "--g-deep-a": dim(rgb(l.deep), 0.55),
    // Computer screens: the standby ember in the filament, its light only around the slot, and
    // the lamp's light on the room (wall above the panel, floor under it).
    "--d-core": deskDim(rgb(l.core)),
    "--d-hue": deskDim(rgb(l.hue)),
    "--d-mid": deskDim(mixRgb(l.hue, l.deep, 0.45)),
    "--d-deep-a": deskDim(rgb(l.deep), 0.55),
    "--x-core": miniDim(rgb(l.core)),
    "--x-hue": miniDim(rgb(l.hue)),
    "--x-mid": miniDim(mixRgb(l.hue, l.deep, 0.45)),
    "--x-deep": miniDim(rgb(l.deep)),
    "--ember": rgba(l.hue, 0.6),
    "--ember-glow": rgba(l.hue, 0.45),
    "--room": light(l.hue, 0.5),
  } as React.CSSProperties;
};
const VARS = Object.fromEntries(LAMP_ORDER.map((r) => [r, varsOf(r)])) as Record<AgentRole, React.CSSProperties>;
export const lampVars = (role: AgentRole) => VARS[role];

/**
 * Computer screens: the one work light over the headline and the department, a warm cone with
 * darker sides, so the room has a visible source. Its peak sits at the top edge; the hint lines
 * (ink-3) stand where it has fallen off, at 4.5:1 or more.
 */
export const WORK_LIGHT = light("#ffcf9a", 0.2, "55% 50%", "50% 0%");
