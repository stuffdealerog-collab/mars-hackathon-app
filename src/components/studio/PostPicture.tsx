import { lampVars } from "../lamp/lamps";
import { useCopy } from "../ui/lang";

/**
 * The picture slot before this post's picture has started (the Dizayner is still studying the
 * channel's photos): the Dizayner's lamp, warming, laid out exactly like the images session's
 * PostImage (4:5, inset, caption row), so nothing moves when the real card takes over.
 */
export function PictureWaiting() {
  const c = useCopy();
  return (
    <div className="p-1.5" role="status">
      <div className="lamp relative aspect-[4/5] w-full overflow-hidden !rounded-[17px]" data-state="warming" style={lampVars("designer")}>
        <span className="lamp__glow" aria-hidden />
        <span className="lamp__filament" aria-hidden />
      </div>
      <p className="mt-1.5 flex min-h-9 items-center px-2.5 text-[12.5px] text-ink-2">{c.posts.image.running}</p>
    </div>
  );
}
