"use client";

/**
 * The owner's path, as one resumable pipeline:
 *   brand (channel or description) + analysis of the pasted channel
 *   -> weekly plan (streamed) -> posts written from the first plan slots -> a picture per post.
 * Each step keeps its result, so "Qayta urinish" resumes from the step that failed.
 * No sample data unless the page was opened with ?mock=1.
 */
import type { BrandProfile, ChannelAudit, ContentPlan, PlanItem, PostDraft, PostImage, Script, Strategy } from "@/lib/uslub/contract";
import { create } from "zustand";
import { COPY } from "../ui/copy";
import { useLang, type Lang } from "../ui/lang";
import * as api from "./api";
import type { Fail } from "./api";
import { sampleAudit, sampleBrand, samplePlan, samplePosts } from "./sample";

export type Phase = "start" | "working" | "ready" | "reopening";
export type Mode = "channel" | "fresh";
export type Tab = "channel" | "posts" | "video";
export type StepKey = "read" | "voice" | "photos" | "plan" | "posts" | "images";
export type StepStatus = "wait" | "run" | "done" | "fail" | "skip";
/** t0/t1: when the step started and finished (ms), for "how long it took" in Professional rejim. */
export type Step = { key: StepKey; status: StepStatus; n?: number; m?: number; t0?: number; t1?: number };

/** How many plan slots become posts in one run (the posts route takes up to 7). */
export const POSTS_PER_RUN = 5;
const IMAGE_POLL_MS = 4000;
const IMAGE_POLL_LIMIT_MS = 4 * 60_000;

export interface Problem {
  message: string;
  code: string;
}

interface Input {
  channel?: string; // bare username
  knowledge?: string;
  photos?: string[]; // data: URLs (fresh mode)
}

interface StudioState {
  phase: Phase;
  mode: Mode;
  sample: boolean;
  bot: string;
  /** How the start screen opens: from ?mode=fresh, ?channel= (sample mode) or an empty channel. */
  entry: { view: "link" | "fresh"; channel: string };
  input: Input;
  brand: BrandProfile | null;
  postsRead: number | null;
  audit: ChannelAudit | null;
  auditProblem: Problem | null;
  strategy: Strategy | null;
  launch: api.Launch | null;
  /** How much real data stood behind each part of the plan (Brain v2), for Professional rejim. */
  sufficiency: api.Sufficiency[] | null;
  plan: ContentPlan | null;
  planProgress: { n: number; m: number } | null;
  posts: PostDraft[];
  steps: Step[];
  startedAt: number;
  problem: Problem | null;
  /** The pasted channel turned out empty or private: the start screen opens the description form. */
  emptyChannel: string | null;
  tab: Tab;
  edited: Record<string, Partial<Record<Script, string>>>;
  busy: Record<string, "approve" | "publish" | undefined>;
  postNote: Record<string, { text: string; href?: string; link?: string; tone: "ok" | "bad" } | undefined>;
  /** The script the post list shows (one switch for all cards); null = follow the page language. */
  postScript: Script | null;
  /** Plan slots ("day time") whose post is being written on request. */
  writingSlot: Record<string, boolean>;

  /** Professional rejim: the full lamp panel, the strategy and plan details. Off = the simple path. */
  pro: boolean;
  setPro: (v: boolean) => void;
  configure: (o: { bot: string }) => void;
  setPostScript: (s: Script) => void;
  writeSlot: (item: PlanItem) => Promise<void>;
  startChannel: (channel: string) => void;
  startFresh: (input: { knowledge: string; channel?: string; photos?: string[] }) => void;
  retry: () => void;
  reset: () => void;
  reopen: (brandId: string) => Promise<void>;
  rebuildPlan: () => Promise<void>;
  reloadAudit: () => Promise<void>;
  setTab: (t: Tab) => void;
  editPost: (id: string, script: Script, text: string) => void;
  approve: (id: string) => Promise<void>;
  publish: (id: string, script: Script) => Promise<void>;
  retryImage: (id: string) => Promise<void>;
}

