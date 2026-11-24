
import type { BrandProfile, ChannelAudit, ContentPlan, Flow, NodeKind, NodeStatus, PostDraft, RadarLead, Script, Strategy, VideoPlan } from "@/lib/uslub/contract";
import { create } from "zustand";
import * as api from "./api";
import type { Source } from "./api";
import { MOCK_BRAND, mockPlan } from "./mocks";

export type View = "delegate" | "analysis" | "strategy" | "team" | "brand" | "radar" | "video" | "rules";

export type RuleKey = "routine" | "promo" | "prices" | "video" | "first";
export const RULES: { key: RuleKey; name: string; hint: string }[] = [
  { key: "routine", name: "Oddiy postlar", hint: "Maslahat, yangi mahsulot, mijoz obrazi" },
  { key: "promo", name: "Aksiya va chegirmalar", hint: "Foiz, «Black Friday», muddatli takliflar" },
  { key: "prices", name: "Narxlar", hint: "Matnda so'm yoki narx bor" },
  { key: "video", name: "Video", hint: "Reels va TikTok" },
  { key: "first", name: "Birinchi 5 post", hint: "Yangi brend ovozini siz tekshirasiz" },
];

export type ItemState = "waiting" | "approved" | "published" | "scheduled";

export interface InboxItem {
  id: string;
  type: "post" | "video";
  title: string;
  postId?: string;
  reasons: RuleKey[]; // rules that require approval for this item
  state: ItemState;
  url?: string;
}

type Sens = { sensitivity?: { sensitive: boolean; reasons: string[] } };
const SENS_MAP: Record<string, RuleKey> = { promo: "promo", price: "prices", video: "video", first_posts: "first" };

