import "server-only";
import { z } from "zod";
import type { AgentRole, BrandProfile, Flow, FlowEdge, FlowNode } from "./contract";
import { llmJson, MODEL_FAST } from "./llm";
import { clip } from "./text";

const ROLES: AgentRole[] = ["brand", "analyst", "strategist","copywriter", "editor", "translator", "designer", "video", "publisher", "radar"];

const LABELS: Record<AgentRole | "input" | "approval", string> = {
  input: "Vazifa",
  brand: "Brend xotirasi",
  analyst: "Analitik",
  strategist: "Strateg",
  copywriter: "Kopirayter",
  editor: "Muharrir",
  translator: "Tarjimon",
  designer: "Dizayner",
  video: "Videograf",
  publisher: "SMM-menejer",
  radar: "Mijoz radar",
  approval: "Sizning tasdig‘ingiz",
};

const PlanSchema = z.object({
  title: z.string(),
  roles: z.array(z.enum(["copywriter", "editor", "translator", "designer", "video", "publisher", "radar"])),
  notes: z.array(z.object({ role: z.string(), task: z.string() })),
});

const SYSTEM = `You are the "Strategist" (Strateg) of an AI marketing department for a small business in Uzbekistan.
The owner delegates a task. Decide which AI employees are needed and give each a one-line task in Uzbek (Latin).
Employees: copywriter (Telegram posts), editor (removes AI clichés), translator (uz Latin/Cyrillic, ru, en),
designer (cover images), video (Reels/TikTok script), publisher (posts to Telegram after approval), radar (finds where customers are).
Pick only what the task needs. The title is a short Uzbek name for the task (max 6 words).`;

/** Deterministic graph: input -> brand -> analyst -> strategist -> [workers] -> approval -> publisher. */
export function buildFlowGraph(roles: AgentRole[], notes: Record<string, string>, task: string): Pick<Flow, "nodes" | "edges"> {
  const want = new Set(roles.filter((r) => ROLES.includes(r)));
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  const add = (id: string, kind: FlowNode["kind"], config?: Record<string, unknown>) =>
    nodes.push({ id, kind, label: LABELS[kind], ...(config ? { config } : {}) });
  const link = (from: string, to: string) => edges.push({ from, to });
  const cfg = (role: string) => (notes[role] ? { task: notes[role] } : undefined);

  add("input", "input", { task });
  add("brand", "brand");
  add("analyst", "analyst", cfg("analyst") ?? { task: "Kanal raqamlari va raqobatchilarni tahlil qilish" });
  add("strategist", "strategist", cfg("strategist"));
  link("input", "brand");
  link("brand", "analyst");
  link("analyst", "strategist");

  // Text pipeline: copywriter -> editor -> translator
  let textTail: string | null = null;
  if (want.has("copywriter") || want.has("editor") || want.has("translator") || want.has("publisher")) {
    add("copywriter", "copywriter", cfg("copywriter"));
    link("strategist", "copywriter");
    add("editor", "editor", cfg("editor") ?? { task: "Neyro-so‘zlarni olib tashlash" });
    link("copywriter", "editor");
    textTail = "editor";
    if (want.has("translator") || want.has("publisher")) {
      add("translator", "translator", cfg("translator") ?? { scripts: ["uz_latn", "uz_cyrl", "ru", "en"] });
      link("editor", "translator");
      textTail = "translator";
    }
  }
  const tails: string[] = textTail ? [textTail] : [];
  for (const role of ["designer", "video", "radar"] as const) {
    if (!want.has(role)) continue;
    add(role, role, cfg(role));
    link(role === "designer" && textTail ? "copywriter" : "strategist", role);
    if (role !== "radar") tails.push(role);
  }
  if (want.has("radar")) tails.push("radar");

  add("approval", "approval");
  for (const t of tails.length ? tails : ["strategist"]) link(t, "approval");
  if (want.has("publisher") || textTail) {
    add("publisher", "publisher", cfg("publisher") ?? { channel: "telegram" });
    link("approval", "publisher");
  }
  return { nodes, edges };
}

const KEYWORDS: Array<[RegExp, AgentRole[]]> = [
  [/post|kontent|matn|e[‘'ʼ]?lon|пост|текст|content|caption/i, ["copywriter", "editor", "translator", "publisher"]],
  [/video|reels|rolik|tiktok|видео|ролик/i, ["video"]],
  [/rasm|dizayn|banner|muqova|картин|дизайн|image|cover/i, ["designer"]],
  [/mijoz|reklama|auditoriya|qayerda|клиент|реклам|аудитор|customer|audience|ads?\b/i, ["radar"]],
];

export function guessRoles(task: string): AgentRole[] {
  const roles = new Set<AgentRole>();
  for (const [re, rs] of KEYWORDS) if (re.test(task)) rs.forEach((r) => roles.add(r));
  if (!roles.size) ["copywriter", "editor", "translator", "publisher"].forEach((r) => roles.add(r as AgentRole));
  return [...roles];
}

/** Owner's task -> node graph of AI employees (the strategist decides who works). */
export async function planFlow(brand: BrandProfile | null, task: string): Promise<Omit<Flow, "id">> {
  let title = clip(task, 60);
  let roles: AgentRole[] = guessRoles(task);
  const notes: Record<string, string> = {};
  try {
    const plan = await llmJson({
      schema: PlanSchema,
      system: SYSTEM,
      prompt: `${brand ? `Business: ${brand.dna.name} — ${brand.dna.oneLiner}\n` : ""}Task from the owner: ${task}`,
      model: MODEL_FAST,
      effort: "low",
      maxTokens: 2000,
      timeoutMs: 20_000,
    });
    if (plan.roles.length) roles = plan.roles;
    if (plan.title.trim()) title = plan.title.trim();
    for (const n of plan.notes) notes[n.role] = n.task;
  } catch (err) {
    console.warn("[uslub/planner] fallback to keyword plan:", err instanceof Error ? err.message : err);
  }
  return { title, ...buildFlowGraph(roles, notes, task) };
}
