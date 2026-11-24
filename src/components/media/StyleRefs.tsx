"use client";

import { ImagePlus, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type Ref, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { VisualStyle } from "@/lib/uslub/contract";
import { styleWords } from "@/lib/uslub/visual/words";
import { copyFor, type Lang } from "./copy";
import { resizeImageFile } from "./resize";
import { cx, EASE_OUT, MEDIA_VARS, QUIET_PILL } from "./theme";

/**
 * The photos new post pictures are modelled on: the channel's own (learned automatically) and the
 * owner's (added here, 3-5 is plenty). Self-contained: learns the style on mount when the brand has
 * none, re-learns when the owner adds or removes a photo. Colours come from the parent.
 *
 *   <StyleRefs brandId={brand.id} initial={brand.visual} lang="uz" />        simple
 *   <StyleRefs brandId={brand.id} initial={brand.visual} lang="en" pro />    pro: + the learned style in words
 *
 * API: GET  /api/uslub/visual?brandId=&lang= -> { visual | null }
 *      POST /api/uslub/visual { brandId, ownerImages?, refresh?, lang } -> { visual } | { error, code }   (~15-30 s)
 */
/** For the caller's own "add photos" button. */
export interface StyleRefsHandle {
  /** Opens the photo picker. Call it straight from a click handler (no await before it). */
  addPhotos(): void;
}

export interface StyleRefsProps {
  brandId: string;
  /** The brand's style if already known (BrandProfile.visual). */
  initial?: VisualStyle | null;
  lang?: Lang;
  /** Pro mode: the learned light, framing, mood, what never appears, and the style paragraph. */
  pro?: boolean;
  /** Learn the style on mount when the brand has none. Default true. */
  autoLearn?: boolean;
  initData?: string;
  /** A ready Authorization header value (`tma <initData>`, `handoff <k>`). Wins over initData. */
  authorization?: string;
  onChange?: (visual: VisualStyle) => void;
  className?: string;
  ref?: Ref<StyleRefsHandle>;
}

const MAX_OWNER = 5;

export function StyleRefs({
  brandId,
  initial,
  lang = "uz",
  pro = false,
  autoLearn = true,
  initData,
  authorization,
  onChange,
  className,
  ref,
}: StyleRefsProps) {
  const t = copyFor(lang);
  const reduce = useReducedMotion() ?? false;
  const [visual, setVisual] = useState<VisualStyle | null>(initial ?? null);
  const [learning, setLearning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const started = useRef(false);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const auth = authorization || (initData ? `tma ${initData}` : "");
  const headers = useCallback(
    (): HeadersInit => ({ "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) }),
    [auth],
  );

  const learn = useCallback(
    async (ownerImages?: string[]) => {
      setLearning(true);
      setError(null);
      try {
        // An explicit owner list (even an empty one after removing the last photo) always re-learns.
        const res = await fetch("/api/uslub/visual", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ brandId, lang, ...(ownerImages ? { ownerImages, refresh: true } : {}) }),
        });
        const data = (await res.json().catch(() => ({}))) as { visual?: VisualStyle; error?: string };
        if (res.ok && data.visual) {
          setVisual(data.visual);
          onChangeRef.current?.(data.visual);
        } else {
          setError(data.error ?? t.styleFailed);
        }
      } catch {
        setError(t.network);
      } finally {
        setLearning(false);
      }
    },
    [brandId, headers, lang, t],
  );

  // A brand without a style: read it (another tab may have learned it), else learn it.
  // Once per mount and never cancelled (StrictMode re-runs effects; see PostImage).
  useEffect(() => {
    if (started.current || initial || !autoLearn) return;
    started.current = true;
    void (async () => {
      try {
        const res = await fetch(`/api/uslub/visual?brandId=${encodeURIComponent(brandId)}&lang=${lang}`, { headers: headers(), cache: "no-store" });
        const data = res.ok ? ((await res.json()) as { visual: VisualStyle | null }) : { visual: null };
        if (data.visual) {
          setVisual(data.visual);
          onChangeRef.current?.(data.visual);
        } else await learn();
      } catch {
        await learn();
      }
    })();
  }, [autoLearn, brandId, headers, initial, lang, learn]);

  const ownerRefs = (visual?.refs ?? []).filter((r) => r.source === "owner").map((r) => r.url);
  const full = ownerRefs.length >= MAX_OWNER;

  // Same rules as the button: nothing while learning; when full, say so instead of opening the picker.
  useImperativeHandle(
    ref,
    () => ({
      addPhotos: () => {
        if (learning) return;
        if (full) setError(t.tooMany);
        else fileInput.current?.click();
      },
    }),
    [learning, full, t],
  );

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!files.length) return;
    if (ownerRefs.length + files.length > MAX_OWNER) {
      setError(t.tooMany);
      return;
    }
    try {
      // 5 x 450 KB is ~3.1 MB of base64: safely under Vercel's 4.5 MB request limit.
      const added = await Promise.all(files.map((f) => resizeImageFile(f, { maxSide: 1280, maxBytes: 450_000 })));
      await learn([...ownerRefs, ...added]);
    } catch {
      setError(t.badFile);
    }
  };

  const remove = (url: string) => void learn(ownerRefs.filter((u) => u !== url));

  const refs = visual?.refs ?? [];
  const rows = styleRows(visual, lang, t);
  const tile = { duration: reduce ? 0.15 : 0.32, ease: EASE_OUT };
  return (
    <section style={MEDIA_VARS} className={cx("w-full text-[var(--mi-ink)]", className)} aria-busy={learning}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{t.styleTitle}</h3>
        <span role="status" aria-live="polite" className={cx("text-[12.5px]", error && !learning ? "text-[var(--mi-bad)]" : "text-[var(--mi-ink-2)]")}>
          {learning ? t.styleLearning : (error ?? "")}
        </span>
      </div>
      <p className="mt-1 min-h-5 text-[13.5px] text-[var(--mi-ink-2)]">{refs.length ? t.styleHint : visual ? t.styleEmpty : ""}</p>

      <motion.ul layout={!reduce} className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        <AnimatePresence initial={false} mode="popLayout">
          {refs.map((r) => (
            <motion.li
              key={r.url}
              layout={!reduce}
              initial={{ opacity: 0, scale: reduce ? 1 : 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: reduce ? 1 : 0.94 }}
              transition={tile}
              className="relative aspect-square overflow-hidden rounded-[14px] bg-[var(--mi-glass)] shadow-[inset_0_0_0_1px_var(--mi-hair)]"
            >
              <RefThumb src={r.url} alt={t.refAlt} reduce={reduce} />
              <span className="absolute bottom-1.5 left-1.5 rounded-full bg-[color-mix(in_srgb,var(--mi-stage)_72%,transparent)] px-2 py-0.5 text-[11px] text-[var(--mi-ink-2)]">
                {r.source === "owner" ? t.styleFromOwner : t.styleFromChannel}
              </span>
              {r.source === "owner" && !learning ? (
                <button
                  type="button"
                  onClick={() => remove(r.url)}
                  aria-label={t.remove}
                  className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-[color-mix(in_srgb,var(--mi-stage)_72%,transparent)] text-[var(--mi-ink)] transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mi-focus)]"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              ) : null}
            </motion.li>
          ))}
          {learning && !refs.length
            ? [0, 1, 2].map((i) => (
                <motion.li
                  key={`skeleton-${i}`}
                  aria-hidden
                  className="aspect-square rounded-[14px] bg-[var(--mi-glass-2)]"
                  initial={{ opacity: 0.35 }}
                  animate={reduce ? { opacity: 0.6 } : { opacity: [0.35, 0.75, 0.35] }}
                  exit={{ opacity: 0 }}
                  transition={reduce ? { duration: 0.2 } : { duration: 2.4, ease: "easeInOut", repeat: Infinity, delay: i * 0.2 }}
                />
              ))
            : null}
        </AnimatePresence>
      </motion.ul>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <motion.button
          type="button"
          disabled={learning || full}
          onClick={() => fileInput.current?.click()}
          whileTap={reduce ? undefined : { scale: 0.96 }}
          transition={{ duration: 0.12, ease: EASE_OUT }}
          className={QUIET_PILL}
        >
          <ImagePlus className="h-3.5 w-3.5" aria-hidden />
          {t.addPhotos}
        </motion.button>
        {visual?.palette.length ? (
          <span className="flex gap-1" aria-hidden>
            {visual.palette.map((c) => (
              <span key={c} className="h-3.5 w-3.5 rounded-full shadow-[inset_0_0_0_1px_var(--mi-hair-2)]" style={{ backgroundColor: c }} />
            ))}
          </span>
        ) : null}
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={onFiles}
        />
      </div>

      {pro && rows.length ? (
        <dl className="mt-3 grid grid-cols-[minmax(0,7.5rem)_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) =>
              // The description is a sentence or two: full width, so it never wraps into a thin column.
              k === t.styleText ? (
                <div key={k} className="col-span-2 mb-1">
                  <dt className="text-[var(--mi-ink-3)]">{k}</dt>
                  <dd className="mt-0.5 text-[var(--mi-ink-2)]">{v}</dd>
                </div>
              ) : (
                <div key={k} className="contents">
                  <dt className="text-[var(--mi-ink-3)]">{k}</dt>
                  <dd className="text-[var(--mi-ink-2)]">{v}</dd>
                </div>
              ),
            )}
        </dl>
      ) : null}
    </section>
  );
}

