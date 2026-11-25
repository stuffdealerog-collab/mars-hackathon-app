import { useCopy } from "../../ui/lang";
import { VideoBoard } from "../../video";
import { TopBar, useCompact } from "../Shell";
import { openLink } from "../tg";

/** «Video»: the Videographer's scripts for this week's video posts; the owner sends the video to the bot. */
export function VideoScreen() {
  const c = useCopy();
  const { ref, compact } = useCompact(40);
  return (
    <>
      <TopBar title={c.video.title} compact={compact} />
      <div ref={ref} className="ma-scroll">
        <div className="ma-pad flex flex-col gap-5">
          <h1 className="ma-h1">{c.video.title}</h1>
          <VideoBoard variant="mini" onOpen={openLink} />
        </div>
      </div>
    </>
  );
}
