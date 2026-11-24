import type { PostDraft, Script } from "@/lib/uslub/contract";
import { Check, ExternalLink } from "lucide-react";
import { useId, useState } from "react";
import { keepNumbers, useCopy, useLang, type Lang } from "../ui/lang";
import { weekday } from "../ui/format";
import { botPublishUrl } from "./api";
import { PostPicture } from "./PostPicture";
import { useStudio } from "./store";

const SCRIPTS: Script[] = ["uz_latn", "uz_cyrl", "ru", "en"];
const DEFAULT_SCRIPT: Record<Lang, Script> = { uz: "uz_latn", ru: "ru", en: "en" };

export function PostCard({ post, inTelegram }: { post: PostDraft; inTelegram: boolean }) {
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

  const available = SCRIPTS.filter((s) => post.variants[s]?.trim());
  const pick = (l: Lang) => (available.includes(DEFAULT_SCRIPT[l]) ? DEFAULT_SCRIPT[l] : (available[0] ?? "uz_latn"));
  // Follows the page language until the owner picks a script on this card.
  const [picked, setPicked] = useState<Script | null>(null);
  const script: Script = picked && available.includes(picked) ? picked : pick(lang);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const text = post.variants[script] ?? "";
  const shown = keepNumbers(text);
  const slot = post.slot;
  const day = slot ? weekday(slot.day) : null;
  const when = slot ? [day != null ? c.weekdays[day] : null, slot.time].filter(Boolean).join(", ") : null;
  const goal = slot ? c.channel.goal[slot.goal] : null;
  const approved = post.status === "approved";
  const published = post.status === "published";

  return (
    <article className="card overflow-hidden" aria-labelledby={`${id}-h`}>
      <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-4 sm:px-5">
        <h3 id={`${id}-h`} className="min-w-0 text-[14px] text-ink-2">
          {when ?? post.brief}
          {goal && <span className="text-ink-3"> · {goal}</span>}
        </h3>
        {(approved || published) && (
          <span className="inline-flex shrink-0 items-center gap-1 text-[14px] font-medium text-ok">
            <Check className="h-4 w-4" aria-hidden />
            {published ? c.posts.published : c.posts.approved}
          </span>
        )}
      </header>

      <PostPicture image={post.image} alt={c.posts.image.alt} onRetry={sample ? undefined : () => void retryImage(post.id)} />

      <div className="px-4 pt-4 sm:px-5">
        {available.length > 1 && (
          <div className="seg mb-3" role="group" aria-label={c.posts.textLabel}>
            {available.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={script === s}
                title={c.posts.scriptNames[s]}
                aria-label={c.posts.scriptNames[s]}
                disabled={editing}
                onClick={() => setPicked(s)}
              >
                {c.posts.scripts[s]}
              </button>
            ))}
          </div>
        )}
        {editing ? (
          <>
            <label htmlFor={`${id}-t`} className="sr-only">
              {c.posts.textLabel}
            </label>
            <textarea id={`${id}-t`} className="input min-h-[220px]" value={draft} onChange={(e) => setDraft(e.target.value)} />
          </>
        ) : (
          <p lang={script === "ru" ? "ru" : script === "en" ? "en" : "uz"} className="post-text">
            {shown}
          </p>
        )}
      </div>

      <footer className="flex flex-col gap-3 px-4 pb-4 pt-5 sm:px-5">
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
          <>
            {inTelegram ? (
              <button type="button" className="btn w-full sm:w-auto sm:self-start" disabled={busy === "publish"} onClick={() => void publish(post.id, script)}>
                {busy === "publish" ? c.posts.publishing : c.posts.publish}
              </button>
            ) : sample ? (
              <button type="button" className="btn w-full sm:w-auto sm:self-start" aria-disabled="true" title={c.sample.banner}>
                {c.posts.publish}
              </button>
            ) : (
              <a href={botPublishUrl(bot, post.id)} target="_blank" rel="noreferrer" className="btn w-full sm:w-auto sm:self-start">
                {c.posts.publish}
              </a>
            )}
            {!inTelegram && <p className="text-[14px] leading-relaxed text-ink-2">{c.posts.webNote}</p>}
          </>
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
