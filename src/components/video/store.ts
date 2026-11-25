"use client";

/**
 * The Video tab's own state: which scripts are being written, what went wrong, and the sample's video posts. The
 * posts themselves live in the Studio's store (useStudio.posts): a written script or a new idea replaces or adds the
 * post there, so the Posts tab, the week and the queue see the same post.
 */
import type { PostDraft } from "@/lib/uslub/contract";
import { useEffect, useMemo } from "react";
import { create } from "zustand";
import * as api from "../studio/api";
import { problemOf, useStudio } from "../studio/store";
import { knownOwner } from "../studio/WeekCard";
import type { Schedule } from "../studio/week";
import { COPY } from "../ui/copy";
import { fmt, useLang, type Lang } from "../ui/lang";
import { isVideoPost, videoList } from "./model";
import { sampleCaption, sampleIdeaPlan, sampleVideo, sampleVideoPlan } from "./sample";

/** "idea" while a new idea is written; a post id while that post's script is. */
export const IDEA = "idea";

type Note = { text: string; tone: "ok" | "bad"; link?: string };

interface VideoStore {
  writing: Record<string, true | undefined>;
  notes: Record<string, Note | undefined>;
  /** `?mock=1`: the sample's video posts (by page language); null outside the sample. */
  sample: { lang: Lang; posts: PostDraft[]; schedule: Schedule } | null;
  write: (postId: string) => Promise<void>;
  idea: (brief: string) => Promise<boolean>;
  approve: (postId: string) => Promise<void>;
  clearNote: (key: string) => void;
}

