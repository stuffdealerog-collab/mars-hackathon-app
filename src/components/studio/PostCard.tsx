import type { PostDraft, Script } from "@/lib/uslub/contract";
import { Check, ExternalLink } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useId, useState } from "react";
import { fmt, keepNumbers, useCopy, useLang } from "../ui/lang";
import { weekday } from "../ui/format";
import { PostImage } from "@/components/media";
import { botPublishUrl, tgInitData } from "./api";
import { PictureWaiting } from "./PostPicture";
import { useStudio } from "./store";

// Professional rejim only, loaded on demand.
const PostDetails = dynamic(() => import("./pro/ProDetails").then((m) => m.PostDetails), { ssr: false });

/** One post: picture, text in the list's chosen script, edit / approve / publish. */
export function PostCard({ post, script, inTelegram }: { post: PostDraft; script: Script; inTelegram: boolean }) {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const id = useId();
  const bot = useStudio((s) => s.bot);
  const busy = useStudio((s) => s.busy[post.id]);
  const note = useStudio((s) => s.postNote[post.id]);
  const editPost = useStudio((s) => s.editPost);
  const approve = useStudio((s) => s.approve);
  const publish = useStudio((s) => s.publish);
  const imageChanged = useStudio((s) => s.imageChanged);
  const sample = useStudio((s) => s.sample);
  const pro = useStudio((s) => s.pro);
  const channelName = useStudio((s) => s.brand?.dna.name || s.brand?.channel || (s.input.channel ? `@${s.input.channel}` : ""));
  // The run starts every picture itself (so they come even while the owner reads Kanal); until
  // this post's has started, the slot is reserved with the Dizayner's lamp so the card never jumps.
  const waiting = useStudio((s) => !s.sample && !post.image && s.steps.some((x) => x.key === "images" && x.status === "run"));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [pulse, setPulse] = useState(false);
  const [wasApproved, setWasApproved] = useState(post.status !== "draft");
  // Pulse once on the change to "approved" (state derived during render, no effect needed).
  if (post.status !== "draft" && !wasApproved) {
    setWasApproved(true);
    setPulse(true);
  }

  const text = post.variants[script] ?? "";
  const slot = post.slot;
  const day = slot ? weekday(slot.day) : null;
  // A suggestion, not a schedule: nothing is published by itself.
  // Russian writes weekdays in lower case mid-sentence ("Лучше выложить: понедельник, 07:30").
  const dayName = day != null ? (lang === "ru" ? c.weekdays[day].toLowerCase() : c.weekdays[day]) : null;
  const when = slot ? fmt(c.posts.when, { when: [dayName, slot.time].filter(Boolean).join(", ") }) : post.brief;
  const approved = post.status === "approved";
  const published = post.status === "published";
  const name = channelName || "Kanal";
  // A blank the writer could not fill ("Kod: [kod]"): the owner's fact to add, said quietly.
  const tokens = post.placeholders ? (post.placeholders.find((p) => p.script === script)?.tokens ?? []) : null;
  const blanks = tokens?.filter((t) => text.includes(t)) ?? [];
  const blankLeft = post.status === "draft" && !!post.note && (tokens ? blanks.length > 0 : true);
  // Named for the script on screen; the server's own sentence when it did not say which blanks.
  const blankText = blanks.length ? fmt(c.posts.blank, { facts: blanks.join(", ") }) : post.note;
  const hint = blankLeft ? blankText : note?.tone === "hint" ? note.text : null;

  return (
    <article aria-labelledby={`${id}-h`} className="@container">
      <header className="flex items-center justify-between gap-3 px-1 pb-2">
        <h3 id={`${id}-h`} className="min-w-0 text-[14px] text-ink-2">
          {when}
        </h3>
        {(approved || published) && (
          <span className="inline-flex shrink-0 items-center gap-1 text-[14px] font-medium text-ok">
            <Check className="h-4 w-4" aria-hidden />
            {published ? c.posts.published : c.posts.approved}
          </span>
        )}
      </header>

      {/* Drawn close to Telegram's own channel post, so the owner sees what subscribers will see. */}
      <div className="tgpost relative">
        {/* Approving answers with one lime pulse around the post: the owner's hand, confirmed. */}
        <AnimatePresence>
          {pulse && (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] shadow-[inset_0_0_0_2px_var(--lime)]"
              initial={{ opacity: 1, scale: 1 }}
              animate={{ opacity: 0, scale: 1.015 }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              onAnimationComplete={() => setPulse(false)}
            />
          )}
        </AnimatePresence>
        {sample ? null : waiting ? (
          <PictureWaiting />
        ) : (
          // The images session's card: develops the picture, "Boshqa variant", and in Pro the
          // product photo, refs and prompt. It re-mounts once the run's own start lands.
          <PostImage
            key={post.image ? "started" : "none"}
            postId={post.id}
            initial={post.image ?? null}
            lang={lang}
            pro={pro}
            autoStart={false}
            initData={tgInitData()}
            onChange={(img) => imageChanged(post.id, img)}
            className="p-1.5 [&>div:first-child]:rounded-[17px] [&>figcaption]:mt-1.5 [&>figcaption]:px-2.5 [&>figcaption~div]:px-2.5 [&>figcaption~div]:pb-1"
          />
        )}
        <div className="px-4 pb-2.5 pt-3">
          <div className="mb-2 flex items-center gap-2.5">
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[14px] font-semibold text-white" style={{ background: "linear-gradient(160deg, #C86B3C, #6b3115)" }}>
              {name.replace(/^@/, "").slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 truncate text-[14.5px] font-semibold text-[#E0956A]">{name}</span>
          </div>
          {editing ? (
            <>
              <label htmlFor={`${id}-t`} className="sr-only">
                {c.posts.textLabel}
              </label>
              <textarea id={`${id}-t`} className="input min-h-[220px]" value={draft} onChange={(e) => setDraft(e.target.value)} />
            </>
          ) : (
            <p lang={script === "ru" ? "ru" : script === "en" ? "en" : "uz"} className="post-text">
              {markBlanks(keepNumbers(text), blanks)}
            </p>
          )}
          {slot && <p className="mt-1.5 text-right text-[12px] text-ink-3">{slot.time}</p>}
        </div>
      </div>

      {hint && (
        <p role="status" className="flex items-start gap-2.5 px-1 pt-3 text-[14px] leading-relaxed">
          <span aria-hidden className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-led shadow-[0_0_8px_var(--led)]" />
          {hint}
        </p>
      )}

      <footer className="flex flex-col gap-3 px-1 pt-3">
        {editing ? (
          <div className="flex gap-2.5">
            <button type="button" className="btn-2 flex-1 @md:flex-none" onClick={() => setEditing(false)}>
              {c.posts.cancel}
            </button>
            <button
              type="button"
              className="btn flex-1 @md:flex-none"
              disabled={!draft.trim()}
              onClick={() => {
                editPost(post.id, script, draft.trim());
                setEditing(false);
              }}
            >
              {c.posts.save}
            </button>
          </div>
        ) : published ? (
          post.publishedUrl && (
            <a href={post.publishedUrl} target="_blank" rel="noreferrer" className="link inline-flex min-h-11 items-center gap-1.5 self-start text-[15px]">
              {c.posts.openPost}
              <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          )
        ) : approved ? (
          sample ? (
            <p className="text-[14px] leading-relaxed text-ink-2">{c.posts.samplePublish}</p>
          ) : (
            <>
              {inTelegram ? (
                <button type="button" className="btn w-full @md:w-auto @md:self-start" disabled={busy === "publish"} onClick={() => void publish(post.id, script)}>
                  {busy === "publish" ? c.posts.publishing : c.posts.publish}
                </button>
              ) : (
                <a href={botPublishUrl(bot, post.id, script)} target="_blank" rel="noreferrer" className="btn w-full @md:w-auto @md:self-start">
                  {c.posts.publish}
                </a>
              )}
              {!inTelegram && <p className="text-[14px] leading-relaxed text-ink-2">{c.posts.webNote}</p>}
            </>
          )
        ) : (
          <div className="flex gap-2.5">
            <button
              type="button"
              className="btn-2 flex-1 @md:flex-none"
              onClick={() => {
                setDraft(text);
                setEditing(true);
              }}
            >
              {c.posts.edit}
            </button>
            <button type="button" className="btn flex-1 @md:flex-none" disabled={busy === "approve"} onClick={() => void approve(post.id)}>
              {busy === "approve" ? c.posts.approving : c.posts.approve}
            </button>
          </div>
        )}
        {note && note.tone !== "hint" && (
          <p role={note.tone === "bad" ? "alert" : "status"} className={`text-[14px] leading-relaxed ${note.tone === "bad" ? "text-bad" : "text-ok"}`}>
            {note.text}
            {note.href && (
              <>
                {" "}
                <a href={note.href} target="_blank" rel="noreferrer" className="link">
                  {note.link ?? (note.tone === "bad" ? c.posts.addAdmin : c.posts.openPost)}
                </a>
              </>
            )}
          </p>
        )}
      </footer>
      {/* Pro depth comes after the owner's decision, never between the post and its buttons. */}
      {pro && <PostDetails post={post} />}
    </article>
  );
}

const escapeRe = (s: string) => s.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");

/** Underlines each unfilled blank ("[kod]") in amber, so the owner sees where the fact goes. */
function markBlanks(text: string, blanks: string[]): React.ReactNode {
  if (!blanks.length) return text;
  const pattern = new RegExp("(" + blanks.map(escapeRe).join("|") + ")");
  const parts = text.split(pattern);
  return parts.map((part, i) =>
    blanks.includes(part) ? (
      <mark key={i} className="rounded-[4px] bg-transparent text-led underline decoration-led/60 decoration-dotted underline-offset-4">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}
