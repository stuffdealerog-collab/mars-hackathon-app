"use client";

/**
 * The owner's path, as one resumable pipeline:
 *   brand (channel or description) + analysis of the pasted channel
 *   -> weekly plan (streamed) -> posts written from the first plan slots -> a picture per post.
 * Each step keeps its result, so "Qayta urinish" resumes from the step that failed.
 * No sample data unless the page was opened with ?mock=1.
 */
import type { AgentRole, BrandProfile, ChannelAudit, ContentPlan, PlanItem, PostDraft, PostImage, Script, Strategy, VisualStyle } from "@/lib/uslub/contract";
import type { AutopilotState, BotAdminStatus } from "@/lib/autopilot/types";
import { weekHashForClient } from "@/lib/autopilot/week-hash";
import { create } from "zustand";
import { answersBody, type AnswerValues, type Question } from "../ui/answers";
import { COPY } from "../ui/copy";
import { fmt } from "../ui/format";
import { useLang, type Lang } from "../ui/lang";
import * as api from "./api";
import type { Fail } from "./api";
import { approvedPost, refreshedPost, withoutKey, type Edits } from "./approval";
import { latestBatch } from "./batch";
import { keepAudit, keepPlan, keptAudit, keptPlan, pickPlan, type KeptPlan } from "./keep";
import { askChannel, nextAsk, publishFailKind, retryAsk, type AdminAsk } from "./admin-ask";
import { defaultPro, safeTab, type Tab } from "./mode";
import { SAMPLE_CHANNEL, sampleAudit, sampleBrand, samplePlan, sampleQuestions, sampleWeek } from "./sample";
import { needsPicture, requeueOnApprove, weekPlan, type Schedule, type WeekPlan } from "./week";

export type Phase = "start" | "working" | "ready" | "reopening";
export type Mode = "channel" | "fresh";
export type { Tab } from "./mode";
export type ApproveResult = { ok: true } | { ok: false; message: string; undone?: boolean };
/** `code` is the server's stable error code (e.g. "publish_in_progress"), when it sent one. */
export type PublishResult = { ok: true; url?: string } | { ok: false; message: string; adminUrl?: string; botUrl?: string; code?: string };
export type RecentBrand = { id: string; name: string; channel?: string };
/** The add-the-bot card at a publish the bot could not make (admin-ask.ts): which post, which channel, where it stands. */
export type { AdminAsk } from "./admin-ask";
/**
 * The line under a post. `missing` (placeholder_left only): the scripts whose text still has a
 * blank, as the server named them, so the editor can open on the one that needs the fact.
 */
export type PostNote = { text: string; href?: string; link?: string; tone: "ok" | "bad" | "hint"; missing?: api.Missing[] };
export type StepKey = "read" | "voice" | "photos" | "plan" | "posts" | "images";
export type StepStatus = "wait" | "run" | "done" | "fail" | "skip";
/** t0/t1: when the step started and finished (ms), for "how long it took" in Professional rejim. */
export type Step = { key: StepKey; status: StepStatus; n?: number; m?: number; t0?: number; t1?: number };

/** How many plan slots become posts in one run (the posts route takes up to 7). */
export const POSTS_PER_RUN = 5;
const IMAGE_POLL_MS = 4000;
const IMAGE_POLL_LIMIT_MS = 4 * 60_000;

/**
 * «Haftani tasdiqlash» as it stands: sending; done (how many went in the queue, what stayed out and why, the bot's
 * add-to-channel link when it cannot post yet); changed (the week was another one by the time it reached the server:
 * the posts were read again, look and press again); continue (the server does not know this browser's owner: the
 * bot's week view carries on); failed.
 */
export type WeekState =
  | { state: "idle" }
  | { state: "sending" }
  | { state: "done"; queued: number; skipped: api.WeekSkipped[]; adminUrl?: string }
  | { state: "changed" }
  /** `code`: auth_required (this browser has no Telegram owner) or brand_unowned (nobody has claimed the channel yet). */
  | { state: "continue"; continueUrl: string; code?: string }
  | { state: "failed"; message: string };

/** The week's outcome in one sentence, for a toast (a post approved again through the week). */
export function weekMessage(w: WeekState): string {
  const c = copy().week;
  if (w.state === "changed") return c.changed;
  if (w.state === "failed") return w.message;
  if (w.state === "continue") return w.code === "brand_unowned" ? c.continueUnowned : c.continueText;
  return "";
}

/** The owner's questions (GET /api/uslub/answers): what the engine asks, and where the card stands. */
export type QuestionsState = {
  list: Question[];
  state: "idle" | "open" | "saving" | "saved" | "skipped" | "error";
  message?: string;
};

export type AutopilotView = AutopilotState & { trialDaysLeft?: number };

export interface Problem {
  message: string;
  code: string;
  /** A day limit (429): said calmly; "anonymous" also offers the bot, where the owner is known. */
  limit?: "app" | "anonymous";
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
  /** Spektr's beams are still travelling: every light (the panel, the hub, its spots) waits. */
  introGate: boolean;
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
  /** A reopen is asking the server for the brand's saved plan (and this device has none to show meanwhile). */
  planLoading: boolean;
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
  /** Under a post: done (ok), went wrong (bad), or a fact the owner still has to add (hint). */
  postNote: Record<string, PostNote | undefined>;
  /** The script the post list shows (one switch for all cards); null = follow the page language. */
  postScript: Script | null;
  /** Plan slots ("day time") whose post is being written on request. */
  writingSlot: Record<string, boolean>;
  /** Plan slots the run asked for but the writer left empty (partial success of POST /posts). */
  missed: PlanItem[];

