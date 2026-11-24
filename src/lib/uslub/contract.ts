/**
 * Shared contract between the Studio UI (src/app/studio, src/components/**)
 * and the engine (src/lib/uslub/**, src/app/api/uslub/**).
 *
 * Product: Uslub AI (working name) — an AI marketing department for small
 * businesses in Uzbekistan. The owner delegates tasks to AI "employees";
 * the Studio shows their work as a node graph (ComfyUI-like) and nothing is
 * published without the owner's approval.
 *
 * Types only — safe to import from client and server code.
 */

/** Output scripts/languages. uz_cyrl is produced deterministically from uz_latn. */
export type Script = "uz_latn" | "uz_cyrl" | "ru" | "en";

/** AI employees of the department. */
export type AgentRole =
  | "brand" //      Brend xotirasi — knowledge base + brand DNA
  | "strategist" // Strateg — content plan / campaign from a task
  | "copywriter" // Kopirayter — posts in the brand's voice
  | "editor" //     Muharrir — anti "neuro-words" (AI cliché) filter
  | "translator" // Tarjimon — UZ Latin / UZ Cyrillic / RU / EN
  | "designer" //   Dizayner — covers and images
  | "video" //      Videograf — Reels/TikTok script + video
  | "publisher" //  SMM-menejer — Telegram now; Instagram/YouTube later
  | "radar"; //     Mijoz radar — where the customers are

export interface BrandDNA {
  name: string;
  oneLiner: string; // what the business does, in plain words
  audience: string;
  tone: string;
  address: "siz" | "sen" | "mixed" | "n/a";
  emojiDensity: "none" | "low" | "medium" | "high";
  avgPostLength: number; // characters
  ctaStyle: string;
  hashtags: string[];
  recurringFormats: string[];
  products: string[];
  doList: string[];
  dontList: string[];
  languages: Script[];
}

export interface BrandProfile {
  id: string;
  channel?: string; // public Telegram @username
  knowledge: string; // business info the owner pasted (products, prices, address, story)
  samplePosts: string[];
  dna: BrandDNA;
  createdAt: string; // ISO
}

/** A phrase that sounds machine-written ("neuro-word"). */
export interface NeuroHit {
  phrase: string;
  index: number;
  suggestion?: string;
}

export interface PostDraft {
  id: string;
  brandId: string;
  brief: string;
  variants: Record<Script, string>;
  neuroHits: Partial<Record<Script, NeuroHit[]>>; // clichés still present after editing
  humanScore: number; // 0-100, higher = sounds more human
  status: "draft" | "approved" | "published";
  publishedUrl?: string;
  createdAt: string;
}

export interface RadarLead {
  kind:
    | "telegram_channel"
    | "telegram_group"
    | "instagram"
    | "youtube"
    | "event"
    | "marketplace"
    | "website"
    | "other";
  name: string;
  url?: string;
  why: string; // why your customers are there
  audienceHint?: string; // e.g. "~45k subscribers" — only if sourced
  action: string; // e.g. "buy an ad post", "partner", "DM the admin"
}

export interface VideoPlan {
  hook: string; // first 2 seconds
  scenes: { seconds: number; visual: string; voiceover: string; caption: string }[];
  musicMood: string;
  videoUrl?: string; // filled when a provider renders it
}

/* ----------------------------------------------------------- node graph */

export type NodeKind = AgentRole | "input" | "approval";

export interface FlowNode {
  id: string;
  kind: NodeKind;
  label: string;
  config?: Record<string, unknown>;
}

export interface FlowEdge {
  from: string;
  to: string;
}

export interface Flow {
  id: string;
  title: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export type NodeStatus = "idle" | "running" | "done" | "error" | "needs_approval";

/* ------------------------------------------------------------------ API
 * All routes: POST JSON, respond JSON, never expose secrets.
 * Errors: { error: string } with a 4xx/5xx status.
 *
 * POST /api/uslub/brand    { channel?: string; knowledge?: string; samplePosts?: string[] }
 *                          -> { brand: BrandProfile }
 * GET  /api/uslub/brand?id= -> { brand: BrandProfile }
 * POST /api/uslub/posts    { brandId: string; brief: string; count?: number }   (count <= 5)
 *                          -> { posts: PostDraft[] }
 * POST /api/uslub/neuro    { text: string; script: Script }
 *                          -> { text: string; hits: NeuroHit[]; humanScore: number }
 * POST /api/uslub/radar    { brandId: string; goal?: string } -> { leads: RadarLead[] }
 * POST /api/uslub/video    { brandId: string; brief: string } -> { plan: VideoPlan }
 * POST /api/uslub/publish  { postId: string; script: Script; chat: string }  (chat = @channel)
 *                          -> { ok: boolean; url?: string; error?: string }
 * POST /api/uslub/plan     { brandId: string; task: string } -> { flow: Flow }
 *                          ("delegate a task": the strategist assembles a node graph)
 */

export type ApiError = { error: string };
