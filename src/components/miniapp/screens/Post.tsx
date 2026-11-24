import type { PostDraft, Script } from "@/lib/uslub/contract";
import { Check, ChevronRight, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PostPicture } from "../../studio/PostPicture";
import { useStudio } from "../../studio/store";
import { fmt, keepNumbers, useCopy } from "../../ui/lang";
import { blankNote, hasBlank } from "../blank";
import { useMiniCopy } from "../copy";
import { PRIORITY, useBottomButtons, useLatest, useNav, type BtnSpec } from "../nav";
import { hasNativeSecondary } from "../native";
import { TopBar } from "../Shell";
import { haptic, openLink } from "../tg";
import { scriptOf, usePostScript, useWhen } from "./Posts";

type Status = "draft" | "approved" | "published";
const statusOf = (p: PostDraft): Status => (p.status === "published" ? "published" : p.status === "approved" ? "approved" : "draft");
const picturePending = (p: PostDraft) => !!p.image && (p.image.status === "queued" || p.image.status === "running");

/** Approve, then publish, from inside Telegram (no bot detour). Returns the outcome for haptics. */
export function usePostActions() {
  const c = useCopy();
  const m = useMiniCopy();
  const say = useNav((s) => s.say);
  const openSheet = useNav((s) => s.openSheet);

  const approve = async (id: string) => {
    haptic.press();
    await useStudio.getState().approve(id);
    const st = useStudio.getState();
    const p = st.posts.find((x) => x.id === id);
    if (p?.status === "approved") {
      haptic.success();
      say(m.post.approvedToast, "ok");
    } else {
      haptic.error();
      say(st.postNote[id]?.text ?? c.posts.approveError, "bad");
    }
  };

  const publish = async (id: string, script: Script) => {
    const st = useStudio.getState();
    if (st.sample) {
      haptic.warn();
      say(c.posts.samplePublish);
      return;
    }
    const chat = st.brand?.channel ?? (st.input.channel ? `@${st.input.channel}` : "");
    if (!chat) {
      // A brand from a description with no channel yet: ask for it here, not in the bot.
      haptic.tap();
      openSheet({ name: "channel", postId: id });
      return;
    }
    haptic.press();
    await st.publish(id, script);
    const after = useStudio.getState();
    const p = after.posts.find((x) => x.id === id);
    if (p?.status === "published") {
      haptic.success();
      say(m.post.publishedToast, "ok");
      return;
    }
    const note = after.postNote[id];
    if (note?.href) {
      haptic.warn();
      openSheet({ name: "admin", postId: id });
      return;
    }
    haptic.error();
    say(note?.text ?? c.error.generic, "bad");
  };

  return { approve, publish };
}

