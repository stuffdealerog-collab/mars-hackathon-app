import type { PostDraft, Script } from "@/lib/uslub/contract";
import { Check, ChevronRight, Send } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { PostImage } from "../../media";
import * as api from "../../studio/api";
import { pictureBusy, useStudio } from "../../studio/store";
import { fmt, keepNumbers, useCopy, useLang } from "../../ui/lang";
import { blankNote, blankTokens } from "../blank";
import { useBlank } from "../use-blank";
import { useMiniCopy } from "../copy";
import { PRIORITY, useBottomButtons, useLatest, useNav, type BtnSpec } from "../nav";
import { hasNativeSecondary } from "../native";
import { TopBar } from "../Shell";
import { haptic, openLink, popup } from "../tg";
import { scriptOf, usePostScript, useWhen } from "./Posts";

type Status = "draft" | "approved" | "published";
const statusOf = (p: PostDraft): Status => (p.status === "published" ? "published" : p.status === "approved" ? "approved" : "draft");
/** A picture still being started or drawn: publishing waits for it (the store's own rule). */
const picturePending = (p: PostDraft) => pictureBusy(p.id, p.image);

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
    // The MainButton is a deliberate tap: no undo delay on the phone.
    const r = await useStudio.getState().approve(id, 0);
    if (r.ok) {
      haptic.success();
      say(m.post.approvedToast, "ok");
      return;
    }
    if (!r.message && !useStudio.getState().postNote[id]) return; // already in flight
    // A blank left in the text is the owner's to fill, never an error: the hint shows on the post.
    if (useStudio.getState().postNote[id]?.tone === "hint") haptic.warn();
    else refuse(r.message || c.posts.approveError);
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
    const r = await st.publish(id, script);
    if (r.ok) {
      haptic.success();
      say(m.post.publishedToast, "ok");
      return;
    }
    if (useStudio.getState().postNote[id]?.tone === "hint") {
      haptic.warn();
      return;
    }
    // Not a failure of the post: the answer was lost (network, timeout) or another tap is posting it
    // right now (409 publish_in_progress). Ask the server before offering «Kanalga joylash» again.
    const busyNow = r.code === "publish_in_progress";
    const lost = r.message === c.error.network || r.message === c.error.timeout;
    if (busyNow || lost) {
      useNav.setState({ checking: { ...useNav.getState().checking, [id]: busyNow ? "busy" : "lost" } });
      if (busyNow) useStudio.setState({ postNote: { ...useStudio.getState().postNote, [id]: undefined } });
      const out = await wasPublished(id, busyNow ? 4 : 2);
      useNav.setState({ checking: { ...useNav.getState().checking, [id]: undefined } });
      if (out) {
        useStudio.setState({ posts: useStudio.getState().posts.map((p) => (p.id === id ? { ...p, status: "published", publishedUrl: out.url ?? p.publishedUrl } : p)), postNote: { ...useStudio.getState().postNote, [id]: undefined } });
        haptic.success();
        say(m.post.publishedToast, "ok");
        return;
      }
      if (busyNow) {
        // Still going out on the other tap: said quietly, never as an error.
        say(r.message);
        return;
      }
    }
    // The bot is not an admin of the owner's channel: not a popup with a bare link, but the
    // add-the-bot card naming that channel; it publishes again when the owner comes back.
    if (useStudio.getState().adminAsk?.postId === id) {
      haptic.warn();
      useNav.getState().openIntro("admin", "over");
      return;
    }
    refuse(r.message || c.error.generic, r.adminUrl);
  };

  return { approve, publish };
}

