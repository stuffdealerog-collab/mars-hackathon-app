import type { AgentRole, NodeKind } from "@/lib/uslub/contract";
import {
  Activity,
  BookOpen,
  Clapperboard,
  Compass,
  Eraser,
  Flag,
  Inbox,
  Languages,
  Megaphone,
  Palette,
  PenLine,
  Radar,
  type LucideIcon,
} from "lucide-react";

export interface AgentMeta {
  role: AgentRole;
  name: string; // Uzbek job title, used as the employee's name in the UI
  ru: string;
  en: string;
  does: string; // one plain sentence, Uzbek
  tone: "lapis" | "turq" | "saffron" | "clay" | "ink";
  icon: LucideIcon;
  today: string; // "what they did today" (mock)
}

export const AGENTS: Record<AgentRole, AgentMeta> = {
  brand: {
    role: "brand",
    name: "Brend xotirasi",
    ru: "Память бренда",
    en: "Brand memory",
    does: "Biznesingiz haqidagi hamma narsani eslab qoladi va ovozingizni DNK kartaga aylantiradi.",
    tone: "lapis",
    icon: BookOpen,
    today: "Kanaldagi 40 ta postni o'qib, Brend DNK ni yangiladi",
  },
  analyst: {
    role: "analyst",
    name: "Analitik",
    ru: "Аналитик",
    en: "Analyst",
    does: "Kanalingizning haqiqiy raqamlarini va raqobatchilarni tahlil qiladi: qaysi post, qaysi soat ishlaydi.",
    tone: "turq",
    icon: Activity,
    today: "So'nggi 60 ta postni va 3 ta raqobatchini tahlil qildi",
  },
  strategist: {
    role: "strategist",
    name: "Strateg",
    ru: "Стратег",
    en: "Strategist",
    does: "Topshirig'ingizni reja va vazifalarga bo'lib, kim nima qilishini belgilaydi.",
    tone: "ink",
    icon: Compass,
    today: "Black Friday uchun 7 kunlik reja tuzdi",
  },
  copywriter: {
    role: "copywriter",
    name: "Kopirayter",
    ru: "Копирайтер",
    en: "Copywriter",
    does: "Postlarni sizning uslubingizda yozadi: siz/sen, emoji, uzunlik — hammasi brenddagidek.",
    tone: "saffron",
    icon: PenLine,
    today: "5 ta post qoralamasini yozdi",
  },
  editor: {
    role: "editor",
    name: "Muharrir",
    ru: "Редактор",
    en: "Editor",
    does: "«Neyro-so'zlar»ni topib, odamday yozilgan matn qoldiradi va inson balini ko'rsatadi.",
    tone: "clay",
    icon: Eraser,
    today: "12 ta neyro-so'zni almashtirdi, o'rtacha ball 91",
  },
  translator: {
    role: "translator",
    name: "Tarjimon",
    ru: "Переводчик",
    en: "Translator",
    does: "O'zbek lotin, kirill, rus va ingliz tillarida bir xil ohangni saqlaydi.",
    tone: "turq",
    icon: Languages,
    today: "20 ta matnni 4 yozuvga o'girdi",
  },
  designer: {
    role: "designer",
    name: "Dizayner",
    ru: "Дизайнер",
    en: "Designer",
    does: "Postlar uchun muqova va rasmlarni brend ranglarida tayyorlaydi.",
    tone: "saffron",
    icon: Palette,
    today: "3 ta muqova tayyorladi",
  },
  video: {
    role: "video",
    name: "Videograf",
    ru: "Видеограф",
    en: "Videographer",
    does: "Reels va TikTok uchun ssenariy, kadrlar va subtitrlarni yozadi.",
    tone: "lapis",
    icon: Clapperboard,
    today: "15 soniyalik Reels ssenariysini yozdi",
  },
  publisher: {
    role: "publisher",
    name: "SMM-menejer",
    ru: "SMM-менеджер",
    en: "SMM manager",
    does: "Siz tasdiqlagan postni Telegram kanalga joylaydi. Instagram va YouTube — tez kunda.",
    tone: "turq",
    icon: Megaphone,
    today: "2 ta postni kanalga joyladi",
  },
  radar: {
    role: "radar",
    name: "Mijoz radar",
    ru: "Радар клиентов",
    en: "Customer radar",
    does: "Mijozlaringiz qayerda ekanini topadi: kanallar, guruhlar, blogerlar, tadbirlar.",
    tone: "clay",
    icon: Radar,
    today: "10 ta joy topdi, 3 tasi yangi",
  },
};

export const AGENT_ORDER: AgentRole[] = [
  "brand",
  "analyst",
  "strategist",
  "copywriter",
  "editor",
  "translator",
  "designer",
  "video",
  "publisher",
  "radar",
];

export const KIND_META: Record<"input" | "approval", { name: string; icon: LucideIcon; tone: AgentMeta["tone"] }> = {
  input: { name: "Topshiriq", icon: Flag, tone: "ink" },
  approval: { name: "Sizning tasdig'ingiz", icon: Inbox, tone: "saffron" },
};

export function kindMeta(kind: NodeKind) {
  if (kind === "input" || kind === "approval") return KIND_META[kind];
  const a = AGENTS[kind];
  return { name: a.name, icon: a.icon, tone: a.tone };
}

export const TONE: Record<AgentMeta["tone"], { bg: string; fg: string; soft: string; hex: string }> = {
  lapis: { bg: "bg-lapis", fg: "text-lapis", soft: "bg-lapis-soft", hex: "#2747C8" },
  turq: { bg: "bg-turq", fg: "text-turq", soft: "bg-turq-soft", hex: "#16A394" },
  saffron: { bg: "bg-saffron", fg: "text-saffron", soft: "bg-saffron-soft", hex: "#F2A93B" },
  clay: { bg: "bg-clay", fg: "text-clay", soft: "bg-clay-soft", hex: "#C8553D" },
  ink: { bg: "bg-ink", fg: "text-ink", soft: "bg-shell", hex: "#13151C" },
};

export const TG_BOT_URL = "https://t.me/hackathonproj1_bot";

/** Signature gradient per employee: [glow, deep]. Glow fades into black on cards. */
export const GRAD: Record<NodeKind, [string, string]> = {
  brand: ["#FBE3C2", "#E98A5E"],
  analyst: ["#D7FF3A", "#16B364"],
  strategist: ["#5B7CFF", "#7C3AED"],
  copywriter: ["#FF7A5C", "#FFB98A"],
  editor: ["#FF2D55", "#C026D3"],
  translator: ["#38E1FF", "#2F6BFF"],
  designer: ["#FF7AC6", "#9D4EDD"],
  video: ["#FF9F1C", "#FF2D55"],
  publisher: ["#3B82F6", "#22D3EE"],
  radar: ["#B4F43A", "#0FB5A6"],
  input: ["#E9E9EE", "#7B7B86"],
  approval: ["#D7FF3A", "#9BCB00"],
};