/**
 * Pro mode's style rows in the owner's language. A style learned before the owner's words existed
 * has only the English descriptors: those are shown in English only, never mixed into uz/ru
 * (the next run learns the style again with the owner's words).
 */
function styleRows(visual: VisualStyle | null, lang: Lang, t: ReturnType<typeof copyFor>): [string, string][] {
  if (!visual) return [];
  const w = styleWords(visual, lang);
  if (w) {
    return [
      [t.styleText, w.summary],
      [t.styleLight, w.light],
      [t.styleFraming, w.composition],
      [t.styleMood, w.mood],
      [t.styleAvoid, w.avoid.join("; ")],
    ];
  }
  if (lang !== "en") return [];
  return [
    [t.styleLight, visual.light],
    [t.styleFraming, visual.composition],
    [t.styleMood, visual.mood],
    [t.styleAvoid, visual.avoid.join("; ")],
    [t.styleText, visual.prompt],
  ];
}

/** A reference thumbnail that fades in once its bytes have loaded (opacity only). */
function RefThumb({ src, alt, reduce }: { src: string; alt: string; reduce: boolean }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <motion.img
      src={src}
      alt={alt}
      loading="lazy"
      onLoad={() => setLoaded(true)}
      className="h-full w-full object-cover"
      initial={{ opacity: 0 }}
      animate={{ opacity: loaded ? 1 : 0 }}
      transition={{ duration: reduce ? 0.15 : 0.6, ease: EASE_OUT }}
    />
  );
}
