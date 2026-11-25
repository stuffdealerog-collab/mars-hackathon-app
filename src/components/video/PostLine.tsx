"use client";

/**
 * A video post inside the Posts tab (Studio and Mini App). The channel gets the owner's video with this text, never
 * the run's picture, so the card shows no picture: one quiet line instead, where the video stands, and the way to the
 * Video tab (where the script, the bot link and the approval live).
 */
import type { PostDraft, PostSchedule } from "@/lib/uslub/contract";
import { ChevronRight, Clapperboard } from "lucide-react";
import { fmtDuration, postLineState } from "./model";
import { useCopy } from "../ui/lang";

export function VideoPostLine({ post, schedule, onOpenTab, className = "" }: { post: PostDraft; schedule?: PostSchedule; onOpenTab: () => void; className?: string }) {
  const c = useCopy();
  const state = postLineState(post, schedule);
  const duration = fmtDuration(post.video?.duration);
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
      <span className="inline-flex min-w-0 items-center gap-2 text-[13.5px] text-ink-2">
        <Clapperboard className="h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden />
        <span className="min-w-0">
          {c.video.postTag} · {c.video.status[state]}
          {duration && <span className="tnum"> · {duration}</span>}
        </span>
      </span>
      <button type="button" className="link inline-flex min-h-10 items-center gap-1 text-[13.5px] text-ink" onClick={onOpenTab}>
        {c.video.toTab}
        <ChevronRight className="h-4 w-4" strokeWidth={1.8} aria-hidden />
      </button>
    </div>
  );
}

/** The list's thumbnail for a video post: the clapperboard, not the run's picture (which never goes out with it). */
export function VideoPostTile({ className = "" }: { className?: string }) {
  return (
    <span className={`grid place-items-center text-ink-2 ${className}`} aria-hidden>
      <Clapperboard className="h-5 w-5" strokeWidth={1.7} />
    </span>
  );
}
