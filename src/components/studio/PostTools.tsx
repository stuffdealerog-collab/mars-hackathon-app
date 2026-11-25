"use client";

/**
 * Two quiet tools under a post, in Simple too: change it in one phrase ("qisqaroq", "narxi 12 000"; POST
 * /api/uslub/posts/rewrite, an approved post becomes a draft again and says so), and «Instagram uchun» (the 4:5
 * picture and the caption with the channel's own hashtags and t.me links).
 */
import type { PostDraft, Script } from "@/lib/uslub/contract";
import { useId, useState } from "react";
import { exportForInstagram, type ExportOutcome } from "../ui/instagram-export";
import { instagramCaption, instagramFileName, ownHashtags } from "../ui/instagram";
import { useCopy } from "../ui/lang";
import { authHeader } from "./api";
import { rewriteLocked, useStudio } from "./store";

/**
 * One post as an Instagram post: the caption (the channel's own hashtags, t.me links), the file name, the post (the
 * proxy reads its picture by id) and its picture's own address (opened when nothing else works).
 */
export function instagramParts(post: PostDraft, script: Script): { caption: string; fileName: string; postId: string | null; imageUrl: string | null; authorization?: string } {
  const st = useStudio.getState();
  const text = post.variants[script]?.trim() || post.variants.uz_latn;
  const imageUrl = post.image?.url ?? null;
  return {
    caption: instagramCaption(text, { hashtags: ownHashtags(st.brand?.dna) }),
    fileName: instagramFileName(st.brand?.channel || st.input.channel || st.brand?.dna.name || "mercat", post.slot?.day),
    postId: imageUrl ? post.id : null,
    imageUrl,
    authorization: authHeader(),
  };
}

/** Exports one post for Instagram; the caller says the outcome (a toast, a Telegram toast). */
export function instagramFor(post: PostDraft, script: Script, open?: (url: string) => void): Promise<ExportOutcome> {
  return exportForInstagram({ ...instagramParts(post, script), open });
}

export function RewriteForm({ post, onDone, className = "" }: { post: PostDraft; onDone?: () => void; className?: string }) {
  const c = useCopy();
  const id = useId();
  const [text, setText] = useState("");
  const busy = useStudio((s) => !!s.rewriting[post.id]);
  // An approval in its undo window or in flight, a publish, the queue sending it: the rewrite waits (store.rewriteLocked).
  const locked = useStudio((s) => rewriteLocked(s, post.id));
  const go = async () => {
    if (await useStudio.getState().rewrite(post.id, text)) {
      setText("");
      onDone?.();
    }
  };
  return (
    <form
      className={`flex flex-col gap-2 ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        void go();
      }}
    >
      <label htmlFor={id} className="text-[13.5px] text-ink-2">
        {c.rewrite.label}
      </label>
      <div className="flex gap-2">
        <input id={id} className="input min-w-0 flex-1 !min-h-11" placeholder={c.rewrite.ph} maxLength={300} value={text} disabled={busy || locked} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn-2 shrink-0 !min-h-11 !px-4" disabled={busy || locked || text.trim().length < 2}>
          {busy ? <span className="breathe">{c.rewrite.busy}</span> : c.rewrite.go}
        </button>
      </div>
    </form>
  );
}

export function PostTools({ post, script, onSay }: { post: PostDraft; script: Script; onSay: (text: string, tone?: "ok" | "bad") => void }) {
  const c = useCopy();
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const canRewrite = post.status !== "published";
  const ig = async () => {
    setExporting(true);
    const r = await instagramFor(post, script).finally(() => setExporting(false));
    onSay(c.instagram[r], r === "failed" ? "bad" : "ok");
  };
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        {canRewrite && (
          <button type="button" className="link min-h-9 text-[14px] text-ink-2" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {c.rewrite.label}
          </button>
        )}
        <button type="button" className="link min-h-9 text-[14px] text-ink-2" disabled={exporting} onClick={() => void ig()}>
          {exporting ? <span className="breathe">{c.instagram.working}</span> : c.instagram.btn}
        </button>
      </div>
      {open && canRewrite && <RewriteForm post={post} onDone={() => setOpen(false)} />}
    </div>
  );
}
