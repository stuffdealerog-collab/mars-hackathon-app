import type { PostDraft, Script } from "@/lib/uslub/contract";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { plural } from "../ui/format";
import { useCopy, useLang, type Lang } from "../ui/lang";
import type { Lamps } from "./Department";
import { useDesk } from "./desk";
import { Inspector } from "./Inspector";
import { PostCard } from "./PostCard";
import { Queue, queueOrder } from "./Queue";
import { slotKey, useStudio } from "./store";
import { useHotkeys } from "./useHotkeys";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const SCRIPTS: Script[] = ["uz_latn", "uz_cyrl", "ru", "en"];
const SCRIPT_FOR: Record<Lang, Script> = { uz: "uz_latn", ru: "ru", en: "en" };

/**
 * One post language for the whole list. It is the channel's own (from the brand), not the page
 * language; the page language is only a fallback when the brand has none.
 */
function usePostScript() {
  const lang = useLang((s) => s.lang);
  const posts = useStudio((s) => s.posts);
  const picked = useStudio((s) => s.postScript);
  const channelLangs = useStudio((s) => s.brand?.dna.languages) ?? [];
  const available = SCRIPTS.filter((s) => posts.some((p) => p.variants[s]?.trim()));
  const own = channelLangs.find((s) => available.includes(s));
  const fallback = own ?? (available.includes(SCRIPT_FOR[lang]) ? SCRIPT_FOR[lang] : (available[0] ?? "uz_latn"));
  const script = picked && available.includes(picked) ? picked : fallback;
  // Every post has a Cyrillic version, so "more than one available" is always true: the switch is
  // shown only when the channel itself writes in two languages or more (spec §3.4).
  const show = available.length > 1 && channelLangs.length > 1;
  return { available: show ? available : [], script, scriptOf: (p: PostDraft): Script => (p.variants[script]?.trim() ? script : "uz_latn") };
}