  /**
   * A publish failed because the bot is not an admin of the owner's channel: the add-the-bot card
   * is open for that post, naming the channel. Null when there is nothing to ask.
   */
  adminAsk: AdminAsk | null;
  /** The owner opened the add-the-bot link from the card: publish again on the way back. */
  adminAdded: () => void;
  /** The card is closed («Keyinroq», ✕): the post keeps its note with the same link. */
  closeAdminAsk: () => void;
  /** Publishes the card's post once more (the owner is back, or pressed «Tayyor»). */
  retryAdminAsk: () => Promise<PublishResult | null>;
  /**
   * Measured results for the lamps ("3 post chiqdi"), when the engine or autopilot
   * supplies them; the lamps show them in place of their work-shaped captions. Empty until then.
   */
  outcomes: Partial<Record<AgentRole, string>>;
  /** Each queued, sent or stopped post's place in the publish queue (GET /api/uslub/autopilot), by post id. */
  schedule: Schedule;
  /** The brand's autopilot and its trial; null until the server said (or for a brand this browser cannot read). */
  autopilot: AutopilotView | null;
  /** Is the bot an admin of the channel (Telegram's my_chat_member), null until known. */
  botAdmin: BotAdminStatus | null;
  autopilotBusy: boolean;
  week: WeekState;
  /** Reads the queue, the autopilot and the bot's rights again (quiet on failure). */
  loadAutopilot: () => Promise<void>;
  /** The week as the screen shows it right now (what «Haftani tasdiqlash» would queue). */
  weekNow: (postIds?: string[]) => WeekPlan;
  /** Approving this post means putting it back in the queue (a changed post whose slot is still ahead). */
  requeues: (id: string) => boolean;
  /** Approves and queues the week on screen, or exactly `postIds` (one post approved again). */
  approveWeek: (postIds?: string[]) => Promise<WeekState>;
  /** Before the bot's week view opens (a web owner the server does not know): waiting approvals and edits leave. */
  handOverWeek: () => void;
  closeWeek: () => void;
  toggleAutopilot: (on: boolean) => Promise<{ ok: boolean; continueUrl?: string; message?: string }>;
  questions: QuestionsState;
  loadQuestions: () => Promise<void>;
  saveAnswers: (v: AnswerValues) => Promise<boolean>;
  skipQuestions: () => void;
  /** Posts being rewritten from the owner's phrase. */
  rewriting: Record<string, boolean>;
  rewrite: (id: string, instruction: string) => Promise<boolean>;
  /** Professional rejim: the full lamp panel, the strategy and plan details. Off = the simple path. */
  pro: boolean;
  setPro: (v: boolean) => void;
  /**
   * The one place that reads the page's own parameters: `?ui=pro|simple` (wins and is saved),
   * `?k=` (the bot's handoff key, saved and removed from the address bar), `?mock=1`.
   * `approveDelayMs`: the desktop Studio passes 4000 (Bekor qilish window), the Mini App nothing.
   */
  configure: (o: { bot: string; approveDelayMs?: number }) => void;
  approveDelayMs: number;
  /** Approvals waiting out their undo window (post id -> true). The post already shows approved. */
  pendingApprove: Record<string, true>;
  /** Ready right after a run (not a reopen): Kanal opens on the first-look summary. */
  justFinished: boolean;
  /** Grows on every successful approve and publish: the SMM-menejer lamp answers the owner's hand. */
  handTick: number;
  /** Sample: back to /studio without ?mock (a reset would run the next channel under the bakery). */
  newChannel: () => void;
  /** The Telegram account whose bot link key is on this device (user id), or null. */
  deviceKey: string | null;
  /** A shared computer: forget the bot's link key and the recent channels, back to the start. */
  signOutDevice: () => void;
  /** Re-reads the brand's posts (status, link, picture) after publishing through the bot. */
  refreshPosts: () => Promise<void>;
  undoApprove: (id: string) => void;
  /** Sends every waiting approval now (page hide, or publish of that post). */
  flushApprovals: () => void;
  /** Sends one post's waiting approval now (the bot link opens before the undo window ends). */
  flushApproval: (id: string) => Promise<void>;
  setPostScript: (s: Script) => void;
  writeSlot: (item: PlanItem) => Promise<void>;
  /** Writes the missed slots again, in one call. */
  writeMissed: () => Promise<void>;
  startChannel: (channel: string) => void;
  startFresh: (input: { knowledge: string; channel?: string; photos?: string[] }) => void;
  retry: () => void;
  reset: () => void;
  reopen: (brandId: string) => Promise<void>;
  rebuildPlan: () => Promise<void>;
  reloadAudit: () => Promise<void>;
  setTab: (t: Tab) => void;
  editPost: (id: string, script: Script, text: string) => void;
  /** `delayMs` defaults to `approveDelayMs`; the post shows approved at once and can be undone meanwhile. */
  approve: (id: string, delayMs?: number) => Promise<ApproveResult>;
  /** `chat`: the @channel the owner typed for a brand that has none yet (linked on this first publish). */
  publish: (id: string, script: Script, chat?: string) => Promise<PublishResult>;
  /** A picture card reports its post's picture (it starts, polls and regenerates on its own). */
  setImage: (id: string, image: PostImage) => void;
  /** The run is learning the picture style from the channel's (or the owner's) photos. */
  styleLearning: boolean;
  /** The style card reports a re-learned style (the owner added or removed photos). */
  styleChanged: (visual: VisualStyle) => void;
}

const lang = (): Lang => useLang.getState().lang;
const copy = () => COPY[lang()];

/** A day limit the owner cannot retry past today: the guests' share (web, no Telegram) or the whole app's. */
const limitOf = (f: Fail): Problem["limit"] =>
  f.code === "guest_limit" ? "anonymous" : f.code === "budget_exhausted" ? (f.scope === "anonymous" || f.scope === "anon" ? "anonymous" : "app") : undefined;

/** Owner-safe text for a failed call: the server's own sentence when it sent one. */
export function problemOf(f: Fail): Problem {
  const c = copy();
  const limit = limitOf(f);
  if (limit) return { code: f.code, message: limit === "anonymous" ? fmt(c.limit.guest, { bot: `@${useStudio.getState().bot}` }) : c.limit.app, limit };
  if (f.code === "network") return { code: f.code, message: c.error.network };
  if (f.code === "timeout") return { code: f.code, message: c.error.timeout };
  if (f.error && f.code !== "internal" && !/^(internal error|http \d+)$/i.test(f.error)) return { code: f.code, message: f.error };
  return { code: f.code, message: c.error.generic };
}

const isEmptyChannel = (f: Fail) => f.code === "channel_empty";
/** The route is not deployed yet (images session's endpoints before their merge). */
const missingRoute = (f: Fail) => f.status === 404 && f.code !== "brand_not_found" && f.code !== "post_not_found";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Approve/publish refuse a text that still has a blank ("Kod: [kod]") with this code. */
export const BLANK_LEFT = "placeholder_left";

/** The request may have done its work even though its answer never arrived. */
const lostAnswer = (f: Fail) => f.code === "timeout" || f.code === "network";

/** The plan items behind `failed[]` (its `index` points into the slots that were sent). */
const missedOf = (sent: PlanItem[], failed: api.MissedSlot[] | undefined): PlanItem[] =>
  (failed ?? []).map((f) => sent[f.index]).filter((it): it is PlanItem => Boolean(it));

/**
 * A plan slot's identity, shared by the plan row and the post written from it. Day and time
 * repeat in busy plans (8+ posts a week share a day and an hour), so the hook is part of it.
 */
export const slotKey = (s: { day: string; time: string; hook?: string }) => `${s.day} ${s.time} ${s.hook ?? ""}`;

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
let polling = false;
/** When a mounted picture last reported (it polls on its own; the store then leaves that post alone). */
const seen = new Map<string, number>();
const isOpen = (i?: PostImage | null) => i?.status === "queued" || i?.status === "running";

/** Questions the owner put off in this tab, by brand (asked again in a later session). */
const SKIPPED_Q = "mercat.q.skip";
function questionsSkipped(brandId: string): boolean {
  try {
    return sessionStorage.getItem(SKIPPED_Q) === brandId;
  } catch {
    return false;
  }
}

/** The channel a week goes out to: the brand's, the one typed at the start, the sample's. */
export const weekChannel = (s: { brand: BrandProfile | null; input: { channel?: string }; sample: boolean }) =>
  s.brand?.channel || (s.input.channel ? `@${s.input.channel}` : s.sample ? SAMPLE_CHANNEL : null);

/**
 * A rewrite would race something already under way: an approval in its undo window or in flight (it would approve
 * a text the owner never read), a publish, or the queue sending the post right now (or a send that was cut off).
 */
export function rewriteLocked(s: Pick<StudioState, "pendingApprove" | "busy" | "schedule">, id: string): boolean {
  const q = s.schedule[id]?.status;
  return !!s.pendingApprove[id] || !!s.busy[id] || q === "sending" || q === "unknown";
}

