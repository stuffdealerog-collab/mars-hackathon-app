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
const rgba = (hex: string, a: number) => `rgba(${rgb(hex).join(", ")}, ${a})`;
const mix = (a: string, b: string, t: number) => {
  const [x, y] = [rgb(a), rgb(b)];
  return `rgb(${x.map((v, i) => Math.round(v * (1 - t) + y[i] * t)).join(", ")})`;
};

/**
 * Per-lamp CSS variables. Mixed colours are computed here, not with CSS color-mix():
 * older Android WebViews (Telegram on Huawei / old MIUI) drop the whole background otherwise.
 */
export const lampVars = (role: AgentRole) => {
  const l = LAMPS[role];
  return {
    "--hue": l.hue,
    "--core": l.core,
    "--deep": l.deep,
    "--mid": mix(l.hue, l.deep, 0.45),
    "--deep-a": rgba(l.deep, 0.55),
    "--hue-a": rgba(l.hue, 0.7),
    "--hue-b": rgba(l.hue, 0.22),
  } as React.CSSProperties;
};
