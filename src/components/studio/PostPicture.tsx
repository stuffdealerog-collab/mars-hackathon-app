import type { PostImage } from "@/lib/uslub/contract";
import { lampVars } from "../lamp/lamps";
import { useCopy } from "../ui/lang";

/**
 * A post's picture in the brand's style.
 * Local stand-in until the images session's `src/components/media/PostImage` is merged;
 * same input (the contract's PostImage), so the swap is one import.
 */
export function PostPicture({ image, alt, onRetry }: { image?: PostImage; alt: string; onRetry?: () => void }) {
  const c = useCopy();
  if (!image) return null;
  if (image.status === "ready" && image.url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- generated picture on an external https host
      <img src={image.url} alt={alt} loading="lazy" className="block max-h-[560px] w-full bg-tint object-cover" />
    );
  }
  if (image.status === "failed") {
    return (
      <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 bg-tint px-6 text-center">
        <p className="text-[15px] font-medium">{c.posts.image.failed}</p>
        {image.error && <p className="max-w-[36ch] text-[14px] text-ink-2">{image.error}</p>}
        {onRetry && (
          <button type="button" onClick={onRetry} className="btn-2 !min-h-10 !text-[15px]">
            {c.posts.image.retry}
          </button>
        )}
      </div>
    );
  }
  // While it is drawn, the picture slot is the Designer's lamp, warming.
  return (
    <div className="lamp aspect-[4/3] w-full items-center justify-center !rounded-none" data-state="warming" style={lampVars("designer")} role="status">
      <span className="lamp__glow" aria-hidden />
      <span className="lamp__filament" aria-hidden />
      <p className="relative text-[15px] font-medium text-white [text-shadow:0_1px_10px_rgb(0_0_0/.4)]">{c.posts.image.running}</p>
    </div>
  );
}
