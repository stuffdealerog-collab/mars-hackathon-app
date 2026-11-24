"use client";

import { ImagePlus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PostImage as PostImageData } from "@/lib/uslub/contract";
import { copyFor, type Lang } from "./copy";
import { resizeImageFile } from "./resize";

/**
 * The picture of one post, in the brand's style. Self-contained: it starts the picture when the
 * post has none, polls until it is ready, and offers "another version", "retry" and the owner's
 * own product photo. Neutral styling on the app's theme tokens; the Studio may restyle via className.
 *
 *   <PostImage postId={post.id} initial={post.image} lang="uz" onChange={(img) => …} />
 *
 * API: POST /api/uslub/media/post-image { postId, regenerate?, photo? } -> { image }
 *      GET  /api/uslub/media/post-image?postId= -> { image }   (every 4 s while queued/running)
 */
export interface PostImageProps {
  postId: string;
  /** The post's image as the posts API returned it (undefined/null = none yet). */
  initial?: PostImageData | null;
  lang?: Lang;
  /** Start making the picture on mount when the post has none. Default true. */
  autoStart?: boolean;
  /** Show the "Product photo" button (owner uploads a photo; the product is kept as is). Default true. */
  allowProductPhoto?: boolean;
  /** Telegram Mini App initData, sent as `Authorization: tma …` (web Studio: leave empty). */
  initData?: string;
  /** Called with every new state (e.g. to keep the post list in sync, or to enable "publish" when ready). */
  onChange?: (image: PostImageData) => void;
  className?: string;
}

const POLL_MS = 4_000;
const SLOW_MS = 120_000;
const GIVE_UP_MS = 8 * 60_000;

const isPending = (img: PostImageData | null) => img?.status === "queued" || img?.status === "running";

export function PostImage({
  postId,
  initial,
  lang,
  autoStart = true,
  allowProductPhoto = true,
  initData,
  onChange,
  className,
}: PostImageProps) {
  const t = copyFor(lang);
  const [image, setImage] = useState<PostImageData | null>(initial ?? null);
  // The last ready picture stays on screen (dimmed) while another version renders.
  const [shown, setShown] = useState<string | undefined>(initial?.status === "ready" ? initial.url : undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const startedAt = useRef(0);
  const autoStarted = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const headers = useCallback(
    (): HeadersInit => ({ "Content-Type": "application/json", ...(initData ? { Authorization: `tma ${initData}` } : {}) }),
    [initData],
  );

  const apply = useCallback((next: PostImageData) => {
    setImage(next);
    if (next.status === "ready" && next.url) setShown(next.url);
    onChangeRef.current?.(next);
  }, []);

  const start = useCallback(
    async (opts: { regenerate?: boolean; photo?: string } = {}) => {
      setBusy(true);
      setError(null);
      setSlow(false);
      startedAt.current = Date.now();
      try {
        const res = await fetch("/api/uslub/media/post-image", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ postId, ...opts }),
        });
        const data = (await res.json().catch(() => ({}))) as { image?: PostImageData; error?: string };
        if (data.image) apply(data.image);
        if (res.status === 429) setError(t.limit);
        else if (!res.ok && !data.image) setError(t.failed);
      } catch {
        setError(t.failed);
      } finally {
        setBusy(false);
      }
    },
    [apply, headers, postId, t],
  );

  // First picture for a post that has none. Once per mount, never cancelled: StrictMode re-runs
  // effects, and a cancelled first run plus a guarded second run would never start at all.
  useEffect(() => {
    if (autoStarted.current || !autoStart || initial) return;
    autoStarted.current = true;
    setTimeout(() => void start(), 0);
  }, [autoStart, initial, start]);

  // Poll while the picture renders.
  const pending = isPending(image);
  useEffect(() => {
    if (!pending) return;
    if (!startedAt.current) startedAt.current = Date.now();
    let stopped = false;
    const tick = async () => {
      const age = Date.now() - startedAt.current;
      if (age > SLOW_MS) setSlow(true);
      if (age > GIVE_UP_MS) {
        stopped = true;
        setImage((prev) => (prev ? { ...prev, status: "failed" } : prev));
        return;
      }
      try {
        const res = await fetch(`/api/uslub/media/post-image?postId=${encodeURIComponent(postId)}`, { headers: headers(), cache: "no-store" });
        if (!res.ok || stopped) return;
        const data = (await res.json()) as { image: PostImageData | null };
        if (data.image && !stopped) apply(data.image);
      } catch {
        // network blip: try again on the next tick
      }
    };
    const id = setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [pending, postId, headers, apply]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const photo = await resizeImageFile(file, { maxSide: 1536, maxBytes: 1_200_000 });
      await start({ photo });
    } catch {
      setError(t.badFile);
    }
  };

  const working = busy || pending;
  const failed = !working && image?.status === "failed";
  const ready = !working && image?.status === "ready";
  const idle = !working && !image;

  return (
    <figure className={["w-full", className].filter(Boolean).join(" ")}>
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-lg border border-line bg-card" aria-busy={working}>
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- fal CDN pictures; next/image would need remotePatterns
          <img
            src={shown}
            alt={t.alt}
            className={`h-full w-full object-cover transition-opacity ${working ? "opacity-50" : "opacity-100"}`}
          />
        ) : null}
        {working && !shown ? <div className="absolute inset-0 animate-pulse bg-line/60 motion-reduce:animate-none" aria-hidden /> : null}
        {failed && !shown ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted">{t.failed}</div>
        ) : null}
        {idle && !shown ? (
          <div className="flex h-full items-center justify-center p-6">
            <button
              type="button"
              onClick={() => void start()}
              className="rounded-md border border-line bg-background px-3 py-2 text-sm text-foreground hover:bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            >
              {t.create}
            </button>
          </div>
        ) : null}
      </div>

      <figcaption className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span role="status" aria-live="polite" className="mr-auto text-muted">
          {working ? (slow ? t.slow : t.making) : error ? error : failed ? t.failed : ""}
        </span>
        {ready ? (
          <button
            type="button"
            onClick={() => void start({ regenerate: true })}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-foreground hover:bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {t.another}
          </button>
        ) : null}
        {failed ? (
          <button
            type="button"
            onClick={() => void start({ regenerate: true })}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-foreground hover:bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {t.retry}
          </button>
        ) : null}
        {allowProductPhoto && !working ? (
          <>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              title={t.ownPhotoHint}
              className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-foreground hover:bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            >
              <ImagePlus className="h-3.5 w-3.5" aria-hidden />
              {t.ownPhoto}
            </button>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={onFile} />
          </>
        ) : null}
      </figcaption>
    </figure>
  );
}