const lang = (): Lang => useLang.getState().lang;
const copy = () => COPY[lang()];

/** Owner-safe text for a failed call: the server's own sentence when it sent one. */
export function problemOf(f: Fail): Problem {
  const c = copy();
  if (f.code === "network") return { code: f.code, message: c.error.network };
  if (f.code === "timeout") return { code: f.code, message: c.error.timeout };
  if (f.error && f.code !== "internal" && !/^(internal error|http \d+)$/i.test(f.error)) return { code: f.code, message: f.error };
  return { code: f.code, message: c.error.generic };
}

const isEmptyChannel = (f: Fail) => f.code === "channel_empty";
/** The route is not deployed yet (images session's endpoints before their merge). */
const missingRoute = (f: Fail) => f.status === 404 && f.code !== "brand_not_found" && f.code !== "post_not_found";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A plan slot's identity, shared by the plan row and the post written from it. */
export const slotKey = (s: { day: string; time: string }) => `${s.day} ${s.time}`;

function stepsFor(mode: Mode, hasPhotos: boolean): Step[] {
  const keys: StepKey[] = ["read", "voice"];
  if (mode === "fresh" && hasPhotos) keys.push("photos");
  keys.push("plan", "posts", "images");
  return keys.map((key) => ({ key, status: "wait" }));
}

/** Keeps ?brand=<id> in the address bar so a reload (or the bot's link) reopens the same work. */
function rememberBrand(id: string | null) {
  if (typeof window === "undefined") return;
  const u = new URL(window.location.href);
  if (id) u.searchParams.set("brand", id);
  else u.searchParams.delete("brand");
  u.searchParams.delete("channel");
  window.history.replaceState(null, "", u.toString());
}

let runId = 0;
let visualRun: Promise<"ok" | "none"> | null = null;
let pollRun = 0;

