import type { PostDraft, Script } from "@/lib/uslub/contract";
import { Check, ChevronDown, ChevronRight, ImageOff } from "lucide-react";
import { useEffect, useState } from "react";
import { lampVars } from "../../lamp/lamps";
import { slotKey, useStudio } from "../../studio/store";
import { plural, weekday } from "../../ui/format";
import { fmt, useCopy, useLang, type Lang } from "../../ui/lang";
import { useBlank } from "../blank";
import { useMiniCopy } from "../copy";
import { useNav } from "../nav";
import { TopBar, useCompact } from "../Shell";
import { haptic } from "../tg";

const SCRIPTS: Script[] = ["uz_latn", "uz_cyrl", "ru", "en"];
const SCRIPT_FOR: Record<Lang, Script> = { uz: "uz_latn", ru: "ru", en: "en" };

/**
 * One post language for the whole list, and the one that gets published: the channel's own (the
 * brand's languages), never the Telegram UI language. The UI language is only a fallback when the
 * brand has none. The switch shows only when the channel itself writes in two languages or more.
 */
export function usePostScript(): { script: Script; available: Script[] } {
  const lang = useLang((s) => s.lang);
  const posts = useStudio((s) => s.posts);
  const picked = useStudio((s) => s.postScript);
  const channelLangs = useStudio((s) => s.brand?.dna.languages) ?? [];
  const all = SCRIPTS.filter((s) => posts.some((p) => p.variants[s]?.trim()));
  const own = channelLangs.find((s) => all.includes(s));
  const fallback = own ?? (all.includes(SCRIPT_FOR[lang]) ? SCRIPT_FOR[lang] : (all[0] ?? "uz_latn"));
  const script = picked && all.includes(picked) ? picked : fallback;
  return { script, available: all.length > 1 && channelLangs.length > 1 ? all : [] };
}

/** The script a single post shows: the list's choice when the post has it, else Uzbek Latin. */
export const scriptOf = (p: PostDraft, s: Script): Script => (p.variants[s]?.trim() ? s : "uz_latn");

/** "Dushanba, 07:30" from the post's plan slot (Russian keeps weekdays in lower case mid-line). */
export function useWhen() {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  return (p: PostDraft) => {
    const slot = p.slot;
    if (!slot) return null;
    const d = weekday(slot.day);
    const day = d != null ? (lang === "ru" ? c.weekdays[d].toLowerCase() : c.weekdays[d]) : null;
    return [day, slot.time].filter(Boolean).join(", ");
  };
}

/** Played once: the first time the posts arrive after a run, the list rises in. */
const played = { list: false };