const lang = () => useLang.getState().lang;
/** The week's short reason ("vaqti o‘tib ketgan") as a sentence of its own. */
const reasonText = (c: (typeof COPY)[Lang], r: { reason: keyof (typeof COPY)[Lang]["week"]["skip"]; tokens?: string[]; dates?: string[] }) => {
  const t = fmt(c.week.skip[r.reason], { tokens: (r.tokens ?? []).join(", "), dates: (r.dates ?? []).join(", ") });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Puts the post the server sent back in the Studio's list (replacing the one with its id, or first when new). */
function putPost(post: PostDraft) {
  const s = useStudio.getState();
  const has = s.posts.some((p) => p.id === post.id);
  useStudio.setState({ posts: has ? s.posts.map((p) => (p.id === post.id ? post : p)) : [post, ...s.posts] });
}

export const useVideo = create<VideoStore>((set, get) => {
  const sampleData = () => {
    const L = lang();
    const cur = get().sample;
    if (cur && cur.lang === L) return cur;
    const fresh = { lang: L, ...sampleVideo(L) };
    set({ sample: fresh });
    return fresh;
  };
  const patchSample = (id: string, patch: (p: PostDraft) => PostDraft) => {
    const cur = sampleData();
    set({ sample: { ...cur, posts: cur.posts.map((p) => (p.id === id ? patch(p) : p)) } });
  };
  const busy = (key: string, on: boolean) => set({ writing: { ...get().writing, [key]: on ? true : undefined } });
  const note = (key: string, n: Note | undefined) => set({ notes: { ...get().notes, [key]: n } });

  return {
    writing: {},
    notes: {},
    sample: null,

    write: async (postId) => {
      if (get().writing[postId]) return;
      busy(postId, true);
      note(postId, undefined);
      try {
        if (useStudio.getState().sample) {
          await sleep(1400);
          patchSample(postId, (p) => ({ ...p, variants: sampleCaption(), video: { ...p.video, plan: sampleVideoPlan(lang()), plannedAt: new Date().toISOString() } }));
          return;
        }
        const brand = useStudio.getState().brand;
        if (!brand) return;
        const r = await api.writeVideoScript(brand.id, postId, lang());
        if (useStudio.getState().brand?.id !== brand.id) return;
        if (r.ok) putPost(r.data.post);
        else note(postId, { text: problemOf(r).message, tone: "bad" });
      } finally {
        busy(postId, false);
      }
    },

    idea: async (brief) => {
      if (get().writing[IDEA]) return false;
      busy(IDEA, true);
      note(IDEA, undefined);
      try {
        if (useStudio.getState().sample) {
          await sleep(1600);
          const cur = sampleData();
          const now = new Date().toISOString();
          const post: PostDraft = {
            id: `sample-idea-${Date.now()}`,
            brandId: "sample",
            brief: brief.trim(),
            variants: sampleCaption(),
            neuroHits: {},
            humanScore: 90,
            status: "draft",
            video: { plan: sampleIdeaPlan(lang()), plannedAt: now },
            createdAt: now,
          };
          set({ sample: { ...cur, posts: [...cur.posts, post] } });
          return true;
        }
        const brand = useStudio.getState().brand;
        if (!brand) return false;
        const r = await api.newVideoIdea(brand.id, brief, lang());
        if (useStudio.getState().brand?.id !== brand.id) return false;
        if (r.ok) {
          putPost(r.data.post);
          return true;
        }
        note(IDEA, { text: problemOf(r).message, tone: "bad" });
        return false;
      } finally {
        busy(IDEA, false);
      }
    },

    /** A received video's post: queued for its slot (approve-week's selector, one post). */
    approve: async (postId) => {
      note(postId, undefined);
      const st = useStudio.getState();
      if (st.sample) {
        const cur = sampleData();
        const p = cur.posts.find((x) => x.id === postId);
        if (!p) return;
        const at = new Date().toISOString();
        const dueAt = p.slot ? new Date(Date.parse(`${p.slot.day}T${p.slot.time}:00+05:00`)).toISOString() : null;
        set({
          sample: {
            ...cur,
            posts: cur.posts.map((x) => (x.id === postId ? { ...x, status: "approved", approvedAt: at } : x)),
            schedule: dueAt ? { ...cur.schedule, [postId]: { dueAt, status: "queued" } } : cur.schedule,
          },
        });
        return;
      }
      if (get().writing[postId]) return;
      const c = COPY[lang()];
      // Why it cannot be queued now (its slot passed, a blank left…), said before anything is sent.
      const plan = st.weekNow([postId]);
      const left = plan.batch.ready.length ? undefined : plan.batch.skipped[0];
      if (left) {
        note(postId, { text: reasonText(c, left), tone: "bad" });
        return;
      }
      busy(postId, true);
      try {
        const w = await st.approveWeek([postId]);
        const skip = w.state === "done" && w.queued === 0 ? w.skipped[0] : undefined;
        if (skip) note(postId, { text: reasonText(c, skip), tone: "bad" });
        else if (w.state === "changed") note(postId, { text: c.week.changed, tone: "bad" });
        else if (w.state === "failed") note(postId, { text: w.message, tone: "bad" });
        else if (w.state === "continue") note(postId, { text: w.code === "brand_unowned" ? c.week.continueUnowned : c.week.continueText, tone: "bad", link: w.continueUrl });
      } finally {
        busy(postId, false);
      }
    },

    clearNote: (key) => note(key, undefined),
  };
});

/**
 * The tab's posts and their queue entries: the sample's own under `?mock=1`, else the brand's video posts from the
 * Studio's store. `now` is to the minute (a slot that passes leaves the list).
 */
export function useVideoView(now: number): { posts: PostDraft[]; all: PostDraft[]; schedule: Schedule; sample: boolean; known: boolean } {
  const sample = useStudio((s) => s.sample);
  const studioPosts = useStudio((s) => s.posts);
  const studioSchedule = useStudio((s) => s.schedule);
  const L = useLang((s) => s.lang);
  const samp = useVideo((s) => s.sample);
  // The sample's data is built on first view (and again when the page language changes).
  const data = sample && samp && samp.lang === L ? samp : null;
  useEffect(() => {
    if (sample && !data) useVideo.setState({ sample: { lang: L, ...sampleVideo(L) } });
  }, [sample, data, L]);
  return useMemo(() => {
    const all = sample ? (data?.posts ?? []) : studioPosts.filter(isVideoPost);
    const schedule = sample ? (data?.schedule ?? {}) : studioSchedule;
    return { posts: videoList(all, now), all, schedule, sample, known: knownOwner(sample) };
  }, [sample, data, studioPosts, studioSchedule, now]);
}
