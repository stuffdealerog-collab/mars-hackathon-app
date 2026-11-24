"use client";

import type { PostDraft, Script } from "@/lib/uslub/contract";
import { Check } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { plural, weekday } from "../ui/format";
import { useCopy, useLang, type Lang } from "../ui/lang";
import { PostCard } from "./PostCard";
import { slotKey, useStudio } from "./store";

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
  return { available, script, scriptOf: (p: PostDraft): Script => (p.variants[script]?.trim() ? script : "uz_latn") };
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

/** Phone and Mini App: the posts one under another, dealt in once. */
export function PostsTab({ inTelegram }: { inTelegram: boolean }) {
  const c = useCopy();
  const posts = useStudio((s) => s.posts);
  const { available, script, scriptOf } = usePostScript();
  const reduce = useReducedMotion() ?? false;
  if (!posts.length) return <p className="text-[15px] text-ink-2">{c.posts.none}</p>;
  return (
    <div className="flex flex-col gap-6">
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
 * Desktop: the week's posts as a queue on the left, the chosen one on the right as subscribers
 * will see it in Telegram, with its picture and the owner's buttons.
 */
export function PostsSplit() {
  const c = useCopy();
  const posts = useStudio((s) => s.posts);
  const { available, script, scriptOf } = usePostScript();
  const [chosen, setChosen] = useState<string | null>(null);
  const reduce = useReducedMotion() ?? false;
  if (!posts.length) return <p className="text-[15px] text-ink-2">{c.posts.none}</p>;
  const current = posts.find((p) => p.id === chosen) ?? posts[0];

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const i = posts.findIndex((p) => p.id === current.id);
    const next = posts[(i + (e.key === "ArrowDown" ? 1 : posts.length - 1)) % posts.length];
    setChosen(next.id);
    document.getElementById(`queue-${next.id}`)?.focus();
  };

  return (
    <div className="grid grid-cols-[minmax(300px,380px)_minmax(0,1fr)] items-start gap-8 xl:gap-12">
      <div className="flex flex-col gap-4">
        <ScriptSwitch available={available} script={script} />
        <MissedNote />
        <ul className="flex flex-col gap-1.5" aria-label={c.tabs.posts} onKeyDown={onKey}>
          {posts.map((p, i) => (
            <motion.li
              key={p.id}
              initial={reduce ? false : { opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.36, ease: EASE_OUT, delay: Math.min(i, 6) * 0.05 }}
            >
              <QueueRow post={p} script={scriptOf(p)} active={p.id === current.id} onPick={() => setChosen(p.id)} />
            </motion.li>
          ))}
        </ul>
      </div>

      <div className="sticky top-6 w-full max-w-[480px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={current.id}
            initial={reduce ? false : { opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? undefined : { opacity: 0, x: -6 }}
            transition={{ duration: 0.24, ease: EASE_OUT }}
          >
            <PostCard post={current} script={scriptOf(current)} inTelegram={false} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/** One line of the queue: when, the post's first line, its picture, and where it stands. */
function QueueRow({ post, script, active, onPick }: { post: PostDraft; script: Script; active: boolean; onPick: () => void }) {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const text = post.variants[script] ?? "";
  const first = text.split("\n").find((l) => l.trim())?.trim() ?? "";
  const day = post.slot ? weekday(post.slot.day) : null;
  const dayName = day != null ? (lang === "ru" ? c.weekdays[day].toLowerCase() : c.weekdays[day]) : null;
  const when = post.slot ? [dayName, post.slot.time].filter(Boolean).join(", ") : "";
  const blank = post.status === "draft" && (post.placeholders?.find((p) => p.script === script)?.tokens ?? []).some((t) => text.includes(t));
  const done = post.status !== "draft";
  const url = post.image?.url;
  return (
    <button
      id={`queue-${post.id}`}
      type="button"
      aria-current={active ? "true" : undefined}
      tabIndex={active ? 0 : -1}
      onClick={onPick}
      className={`group flex w-full items-center gap-3.5 rounded-[18px] p-2 pr-3.5 text-left transition-[background-color,box-shadow] duration-150 ${
        active ? "bg-glass-2 shadow-[inset_0_0_0_1px_var(--hair-2)]" : "hover:bg-glass"
      }`}
    >
      <span className="relative aspect-[4/5] w-12 shrink-0 overflow-hidden rounded-[11px] bg-glass-2 shadow-[inset_0_0_0_1px_var(--hair)]">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span aria-hidden className="absolute inset-0" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] text-ink-3">{when}</span>
        <span className={`mt-0.5 line-clamp-2 text-[14.5px] leading-snug ${active ? "text-ink" : "text-ink-2 group-hover:text-ink"}`}>{first}</span>
      </span>
      {done ? (
        <Check className="h-4 w-4 shrink-0 text-ok" aria-label={post.status === "published" ? c.posts.published : c.posts.approved} />
      ) : blank ? (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-led shadow-[0_0_8px_var(--led)]" role="img" aria-label={c.posts.blankShort} />
      ) : null}
    </button>
  );
}
