import { LampTile } from "../../lamp/LampTile";
import { useCopy } from "../../ui/lang";
import { TopBar, useCompact } from "../Shell";

/** «Video»: a calm stub. The Videographer's lamp stays dark until it can do real work. */
export function VideoScreen() {
  const c = useCopy();
  const { ref, compact } = useCompact(40);
  return (
    <>
      <TopBar title={c.video.title} compact={compact} />
      <div ref={ref} className="ma-scroll">
        <div className="ma-pad flex min-h-full flex-col">
          <h1 className="ma-h1">{c.video.title}</h1>
          <div className="flex flex-1 flex-col items-center justify-center gap-6 pb-10 pt-8 text-center">
            <LampTile role="video" state="off" size="sm" name={c.lamps.video.name} stateText={c.lampState.soon} className="w-[164px] opacity-70" />
            <p className="max-w-[30ch] text-[16px] leading-relaxed text-ink-2">{c.video.text}</p>
          </div>
        </div>
      </div>
    </>
  );
}
