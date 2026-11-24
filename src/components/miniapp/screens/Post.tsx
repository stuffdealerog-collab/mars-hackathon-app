import type { PostDraft, PostImage as PostImageData, Script } from "@/lib/uslub/contract";
import { Check, ChevronRight, Send } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { PostImage } from "../../media";
import * as api from "../../studio/api";
import { PostPicture } from "../../studio/PostPicture";
import { useStudio } from "../../studio/store";
import { fmt, keepNumbers, useCopy, useLang } from "../../ui/lang";
import { blankNote, blankTokens, useBlank } from "../blank";
import { useMiniCopy } from "../copy";
import { PRIORITY, useBottomButtons, useLatest, useNav, type BtnSpec } from "../nav";
import { hasNativeSecondary } from "../native";
import { TopBar } from "../Shell";
import { haptic, openLink, popup } from "../tg";
import { scriptOf, usePostScript, useWhen } from "./Posts";

type Status = "draft" | "approved" | "published";
const statusOf = (p: PostDraft): Status => (p.status === "published" ? "published" : p.status === "approved" ? "approved" : "draft");
const picturePending = (p: PostDraft) => !!p.image && (p.image.status === "queued" || p.image.status === "running");

/** Keeps the store's copy of a post's picture in step with what PostImage shows (thumbnails, publish gate). */
const setPostImage = (id: string, image: PostImageData) =>
  useStudio.setState({ posts: useStudio.getState().posts.map((p) => (p.id === id ? { ...p, image } : p)) });

/** Approve, then publish, from inside Telegram (no bot detour). Outcomes answer with haptics, a toast or a native popup. */
export function usePostActions() {
  const c = useCopy();
  const m = useMiniCopy();
  const say = useNav((s) => s.say);
  const openSheet = useNav((s) => s.openSheet);

  /** A refusal the owner must read: a native popup (the full text stays on the post), a toast where there is none. */
  const refuse = (text: string, adminUrl?: string) => {
    haptic.error();
    if (!popup(text, adminUrl ? { text: m.admin.open, onPress: () => openLink(adminUrl) } : undefined)) say(text, "bad");
  };

  const approve = async (id: string) => {
    haptic.press();
    await useStudio.getState().approve(id);
    const st = useStudio.getState();
    const p = st.posts.find((x) => x.id === id);
    if (p?.status === "approved") {
      haptic.success();
      say(m.post.approvedToast, "ok");
      return;
    }
    const note = st.postNote[id];
    // A blank left in the text is the owner's to fill, never an error: the hint shows on the post.
    if (note?.tone === "hint") haptic.warn();
    else refuse(note?.text ?? c.posts.approveError);
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
    if (note?.tone === "hint") haptic.warn();
    else refuse(note?.text ?? c.error.generic, note?.href);
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
  // A blank the writer could not fill (a price, a code): the owner fills it before it can go out.
  const blank = useBlank(post);
  const edit = () => {
    if (!post) return;
    haptic.tap();
    openSheet({ name: "edit", postId: post.id });
  };

  let main: BtnSpec | null = null;
  let secondary: BtnSpec | null = null;
  if (post) {
    if (status !== "published" && blank) {
      main = { text: m.post.fill, onClick: edit };
    } else if (status === "draft") {
      main = { text: busy === "approve" ? c.posts.approving : c.posts.approve, onClick: () => void approve(post.id), progress: busy === "approve" };
      secondary = { text: c.posts.edit, onClick: edit };
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

/** The post text with each unfilled blank ("[kod]") underlined in amber. */
function TextWithBlanks({ text, tokens }: { text: string; tokens: string[] }) {
  if (!tokens.length) return <>{keepNumbers(text)}</>;
  const esc = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = keepNumbers(text).split(new RegExp(`(${esc.join("|")})`, "g"));
  return (
    <>
      {parts.map((part, i) => (tokens.includes(part) ? <mark key={i} className="ma-blank">{part}</mark> : <Fragment key={i}>{part}</Fragment>))}
    </>
  );
}

/** "Kanalingizdagi 4 ta rasm asosida": which pictures the style came from, with the channel's palette. */
function RefsLine({ post }: { post: PostDraft }) {
  const m = useMiniCopy();
  const visual = useStudio((s) => s.brand?.visual);
  const fresh = useStudio((s) => s.mode === "fresh");
  const img = post.image;
  if (img?.status !== "ready" || !img.url || !img.refsUsed) return null;
  const owner = visual?.refs.some((r) => r.source === "owner");
  const channel = visual?.refs.some((r) => r.source === "channel");
  const text = fresh ? m.refs.owner : owner && channel ? m.refs.mixed : owner ? m.refs.owner : m.refs.channel;
  return (
    <p className="mt-2.5 flex items-center gap-2 px-1 text-[13px] text-ink-2">
      {visual?.palette?.length ? (
        <span aria-hidden className="flex shrink-0 gap-1">
          {visual.palette.slice(0, 4).map((col) => (
            <span key={col} className="h-3 w-3 rounded-full shadow-[inset_0_0_0_1px_var(--hair-2)]" style={{ background: col }} />
          ))}
        </span>
      ) : null}
      <span className="min-w-0">{fmt(text, { n: img.refsUsed })}</span>
    </p>
  );
}

function PostPage({ post, script, current, pro, label }: { post: PostDraft; script: Script; current: boolean; pro: boolean; label: string }) {
  const c = useCopy();
  const m = useMiniCopy();
  const lang = useLang((s) => s.lang);
  const when = useWhen()(post);
  const channelName = useStudio((s) => s.brand?.dna.name || s.brand?.channel || (s.input.channel ? `@${s.input.channel}` : "Kanal"));
  const sample = useStudio((s) => s.sample);
  const edited = useStudio((s) => !!s.edited[post.id]?.[script]);
  const note = useStudio((s) => s.postNote[post.id]);
  const blank = useBlank(post);
  // Reserve the picture slot while pictures are on their way, so the post never jumps when one lands.
  const picturesExpected = useStudio((s) => !s.sample && s.steps.some((x) => x.key === "images" && (x.status === "run" || x.status === "wait")));
  const openSheet = useNav((s) => s.openSheet);
  const status = statusOf(post);
  const text = post.variants[script] ?? "";
  // Only a draft's picture can change: redrawing an approved post would no longer match what the bot previewed.
  const live = status === "draft" && !sample && (!!post.image || !picturesExpected);
  const hint = blankNote(post) || (note?.tone === "hint" ? note.text : null) || (blank ? m.post.blank : null);
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

        {blank && hint && status !== "published" && (
          <p role="note" className="ma-hint mb-3">
            {hint}
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
          {live ? (
            <PostImage
              key={`${post.id}:${post.image ? "i" : "n"}`}
              postId={post.id}
              initial={post.image ?? null}
              autoStart={false}
              pro={pro}
              lang={lang}
              initData={api.tgInitData()}
              onChange={(img) => setPostImage(post.id, img)}
              className="ma-postimage"
            />
          ) : (
            <PostPicture image={post.image} alt={c.posts.image.alt} expected={picturesExpected} />
          )}
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
              <TextWithBlanks text={text} tokens={blank ? blankTokens(post, script) : []} />
            </p>
            <p className="mt-1.5 text-right text-[12px] text-ink-3">
              {edited && <span className="mr-2">{m.post.edited}</span>}
              {post.slot?.time}
            </p>
          </div>
        </div>
        <RefsLine post={post} />

        {note?.tone === "bad" && (
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