/** One post, full size, as subscribers will see it; swipe sideways for the next one. */
export function PostScreen({ id, active }: { id: string; active: boolean }) {
  const c = useCopy();
  const m = useMiniCopy();
  const posts = useStudio((s) => s.posts);
  const busyMap = useStudio((s) => s.busy);
  const pro = useStudio((s) => s.pro);
  const openSheet = useNav((s) => s.openSheet);
  const { script } = usePostScript();
  const { approve, publish } = usePostActions();
  const when = useWhen();
  const deck = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(() => Math.max(0, posts.findIndex((p) => p.id === id)));
  // The post went away (a new run, another device): nothing to show here, go back.
  const [missing] = useState(() => !posts.some((p) => p.id === id));
  useEffect(() => {
    if (missing) useNav.getState().back();
  }, [missing]);
  const indexRef = useLatest(index);

  // Open on the tapped post without an animated scroll.
  useEffect(() => {
    const el = deck.current;
    if (el) el.scrollLeft = index * el.clientWidth;
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The page under the finger becomes current once the snap settles.
  useEffect(() => {
    const el = deck.current;
    if (!el) return;
    let timer = 0;
    const settle = () => {
      const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
      if (i !== indexRef.current) {
        haptic.select();
        setIndex(i);
      }
    };
    const onScroll = () => {
      clearTimeout(timer);
      timer = window.setTimeout(settle, 90);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("scrollend", settle);
    return () => {
      clearTimeout(timer);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("scrollend", settle);
    };
  }, [indexRef]);

  const goTo = (i: number) => {
    const el = deck.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: i * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
  };

  const post = posts[index];
  const s = post ? scriptOf(post, script) : script;
  const status = post ? statusOf(post) : "draft";
  const busy = post ? busyMap[post.id] : undefined;
  const nextOpen = posts.findIndex((p, i) => i !== index && statusOf(p) !== "published");
  // A blank the writer could not fill (a price, a code): the owner fills it before approving.
  const blank = useStudio((st) => !!post && hasBlank(post) && !st.edited[post.id]);

  let main: BtnSpec | null = null;
  let secondary: BtnSpec | null = null;
  if (post) {
    if (status === "draft" && blank) {
      main = { text: m.post.fill, onClick: () => (haptic.tap(), openSheet({ name: "edit", postId: post.id })) };
    } else if (status === "draft") {
      main = { text: busy === "approve" ? c.posts.approving : c.posts.approve, onClick: () => void approve(post.id), progress: busy === "approve" };
      secondary = { text: c.posts.edit, onClick: () => (haptic.tap(), openSheet({ name: "edit", postId: post.id })) };
    } else if (status === "approved") {
      main = picturePending(post)
        ? { text: m.post.waitPicture, onClick: () => undefined, active: false }
        : { text: busy === "publish" ? c.posts.publishing : c.posts.publish, onClick: () => void publish(post.id, s), progress: busy === "publish", shine: true };
    } else {
      const url = post.publishedUrl;
      if (nextOpen >= 0) {
        main = { text: m.post.next, onClick: () => (haptic.tap(), goTo(nextOpen)) };
        if (url) secondary = { text: c.posts.openPost, onClick: () => openLink(url) };
      } else if (url) main = { text: c.posts.openPost, onClick: () => openLink(url) };
    }
  }
  useBottomButtons("post", PRIORITY.pushed, active, main, secondary);
  const inlineSecondary = !!secondary && !hasNativeSecondary();

  return (
    <>
      {/* In fullscreen the row between Telegram's pills says when this post goes out. */}
      <TopBar title={post ? (when(post) ?? fmt(m.post.counter, { i: index + 1, n: posts.length })) : ""} compact={false} pinned />
      <div className="flex min-h-0 flex-1 flex-col pt-[var(--ma-top)]">
        <div className="ma-dots ma-chrome py-2.5" aria-hidden>
          {posts.map((p, i) => (
            <span key={p.id} data-on={i === index ? "true" : "false"} data-state={statusOf(p)} />
          ))}
        </div>
        <div ref={deck} className="ma-deck" aria-roledescription="carousel">
          {posts.map((p, i) => (
            <PostPage key={p.id} post={p} script={scriptOf(p, script)} current={i === index} pro={pro} label={fmt(m.post.counter, { i: i + 1, n: posts.length })} />
          ))}
        </div>
        {inlineSecondary && secondary && (
          <div className="px-4 pb-3 pt-2">
            <button type="button" className="btn-2 w-full" onClick={secondary.onClick}>
              {secondary.text}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function PostPage({ post, script, current, pro, label }: { post: PostDraft; script: Script; current: boolean; pro: boolean; label: string }) {
  const c = useCopy();
  const m = useMiniCopy();
  const when = useWhen()(post);
  const channelName = useStudio((s) => s.brand?.dna.name || s.brand?.channel || (s.input.channel ? `@${s.input.channel}` : "Kanal"));
  const retryImage = useStudio((s) => s.retryImage);
  const sample = useStudio((s) => s.sample);
  const edited = useStudio((s) => !!s.edited[post.id]?.[script]);
  const note = useStudio((s) => s.postNote[post.id]);
  const blank = useStudio((s) => hasBlank(post) && !s.edited[post.id]);
  // Reserve the 4:5 slot while pictures are on their way, so the post never jumps when one lands.
  const picturesExpected = useStudio((s) => !s.sample && s.steps.some((x) => x.key === "images" && (x.status === "run" || x.status === "wait")));
  const openSheet = useNav((s) => s.openSheet);
  const status = statusOf(post);
  const text = post.variants[script] ?? "";
  // Approving answers with one lime ring around the post (state derived during render).
  const [seen, setSeen] = useState(status);
  const [pulse, setPulse] = useState(0);
  if (status !== seen) {
    setSeen(status);
    if (status === "approved") setPulse((n) => n + 1);
  }

  return (
    <article className="ma-page" aria-roledescription="slide" aria-label={label} inert={!current ? true : undefined}>
      <div className="px-4 pb-8 pt-1">
        <p className="ma-inline-when min-h-9 truncate px-1 pb-2.5 pt-1.5 text-[14px] text-ink-2">{when ? fmt(c.posts.when, { when }) : null}</p>

        {blank && status === "draft" && (
          <p role="note" className="mb-3 rounded-2xl bg-[color-mix(in_oklab,var(--led)_14%,transparent)] px-4 py-3 text-[14.5px] leading-snug">
            {blankNote(post) || m.post.blank}
          </p>
        )}

        {/* Drawn close to Telegram's own channel post, so the owner sees what subscribers will see. */}
        <div className="tgpost relative">
          {pulse > 0 && <span key={pulse} aria-hidden className="ma-pulse" />}
          {/* The status sits on the post's corner, so approving never moves the post. */}
          {status !== "draft" && (
            <span className="ma-stamp ma-stamp--over" data-state={status}>
              {status === "published" ? <Send className="h-3.5 w-3.5" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
              {status === "published" ? m.posts.published : m.posts.approved}
            </span>
          )}
          <PostPicture image={post.image} alt={c.posts.image.alt} expected={picturesExpected} onRetry={sample ? undefined : () => void retryImage(post.id)} />
          <div className="px-4 pb-2.5 pt-3">
            <div className={`mb-2 flex items-center gap-2.5 ${status !== "draft" && !post.image ? "pr-32" : ""}`}>
              <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[14px] font-semibold text-white" style={{ background: "linear-gradient(160deg, #C86B3C, #6b3115)" }}>
                {channelName.replace(/^@/, "").slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 truncate text-[14.5px] font-semibold" style={{ color: "color-mix(in oklab, #E08A55 70%, var(--ink))" }}>
                {channelName}
              </span>
            </div>
            <p lang={script === "ru" ? "ru" : script === "en" ? "en" : "uz"} className="post-text select-text">
              {keepNumbers(text)}
            </p>
            <p className="mt-1.5 text-right text-[12px] text-ink-3">
              {edited && <span className="mr-2">{m.post.edited}</span>}
              {post.slot?.time}
            </p>
          </div>
        </div>

        {note?.tone === "bad" && !note.href && (
          <p role="alert" className="mt-3 px-1 text-[14px] leading-snug text-bad">
            {note.text}
          </p>
        )}

        {pro && (
          <div className="ma-group mt-4">
            <button
              type="button"
              className="ma-row ma-press"
              onClick={() => {
                haptic.tap();
                openSheet({ name: "details", postId: post.id });
              }}
            >
              <span className="min-w-0 flex-1 text-[15.5px] font-medium">{m.post.details}</span>
              <span className="truncate text-[13.5px] text-ink-3">{post.slot ? c.channel.goal[post.slot.goal] : null}</span>
              <ChevronRight className="h-5 w-5 shrink-0 text-ink-3" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