/** Reads the post back (unthrottled): did the publish go out after all? A few tries, 2.5 s apart. */
async function wasPublished(id: string, tries = 2): Promise<{ url?: string } | null> {
  const brand = useStudio.getState().brand;
  if (!brand) return null;
  for (let i = 0; i < tries; i++) {
    if (i) await new Promise((r) => setTimeout(r, 2500));
    const r = await api.listPosts(brand.id, useLang.getState().lang);
    if (!r.ok) continue;
    const p = r.data.posts.find((x) => x.id === id);
    if (p?.status === "published") return { url: p.publishedUrl };
    if (p && i === tries - 1) return null;
  }
  return null;
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
  // While the pager moves, the MainButton would act on the post it is leaving: it waits for the snap.
  const [moving, setMoving] = useState(false);
  const movingRef = useLatest(moving);

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
      setMoving(false);
    };
    const onScroll = () => {
      if (!movingRef.current && Math.abs(el.scrollLeft - indexRef.current * el.clientWidth) > 4) setMoving(true);
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
  }, [indexRef, movingRef]);

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
  const checking = useNav((st) => (post ? st.checking[post.id] : undefined));
  // Pictures are still coming (the store has not reached this post yet, or it is drawing): publishing
  // now would send text only.
  const picturesExpected = useStudio((st) => !st.sample && st.steps.some((x) => x.key === "images" && (x.status === "run" || x.status === "wait")));
  const pictureComing = !!post && (picturePending(post) || (picturesExpected && !post.image?.url));
  /** The post under the pager right now (the tap may come before the snap settles). */
  const settled = (pid: string) => {
    const el = deck.current;
    const i = el ? Math.round(el.scrollLeft / Math.max(1, el.clientWidth)) : index;
    return posts[i]?.id === pid;
  };
  const edit = () => {
    if (!post) return;
    haptic.tap();
    openSheet({ name: "edit", postId: post.id });
  };

  let main: BtnSpec | null = null;
  let secondary: BtnSpec | null = null;
  if (post) {
    if (status !== "published" && blank) {
      main = { text: m.post.fill, onClick: edit, active: !moving };
    } else if (status === "draft") {
      main = { text: busy === "approve" ? c.posts.approving : c.posts.approve, onClick: () => settled(post.id) && void approve(post.id), progress: busy === "approve", active: !moving };
      secondary = { text: c.posts.edit, onClick: edit, active: !moving };
    } else if (status === "approved") {
      main = checking
        ? { text: checking === "busy" ? c.posts.publishing : m.post.checking, onClick: () => undefined, progress: true }
        : pictureComing
          ? { text: m.post.waitPicture, onClick: () => undefined, active: false }
          : { text: busy === "publish" ? c.posts.publishing : c.posts.publish, onClick: () => settled(post.id) && void publish(post.id, s), progress: busy === "publish", shine: true, active: !moving };
    } else {
      const url = post.publishedUrl;
      if (nextOpen >= 0) {
        main = { text: m.post.next, onClick: () => (haptic.tap(), goTo(nextOpen)), active: !moving };
        if (url) secondary = { text: c.posts.openPost, onClick: () => openLink(url), active: !moving };
      } else if (url) main = { text: c.posts.openPost, onClick: () => openLink(url), active: !moving };
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

function PostPage({ post, script, current, pro, label }: { post: PostDraft; script: Script; current: boolean; pro: boolean; label: string }) {
  const c = useCopy();
  const m = useMiniCopy();
  const lang = useLang((s) => s.lang);
  const when = useWhen()(post);
  const channelName = useStudio((s) => s.brand?.dna.name || s.brand?.channel || (s.input.channel ? `@${s.input.channel}` : "Kanal"));
  const sample = useStudio((s) => s.sample);
  const setImage = useStudio((s) => s.setImage);
  const visual = useStudio((s) => s.brand?.visual);
  const fresh = useStudio((s) => s.mode === "fresh");
  const edited = useStudio((s) => !!s.edited[post.id]?.[script]);
  const note = useStudio((s) => s.postNote[post.id]);
  const blank = useBlank(post);
  // Reserve the picture slot while pictures are on their way, so the post never jumps when one lands.
  const picturesExpected = useStudio((s) => !s.sample && s.steps.some((x) => x.key === "images" && (x.status === "run" || x.status === "wait")));
  const openSheet = useNav((s) => s.openSheet);
  const status = statusOf(post);
  const text = post.variants[script] ?? "";
  // Which pictures the style came from, under a ready picture: "Kanalingizdagi 4 ta rasm asosida".
  const n = post.image?.refsUsed ?? 0;
  const owner = visual?.refs.some((r) => r.source === "owner") ?? false;
  const refs = n > 0 ? { palette: visual?.palette.slice(0, 4), text: fmt(fresh ? c.refs.owner : owner ? c.refs.mixed : c.refs.channel, { n }) } : undefined;
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
          {/* The sample bakery has no pictures: no empty frame for it. */}
          {(!sample || post.image) && (
            <PostImage
              key={post.id}
              postId={post.id}
              initial={post.image ?? null}
              autoStart={false}
              expected={picturesExpected}
              // Only a draft's picture can change: a redrawn approved post would no longer match the bot's preview.
              locked={status !== "draft" || sample}
              // Never the model name, the English prompt or the sample count for an owner; Pro keeps
              // the product photo button.
              pro={false}
              allowProductPhoto={pro}
              lang={lang}
              authorization={api.authHeader()}
              refs={refs}
              onChange={(img) => setImage(post.id, img)}
              className="ma-postimage"
            />
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
              <TextWithBlanks text={text} tokens={blank ? blankTokens(post, script, note) : []} />
            </p>
            <p className="mt-1.5 text-right text-[12px] text-ink-3">
              {edited && <span className="mr-2">{m.post.edited}</span>}
              {post.slot?.time}
            </p>
          </div>
        </div>

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