export const useStudio = create<StudioState>((set, get) => {
  const step = (key: StepKey, patch: Partial<Step>) =>
    set({
      steps: get().steps.map((s) => {
        if (s.key !== key) return s;
        const next = { ...s, ...patch };
        if (patch.status === "run" && s.status !== "run") next.t0 = Date.now();
        if (patch.status === "done" && s.status !== "done") next.t1 = Date.now();
        return next;
      }),
    });

  const fail = (key: StepKey, f: Fail) => {
    step(key, { status: "fail" });
    set({ problem: problemOf(f) });
  };

  const setPostImage = (id: string, image: PostImage) =>
    set({ posts: get().posts.map((p) => (p.id === id ? { ...p, image } : p)) });

  const countImages = () => {
    const ps = get().posts;
    const ready = ps.filter((p) => p.image?.status === "ready").length;
    const open = ps.filter((p) => p.image && (p.image.status === "queued" || p.image.status === "running")).length;
    step("images", { n: ready, m: ps.length, status: open ? "run" : ready ? "done" : get().steps.find((s) => s.key === "images")?.status });
  };

  /** Learns the picture style once per brand (channel photos and/or the owner's photos). */
  const learnStyle = (brandId: string, photos?: string[]) => {
    if (!visualRun) {
      visualRun = api.learnVisual(brandId, photos, lang()).then((r) => (r.ok ? "ok" : "none"));
    }
    return visualRun;
  };

  /** Starts a picture for every post that has none, then polls until all are ready or failed. */
  const pictures = async (my: number) => {
    const posts = get().posts.filter((p) => !p.image || p.image.status === "failed");
    if (!posts.length && !get().posts.some((p) => p.image?.status === "queued" || p.image?.status === "running")) {
      countImages();
      return;
    }
    step("images", { status: "run", n: 0, m: get().posts.length });
    for (const p of posts) {
      const r = await api.startPostImage(p.id, lang());
      if (my !== runId) return;
      if (!r.ok) {
        if (missingRoute(r)) {
          // Pictures are not available on this server yet: say nothing rather than pretend.
          step("images", { status: "skip" });
          return;
        }
        setPostImage(p.id, { status: "failed", refsUsed: 0, error: problemOf(r).message });
        continue;
      }
      setPostImage(p.id, r.data.image);
    }
    countImages();
    void poll(my);
  };

  const poll = async (my: number) => {
    const mine = ++pollRun;
    const until = Date.now() + IMAGE_POLL_LIMIT_MS;
    while (Date.now() < until) {
      await sleep(IMAGE_POLL_MS);
      if (my !== runId || mine !== pollRun) return;
      const open = get().posts.filter((p) => p.image && (p.image.status === "queued" || p.image.status === "running"));
      if (!open.length) break;
      await Promise.all(
        open.map(async (p) => {
          const r = await api.getPostImage(p.id, lang());
          if (r.ok && my === runId) setPostImage(p.id, r.data.image);
        }),
      );
      countImages();
    }
    countImages();
  };

  /** Plan -> posts -> pictures, resuming from what is already there. */
  const fromPlan = async (my: number) => {
    const s = get();
    const brand = s.brand!;
    if (!s.plan) {
      step("plan", { status: "run" });
      const r = await api.buildStrategy(brand.id, lang(), (e) => {
        if (my !== runId) return;
        if (e.stage === "skeleton" && Array.isArray(e.slots)) {
          set({ planProgress: { n: 0, m: e.slots.length } });
          step("plan", { n: 0, m: e.slots.length });
        } else if (e.stage === "item") {
          const p = get().planProgress;
          if (p) {
            set({ planProgress: { ...p, n: Math.min(p.n + 1, p.m) } });
            step("plan", { n: Math.min(p.n + 1, p.m), m: p.m });
          }
        }
      });
      if (my !== runId) return;
      if (!r.ok) return fail("plan", r);
      set({
        plan: r.data.plan,
        strategy: r.data.strategy,
        launch: r.data.launch?.tactics?.length ? r.data.launch : null,
        sufficiency: Array.isArray(r.data.sufficiency) ? r.data.sufficiency : null,
      });
      step("plan", { status: "done", n: r.data.plan.items.length });
    }

    if (!get().posts.length) {
      const items = get().plan!.items.slice(0, POSTS_PER_RUN);
      step("posts", { status: "run", n: items.length });
      const r = await api.writePosts(brand.id, items.map(api.slotOf), lang());
      if (my !== runId) return;
      if (!r.ok) return fail("posts", r);
      set({ posts: r.data.posts });
      step("posts", { status: "done", n: r.data.posts.length });
    }

    set({ phase: "ready", tab: "posts", problem: null });
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
    // Pictures wait for the style; without one the picture route decides what it can do.
    await learnStyle(brand.id, get().input.photos);
    if (my !== runId) return;
    void pictures(my);
  };

  /** The whole run, from whatever step is missing. */
  const run = async () => {
    const my = ++runId;
    const s = get();
    set({ phase: "working", problem: null });

    if (s.sample) return runSample(my);

    if (!s.brand) {
      const L = lang();
      const ch = s.input.channel;
      step("read", { status: "run" });
      step("voice", { status: "run" });
      const brandP =
        s.mode === "channel"
          ? api.createBrand({ channel: `@${ch}`, lang: L })
          : api.createBrand({ mode: "fresh", knowledge: s.input.knowledge, channel: ch ? `@${ch}` : undefined, lang: L });
      // The analysis needs no brand: it reads the pasted channel directly, in parallel.
      const auditP = s.mode === "channel" && ch && !s.audit ? api.analyzeChannel(`@${ch}`, L) : null;

      if (auditP) {
        void auditP.then((a) => {
          if (my !== runId) return;
          if (a.ok) {
            set({ audit: a.data.audit, auditProblem: null });
            if (get().postsRead == null) {
              set({ postsRead: a.data.audit.postsAnalyzed });
              step("read", { status: "done", n: a.data.audit.postsAnalyzed });
            }
          } else if (!isEmptyChannel(a)) set({ auditProblem: problemOf(a) });
        });
      }

      const b = await brandP;
      if (my !== runId) return;
      if (!b.ok) {
        if (isEmptyChannel(b) && ch) return toEmptyChannel(ch);
        // The analysis may still tell us the channel is empty.
        const a = auditP ? await auditP : null;
        if (my !== runId) return;
        if (a && !a.ok && isEmptyChannel(a) && ch) return toEmptyChannel(ch);
        step("read", { status: get().postsRead != null ? "done" : "fail" });
        return fail("voice", b);
      }
      const read = b.data.channelInfo?.postsRead ?? get().postsRead;
      set({ brand: b.data.brand, postsRead: read ?? null });
      rememberBrand(b.data.brand.id);
      step("read", { status: "done", n: read ?? undefined });
      step("voice", { status: "done" });

      if (s.mode === "fresh" && s.input.photos?.length) {
        step("photos", { status: "run" });
        const v = await learnStyle(b.data.brand.id, s.input.photos);
        if (my !== runId) return;
        step("photos", { status: v === "ok" ? "done" : "skip" });
      } else void learnStyle(b.data.brand.id);
    }
    await fromPlan(my);
  };

  const toEmptyChannel = (channel: string) => {
    set({ phase: "start", emptyChannel: channel, mode: "fresh", steps: [], problem: null, brand: null, audit: null, postsRead: null });
  };

  const runSample = async (my: number) => {
    const L = lang();
    const seq: [StepKey, Partial<Step>][] = [
      ["read", { status: "done", n: 60 }],
      ["voice", { status: "done" }],
      ["plan", { status: "done", n: 7 }],
      ["posts", { status: "done", n: POSTS_PER_RUN }],
    ];
    for (const [k, patch] of seq) {
      step(k, { status: "run", ...(k === "posts" ? { n: POSTS_PER_RUN } : {}) });
      await sleep(550);
      if (my !== runId) return;
      step(k, patch);
    }
    step("images", { status: "skip" });
    set({
      brand: sampleBrand(L),
      audit: sampleAudit(L),
      plan: samplePlan(L),
      posts: samplePosts(L),
      postsRead: 60,
      phase: "ready",
      tab: "posts",
    });
  };

  return {
    phase: "start",
    mode: "channel",
    sample: false,
    bot: "hackathonproj1_bot",
    entry: { view: "link", channel: "" },
    input: {},
    brand: null,
    postsRead: null,
    audit: null,
    auditProblem: null,
    strategy: null,
    launch: null,
    sufficiency: null,
    plan: null,
    planProgress: null,
    posts: [],
    steps: [],
    startedAt: 0,
    problem: null,
    emptyChannel: null,
    tab: "posts",
    edited: {},
    busy: {},
    postNote: {},
    postScript: null,
    writingSlot: {},
    pro: false,

    setPro: (pro) => {
      set({ pro });
      try {
        localStorage.setItem("mercat.pro", pro ? "1" : "0");
      } catch {
        /* private mode: lasts for this page */
      }
    },

    configure: ({ bot }) => {
      const p = new URLSearchParams(window.location.search);
      let pro = false;
      try {
        pro = localStorage.getItem("mercat.pro") === "1";
      } catch {
        /* ignore */
      }
      set({ bot, pro, sample: api.sampleMode(), entry: { view: p.get("mode") === "fresh" ? "fresh" : "link", channel: "" } });
    },

    setPostScript: (postScript) => set({ postScript }),

    /** Writes the post for one more plan slot (the run writes only the first few). */
    writeSlot: async (item) => {
      const brand = get().brand;
      if (!brand || get().sample) return;
      const key = slotKey(item);
      const my = runId;
      set({ writingSlot: { ...get().writingSlot, [key]: true }, problem: null });
      const r = await api.writePosts(brand.id, [api.slotOf(item)], lang());
      set({ writingSlot: { ...get().writingSlot, [key]: false } });
      if (my !== runId) return;
      if (!r.ok) {
        set({ problem: problemOf(r) });
        return;
      }
      set({ posts: [...get().posts, ...r.data.posts] });
      void pictures(my);
    },

    startChannel: (channel) => {
      visualRun = null;
      set({
        mode: "channel",
        input: { channel },
        brand: null,
        audit: null,
        auditProblem: null,
        plan: null,
        strategy: null,
    launch: null,
    sufficiency: null,
        planProgress: null,
        posts: [],
        postsRead: null,
        emptyChannel: null,
        edited: {},
        postNote: {},
        steps: stepsFor("channel", false),
        startedAt: Date.now(),
      });
      void run();
    },

    startFresh: ({ knowledge, channel, photos }) => {
      visualRun = null;
      set({
        mode: "fresh",
        input: { knowledge, channel, photos },
        brand: null,
        audit: null,
        auditProblem: null,
        plan: null,
        strategy: null,
    launch: null,
    sufficiency: null,
        planProgress: null,
        posts: [],
        postsRead: null,
        edited: {},
        postNote: {},
        steps: stepsFor("fresh", !!photos?.length),
        startedAt: Date.now(),
      });
      void run();
    },

    retry: () => {
      set({
        steps: get().steps.map((s) => (s.status === "fail" ? { ...s, status: "wait" } : s)),
        startedAt: Date.now(),
      });
      void run();
    },

    reset: () => {
      runId++;
      pollRun++;
      visualRun = null;
      rememberBrand(null);
      set({
        phase: "start",
        mode: "channel",
        input: {},
        brand: null,
        audit: null,
        auditProblem: null,
        plan: null,
        strategy: null,
    launch: null,
    sufficiency: null,
        planProgress: null,
        posts: [],
        postsRead: null,
        steps: [],
        problem: null,
        emptyChannel: null,
        edited: {},
        busy: {},
        postNote: {},
      });
    },

    reopen: async (brandId) => {
      const my = ++runId;
      set({ phase: "reopening", problem: null });
      const L = lang();
      const [b, p] = await Promise.all([api.getBrand(brandId, L), api.listPosts(brandId, L)]);
      if (my !== runId) return;
      if (!b.ok) {
        set({ phase: "start", problem: problemOf(b) });
        rememberBrand(null);
        return;
      }
      const brand = b.data.brand;
      const mode: Mode = brand.mode === "fresh" ? "fresh" : "channel";
      const posts = p.ok ? p.data.posts.slice(0, 12) : [];
      set({
        brand,
        mode,
        input: { channel: brand.channel?.replace(/^@/, "") },
        posts,
        phase: "ready",
        tab: posts.length ? "posts" : "channel",
        steps: stepsFor(mode, false).map((s) => (s.key === "read" || s.key === "voice" || (s.key === "posts" && posts.length) ? { ...s, status: "done" } : s)),
      });
      if (mode === "channel" && brand.channel) {
        void api.analyzeChannel(brand.channel, L).then((a) => {
          if (my !== runId) return;
          if (a.ok) set({ audit: a.data.audit, auditProblem: null });
          else set({ auditProblem: problemOf(a) });
        });
      }
      if (posts.some((x) => x.image && (x.image.status === "queued" || x.image.status === "running"))) void poll(my);
    },

    rebuildPlan: async () => {
      const brand = get().brand;
      if (!brand) return;
      const my = runId;
      set({ planProgress: { n: 0, m: 0 }, auditProblem: get().auditProblem });
      step("plan", { status: "run" });
      const r = await api.buildStrategy(brand.id, lang(), (e) => {
        if (e.stage === "skeleton" && Array.isArray(e.slots)) set({ planProgress: { n: 0, m: e.slots.length } });
        else if (e.stage === "item") {
          const p = get().planProgress;
          if (p) set({ planProgress: { ...p, n: Math.min(p.n + 1, p.m || p.n + 1) } });
        }
      });
      if (my !== runId) return;
      if (!r.ok) {
        step("plan", { status: "fail" });
        set({ planProgress: null, problem: problemOf(r) });
        return;
      }
      set({ plan: r.data.plan, strategy: r.data.strategy, launch: r.data.launch?.tactics?.length ? r.data.launch : null, planProgress: null, problem: null });
      step("plan", { status: "done", n: r.data.plan.items.length });
    },

    reloadAudit: async () => {
      const channel = get().brand?.channel ?? (get().input.channel ? `@${get().input.channel}` : null);
      if (!channel) return;
      const my = runId;
      set({ auditProblem: null });
      const a = await api.analyzeChannel(channel, lang());
      if (my !== runId) return;
      if (a.ok) set({ audit: a.data.audit });
      else set({ auditProblem: problemOf(a) });
    },

    setTab: (tab) => set({ tab }),

    editPost: (id, script, text) => {
      set({
        posts: get().posts.map((p) => (p.id === id ? { ...p, variants: { ...p.variants, [script]: text } } : p)),
        edited: { ...get().edited, [id]: { ...get().edited[id], [script]: text } },
      });
    },

    approve: async (id) => {
      const note = (v: StudioState["postNote"][string]) => set({ postNote: { ...get().postNote, [id]: v } });
      const busy = (v: "approve" | undefined) => set({ busy: { ...get().busy, [id]: v } });
      if (get().sample) {
        set({ posts: get().posts.map((p) => (p.id === id ? { ...p, status: "approved", approvedAt: new Date().toISOString() } : p)) });
        return;
      }
      busy("approve");
      note(undefined);
      const r = await api.approvePost(id, lang(), get().edited[id]);
      busy(undefined);
      if (!r.ok) {
        note({ text: problemOf(r).message || copy().posts.approveError, tone: "bad" });
        return;
      }
      const server = r.data.post;
      set({
        posts: get().posts.map((p) =>
          p.id === id
            ? { ...p, ...server, variants: { ...server.variants, ...get().edited[id] }, image: server.image ?? p.image, status: server.status === "draft" ? "approved" : server.status }
            : p,
        ),
      });
    },

    publish: async (id, script) => {
      const busy = (v: "publish" | undefined) => set({ busy: { ...get().busy, [id]: v } });
      const note = (v: StudioState["postNote"][string]) => set({ postNote: { ...get().postNote, [id]: v } });
      const chat = get().brand?.channel ?? (get().input.channel ? `@${get().input.channel}` : "");
      if (!chat) {
        // A brand from a description with no channel yet: the bot asks for the channel and publishes.
        note({ text: copy().posts.noChannel, href: api.botPublishUrl(get().bot, id), tone: "bad", link: copy().posts.openBot });
        return;
      }
      busy("publish");
      note(undefined);
      const r = await api.publishPost(id, script, chat, lang());
      busy(undefined);
      if (r.ok && r.data.ok) {
        set({ posts: get().posts.map((p) => (p.id === id ? { ...p, status: "published", publishedUrl: r.data.url } : p)) });
        note({ text: copy().posts.published, href: r.data.url, tone: "ok" });
        return;
      }
      const msg = r.ok ? r.data.error ?? copy().error.generic : problemOf(r).message;
      const admin = r.ok ? r.data.addAdminUrl : r.addAdminUrl;
      note({ text: msg, href: admin, tone: "bad" });
    },

    retryImage: async (id) => {
      const my = runId;
      setPostImage(id, { status: "queued", refsUsed: 0 });
      const r = await api.startPostImage(id, lang());
      if (my !== runId) return;
      if (!r.ok) {
        setPostImage(id, { status: "failed", refsUsed: 0, error: problemOf(r).message });
        return;
      }
      setPostImage(id, r.data.image);
      void poll(my);
    },
  };
});
