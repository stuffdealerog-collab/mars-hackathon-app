"use client";

import { ImagePlus, RefreshCw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PostImage as PostImageData } from "@/lib/uslub/contract";
import { copyFor, fill, type Lang } from "./copy";
import { resizeImageFile } from "./resize";
import { cx, EASE_OUT, MEDIA_VARS, QUIET_PILL } from "./theme";

/**
 * The picture of one post, in the brand's style. Self-contained: it starts the picture when the
 * post has none, polls until it is ready, and "develops" it out of the skeleton. Colours come from
 * the parent (lamp-world tokens inside `.lw`, else the parent's text colour); restyle via className.
 *
 *   <PostImage postId={post.id} initial={post.image} lang="uz" />            simple: picture + "Boshqa variant"
 *   <PostImage postId={post.id} initial={post.image} lang="ru" pro />        pro: + product photo, refs, model, prompt
 *
 * API: POST /api/uslub/media/post-image { postId, regenerate?, photo?, lang } -> { image } | { error, code }
 *      GET  /api/uslub/media/post-image?postId=&lang= -> { image }   (every 4 s while queued/running)
 */
export type PostImageValue = PostImageData & { model?: string };

export interface PostImageProps {
  postId: string;
  /** The post's image as the posts API returned it (undefined/null = none yet). */
  initial?: PostImageValue | null;
  lang?: Lang;
  /** Pro mode: the owner's product photo button, the prompt used, how many refs, the model. */
  pro?: boolean;
  /** Start making the picture on mount when the post has none. Default true. */
  autoStart?: boolean;
  /** Show the "Product photo" button. Default: on in pro mode, off in simple mode. */
  allowProductPhoto?: boolean;
  /** Telegram Mini App initData, sent as `Authorization: tma …` (web Studio: leave empty). */
  initData?: string;
  /**
   * Every new state. `image.url` is the picture that will be published (it stays while another
   * version renders or fails); `status` is the latest attempt.
   */
  onChange?: (image: PostImageValue) => void;
  className?: string;
}

const POLL_MS = 4_000;
const SLOW_MS = 120_000;
const GIVE_UP_MS = 8 * 60_000;

const isPending = (img: PostImageValue | null) => img?.status === "queued" || img?.status === "running";

export function PostImage({
  postId,
  initial,
  lang = "uz",
  pro = false,
  autoStart = true,
  allowProductPhoto,
  initData,
  onChange,
  className,
}: PostImageProps) {
  const t = copyFor(lang);
  const reduce = useReducedMotion() ?? false;
  const [image, setImage] = useState<PostImageValue | null>(initial ?? null);
  // `url` is the post's picture (the newest finished one): it stays set while another version
  // renders or after it fails, and it is exactly what publishing sends. Shown dimmed while rendering.
  const [shown, setShown] = useState<string | undefined>(initial?.url);
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
  const productButton = allowProductPhoto ?? pro;

  const headers = useCallback(
    (): HeadersInit => ({ "Content-Type": "application/json", ...(initData ? { Authorization: `tma ${initData}` } : {}) }),
    [initData],
  );

  const apply = useCallback((next: PostImageValue) => {
    setImage(next);
    if (next.url) setShown(next.url);
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
          body: JSON.stringify({ postId, lang, ...opts }),
        });
        const data = (await res.json().catch(() => ({}))) as { image?: PostImageValue; error?: string };
        if (data.image) apply(data.image);
        if (!res.ok && data.image?.status !== "failed") setError(data.error ?? (res.status === 429 ? t.limit : t.failed));
      } catch {
        setError(t.network);
      } finally {
        setBusy(false);
      }
    },
    [apply, headers, lang, postId, t],
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
        const res = await fetch(`/api/uslub/media/post-image?postId=${encodeURIComponent(postId)}&lang=${lang}`, {
          headers: headers(),
          cache: "no-store",
        });
        if (!res.ok || stopped) return;
        const data = (await res.json()) as { image: PostImageValue | null };
        if (data.image && !stopped) apply(data.image);
      } catch {
        // network blip: the next tick tries again
      }
    };
    const id = setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [pending, postId, lang, headers, apply]);

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
  const status = working ? (slow ? t.slow : t.making) : (error ?? (failed ? t.failed : ""));

  return (
    <figure style={MEDIA_VARS} className={cx("w-full text-[var(--mi-ink)]", className)}>
      <div
        className="relative aspect-[4/5] w-full overflow-hidden rounded-[20px] bg-[var(--mi-glass)] shadow-[inset_0_0_0_1px_var(--mi-hair)]"
        aria-busy={working}
      >
        {/* Skeleton: a calm glass breathing slowly; never a bright shimmer. */}
        <AnimatePresence>
          {working && !shown ? (
            <motion.div
              key="skeleton"
              aria-hidden
              className="absolute inset-0 bg-[var(--mi-glass-2)]"
              initial={{ opacity: 0 }}
              animate={reduce ? { opacity: 0.6 } : { opacity: [0.35, 0.75, 0.35] }}
              exit={{ opacity: 0, transition: { duration: 0.9, ease: EASE_OUT } }}
              transition={reduce ? { duration: 0.2 } : { duration: 2.4, ease: "easeInOut", repeat: Infinity }}
            />
          ) : null}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {shown ? <DevelopingImage key={shown} src={shown} alt={t.alt} reduce={reduce} /> : null}
        </AnimatePresence>

        {/* Another version is rendering: the old picture rests under a dark veil. */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[var(--mi-stage)]"
          initial={false}
          animate={{ opacity: working && shown ? 0.5 : 0 }}
          transition={{ duration: working ? 0.3 : 0.8, ease: EASE_OUT }}
        />

        {failed && !shown ? (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-[14px] text-[var(--mi-ink-2)]">{t.failed}</div>
        ) : null}
        {idle && !shown ? (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <Pill reduce={reduce} onClick={() => void start()}>
              {t.create}
            </Pill>
          </div>
        ) : null}
      </div>

      <figcaption className="mt-2.5 flex min-h-9 flex-wrap items-center gap-2">
        <span role="status" aria-live="polite" className={cx("mr-auto text-[12.5px]", error ? "text-[var(--mi-bad)]" : "text-[var(--mi-ink-2)]")}>
          {status}
        </span>
        {ready ? (
          <Pill reduce={reduce} onClick={() => void start({ regenerate: true })}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {t.another}
          </Pill>
        ) : null}
        {failed ? (
          <Pill reduce={reduce} onClick={() => void start({ regenerate: true })}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {t.retry}
          </Pill>
        ) : null}
        {productButton && !working ? (
          <>
            <Pill reduce={reduce} onClick={() => fileInput.current?.click()} title={t.ownPhotoHint}>
              <ImagePlus className="h-3.5 w-3.5" aria-hidden />
              {t.ownPhoto}
            </Pill>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={onFile} />
          </>
        ) : null}
      </figcaption>

      {pro && image ? <ProDetails image={image} t={t} /> : null}
    </figure>
  );
}