/** Posts whose picture start is in flight: never a second paid start for the same post. */
const starting = new Set<string>();
/** Picture starts whose answer was lost (post id -> when it started), and how long to wait for them. */
const lostAt = new Map<string, number>();
const LOST_PICTURE_MS = 160_000;
/** True while this post's picture is being started or drawn (the card and the hub's tools stay still). */
export const pictureBusy = (id: string, image?: PostImage | null) => starting.has(id) || isOpen(image);

/** Approvals inside their undo window: settle("go") sends, "undo" drops, "flushed" was sent already. */
type Waiting = { timer: ReturnType<typeof setTimeout>; settle: (v: "go" | "undo" | "flushed") => void; done: Promise<ApproveResult> };
const waiting = new Map<string, Waiting>();
let lastRefresh = 0;

const RECENT = "mercat.recent";
/** Channels opened on this device, newest first (up to 8): the hub's "So‘nggi kanallar". */
export function recentBrands(): RecentBrand[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((r): r is RecentBrand => typeof r?.id === "string" && typeof r?.name === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}
function rememberRecent(b: BrandProfile) {
  try {
    const me: RecentBrand = { id: b.id, name: b.dna?.name || b.channel || "Kanal", channel: b.channel };
    localStorage.setItem(RECENT, JSON.stringify([me, ...recentBrands().filter((r) => r.id !== b.id)].slice(0, 8)));
  } catch {
    /* private mode */
  }
}

/** A brand this browser opened before for the same channel: a re-run reuses its row (type, goal, answers). */
function recentBrandFor(channel?: string): string | undefined {
  if (!channel) return undefined;
  const name = channel.replace(/^@/, "").toLowerCase();
  return recentBrands().find((r) => r.channel?.replace(/^@/, "").toLowerCase() === name)?.id;
}

/** The autopilot, week and question state of one brand, cleared when another opens. */
const freshWeek = () => ({
  schedule: {} as Schedule,
  autopilot: null,
  botAdmin: null,
  autopilotBusy: false,
  week: { state: "idle" } as WeekState,
  questions: { list: [], state: "idle" } as QuestionsState,
  rewriting: {} as Record<string, boolean>,
});

/**
 * Reads ?ui= and the bot's link key once. The key comes in the fragment (`#k=`, which never
 * reaches a server log; `?k=` is accepted too), is saved on this device and taken out of the
 * address bar at once; ?brand= stays.
 */
function readPageParams(): { pro: boolean | null } {
  const u = new URL(window.location.href);
  const ui = u.searchParams.get("ui");
  const hash = new URLSearchParams(u.hash.replace(/^#/, ""));
  const k = hash.get("k") ?? u.searchParams.get("k");
  if (k) {
    api.saveHandoff(k);
    u.searchParams.delete("k");
    hash.delete("k");
    const rest = hash.toString();
    u.hash = rest ? `#${rest}` : "";
    window.history.replaceState(null, "", u.toString());
  }
  return { pro: ui === "pro" ? true : ui === "simple" ? false : null };
}

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
    const problem = problemOf(f);
    // A day limit is not the employee's mistake: the lamp goes quiet instead of red.
    step(key, { status: problem.limit ? "skip" : "fail" });
    set({ problem });
  };

  /**
   * After a timeout or a dropped connection the server may still have written the posts (it
   * finishes before the client gives up). Lists them: this run's slots that landed, and the rest.
   */
  const landed = async (brandId: string, items: PlanItem[]) => {
    const r = await api.listPosts(brandId, lang());
    if (!r.ok) return null;
    const keys = new Set(items.map(slotKey));
    const known = new Set(get().posts.map((p) => p.id));
    const posts = r.data.posts.filter((p) => p.slot && keys.has(slotKey(p.slot)) && !known.has(p.id));
    const have = new Set(posts.map((p) => slotKey(p.slot!)));
    return { posts, missing: items.filter((it) => !have.has(slotKey(it))) };
  };

  /**
   * The server's answer to an approval: on success its post is merged (uz_cyrl rebuilt,
   * approvedAt) and the SMM-menejer blinks; on failure the post is a draft again with the reason
   * under it ("Kod: [kod]" is a quiet hint, an old link key says so).
   */
  const applyApproval = (id: string, r: api.Res<{ post: PostDraft }>, sent: Edits | undefined): ApproveResult => {
    if (!r.ok) {
      const expired = r.status === 401 && api.handoffState() !== "none";
      const message = expired ? copy().access.expired : problemOf(r).message || copy().posts.approveError;
      set({
        posts: get().posts.map((p) => (p.id === id ? { ...p, status: "draft" } : p)),
        postNote: { ...get().postNote, [id]: r.code === BLANK_LEFT ? { text: message, tone: "hint", missing: r.missing } : { text: message, tone: "bad" } },
      });
      return { ok: false, message };
    }
    // The server's text is what was approved (cleaned: no spaces before line breaks, no invisible characters), and
    // the week's hash is taken of it: the edit that went with the approval is spent. An edit made while the approval
    // was out (a newer one than `sent`) stays on screen.
    const edits = get().edited[id];
    const spent = edits === sent;
    set({
      posts: get().posts.map((p) => (p.id === id ? approvedPost(p, r.data.post, spent ? undefined : edits) : p)),
      ...(spent && edits ? { edited: withoutKey(get().edited, id) } : {}),
      handTick: get().handTick + 1,
    });
    return { ok: true };
  };

  /** Writes the posts for more plan slots (one row, or the ones the run missed), in one call. */
  const writeMore = async (items: PlanItem[]) => {
    const brand = get().brand;
    if (!brand || get().sample || !items.length) return;
    const my = runId;
    const keys = new Set(items.map(slotKey));
    const flag = (v: boolean) => set({ writingSlot: { ...get().writingSlot, ...Object.fromEntries([...keys].map((k) => [k, v])) } });
    flag(true);
    set({ problem: null });
    const r = await api.writePosts(brand.id, items.map(api.slotOf), lang());
    const got = !r.ok && lostAnswer(r) ? await landed(brand.id, items) : null;
    flag(false);
    if (my !== runId) return;
    const written = r.ok ? r.data.posts : (got?.posts ?? []);
    if (!written.length) {
      set({ problem: r.ok ? { code: "internal", message: copy().error.generic } : problemOf(r) });
      return;
    }
    const known = new Set(get().posts.map((p) => p.id));
    const others = get().missed.filter((m) => !keys.has(slotKey(m)));
    set({
      posts: [...get().posts, ...written.filter((p) => !known.has(p.id))],
      missed: [...others, ...(r.ok ? missedOf(items, r.data.failed) : (got?.missing ?? []))],
    });
    void pictures(my);
  };

  const setPostImage = (id: string, image: PostImage) =>
    set({ posts: get().posts.map((p) => (p.id === id ? { ...p, image } : p)) });

  const countImages = (otherwise?: StepStatus) => {
    const ps = get().posts;
    const ready = ps.filter((p) => p.image?.status === "ready").length;
    const open = ps.filter((p) => isOpen(p.image)).length;
    const failed = ps.some((p) => p.image?.status === "failed");
    const was = get().steps.find((s) => s.key === "images")?.status;
    step("images", { n: ready, m: ps.length, status: open ? "run" : ready ? "done" : failed ? "fail" : (otherwise ?? was) });
  };

  /** Learns the picture style once per brand (channel photos and/or the owner's photos). */
  const learnStyle = (brandId: string, photos?: string[]) => {
    if (!visualRun) {
      set({ styleLearning: true });
      const run: Promise<"ok" | "none"> = api.learnVisual(brandId, photos, lang()).then((r) => {
        const b = get().brand;
        // A newer run (another channel, start over) owns the flag by now.
        if (visualRun === run) set({ styleLearning: false, ...(r.ok && b?.id === brandId ? { brand: { ...b, visual: r.data.visual } } : {}) });
        return r.ok ? "ok" : "none";
      });
      visualRun = run;
    }
    return visualRun;
  };

  /**
   * Starts a picture for each post of the latest run that has none, then polls until all are ready
   * or failed. Older drafts without one keep the card's own «Rasm yaratish»: reopening a brand
   * with many of them must not start a pile of paid pictures at once.
   */
  const pictures = async (my: number) => {
    // Drafts only: a redrawn approved post would no longer match what the owner approved (and the
    // bot refuses to publish it). A failed attempt that still has a picture keeps it; the owner can
    // ask for another one from the card.
    const batch = latestBatch(get().posts);
    const posts = get().posts.filter((p) => batch.has(p.id) && needsPicture(p, get().schedule[p.id]));
    if (!posts.length && !get().posts.some((p) => p.image?.status === "queued" || p.image?.status === "running")) {
      countImages();
      return;
    }
    step("images", { status: "run", n: 0, m: get().posts.length });
    for (const p of posts) {
      // One paid start per post: a start still in flight (the run's, a reopen's) is not repeated.
      if (starting.has(p.id)) continue;
      // Each start can take minutes: by now the owner may have approved and queued this post (it then goes out as
      // it was approved, text only) or given it a picture of their own. Nothing is drawn for it then.
      const cur = get().posts.find((x) => x.id === p.id);
      if (!cur || !needsPicture(cur, get().schedule[p.id])) continue;
      starting.add(p.id);
      const t0 = Date.now();
      const r = await api.startPostImage(p.id, lang()).finally(() => starting.delete(p.id));
      if (my !== runId) return;
      if (!r.ok) {
        if (missingRoute(r)) {
          // Pictures are not available on this server yet: say nothing rather than pretend.
          step("images", { status: "skip" });
          return;
        }
        if (r.status === 429) {
          // A day limit: the next post would hit it too. Say it once, calmly, and leave the rest
          // on the card's own button for when the limit allows.
          set({ problem: problemOf(r) });
          countImages("skip");
          void poll(my);
          return;
        }
        // The answer was lost, not necessarily the picture: the route may still be drawing it
        // (it can take up to 150 s on a brand whose style is learned first). Poll for it.
        // A network failure long before the route's limit never reached the server: say so now.
        const lost = r.code === "timeout" || (r.code === "network" && Date.now() - t0 > 15_000);
        if (lost) {
          lostAt.set(p.id, t0);
          setPostImage(p.id, { status: "queued", refsUsed: 0 });
        } else setPostImage(p.id, { status: "failed", refsUsed: 0, error: problemOf(r).message });
        continue;
      }
      setPostImage(p.id, r.data.image);
    }
    countImages();
    void poll(my);
  };

  /**
   * Keeps the pictures (and the Dizayner lamp) current while no card is on screen to do it:
   * a mounted PostImage polls its own post, so posts it reported on lately are skipped.
   */
  const poll = async (my: number) => {
    const mine = ++pollRun;
    polling = true;
    const until = Date.now() + IMAGE_POLL_LIMIT_MS;
    try {
      while (Date.now() < until) {
        await sleep(IMAGE_POLL_MS);
        if (my !== runId || mine !== pollRun) return;
        const open = get().posts.filter((p) => isOpen(p.image));
        if (!open.length) break;
        const stale = open.filter((p) => Date.now() - (seen.get(p.id) ?? 0) > IMAGE_POLL_MS * 1.5);
        await Promise.all(
          stale.map(async (p) => {
            const r = await api.getPostImage(p.id, lang());
            if (!r.ok || my !== runId) return;
            if (r.data.image) {
              lostAt.delete(p.id);
              setPostImage(p.id, r.data.image);
            } else if (Date.now() - (lostAt.get(p.id) ?? Date.now()) > LOST_PICTURE_MS) {
              // The lost start saved nothing on the server: stop waiting, offer "Qayta urinish".
              lostAt.delete(p.id);
              setPostImage(p.id, { status: "failed", refsUsed: 0, error: copy().posts.image.failed });
            }
          }),
        );
        countImages();
      }
      countImages();
    } finally {
      if (mine === pollRun) polling = false;
    }
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
      keepPlan(brand.id, { plan: get().plan!, strategy: get().strategy, launch: get().launch, sufficiency: get().sufficiency });
      step("plan", { status: "done", n: r.data.plan.items.length });
    }

    if (!get().posts.length) {
      const items = get().plan!.items.slice(0, POSTS_PER_RUN);
      step("posts", { status: "run", n: items.length });
      const r = await api.writePosts(brand.id, items.map(api.slotOf), lang());
      if (my !== runId) return;
      if (r.ok) {
        set({ posts: r.data.posts, missed: missedOf(items, r.data.failed) });
      } else {
        // The answer was lost, not necessarily the work: show what landed, rewrite only the rest.
        const got = lostAnswer(r) ? await landed(brand.id, items) : null;
        if (my !== runId) return;
        if (!got?.posts.length) return fail("posts", r);
        set({ posts: got.posts, missed: got.missing });
      }
      step("posts", { status: "done", n: get().posts.length });
    }

    // The first moment after a run is "they know my channel": Kanal with real numbers, when we have them.
    const first = get().mode === "channel" && !!get().audit;
    set({ phase: "ready", tab: first ? "channel" : "posts", justFinished: first, problem: null });
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
    void get().loadAutopilot();
    // Pictures wait for the style; without one the picture route decides what it can do.
    // The Dizayner is already at work while it studies the channel's photos.
    if (get().posts.some((p) => !p.image)) step("images", { status: "run", n: 0, m: get().posts.length });
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
      // The same channel opened on this browser before: its row is reused, with its type, goal and answers.
      const known = s.mode === "channel" ? recentBrandFor(ch) : undefined;
      const brandP =
        s.mode === "channel"
          ? api.createBrand({ channel: `@${ch}`, lang: L, brandId: known })
          : api.createBrand({ mode: "fresh", knowledge: s.input.knowledge, channel: ch ? `@${ch}` : undefined, lang: L });
      // The analysis needs no brand: it reads the pasted channel directly, in parallel.
      const auditP = s.mode === "channel" && ch && !s.audit ? api.analyzeChannel(`@${ch}`, L, known) : null;

      if (auditP) {
        void auditP.then((a) => {
          if (my !== runId) return;
          if (a.ok) {
            set({ audit: a.data.audit, auditProblem: null });
            const id = get().brand?.id;
            if (id) keepAudit(id, a.data.audit);
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
        step("read", { status: get().postsRead != null ? "done" : problemOf(b).limit ? "skip" : "fail" });
        return fail("voice", b);
      }
      const read = b.data.channelInfo?.postsRead ?? get().postsRead;
      set({ brand: b.data.brand, postsRead: read ?? null });
      if (get().audit) keepAudit(b.data.brand.id, get().audit!);
      rememberBrand(b.data.brand.id);
      rememberRecent(b.data.brand);
      step("read", { status: "done", n: read ?? undefined });
      step("voice", { status: "done" });
      // The owner's questions come while the plan is made: answers given in time reach the writer.
      void get().loadQuestions();

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
    // The engine's questions come while the department works (here, the sample's own).
    set({ questions: { list: sampleQuestions(L), state: "open" } });
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
    const week = sampleWeek(L);
    set({
      brand: sampleBrand(L),
      audit: sampleAudit(L),
      plan: samplePlan(L),
      posts: week.posts,
      schedule: week.schedule,
      autopilot: week.autopilot,
      botAdmin: week.admin,
      postsRead: 60,
      phase: "ready",
      tab: "posts",
    });
  };

  const applyAutopilot = (d: api.AutopilotInfo) =>
    set({ autopilot: d.autopilot ?? null, botAdmin: d.admin ?? null, schedule: d.schedule && typeof d.schedule === "object" ? d.schedule : {} });

  /**
   * Approvals in their undo window go now and are awaited: the week is approved over what the server holds, and its
   * hash must be taken of exactly that text.
   */
  const settleWaiting = async () => {
    for (const [id, w] of [...waiting]) {
      if (!waiting.has(id)) continue;
      w.settle("go");
      await w.done;
    }
    await sleep(0);
    while (Object.values(get().busy).some((v) => v === "approve")) await sleep(120);
  };

  return {
    phase: "start",
    mode: "channel",
    sample: false,
    introGate: false,
    bot: "mercatai",
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
    planLoading: false,
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
    missed: [],
    adminAsk: null,
    outcomes: {},
    ...freshWeek(),
    pro: false,
    approveDelayMs: 0,
    pendingApprove: {},
    justFinished: false,
    handTick: 0,

    setPro: (pro) => {
      // Bo‘lim exists only in Pro: leaving Pro from there lands on Kanal, never on a dead end.
      set({ pro, ...(!pro && get().tab === "dept" ? { tab: "channel" as Tab } : {}) });
      try {
        localStorage.setItem("mercat.pro", pro ? "1" : "0");
      } catch {
        /* private mode: lasts for this page */
      }
    },

    configure: ({ bot, approveDelayMs = 0 }) => {
      const p = new URLSearchParams(window.location.search);
      const forced = readPageParams().pro;
      // Simple everywhere, the desktop too (PRODUCT.md): Pro only when this device chose it or ?ui=pro.
      let saved: string | null = null;
      try {
        saved = localStorage.getItem("mercat.pro");
        if (forced != null) localStorage.setItem("mercat.pro", forced ? "1" : "0");
      } catch {
        /* ignore */
      }
      const pro = defaultPro({ saved, forced });
      set({ bot, pro, approveDelayMs, deviceKey: api.handoffUser(), sample: api.sampleMode(), entry: { view: p.get("mode") === "fresh" ? "fresh" : "link", channel: "" } });
    },

    deviceKey: null,
    signOutDevice: () => {
      const s = get();
      const unsaved = s.posts.some((p) => p.status === "draft" && s.edited[p.id] && !s.pendingApprove[p.id]);
      if (unsaved && !window.confirm(copy().hub.signOutConfirm)) return;
      // Approvals in their undo window leave while the key still signs them.
      s.flushApprovals();
      api.saveHandoff(null);
      try {
        localStorage.removeItem(RECENT);
      } catch {
        /* nothing kept */
      }
      set({ deviceKey: null });
      if (s.sample) window.location.assign(window.location.pathname);
      else get().reset();
    },

    newChannel: () => {
      if (get().sample) {
        window.location.assign(window.location.pathname);
        return;
      }
      get().reset();
    },

    refreshPosts: async () => {
      const brand = get().brand;
      if (!brand || get().sample || get().phase !== "ready" || Date.now() - lastRefresh < 10_000) return;
      lastRefresh = Date.now();
      const my = runId;
      const r = await api.listPosts(brand.id, lang());
      if (my !== runId || !r.ok) return;
      const server = new Map(r.data.posts.map((p) => [p.id, p]));
      const local = new Set(get().posts.map((p) => p.id));
      const pending = get().pendingApprove;
      let edited = get().edited;
      const merged = get().posts.map((p) => {
        const s = server.get(p.id);
        if (!s) return p;
        // Server facts win (status, link, picture, and the text unless this device holds a newer one: a rewrite on
        // another device, or «Haftani tasdiqlash» would hash an old text). The owner's edits of drafts and waiting
        // approvals stay; an edit of a post the server approved is spent (approval.ts).
        const r = refreshedPost(p, s, { edited: !!edited[p.id], pending: !!pending[p.id] });
        if (edited[p.id] && !r.keepEdit) edited = withoutKey(edited, p.id);
        return r.post;
      });
      set({ posts: [...merged, ...r.data.posts.filter((p) => !local.has(p.id))], edited });
      void get().loadAutopilot();
    },

    undoApprove: (id) => {
      const w = waiting.get(id);
      if (w) w.settle("undo");
    },

    flushApproval: async (id) => {
      const w = waiting.get(id);
      if (!w) return;
      w.settle("flushed");
      // keepalive: the bot's tab may take the page's place; the answer still counts when it comes.
      const sent = get().edited[id];
      const r = await api.approvePost(id, lang(), sent, true);
      applyApproval(id, r, sent);
    },

    flushApprovals: () => {
      for (const [id, w] of waiting) {
        // Page is going away: send now, with keepalive so the request outlives the page.
        void api.approvePost(id, lang(), get().edited[id], true);
        w.settle("flushed");
      }
    },

    setPostScript: (postScript) => set({ postScript }),

    /** Writes the post for one more plan slot (the run writes only the first few). */
    writeSlot: (item) => writeMore([item]),

    writeMissed: () => writeMore(get().missed),

    startChannel: (channel) => {
      visualRun = null;
      set({ styleLearning: false });
      set({
        mode: "channel",
        input: { channel },
        brand: null,
        audit: null,
        auditProblem: null,
        plan: null,
        planLoading: false,
        strategy: null,
    launch: null,
    sufficiency: null,
        planProgress: null,
        posts: [],
        postsRead: null,
        emptyChannel: null,
        edited: {},
        postNote: {},
        missed: [],
        adminAsk: null,
        outcomes: {},
        ...freshWeek(),
        steps: stepsFor("channel", false),
        startedAt: Date.now(),
      });
      void run();
    },

    startFresh: ({ knowledge, channel, photos }) => {
      visualRun = null;
      set({ styleLearning: false });
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
        missed: [],
        adminAsk: null,
        outcomes: {},
        ...freshWeek(),
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
      get().flushApprovals();
      runId++;
      pollRun++;
      visualRun = null;
      set({ styleLearning: false, justFinished: false, pendingApprove: {} });
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
        missed: [],
        adminAsk: null,
        outcomes: {},
        ...freshWeek(),
      });
    },

    reopen: async (brandId) => {
      // Another channel from "So‘nggi kanallar": waiting approvals of this one leave first.
      get().flushApprovals();
      const my = ++runId;
      pollRun++;
      visualRun = null;
      // The address bar names the brand being opened from the first moment: a retry or the 403
      // screen's bot link then go to this brand, not the channel that was open before.
      rememberBrand(brandId);
      set({
        phase: "reopening",
        problem: null,
        justFinished: false,
        brand: null,
        posts: [],
        steps: [],
        pendingApprove: {},
        styleLearning: false,
        audit: null,
        auditProblem: null,
        plan: null,
        strategy: null,
        launch: null,
        sufficiency: null,
        planProgress: null,
        edited: {},
        busy: {},
        postNote: {},
        missed: [],
        writingSlot: {},
        // Run-scoped facts of the previous channel must not show on this one.
        postsRead: null,
        emptyChannel: null,
        adminAsk: null,
        outcomes: {},
        ...freshWeek(),
      });
      const L = lang();
      const [b, p] = await Promise.all([api.getBrand(brandId, L), api.listPosts(brandId, L)]);
      if (my !== runId) return;
      // Either call refused: brand_forbidden (a bot brand opened without its link key, the brand
      // itself may be public) is the 403 screen and keeps ?brand=. Anything else is said with a
      // retry; never an empty workspace that invites a new paid run on an existing brand.
      const failed = !b.ok ? b : !p.ok ? p : null;
      if (failed) {
        set({ phase: "start", problem: problemOf(failed) });
        if (failed.code === "brand_not_found" || failed.code === "not_found") rememberBrand(null);
        return;
      }
      if (!b.ok || !p.ok) return;
      const brand = b.data.brand;
      rememberBrand(brand.id);
      rememberRecent(brand);
      const mode: Mode = brand.mode === "fresh" ? "fresh" : "channel";
      const posts = p.data.posts.slice(0, 12);
      set({
        brand,
        mode,
        input: { channel: brand.channel?.replace(/^@/, "") },
        posts,
        phase: "ready",
        tab: posts.length ? "posts" : "channel",
        steps: stepsFor(mode, false).map((s) =>
          s.key === "read" || s.key === "voice" ? { ...s, status: "done" } : s.key === "posts" && posts.length ? { ...s, status: "done", n: posts.length } : s,
        ),
      });
      // The plan: this device's copy at once, then the server's latest (built on any device).
      // Neither: Kanal offers «Rejani tuzish».
      const showPlan = (v: KeptPlan) => {
        set({ plan: v.plan, strategy: v.strategy, launch: v.launch?.tactics?.length ? v.launch : null, sufficiency: v.sufficiency });
        step("plan", { status: "done", n: v.plan.items.length });
      };
      const kept = keptPlan(brand.id);
      if (kept) showPlan(kept);
      set({ planLoading: !kept });
      void api.savedPlan(brand.id, L).then((r) => {
        if (my !== runId) return;
        set({ planLoading: false });
        // A plan being built right now is newer than anything saved.
        if (get().planProgress) return;
        const pick = pickPlan(kept, r.ok ? r.data : null);
        if (!pick || pick === kept) return;
        showPlan(pick);
        keepPlan(brand.id, pick);
      });
      if (mode === "channel" && brand.channel) {
        const audit = keptAudit(brand.id);
        if (audit) set({ audit, auditProblem: null });
        else
          void api.analyzeChannel(brand.channel, L, brand.id).then((a) => {
            if (my !== runId) return;
            if (a.ok) {
              set({ audit: a.data.audit, auditProblem: null });
              keepAudit(brand.id, a.data.audit);
            } else set({ auditProblem: problemOf(a) });
          });
      }
      void get().loadQuestions();
      // The queue first: a post it holds keeps the picture it was approved with.
      await get().loadAutopilot();
      if (my !== runId) return;
      // A run cut short (tab closed mid-way) leaves drafts without a picture: finish them now,
      // so no slot waits for a picture nobody is drawing.
      if (posts.some((x) => needsPicture(x, get().schedule[x.id]))) void pictures(my);
      else if (posts.some((x) => isOpen(x.image))) void poll(my);
    },

    rebuildPlan: async () => {
      const brand = get().brand;
      if (!brand) return;
      const my = runId;
      set({ planProgress: { n: 0, m: 0 }, auditProblem: get().auditProblem });
      step("plan", { status: "run" });
      const r = await api.buildStrategy(brand.id, lang(), (e) => {
        // Another channel opened meanwhile: this plan's progress is not its business.
        if (my !== runId) return;
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
      set({
        plan: r.data.plan,
        strategy: r.data.strategy,
        launch: r.data.launch?.tactics?.length ? r.data.launch : null,
        sufficiency: Array.isArray(r.data.sufficiency) ? r.data.sufficiency : null,
        planProgress: null,
        problem: null,
      });
      keepPlan(brand.id, { plan: r.data.plan, strategy: get().strategy, launch: get().launch, sufficiency: get().sufficiency });
      step("plan", { status: "done", n: r.data.plan.items.length });
    },

    reloadAudit: async () => {
      const channel = get().brand?.channel ?? (get().input.channel ? `@${get().input.channel}` : null);
      if (!channel) return;
      const my = runId;
      set({ auditProblem: null });
      const a = await api.analyzeChannel(channel, lang(), get().brand?.id);
      if (my !== runId) return;
      if (a.ok) {
        set({ audit: a.data.audit });
        const id = get().brand?.id;
        if (id) keepAudit(id, a.data.audit);
      } else set({ auditProblem: problemOf(a) });
    },

    // The first-look summary is a moment, not a page: it ends once the owner goes to the posts.
    // A tab that no longer exists (the old «Video») opens Postlar.
    setTab: (t) => {
      const tab = safeTab(t);
      set({ tab, ...(tab === "posts" ? { justFinished: false } : {}) });
    },

    editPost: (id, script, text) => {
      const note = get().postNote[id];
      set({
        posts: get().posts.map((p) => (p.id === id ? { ...p, variants: { ...p.variants, [script]: text } } : p)),
        edited: { ...get().edited, [id]: { ...get().edited[id], [script]: text } },
        // The next Tasdiqlash re-checks the blank; an old hint would only confuse.
        ...(note?.tone === "hint" ? { postNote: { ...get().postNote, [id]: undefined } } : {}),
      });
    },

    approve: async (id, delayMs) => {
      const note = (v: StudioState["postNote"][string]) => set({ postNote: { ...get().postNote, [id]: v } });
      const busy = (v: "approve" | undefined) => set({ busy: { ...get().busy, [id]: v } });
      const mark = (status: PostDraft["status"]) => set({ posts: get().posts.map((p) => (p.id === id ? { ...p, status } : p)) });
      const pending = (on: boolean) => {
        const next = { ...get().pendingApprove };
        if (on) next[id] = true;
        else delete next[id];
        set({ pendingApprove: next });
      };
      if (waiting.has(id) || get().busy[id]) return { ok: false, message: "" };
      // A queued post changed since (a draft again with its old queue entry): a plain approval would leave the old
      // entry, which stops at the slot. It goes back in the queue instead, as «Qayta tasdiqlash» does (no undo window).
      if (get().requeues(id)) {
        const w = await get().approveWeek([id]);
        return w.state === "done" ? { ok: true } : { ok: false, message: weekMessage(w) };
      }
      if (get().sample) {
        set({ posts: get().posts.map((p) => (p.id === id ? { ...p, status: "approved", approvedAt: new Date().toISOString() } : p)), handTick: get().handTick + 1 });
        return { ok: true };
      }
      note(undefined);

      const delay = delayMs ?? get().approveDelayMs;
      let flushed = false;
      if (delay > 0) {
        // Shown approved at once; the request leaves when the undo window closes.
        mark("approved");
        pending(true);
        let settle!: Waiting["settle"];
        const verdict = new Promise<"go" | "undo" | "flushed">((resolve) => (settle = resolve));
        const timer = setTimeout(() => settle("go"), delay);
        const done = (async (): Promise<ApproveResult> => {
          const v = await verdict;
          clearTimeout(timer);
          waiting.delete(id);
          if (v === "undo") {
            pending(false);
            mark("draft");
            return { ok: false, message: "", undone: true };
          }
          flushed = v === "flushed";
          return { ok: true };
        })();
        waiting.set(id, { timer, settle, done });
        const first = await done;
        if (flushed) pending(false); // sent with keepalive already
        if (!first.ok || flushed) return first;
      }

      busy("approve");
      const sent = get().edited[id];
      const r = await api.approvePost(id, lang(), sent);
      busy(undefined);
      pending(false);
      return applyApproval(id, r, sent);
    },

    publish: async (id, script, typed) => {
      const busy = (v: "publish" | undefined) => set({ busy: { ...get().busy, [id]: v } });
      const note = (v: StudioState["postNote"][string]) => set({ postNote: { ...get().postNote, [id]: v } });
      const botUrl = api.botPublishUrl(get().bot, id, script);
      // An approval still in its undo window goes first; publishing a draft would be refused.
      const w = waiting.get(id);
      if (w) {
        w.settle("go");
        const a = await w.done;
        if (!a.ok) return { ok: false, message: a.message };
        while (get().busy[id] === "approve") await sleep(120);
        if (get().posts.find((p) => p.id === id)?.status === "draft") return { ok: false, message: get().postNote[id]?.text ?? copy().posts.approveError };
      }
      const chat = typed || get().brand?.channel || (get().input.channel ? `@${get().input.channel}` : "");
      if (!chat) {
        // A brand from a description with no channel yet: the bot asks for the channel and publishes.
        note({ text: copy().posts.noChannel, href: botUrl, tone: "bad", link: copy().posts.openBot });
        return { ok: false, message: copy().posts.noChannel, botUrl };
      }
      busy("publish");
      note(undefined);
      const r = await api.publishPost(id, script, chat, lang());
      busy(undefined);
      if (r.ok && r.data.ok) {
        set({
          posts: get().posts.map((p) => (p.id === id ? { ...p, status: "published", publishedUrl: r.data.url } : p)),
          handTick: get().handTick + 1,
          adminAsk: nextAsk(get().adminAsk, id, null),
        });
        // The channel the owner typed is this brand's now (the engine linked it on this publish).
        if (typed && !get().input.channel) set({ input: { ...get().input, channel: typed.replace(/^@/, "") } });
        note({ text: copy().posts.published, href: r.data.url, tone: "ok" });
        return { ok: true, url: r.data.url };
      }
      // 401 with a link key on this device: the key is old. Said calmly, with the bot to open again.
      if (!r.ok && r.status === 401 && api.handoffState() !== "none") {
        note({ text: copy().access.expired, href: botUrl, link: copy().posts.openBot, tone: "bad" });
        return { ok: false, message: copy().access.expired, botUrl };
      }
      const msg = r.ok ? r.data.error ?? copy().error.generic : problemOf(r).message;
      const admin = r.ok ? r.data.addAdminUrl : r.addAdminUrl;
      const kind = publishFailKind({ code: r.ok ? r.data.code : r.code, adminUrl: admin });
      // A blank still in the text is the owner's fact to add, not a failure.
      const blank = kind === "blank";
      note(blank ? { text: msg, tone: "hint", missing: r.ok ? r.data.missing : r.missing } : { text: msg, href: admin, tone: "bad" });
      // The bot is not an admin of the owner's channel: the add-the-bot card opens now, at this
      // publish, naming that channel. A retry that comes back the same way keeps it open, saying so;
      // the card keeps `chat`, so the retry goes to the channel this publish went to.
      const b = get().brand;
      const open = kind === "admin" ? { script, chat, channel: askChannel({ name: b?.dna.name, channel: b?.channel || chat, typed: get().input.channel }) } : null;
      set({ adminAsk: nextAsk(get().adminAsk, id, open) });
      return { ok: false, message: msg, adminUrl: blank ? undefined : admin, botUrl, code: r.ok ? r.data.code : r.code };
    },

    loadAutopilot: async () => {
      const b = get().brand;
      if (!b || get().sample) return;
      const r = await api.getAutopilot(b.id, lang());
      // Another channel opened meanwhile: its queue is not this one.
      if (get().brand?.id !== b.id || !r.ok) return;
      applyAutopilot(r.data);
    },

    weekNow: (postIds) => {
      const s = get();
      return weekPlan({ posts: s.posts, schedule: s.schedule, channel: weekChannel(s), languages: s.brand?.dna.languages, now: Date.now(), postIds });
    },

    requeues: (id) => {
      const s = get();
      const p = s.posts.find((x) => x.id === id);
      // A slot that has passed cannot be queued again: a plain approval then (the old entry is spent).
      return !!p && requeueOnApprove(p, s.schedule[id]) && s.weekNow([id]).batch.ready.length > 0;
    },

    approveWeek: async (postIds) => {
      const brand = get().brand;
      if (!brand || get().week.state === "sending") return get().week;
      const done = (week: WeekState) => {
        set({ week });
        return week;
      };
      if (get().sample) {
        // The sample queues on screen only: every ready post waits for its slot.
        const plan = get().weekNow(postIds);
        const at = new Date().toISOString();
        const due = new Map(plan.toQueue.map((r) => [r.postId, r.dueAt]));
        set({
          posts: get().posts.map((p) => (due.has(p.id) ? { ...p, status: "approved", approvedAt: at } : p)),
          schedule: { ...get().schedule, ...Object.fromEntries([...due].map(([id, dueAt]) => [id, { dueAt, status: "queued" as const }])) },
          handTick: get().handTick + 1,
        });
        return done({ state: "done", queued: due.size, skipped: plan.skipped });
      }
      set({ week: { state: "sending" } });
      // The server approves what it holds: approvals waiting out their undo window and the owner's edits go first,
      // so the hash below is taken of the same text.
      await settleWaiting();
      for (const r of get().weekNow(postIds).toQueue) {
        const p = get().posts.find((x) => x.id === r.postId);
        const sent = p ? get().edited[p.id] : undefined;
        if (p?.status !== "draft" || !sent) continue;
        // A refused edit (a blank left, too long) would otherwise go out unedited: the week stops here, said why.
        const a = applyApproval(p.id, await api.approvePost(p.id, lang(), sent), sent);
        if (get().brand?.id !== brand.id) return done({ state: "idle" });
        if (!a.ok) return done({ state: "failed", message: a.message });
      }
      if (get().brand?.id !== brand.id) return done({ state: "idle" });
      const plan = get().weekNow(postIds);
      if (!plan.batch.ready.length) return done({ state: "changed" });
      const hash = await weekHashForClient(plan.batch, get().posts);
      const r = await api.approveWeek(brand.id, hash, lang(), postIds);
      if (get().brand?.id !== brand.id) return done({ state: "idle" });
      if (!r.ok) {
        if (r.code === "batch_changed") {
          // Another batch than the one shown (a picture finished, a new Monday batch): read the posts again.
          lastRefresh = 0;
          await get().refreshPosts();
          await get().loadAutopilot();
          return done({ state: "changed" });
        }
        if (r.continueUrl) return done({ state: "continue", continueUrl: r.continueUrl, ...(r.code ? { code: r.code } : {}) });
        return done({ state: "failed", message: problemOf(r).message });
      }
      const queued = new Map(r.data.queued.map((q) => [q.postId, q.dueAt]));
      const at = new Date().toISOString();
      set({
        posts: get().posts.map((p) => (queued.has(p.id) && p.status !== "published" ? { ...p, status: "approved", approvedAt: p.approvedAt ?? at } : p)),
        schedule: { ...get().schedule, ...Object.fromEntries([...queued].map(([id, dueAt]) => [id, { dueAt, status: "queued" as const }])) },
        botAdmin: r.data.admin ?? get().botAdmin,
        handTick: get().handTick + 1,
      });
      void get().loadAutopilot();
      return done({ state: "done", queued: queued.size, skipped: r.data.skipped.filter((x) => x.reason !== "published"), adminUrl: r.data.addAdminUrl });
    },

    handOverWeek: () => {
      // keepalive: the bot's tab may take the page's place; the bot then shows the text the owner saw.
      get().flushApprovals();
      for (const r of get().weekNow().toQueue) {
        const p = get().posts.find((x) => x.id === r.postId);
        if (p?.status === "draft" && get().edited[p.id]) void api.approvePost(p.id, lang(), get().edited[p.id], true);
      }
    },

    closeWeek: () => set({ week: { state: "idle" } }),

    toggleAutopilot: async (on) => {
      const b = get().brand;
      if (!b || get().autopilotBusy) return { ok: false };
      if (get().sample) {
        const prev = get().autopilot ?? { on: false };
        const since = prev.since ?? new Date().toISOString();
        const trialEndsAt = prev.trialEndsAt ?? new Date(Date.parse(since) + 7 * 86_400_000).toISOString();
        set({ autopilot: on ? { ...prev, on, since, trialEndsAt, trialDaysLeft: prev.trialDaysLeft ?? 7 } : { ...prev, on } });
        return { ok: true };
      }
      set({ autopilotBusy: true });
      const r = await api.setAutopilot(b.id, on, lang());
      set({ autopilotBusy: false });
      if (get().brand?.id !== b.id) return { ok: false };
      if (r.ok) {
        applyAutopilot(r.data);
        return { ok: true };
      }
      return { ok: false, continueUrl: r.continueUrl, message: problemOf(r).message };
    },

    loadQuestions: async () => {
      const b = get().brand;
      if (!b || get().sample || questionsSkipped(b.id)) return;
      const r = await api.getAnswers(b.id, lang());
      if (get().brand?.id !== b.id || !r.ok) return;
      // The owner may have answered meanwhile (another device, the bot): the server's list is the truth.
      const list = Array.isArray(r.data.questions) ? r.data.questions.filter((q) => q && typeof q.text === "string") : [];
      const st = get().questions.state;
      if (st === "saving" || st === "skipped") return;
      set({ questions: { list, state: list.length ? "open" : "idle" } });
      if (r.data.channelType && !get().brand?.channelType) set({ brand: { ...get().brand!, channelType: r.data.channelType } });
    },

    saveAnswers: async (values) => {
      const b = get().brand;
      const list = get().questions.list;
      const body = answersBody(list, values);
      if (!b || !body) return false;
      if (get().sample) {
        set({ questions: { list: [], state: "saved" } });
        return true;
      }
      set({ questions: { ...get().questions, state: "saving", message: undefined } });
      const r = await api.saveAnswers(b.id, body, lang());
      if (get().brand?.id !== b.id) return false;
      if (!r.ok) {
        set({ questions: { list, state: "error", message: problemOf(r).message } });
        return false;
      }
      set({ questions: { list: Array.isArray(r.data.questions) ? r.data.questions : [], state: "saved" } });
      if (body.goal) set({ brand: { ...get().brand!, goal: body.goal } });
      return true;
    },

    skipQuestions: () => {
      const b = get().brand;
      try {
        if (b) sessionStorage.setItem(SKIPPED_Q, b.id);
      } catch {
        /* this page only */
      }
      set({ questions: { ...get().questions, state: "skipped" } });
    },

    rewrite: async (id, instruction) => {
      const note = (v: PostNote | undefined) => set({ postNote: { ...get().postNote, [id]: v } });
      const text = instruction.trim();
      if (!text || get().rewriting[id] || rewriteLocked(get(), id)) return false;
      if (get().sample) {
        note({ text: copy().tools.notInSample, tone: "hint" });
        return false;
      }
      const flag = (v: boolean) => set({ rewriting: { ...get().rewriting, [id]: v } });
      flag(true);
      note(undefined);
      const r = await api.rewritePost(id, text, lang());
      flag(false);
      if (!r.ok) {
        note({ text: problemOf(r).message, tone: "bad" });
        return false;
      }
      const { post, kept, reapprove } = r.data;
      // The server's text is the post now: an older local edit of it would only bring the old words back.
      const edited = { ...get().edited };
      delete edited[id];
      set({ edited, posts: get().posts.map((p) => (p.id === id ? { ...p, ...post, image: post.image ?? p.image } : p)) });
      const c = copy().rewrite;
      const allKept = ["uz_latn", "ru", "en"].every((s) => kept.includes(s as Script));
      note(allKept ? { text: c.kept, tone: "hint" } : reapprove ? { text: c.reapprove, tone: "hint" } : { text: c.done, tone: "ok" });
      return !allKept;
    },

    adminAdded: () => {
      const a = get().adminAsk;
      if (a) set({ adminAsk: { ...a, state: "added" } });
    },
    closeAdminAsk: () => set({ adminAsk: null }),
    // publish() closes the card on success or on any other failure, and keeps it ("notYet") when the
    // bot is still not an admin; a publish that returns before the server closes it (retryAsk).
    retryAdminAsk: () =>
      retryAsk({
        ask: () => get().adminAsk,
        setAsk: (adminAsk) => set({ adminAsk }),
        busy: (id) => !!get().busy[id],
        publish: (id, script, chat) => get().publish(id, script, chat),
      }),

    setImage: (id, image) => {
      seen.set(id, Date.now());
      lostAt.delete(id); // the card heard from the server: no lost start to wait for
      setPostImage(id, image);
      countImages();
      // A new version started from the card keeps the lamp honest even if the owner leaves the tab.
      if (isOpen(image) && !polling) void poll(runId);
    },

    styleLearning: false,
    styleChanged: (visual) => {
      const b = get().brand;
      if (b) set({ brand: { ...b, visual } });
    },
  };
});
