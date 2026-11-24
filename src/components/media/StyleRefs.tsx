"use client";

import { ImagePlus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { VisualStyle } from "@/lib/uslub/contract";
import { copyFor, type Lang } from "./copy";
import { resizeImageFile } from "./resize";

/**
 * The photos new post pictures are modelled on: the channel's own (learned automatically) and the
 * owner's (added here, 3-5 is plenty). Self-contained: it learns the style on mount when the brand
 * has none, and re-learns when the owner adds or removes a photo.
 *
 *   <StyleRefs brandId={brand.id} initial={brand.visual} lang="uz" onChange={(v) => …} />
 *
 * API: GET  /api/uslub/visual?brandId= -> { visual | null }
 *      POST /api/uslub/visual { brandId, ownerImages? } -> { visual }   (~15-30 s with AI)
 */
export interface StyleRefsProps {
  brandId: string;
  /** The brand's style if already known (BrandProfile.visual). */
  initial?: VisualStyle | null;
  lang?: Lang;
  /** Learn the style on mount when the brand has none. Default true. */
  autoLearn?: boolean;
  initData?: string;
  onChange?: (visual: VisualStyle) => void;
  className?: string;
}

const MAX_OWNER = 5;

export function StyleRefs({ brandId, initial, lang, autoLearn = true, initData, onChange, className }: StyleRefsProps) {
  const t = copyFor(lang);
  const [visual, setVisual] = useState<VisualStyle | null>(initial ?? null);
  const [learning, setLearning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const started = useRef(false);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const headers = useCallback(
    (): HeadersInit => ({ "Content-Type": "application/json", ...(initData ? { Authorization: `tma ${initData}` } : {}) }),
    [initData],
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
          body: JSON.stringify({ brandId, ...(ownerImages ? { ownerImages, refresh: true } : {}) }),
        });
        const data = (await res.json().catch(() => ({}))) as { visual?: VisualStyle; error?: string };
        if (res.ok && data.visual) {
          setVisual(data.visual);
          onChangeRef.current?.(data.visual);
        } else {
          setError(res.status === 400 ? t.badFile : t.styleFailed);
        }
      } catch {
        setError(t.styleFailed);
      } finally {
        setLearning(false);
      }
    },
    [brandId, headers, t],
  );

  // A brand without a style: read it (another tab may have learned it), else learn it.
  // Once per mount and never cancelled (StrictMode re-runs effects; see PostImage).
  useEffect(() => {
    if (started.current || initial || !autoLearn) return;
    started.current = true;
    void (async () => {
      try {
        const res = await fetch(`/api/uslub/visual?brandId=${encodeURIComponent(brandId)}`, { headers: headers(), cache: "no-store" });
        const data = res.ok ? ((await res.json()) as { visual: VisualStyle | null }) : { visual: null };
        if (data.visual) {
          setVisual(data.visual);
          onChangeRef.current?.(data.visual);
        } else await learn();
      } catch {
        await learn();
      }
    })();
  }, [autoLearn, brandId, headers, initial, learn]);

  const ownerRefs = (visual?.refs ?? []).filter((r) => r.source === "owner").map((r) => r.url);

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!files.length) return;
    if (ownerRefs.length + files.length > MAX_OWNER) {
      setError(t.tooMany);
      return;
    }
    try {
      const added = await Promise.all(files.map((f) => resizeImageFile(f, { maxSide: 1280, maxBytes: 600_000 })));
      await learn([...ownerRefs, ...added]);
    } catch {
      setError(t.badFile);
    }
  };

  const remove = (url: string) => void learn(ownerRefs.filter((u) => u !== url));

  const refs = visual?.refs ?? [];
  return (
    <section className={["w-full", className].filter(Boolean).join(" ")} aria-busy={learning}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium text-foreground">{t.styleTitle}</h3>
        <span role="status" aria-live="polite" className="text-xs text-muted">
          {learning ? t.styleLearning : error ?? ""}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">{refs.length ? t.styleHint : visual ? t.styleEmpty : ""}</p>

      <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {refs.map((r) => (
          <li key={r.url} className="relative aspect-square overflow-hidden rounded-md border border-line bg-card">
            {/* eslint-disable-next-line @next/next/no-img-element -- fal CDN refs; next/image would need remotePatterns */}
            <img src={r.url} alt={t.refAlt} className="h-full w-full object-cover" loading="lazy" />
            <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1.5 py-0.5 text-[11px] text-muted">
              {r.source === "owner" ? t.styleFromOwner : t.styleFromChannel}
            </span>
            {r.source === "owner" && !learning ? (
              <button
                type="button"
                onClick={() => remove(r.url)}
                aria-label={t.remove}
                className="absolute right-1 top-1 rounded bg-background/90 p-1 text-foreground hover:bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </li>
        ))}
        {learning && !refs.length
          ? [0, 1, 2].map((i) => <li key={i} className="aspect-square animate-pulse rounded-md border border-line bg-card motion-reduce:animate-none" aria-hidden />)
          : null}
      </ul>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={learning || ownerRefs.length >= MAX_OWNER}
          onClick={() => fileInput.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-sm text-foreground hover:bg-card disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          <ImagePlus className="h-3.5 w-3.5" aria-hidden />
          {t.addPhotos}
        </button>
        {visual?.palette.length ? (
          <span className="flex gap-1" aria-hidden>
            {visual.palette.map((c) => (
              <span key={c} className="h-3.5 w-3.5 rounded-full border border-line" style={{ backgroundColor: c }} />
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
    </section>
  );
}
