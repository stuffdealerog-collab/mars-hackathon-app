import type { PostImage } from "@/lib/uslub/contract";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { lampVars } from "../lamp/lamps";
import { useCopy } from "../ui/lang";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/**
 * A post's picture in the brand's style, always in a 4:5 slot so cards never jump.
 * The Studio uses `@/components/media` PostImage now; this stays for the Mini App, which moves
 * over at its own pace (spec §3.6).
 *
 * `expected` reserves the slot before a picture exists (pictures are on their way); without
 * it, a post with no picture shows none.
 */
export function PostPicture({ image, alt, onRetry, expected = false }: { image?: PostImage; alt: string; onRetry?: () => void; expected?: boolean }) {
  const c = useCopy();
  const reduce = useReducedMotion() ?? false;
  const [loaded, setLoaded] = useState(false);
  if (!image && !expected) return null;

  if (image?.status === "failed") {
    return (
      <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-3 bg-glass px-6 text-center">
        <p className="text-[15px] font-medium">{c.posts.image.failed}</p>
        {image.error && <p className="max-w-[36ch] text-[14px] text-ink-2">{image.error}</p>}
        {onRetry && (
          <button type="button" onClick={onRetry} className="btn-2 !min-h-11 !text-[15px]">
            {c.posts.image.retry}
          </button>
        )}
      </div>
    );
  }

  const ready = image?.status === "ready" && !!image.url;
  return (
    <div className="relative aspect-[4/5] w-full overflow-hidden bg-glass">
      {/* While it is drawn (and until the file arrives), the slot is the Dizayner's lamp, warming. */}
      {(!ready || !loaded) && (
        <div className="lamp absolute inset-0 items-center justify-center !rounded-none" data-state="warming" style={lampVars("designer")} role="status">
          <span className="lamp__glow" aria-hidden />
          <span className="lamp__filament" aria-hidden />
          <p className="relative text-[15px] font-medium text-white [text-shadow:0_1px_10px_rgb(0_0_0/.4)]">{c.posts.image.running}</p>
        </div>
      )}
      {ready && (
        // The picture develops out of the lamp: a soft fade and settle, once.
        <motion.img
          src={image!.url}
          alt={alt}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          className="absolute inset-0 h-full w-full object-cover"
          initial={reduce ? false : { opacity: 0, scale: 1.03 }}
          animate={loaded ? { opacity: 1, scale: 1 } : undefined}
          transition={{ duration: 0.7, ease: EASE_OUT }}
        />
      )}
    </div>
  );
}

/**
 * The Dizayner's slot where a picture will be, laid out exactly like PostImage (4:5, inset,
 * caption row) so nothing moves when the real card takes over. Warming while a picture is on
 * its way; dark with its own caption where none will come (the sample).
 */
export function PictureWaiting({ caption, dark = false }: { caption?: string; dark?: boolean }) {
  const c = useCopy();
  return (
    <div className="p-1.5" role="status">
      <div className="lamp relative aspect-[4/5] w-full overflow-hidden !rounded-[17px]" data-state={dark ? "off" : "warming"} style={lampVars("designer")}>
        <span className="lamp__glow" aria-hidden />
        <span className="lamp__filament" aria-hidden />
      </div>
      <p className="mt-1.5 flex min-h-9 items-center px-2.5 text-[12.5px] text-ink-2">{caption ?? c.posts.image.running}</p>
    </div>
  );
}