/** «Postlar»: every post as a row; tap opens it full size with the actions. */
export function PostsScreen({ onOpen, active }: { onOpen: (id: string) => void; active: boolean }) {
  const c = useCopy();
  const m = useMiniCopy();
  const posts = useStudio((s) => s.posts);
  const setTab = useStudio((s) => s.setTab);
  const openSheet = useNav((s) => s.openSheet);
  const { script, available } = usePostScript();
  const { ref, compact } = useCompact(40);
  // The first list of the session rises in once; later visits show it in place.
  const [rise] = useState(() => !played.list);
  useEffect(() => {
    if (active && posts.length) played.list = true;
  }, [active, posts.length]);

  const done = posts.filter((p) => p.status === "approved" || p.status === "published").length;

  return (
    <>
      <TopBar title={m.posts.title} compact={compact} />
      <div ref={ref} className="ma-scroll">
        <div className="ma-pad">
          <div className="flex items-center justify-between gap-3">
            <h1 className="ma-h1">{m.posts.title}</h1>
            {available.length > 1 && (
              <button
                type="button"
                className="ma-chip"
                aria-label={`${c.posts.langLabel}: ${c.posts.scriptNames[script]}`}
                onClick={() => {
                  haptic.tap();
                  openSheet({ name: "lang" });
                }}
              >
                {c.posts.scripts[script]}
                <ChevronDown className="h-4 w-4 text-ink-3" aria-hidden />
              </button>
            )}
          </div>
          {posts.length > 0 && <p className="tnum mt-1 text-[14px] text-ink-2">{fmt(m.posts.done, { n: done, m: posts.length })}</p>}

          {posts.length === 0 ? (
            <div className="ma-group mt-6 flex flex-col items-start gap-3 p-4">
              <p className="text-[15px] text-ink-2">{m.posts.empty}</p>
              <button type="button" className="btn-2 !min-h-11" onClick={() => setTab("channel")}>
                {m.posts.emptyGo}
              </button>
            </div>
          ) : (
            <ul className="mt-5 flex flex-col gap-2.5">
              {posts.map((p, i) => (
                <li key={p.id} className={rise ? "ma-rise" : undefined} style={{ ["--i" as string]: i }}>
                  <PostRow post={p} script={scriptOf(p, script)} onOpen={() => onOpen(p.id)} />
                </li>
              ))}
            </ul>
          )}

          <Missed />

          {posts.length > 0 && (
            <button
              type="button"
              className="mx-auto mt-6 flex min-h-11 items-center gap-1 px-3 text-[14.5px] font-medium text-ink-2"
              onClick={() => {
                haptic.tap();
                setTab("channel");
              }}
            >
              {m.posts.toPlan}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/** Posts the run asked for but did not get: how many, and one tap to write them again. */
function Missed() {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const missed = useStudio((s) => s.missed);
  const writing = useStudio((s) => s.missed.some((it) => s.writingSlot[slotKey(it)]));
  const writeMissed = useStudio((s) => s.writeMissed);
  if (!missed.length) return null;
  return (
    <div className="ma-group mt-2.5 flex items-center gap-3 py-2 pl-4 pr-2">
      <p className="min-w-0 flex-1 text-[14.5px] text-ink-2">
        {missed.length} {plural(c.posts.missed, missed.length, lang)}
      </p>
      <button
        type="button"
        className="btn-2 !min-h-11 shrink-0 !px-4 !text-[15px]"
        disabled={writing}
        onClick={() => {
          haptic.press();
          void writeMissed();
        }}
      >
        {writing ? <span className="breathe">{c.channel.writingSlot}</span> : c.posts.rewrite}
      </button>
    </div>
  );
}

function PostRow({ post, script, onOpen }: { post: PostDraft; script: Script; onOpen: () => void }) {
  const m = useMiniCopy();
  const when = useWhen()(post);
  // The picture slot stays reserved while pictures are on their way, so rows never shift.
  const expected = useStudio((s) => !s.sample && s.steps.some((x) => x.key === "images" && (x.status === "run" || x.status === "wait")));
  const thumb = !!post.image || expected;
  const blank = useBlank(post);
  const text = (post.variants[script] ?? "").trim();
  const status = post.status === "published" ? "published" : post.status === "approved" ? "approved" : "draft";
  return (
    <button
      type="button"
      className={`ma-group ma-card-press flex w-full items-stretch gap-3.5 p-2.5 pr-3 text-left ${thumb ? "" : "!pl-4"}`}
      onClick={() => {
        haptic.tap();
        onOpen();
      }}
    >
      {thumb && <Thumb post={post} />}
      <span className="flex min-w-0 flex-1 flex-col py-0.5">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] text-ink-2">{when}</span>
          {/* A status appears once the owner acted; a draft needs no label, unless it waits for a fact. */}
          {status !== "draft" ? (
            <StatusDot status={status} label={m.posts[status]} />
          ) : blank ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] font-semibold text-led">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-led" />
              {m.post.fill}
            </span>
          ) : null}
        </span>
        <span lang={script === "ru" ? "ru" : script === "en" ? "en" : "uz"} className="mt-1 line-clamp-3 text-[15px] leading-snug">
          {text}
        </span>
      </span>
    </button>
  );
}

function StatusDot({ status, label }: { status: "draft" | "approved" | "published"; label: string }) {
  const color = status === "published" ? "text-[#25d0c2]" : status === "approved" ? "text-ok" : "text-ink-3";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 text-[12.5px] font-semibold ${color}`}>
      {status !== "draft" && <Check className="h-3.5 w-3.5" aria-hidden />}
      {label}
    </span>
  );
}

/** The post's picture as a thumbnail; while it is drawn, the Designer's lamp warms in its place. */
export function Thumb({ post, className = "" }: { post: PostDraft; className?: string }) {
  const m = useMiniCopy();
  const img = post.image;
  if (img?.status === "ready" && img.url) {
    return (
      <span className={`ma-thumb ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- generated picture on an external https host */}
        <img src={img.url} alt="" loading="lazy" className="h-full w-full object-cover" />
      </span>
    );
  }
  if (img && (img.status === "queued" || img.status === "running")) {
    return (
      <span className={`ma-thumb lamp lamp--xs !min-h-0 ${className}`} data-state="warming" style={lampVars("designer")} role="img" aria-label={m.posts.pictureWait}>
        <span className="lamp__glow" aria-hidden />
        <span className="lamp__filament" aria-hidden />
      </span>
    );
  }
  return (
    <span className={`ma-thumb grid place-items-center text-ink-3 ${className}`} aria-hidden>
      {img?.status === "failed" ? <ImageOff className="h-5 w-5" /> : <span className="h-[3px] w-4 rounded-full bg-[var(--hair-2)]" />}
    </span>
  );
}
