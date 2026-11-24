import type { AgentRole } from "@/lib/uslub/contract";

/**
 * "Chiroqlar yonadi" — the department is a panel of lamps.
 * Each employee owns one light. In pipeline order the hues run warm-white →
 * amber → coral → rose → magenta → violet → indigo → blue → teal, so a fully
 * lit panel reads as one spectrum. Lime is never a lamp: it belongs to the owner.
 */
export interface Lamp {
  role: AgentRole;
  name: string; // Uzbek job title (UI name)
  ru: string;
  job: string; // one plain line, Uzbek
  hue: string; // the light
  core: string; // hot centre of the bulb
  deep: string; // where the light falls into the dark
  darkInk?: boolean; // results sit on a light glow: print them dark
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
  brand: { role: "brand", name: "Brend xotirasi", ru: "Память бренда", job: "Ovozingizni eslab qoladi", hue: "#FFD6A0", core: "#FFF7EA", deep: "#B8642F", darkInk: true },
  analyst: { role: "analyst", name: "Analitik", ru: "Аналитик", job: "Kanal raqamlarini o‘qiydi", hue: "#FFB547", core: "#FFEBC2", deep: "#A8501A", darkInk: true },
  strategist: { role: "strategist", name: "Strateg", ru: "Стратег", job: "Haftalik reja tuzadi", hue: "#FF8A3D", core: "#FFD6B8", deep: "#9A2E1A" },
  copywriter: { role: "copywriter", name: "Kopirayter", ru: "Копирайтер", job: "Postlarni ovozingizda yozadi", hue: "#FF6152", core: "#FFC9BF", deep: "#931D38" },
  editor: { role: "editor", name: "Muharrir", ru: "Редактор", job: "Neyro-so‘zlarni o‘chiradi", hue: "#FF4580", core: "#FFC0D5", deep: "#7E1258" },
  translator: { role: "translator", name: "Tarjimon", ru: "Переводчик", job: "Lotin, kirill, rus, ingliz", hue: "#E04BC9", core: "#F8C2EE", deep: "#561A86" },
  designer: { role: "designer", name: "Dizayner", ru: "Дизайнер", job: "Muqova g‘oyalari", hue: "#9E62FF", core: "#DECBFF", deep: "#341C98" },
  video: { role: "video", name: "Videograf", ru: "Видеограф", job: "Reels ssenariysi", hue: "#6273FF", core: "#CBD1FF", deep: "#1A2788" },
  radar: { role: "radar", name: "Mijoz radar", ru: "Радар клиентов", job: "Mijozlaringiz qayerda", hue: "#2F9CFF", core: "#BEE3FF", deep: "#0C4A8C" },
  publisher: { role: "publisher", name: "SMM-menejer", ru: "SMM-менеджер", job: "Kanalga joylaydi", hue: "#25D0C2", core: "#BDFFF7", deep: "#0A6B74" },
};

/** Owner's hand: the only lime on screen. */
export const LIME = "#D7FF3A";
/** LED readout amber: measured numbers only. */
export const LED = "#FFB547";

export type LampState = "off" | "warming" | "on" | "you" | "error";

export const lampVars = (role: AgentRole) => {
  const l = LAMPS[role];
  return {
    "--hue": l.hue,
    "--core": l.core,
    "--deep": l.deep,
    "--on": l.darkInk ? "#1c0f05" : "#fff",
    "--on-shadow": l.darkInk ? "none" : "0 1px 14px rgb(0 0 0 / .35)",
  } as React.CSSProperties;
};