function ScriptSwitch({ available, script }: { available: Script[]; script: Script }) {
  const c = useCopy();
  const setPostScript = useStudio((s) => s.setPostScript);
  if (available.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-[14px] text-ink-2" id="post-lang">
        {c.posts.langLabel}
      </span>
      <div className="seg" role="group" aria-labelledby="post-lang">
        {available.map((s) => (
          <button key={s} type="button" aria-pressed={script === s} title={c.posts.scriptNames[s]} onClick={() => setPostScript(s)}>
            {c.posts.scripts[s]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Posts the run asked for but did not get: how many, and one button to write them again. */
function MissedNote() {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const missed = useStudio((s) => s.missed);
  const writing = useStudio((s) => s.missed.some((it) => s.writingSlot[slotKey(it)]));
  const writeMissed = useStudio((s) => s.writeMissed);
  if (!missed.length) return null;
  return (
    <div className="card flex flex-wrap items-center gap-3 p-4">
      <p className="mr-auto text-[15px] text-ink-2">
        {missed.length} {plural(c.posts.missed, missed.length, lang)}.
      </p>
      <button type="button" className="btn-2" disabled={writing} onClick={() => void writeMissed()}>
        {writing ? c.channel.writingSlot : c.posts.rewrite}
      </button>
    </div>
  );
}

/** No posts yet (a reopen without them): where they come from, and the way there. */
function EmptyQueue() {
  const c = useCopy();
  const setTab = useStudio((s) => s.setTab);
  return (
    <div className="card flex max-w-[560px] flex-col items-start gap-4 p-5">
      <p className="text-[15px] leading-relaxed text-ink-2">{c.queue.empty}</p>
      <button type="button" className="btn-2" onClick={() => setTab("channel")}>
        {c.queue.toChannel}
      </button>
    </div>
  );
}

/**
 * The posts one under another, dealt in once: phones, the Mini App, and the desktop in Oddiy
 * (a 640 px column there). On the desktop the card most in view is the post the hub's tools act on.
 */
export function PostsTab({ inTelegram, column = false }: { inTelegram: boolean; column?: boolean }) {
  const posts = useStudio((s) => s.posts);
  const { available, script, scriptOf } = usePostScript();
  const reduce = useReducedMotion() ?? false;
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = list.current;
    if (!column || !root) return;
    const seen = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set((e.target as HTMLElement).id.replace(/^post-/, ""), e.intersectionRatio);
        const best = [...seen.entries()].sort((a, b) => b[1] - a[1])[0];
        if (best && best[1] > 0) useDesk.getState().setFocused(best[0]);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    root.querySelectorAll("[data-post-scope]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [column, posts.length]);

  if (!posts.length) return <EmptyQueue />;
  return (
    <div ref={list} className={`flex flex-col gap-6 ${column ? "max-w-[640px]" : ""}`}>
      <ScriptSwitch available={available} script={script} />
      <MissedNote />
      {/* Cards are dealt in one after another, once; later state changes do not replay it. */}
      {posts.map((p, i) => (
        <motion.div
          key={p.id}
          initial={reduce ? false : { opacity: 0, y: 18, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.42, ease: EASE_OUT, delay: Math.min(i, 6) * 0.07 }}
        >
          <PostCard post={p} script={scriptOf(p)} inTelegram={inTelegram} />
        </motion.div>
      ))}
    </div>
  );
}

/**
 * Postlar · Pro on the desktop: the queue (decisions waiting first), the chosen post as
 * subscribers will see it with its one lime action, and the Inspector with its insides, each
 * section signed by the employee who made it. Below 920 px of canvas the Inspector moves under
 * the preview. Keyboard: J/K, Enter, E, 1-4 (useHotkeys).
 */
export function PostsSplit({ lamps }: { lamps: Lamps }) {
  const c = useCopy();
  const posts = useStudio((s) => s.posts);
  const { script, scriptOf } = usePostScript();
  const focused = useDesk((s) => s.focusedPostId);
  const keysUsed = useDesk((s) => s.keysUsed);
  const reduce = useReducedMotion() ?? false;
  const order = queueOrder(posts);
  const current = order.find((p) => p.id === focused) ?? order[0];
  useHotkeys(true);

  // Entering Postlar puts the keyboard on the queue, without scrolling the page.
  useEffect(() => {
    if (!current) return;
    useDesk.getState().setFocused(current.id);
    document.getElementById(`q-${current.id}`)?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on entering the section
  }, []);

  if (!posts.length) return <EmptyQueue />;
  const drafts = order.filter((p) => p.status === "draft").length;
  const s = scriptOf(current);
  const inspector = <Inspector post={current} script={script === s ? script : s} lamps={lamps} />;

  return (
    <div className="@container">
      <div className="grid grid-cols-[260px_minmax(0,1fr)] items-start gap-4 @min-[920px]:grid-cols-[280px_minmax(340px,460px)_316px]">
        <div className="sticky top-3 flex max-h-[calc(100dvh-24px)] flex-col gap-3 overflow-auto">
          <MissedNote />
          <Queue script={scriptOf} />
        </div>

        <div className="min-w-0">
          {drafts === 0 && <p className="mb-3 px-1 text-[14px] text-ink-2">{c.queue.allDone}</p>}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={current.id}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { duration: reduce ? 0.12 : 0.24, ease: EASE_OUT } }}
              exit={{ opacity: 0, transition: { duration: reduce ? 0.1 : 0.16, ease: EASE_OUT } }}
            >
              <PostCard post={current} script={s} inTelegram={false} inspector advance />
            </motion.div>
          </AnimatePresence>
          {keysUsed && <p className="mt-4 px-1 text-[12.5px] text-ink-3">{c.keys.hint}</p>}
          <div className="mt-6 @min-[920px]:hidden">{inspector}</div>
        </div>

        <div className="sticky top-3 hidden max-h-[calc(100dvh-24px)] overflow-auto @min-[920px]:block">{inspector}</div>
      </div>
    </div>
  );
}