export function classify(post: PostDraft): RuleKey[] {
  const sens = (post as PostDraft & Sens).sensitivity;
  if (sens) {
    const r = sens.reasons.map((x) => SENS_MAP[x]).filter(Boolean).filter((x) => x !== "first");
    return r.length ? r : ["routine"];
  }
  const t = post.variants.uz_latn + " " + post.brief;
  const r: RuleKey[] = [];
  if (/%|chegirma|black friday|aksiya/i.test(t)) r.push("promo");
  if (/so'm|so‘m|\d{3}\s?000/i.test(t)) r.push("prices");
  if (r.length === 0) r.push("routine");
  return r;
}

type Status = Record<string, NodeStatus>;

interface StudioState {
  view: View;
  brand: BrandProfile;
  posts: PostDraft[];
  leads: RadarLead[];
  video: VideoPlan | null;
  audit: ChannelAudit | null;
  strategy: Strategy | null;
  plan: ContentPlan | null;
  flow: Flow | null;
  status: Status;
  selected: string | null;
  running: boolean;
  elapsed: number;
  sources: Partial<Record<"brand" | "posts" | "radar" | "video" | "plan" | "audit" | "strategy", Source>>;
  inbox: InboxItem[];
  reviewing: string | null; // post id
  notice: string | null;
  autopilot: Record<RuleKey, boolean>; // true = may publish without approval
  publishedCount: number;
  setView: (v: View) => void;
  select: (id: string | null) => void;
  review: (postId: string | null) => void;
  setRule: (k: RuleKey, v: boolean) => void;
  updatePost: (id: string, script: Script, text: string, humanScore?: number) => void;
  setItem: (id: string, patch: Partial<InboxItem>) => void;
  setKnowledge: (k: string) => void;
  run: (task: string) => Promise<void>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Longest-path layering, used for both the run order and the canvas layout. */
export function layers(flow: Flow): string[][] {
  const depth: Record<string, number> = {};
  const incoming = (id: string) => flow.edges.filter((e) => e.to === id).map((e) => e.from);
  const visit = (id: string, seen: Set<string>): number => {
    if (depth[id] !== undefined) return depth[id];
    if (seen.has(id)) return 0;
    seen.add(id);
    const d = Math.max(-1, ...incoming(id).map((p) => visit(p, seen))) + 1;
    depth[id] = d;
    return d;
  };
  flow.nodes.forEach((n) => visit(n.id, new Set()));
  const out: string[][] = [];
  flow.nodes.forEach((n) => {
    (out[depth[n.id]] ??= []).push(n.id);
  });
  return out.filter(Boolean);
}

function needsApproval(reasons: RuleKey[], auto: Record<RuleKey, boolean>, publishedCount: number) {
  const blocking = reasons.filter((r) => !auto[r]);
  if (publishedCount < 5 && !auto.first) blocking.push("first");
  return blocking;
}

export function buildInbox(posts: PostDraft[], video: VideoPlan | null, auto: Record<RuleKey, boolean>, publishedCount: number): InboxItem[] {
  const items: InboxItem[] = posts.map((p) => {
    const blocking = needsApproval(classify(p), auto, publishedCount);
    return {
      id: `i-${p.id}`,
      type: "post",
      postId: p.id,
      title: p.brief,
      reasons: blocking,
      state: blocking.length ? "waiting" : "scheduled",
    };
  });
  if (video) {
    const blocking = needsApproval(["video"], auto, publishedCount);
    items.push({ id: "i-video", type: "video", title: "Reels: " + video.hook, reasons: blocking, state: blocking.length ? "waiting" : "scheduled" });
  }
  return items;
}

/** Which data source feeds each employee's output (for the "namuna" badge). */
export const KIND_SOURCE: Partial<Record<NodeKind, "brand" | "posts" | "radar" | "video" | "audit" | "strategy">> = {
  brand: "brand",
  analyst: "audit",
  strategist: "strategy",
  copywriter: "posts",
  editor: "posts",
  translator: "posts",
  designer: "posts",
  video: "video",
  radar: "radar",
};

function resultLabel(kind: NodeKind, s: StudioState): string | null {
  if (kind === "brand") return s.brand.dna.name ? `${s.brand.dna.name}: DNK` : "Brend DNK";
  if (kind === "analyst" && s.audit) return `${s.audit.postsAnalyzed} ta post tahlili`;
  if (kind === "strategist" && s.plan) return `${s.plan.items.length} kunlik reja`;
  if (kind === "copywriter") return `${s.posts.length} ta post`;
  if (kind === "editor") {
    const avg = s.posts.length ? Math.round(s.posts.reduce((a, p) => a + p.humanScore, 0) / s.posts.length) : 0;
    return avg ? `Inson bali ${avg}` : null;
  }
  if (kind === "radar") return `${s.leads.length} ta joy`;
  if (kind === "video" && s.video) return `${s.video.scenes.reduce((a, x) => a + x.seconds, 0)} soniyalik Reels`;
  return null;
}

let runId = 0;

export const useStudio = create<StudioState>((set, get) => ({
  view: "delegate",
  brand: MOCK_BRAND,
  posts: [],
  leads: [],
  video: null,
  audit: null,
  strategy: null,
  plan: null,
  flow: null,
  status: {},
  selected: null,
  running: false,
  elapsed: 0,
  sources: {},
  inbox: [],
  reviewing: null,
  notice: null,
  autopilot: { routine: true, promo: false, prices: false, video: false, first: false },
  publishedCount: 0,
  setView: (view) => set({ view }),
  select: (selected) => set({ selected }),
  review: (reviewing) => set({ reviewing }),
  setRule: (k, v) => {
    const autopilot = { ...get().autopilot, [k]: v };
    const { posts, video, publishedCount, inbox } = get();
    const fresh = buildInbox(posts, video, autopilot, publishedCount);
    // keep decisions the owner already made
    const merged = fresh.map((f) => {
      const old = inbox.find((o) => o.id === f.id);
      return old && (old.state === "approved" || old.state === "published") ? { ...f, state: old.state, url: old.url } : f;
    });
    set({ autopilot, inbox: merged });
  },
  updatePost: (id, script, text, humanScore) =>
    set({
      posts: get().posts.map((p) =>
        p.id === id
          ? {
              ...p,
              variants: { ...p.variants, [script]: text },
              neuroHits: {
                ...p.neuroHits,
                [script]: (p.neuroHits[script] ?? [])
                  .filter((h) => text.includes(h.phrase))
                  .map((h) => ({ ...h, index: text.indexOf(h.phrase) })),
              },
              humanScore: humanScore ?? p.humanScore,
            }
          : p,
      ),
    }),
  setItem: (id, patch) => {
    const inbox = get().inbox.map((i) => (i.id === id ? { ...i, ...patch } : i));
    const publishedCount = inbox.filter((i) => i.state === "published").length;
    set({ inbox, publishedCount });
  },
  setKnowledge: (knowledge) => set({ brand: { ...get().brand, knowledge } }),

  run: async (task) => {
    const my = ++runId;
    const alive = () => my === runId;
    const start = Date.now();
    set({ running: true, elapsed: 0, flow: null, status: {}, selected: null, inbox: [], view: "delegate", notice: null });
    const tick = setInterval(() => alive() && set({ elapsed: (Date.now() - start) / 1000 }), 100);

    const channel = task.match(/(?:t\.me\/|@)([A-Za-z0-9_]{4,32})/)?.[1];
    // Channel onboarding uses the fixed "Bir havola" graph so it draws instantly;
    // free-text tasks ask the strategist (POST /plan) for a graph.
    const planP = channel
      ? Promise.resolve({ data: mockPlan(task), source: "mock" as Source })
      : get().sources.brand === "live"
        ? api.planFlow(get().brand.id, task)
        : Promise.resolve({ data: mockPlan(task), source: "mock" as Source });
    const brandP = channel ? api.createBrand({ channel: "@" + channel }) : Promise.resolve({ data: get().brand, source: get().sources.brand ?? ("mock" as Source) });

    const plan = await planP;
    if (!alive()) return clearInterval(tick);
    const flow = plan.data;
    const st: Status = Object.fromEntries(flow.nodes.map((n) => [n.id, "idle" as NodeStatus]));
    set({ flow, status: st, sources: { ...get().sources, plan: plan.source } });

    const kinds = new Set(flow.nodes.map((n) => n.kind));
    const brand = await brandP;
    const brandId = brand.data.id;
    set({ brand: brand.data, sources: { ...get().sources, brand: brand.source } });
    if (channel && brand.source === "mock") {
      const err = (brand as { error?: string }).error;
      const why = err && !/^HTTP|mock mode|abort/i.test(err) ? `${err} ` : "";
      set({ notice: `${why}Hozircha namuna ma’lumot bilan ko‘rsatyapmiz.` });
    }
    const postsP = kinds.has("copywriter") ? api.generatePosts(brandId, task, 2) : Promise.resolve(null);
    const radarP = kinds.has("radar") ? api.findLeads(brandId, task) : Promise.resolve(null);
    const videoP = kinds.has("video") ? api.planVideo(brandId, task) : Promise.resolve(null);
    const auditP = kinds.has("analyst") ? api.analyzeChannel(brand.data.channel ?? "") : Promise.resolve(null);
    const strategyP = kinds.has("strategist")
      ? auditP.then((a) => api.buildStrategy(brandId, a?.data, task))
      : Promise.resolve(null);

    const wait: Partial<Record<string, Promise<unknown>>> = { copywriter: postsP, radar: radarP, video: videoP, analyst: auditP, strategist: strategyP };
    const order = layers(flow);
    for (const layer of order) {
      if (!alive()) break;
      const ids = layer.filter((id) => {
        const k = flow.nodes.find((n) => n.id === id)!.kind;
        return k !== "publisher";
      });
      set({ status: { ...get().status, ...Object.fromEntries(ids.map((id) => [id, "running" as NodeStatus])) } });
      await Promise.all(
        ids.map(async (id, i) => {
          const node = flow.nodes.find((n) => n.id === id)!;
          await sleep(node.kind === "input" ? 600 : 1500 + i * 350 + Math.random() * 600);
          const pending = wait[node.kind];
          if (pending) await pending;
          if (!alive()) return;
          if (node.kind === "analyst") {
            const r = await auditP;
            if (r) set({ audit: r.data, sources: { ...get().sources, audit: r.source } });
          }
          if (node.kind === "strategist") {
            const r = await strategyP;
            if (r) set({ strategy: r.data.strategy, plan: r.data.plan, sources: { ...get().sources, strategy: r.source } });
          }
          if (node.kind === "copywriter") {
            const r = await postsP;
            if (r) set({ posts: r.data, sources: { ...get().sources, posts: r.source } });
          }
          if (node.kind === "radar") {
            const r = await radarP;
            if (r) set({ leads: r.data, sources: { ...get().sources, radar: r.source } });
          }
          if (node.kind === "video") {
            const r = await videoP;
            if (r) set({ video: r.data, sources: { ...get().sources, video: r.source } });
          }
          const label = resultLabel(node.kind, get());
          const cur = get().flow;
          if (label && cur) set({ flow: { ...cur, nodes: cur.nodes.map((x) => (x.id === id ? { ...x, label } : x)) } });
          set({ status: { ...get().status, [id]: node.kind === "approval" ? "needs_approval" : "done" } });
        }),
      );
    }
    clearInterval(tick);
    if (!alive()) return;
    const { posts, video, autopilot, publishedCount } = get();
    set({
      running: false,
      elapsed: (Date.now() - start) / 1000,
      inbox: buildInbox(kinds.has("copywriter") ? posts : [], kinds.has("video") ? video : null, autopilot, publishedCount),
    });
  },
}));
