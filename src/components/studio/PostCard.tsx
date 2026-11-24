import type { PostDraft, Script } from "@/lib/uslub/contract";
import { Check, ExternalLink } from "lucide-react";
import { useId, useState } from "react";
import { fmt, keepNumbers, useCopy, useLang } from "../ui/lang";
import { weekday } from "../ui/format";
import { botPublishUrl } from "./api";
import { PostPicture } from "./PostPicture";
import { useStudio } from "./store";

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
  const retryImage = useStudio((s) => s.retryImage);
  const sample = useStudio((s) => s.sample);
  const channelName = useStudio((s) => s.brand?.dna.name || s.brand?.channel || (s.input.channel ? `@${s.input.channel}` : ""));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

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

  return (
    <article aria-labelledby={`${id}-h`}>
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
      <div className="tgpost">
        <PostPicture image={post.image} alt={c.posts.image.alt} onRetry={sample ? undefined : () => void retryImage(post.id)} />
        <div className="px-4 pb-2.5 pt-3">
          <div className="mb-2 flex items-center gap-2.5">
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[14px] font-semibold text-white" style={{ background: "linear-gradient(160deg, #C86B3C, #6b3115)" }}>
              {name.replace(/^@/, "").slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 truncate text-[14.5px] font-semibold" style={{ color: "color-mix(in oklab, #E08A55 70%, var(--ink))" }}>
              {name}
            </span>
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
              {keepNumbers(text)}
            </p>
          )}
          {slot && <p className="mt-1.5 text-right text-[12px] text-ink-3">{slot.time}</p>}
        </div>
      </div>

      <footer className="flex flex-col gap-3 px-1 pt-3">
        {editing ? (
          <div className="flex gap-2.5">
            <button type="button" className="btn-2 flex-1 sm:flex-none" onClick={() => setEditing(false)}>
              {c.posts.cancel}
            </button>
            <button
              type="button"
              className="btn flex-1 sm:flex-none"
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
                <button type="button" className="btn w-full sm:w-auto sm:self-start" disabled={busy === "publish"} onClick={() => void publish(post.id, script)}>
                  {busy === "publish" ? c.posts.publishing : c.posts.publish}
                </button>
              ) : (
                <a href={botPublishUrl(bot, post.id, script)} target="_blank" rel="noreferrer" className="btn w-full sm:w-auto sm:self-start">
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
              className="btn-2 flex-1 sm:flex-none"
              onClick={() => {
                setDraft(text);
                setEditing(true);
              }}
            >
              {c.posts.edit}
            </button>
            <button type="button" className="btn flex-1 sm:flex-none" disabled={busy === "approve"} onClick={() => void approve(post.id)}>
              {busy === "approve" ? c.posts.approving : c.posts.approve}
            </button>
          </div>
        )}
        {note && (
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
    </article>
  );
}
