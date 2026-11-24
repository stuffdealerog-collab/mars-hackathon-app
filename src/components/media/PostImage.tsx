"use client";

import { ImagePlus, RefreshCw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type Ref, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
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
 * `initial` may change after mount (the parent store polls too): a new status, url or error is
 * adopted without calling onChange, unless the component's own request is in flight.
 *
 * API: POST /api/uslub/media/post-image { postId, regenerate?, photo?, lang } -> { image } | { error, code }
 *      GET  /api/uslub/media/post-image?postId=&lang= -> { image }   (every 4 s while queued/running)
 */
export type PostImageValue = PostImageData & { model?: string };

/** Actions for the caller's own buttons. Both do nothing while locked or while a picture is being made. */
export interface PostImageHandle {
  /** Same as "Boshqa variant". */
  regenerate(): void;
  /** Opens the product photo picker. Call it straight from a click handler (no await before it). */
  pickPhoto(): void;
}

export interface PostImageProps {
  postId: string;
  /** The post's image as the posts API returned it (undefined/null = none yet). Later changes are adopted. */
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
  /** A ready Authorization header value (`tma <initData>`, `handoff <k>`). Wins over initData. */
  authorization?: string;
  /** The parent is starting the picture: show the breathing skeleton, not the "create" button. */
  expected?: boolean;
  /** No new pictures (approved or published posts, the sample): hides every button that makes one. */
  locked?: boolean;
  /** Shown under a ready picture made from refs: up to 4 palette dots and the caller's line. */
  refs?: { palette?: string[]; text: string };
  ref?: Ref<PostImageHandle>;
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

const sameImage = (a: PostImageValue | null, b: PostImageValue | null) =>
  a === b || (!!a && !!b && a.status === b.status && a.url === b.url && a.error === b.error);

export function PostImage({
  postId,
  initial,
  lang = "uz",
  pro = false,
  autoStart = true,
  allowProductPhoto,
  initData,
  authorization,
  expected = false,
  locked = false,
  refs,
  onChange,
  className,
  ref,
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

  // A new `initial` from the parent is adopted during render (no effect). Skipped while our own
  // request is in flight, and when it only echoes what we already hold (our onChange came back).
  // No onChange here: that would loop through the parent store.
  const [seen, setSeen] = useState<PostImageValue | null>(initial ?? null);
  const incoming = initial ?? null;
  if (!sameImage(incoming, seen)) {
    setSeen(incoming);
    if (incoming && !busy && !sameImage(incoming, image)) {
      setImage(incoming);
      if (incoming.url) setShown(incoming.url);
      setError(null);
      if (isPending(incoming) && !isPending(image)) setSlow(false);
    }
  }
  const startedAt = useRef(0);
  const autoStarted = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const productButton = allowProductPhoto ?? pro;

  const auth = authorization || (initData ? `tma ${initData}` : "");
  const headers = useCallback(
    (): HeadersInit => ({ "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) }),
    [auth],
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
      let next: PostImageValue | null = null;
      try {
        const res = await fetch("/api/uslub/media/post-image", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ postId, lang, ...opts }),
        });
        const data = (await res.json().catch(() => ({}))) as { image?: PostImageValue; error?: string };
        if (data.image) apply((next = data.image));
        if (!res.ok && data.image?.status !== "failed") setError(data.error ?? (res.status === 429 ? t.limit : t.failed));
      } catch {
        setError(t.network);
      } finally {
        // Nothing to poll: stop the clock, so a later run starts its own.
        if (!isPending(next)) startedAt.current = 0;
        setBusy(false);
      }
    },
    [apply, headers, lang, postId, t],
  );

  // First picture for a post that has none. Once per mount, never cancelled: StrictMode re-runs
  // effects, and a cancelled first run plus a guarded second run would never start at all.
  useEffect(() => {
    if (autoStarted.current || !autoStart || initial || expected || locked) return;
    autoStarted.current = true;
    setTimeout(() => void start(), 0);
  }, [autoStart, initial, expected, locked, start]);

  // Poll while the picture renders. The clock restarts with each run, so a run adopted from the
  // parent long after our last one is not given up at once.
  const pending = isPending(image);
  useEffect(() => {
    if (!pending) {
      startedAt.current = 0;
      return;
    }
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
  // The parent is starting it: looks like working, but nothing of ours runs.
  const waiting = !working && !image && expected;
  const failed = !working && image?.status === "failed";
  const ready = !working && image?.status === "ready";
  const idle = !working && !image && !expected;
  const status = working ? (slow ? t.slow : t.making) : waiting ? t.making : (error ?? (failed ? t.failed : ""));
  const refsRow = ready && !error && refs && (image?.refsUsed ?? 0) > 0 ? refs : null;

  useImperativeHandle(
    ref,
    () => ({
      // While the parent is starting this picture (waiting), a second start would be a second paid one.
      regenerate: () => {
        if (!locked && !working && !waiting) void start({ regenerate: true });
      },
      pickPhoto: () => {
        if (!locked && !working && !waiting) fileInput.current?.click();
      },
    }),
    [locked, working, waiting, start],
  );

  return (
    <figure style={MEDIA_VARS} className={cx("w-full text-[var(--mi-ink)]", className)}>
      <div
        className="relative aspect-[4/5] w-full overflow-hidden rounded-[20px] bg-[var(--mi-glass)] shadow-[inset_0_0_0_1px_var(--mi-hair)]"
        aria-busy={working || waiting}
      >
        {/* Skeleton: a calm glass breathing slowly; never a bright shimmer. */}
        <AnimatePresence>
          {(working || waiting) && !shown ? (
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
        <AnimatePresence>
          {working && shown ? (
            <motion.span
              key="new-version"
              aria-hidden
              className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-[color-mix(in_srgb,var(--mi-stage)_70%,transparent)] px-3 py-1 text-[12.5px] text-[var(--mi-ink)] shadow-[inset_0_0_0_1px_var(--mi-hair-2)]"
              initial={{ opacity: 0, y: reduce ? 0 : 4 }}
              animate={reduce ? { opacity: 1, y: 0 } : { opacity: [0.6, 1, 0.6], y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.4 } }}
              transition={reduce ? { duration: 0.2 } : { opacity: { duration: 2.4, ease: "easeInOut", repeat: Infinity }, y: { duration: 0.3, ease: EASE_OUT } }}
            >
              {t.newVersion}
            </motion.span>
          ) : null}
        </AnimatePresence>

        {failed && !shown ? (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-[14px] text-[var(--mi-ink-2)]">{t.failed}</div>
        ) : null}
        {idle && !locked && !shown ? (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <Pill reduce={reduce} onClick={() => void start()}>
              {t.create}
            </Pill>
          </div>
        ) : null}
      </div>

      <figcaption className="mt-2.5 flex min-h-9 flex-wrap items-center gap-2">
        {refsRow ? <RefsRow palette={refsRow.palette} text={refsRow.text} reduce={reduce} /> : null}
        <span role="status" aria-live="polite" className={cx("mr-auto text-[12.5px]", error ? "text-[var(--mi-bad)]" : "text-[var(--mi-ink-2)]")}>
          {status}
        </span>
        {ready && !locked ? (
          <Pill reduce={reduce} onClick={() => void start({ regenerate: true })}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {t.another}
          </Pill>
        ) : null}
        {failed && !locked ? (
          <Pill reduce={reduce} onClick={() => void start({ regenerate: true })}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {t.retry}
          </Pill>
        ) : null}
        {productButton && !working && !waiting && !locked ? (
          <Pill reduce={reduce} onClick={() => fileInput.current?.click()} title={t.ownPhotoHint}>
            <ImagePlus className="h-3.5 w-3.5" aria-hidden />
            {t.ownPhoto}
          </Pill>
        ) : null}
        {/* Always mounted, so pickPhoto() works in simple mode too. */}
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={onFile} />
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

/** One quiet line under a ready picture: the style's palette and what the picture was modelled on. */
function RefsRow({ palette, text, reduce }: { palette?: string[]; text: string; reduce: boolean }) {
  const dots = (palette ?? []).slice(0, 4);
  return (
    <motion.span
      className="flex min-w-0 items-center gap-2 text-[12.5px] text-[var(--mi-ink-2)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reduce ? { duration: 0.2 } : { duration: 0.6, delay: 0.4, ease: EASE_OUT }}
    >
      {dots.length ? (
        <span className="flex shrink-0 gap-1" aria-hidden>
          {dots.map((c, i) => (
            <span key={`${c}-${i}`} className="h-3.5 w-3.5 rounded-full shadow-[inset_0_0_0_1px_var(--mi-hair-2)]" style={{ backgroundColor: c }} />
          ))}
        </span>
      ) : null}
      <span className="min-w-0">{text}</span>
    </motion.span>
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
          <summary className="cursor-pointer select-none list-none rounded-[14px] px-3 py-2 text-[var(--mi-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--mi-focus)]">
            {t.prompt}
          </summary>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words px-3 pb-3 font-[inherit] text-[12.5px] leading-relaxed">{image.prompt}</pre>
        </details>
      ) : null}
    </div>
  );
}