/**
 * The reveal: the picture "develops" out of the skeleton. A blurred copy glows up first, then the
 * sharp picture fades in over it while settling from a 3.5% zoom. Opacity and transform only (the
 * blur is a static filter on its own layer); starts when the bytes have loaded, never half-drawn.
 */
function DevelopingImage({ src, alt, reduce }: { src: string; alt: string; reduce: boolean }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <motion.div className="absolute inset-0" exit={{ opacity: 0, transition: { duration: 0.7, ease: EASE_OUT } }}>
      {!reduce ? (
        <motion.img
          src={src}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl saturate-[1.15]"
          initial={{ opacity: 0 }}
          animate={loaded ? { opacity: [0, 0.9, 0] } : { opacity: 0 }}
          transition={{ duration: 1.6, times: [0, 0.3, 1], ease: "easeOut" }}
        />
      ) : null}
      <motion.img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        className="absolute inset-0 h-full w-full object-cover"
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.035 }}
        animate={loaded ? { opacity: 1, scale: 1 } : undefined}
        transition={reduce ? { duration: 0.2 } : { duration: 1.15, delay: 0.25, ease: EASE_OUT }}
      />
    </motion.div>
  );
}

function Pill({
  children,
  onClick,
  title,
  reduce,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  reduce: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      title={title}
      whileTap={reduce ? undefined : { scale: 0.96 }}
      transition={{ duration: 0.12, ease: EASE_OUT }}
      className={QUIET_PILL}
    >
      {children}
    </motion.button>
  );
}

function ProDetails({ image, t }: { image: PostImageValue; t: ReturnType<typeof copyFor> }) {
  return (
    <div className="mt-2 space-y-1.5 text-[12.5px] text-[var(--mi-ink-2)]">
      <p className="tabular-nums">
        {image.refsUsed ? fill(t.refsUsed, image.refsUsed) : t.refsNone}
        {image.model ? (
          <>
            <span aria-hidden> · </span>
            {t.model}: <span className="text-[var(--mi-ink)]">{image.model}</span>
          </>
        ) : null}
      </p>
      {image.prompt ? (
        <details className="group rounded-[14px] bg-[var(--mi-glass)] shadow-[inset_0_0_0_1px_var(--mi-hair)]">
          <summary className="cursor-pointer select-none list-none rounded-[14px] px-3 py-2 text-[var(--mi-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--mi-lime)]">
            {t.prompt}
          </summary>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words px-3 pb-3 font-[inherit] text-[12.5px] leading-relaxed">{image.prompt}</pre>
        </details>
      ) : null}
    </div>
  );
}
