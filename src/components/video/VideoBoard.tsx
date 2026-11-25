"use client";

/**
 * «Video»: the Videographer at work, for the Studio and the Mini App.
 * - The Videographer's lamp: lit while it writes a script, holding the number of scripts once there are any.
 * - This week's video posts, one card each: the slot (or "Idea"), where it stands, the script (folds open), and the
 *   one thing to do next: write the script / send the video to the bot (deep link) / approve / see it in the channel.
 * - A new idea on request (an optional brief), and "Make the video with AI" shown as coming, not usable.
 * Video files never pass through Mercat: the owner sends them to the bot, the post keeps Telegram's file id.
 */
import type { PostDraft, PostSchedule } from "@/lib/uslub/contract";
import { Check, ChevronDown, Clapperboard, ExternalLink, Send, Sparkles } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { LampTile } from "../lamp/LampTile";
import * as api from "../studio/api";
import { whenOf } from "../studio/desk";
import { useStudio } from "../studio/store";
import { useMinute, useWhenLabel } from "../studio/WeekCard";
import { plural } from "../ui/format";
import { fmt, useCopy, useLang } from "../ui/lang";
import { fmtDuration, isVideoIdea, planSeconds, sceneRanges, videoLamp, videoLink, videoState, type VideoState } from "./model";
import { IDEA, useVideo, useVideoView } from "./store";

type Variant = "studio" | "mini";

/** A link that leaves the page: a new tab on the web, Telegram's own opener inside the Mini App. */
function Out({ href, onOpen, className, children }: { href: string; onOpen?: (href: string) => void; className?: string; children: React.ReactNode }) {
  if (onOpen)
    return (
      <button type="button" className={className} onClick={() => onOpen(href)}>
        {children}
      </button>
    );
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  );
}

const DOT: Record<VideoState, string> = {
  needs_script: "var(--ink-3)",
  waiting: "var(--lime)",
  received: "var(--lime)",
  approved: "var(--ok, #34c759)",
  queued: "var(--ok, #34c759)",
  stopped: "var(--bad)",
  out: "var(--ok, #34c759)",
};

export function VideoBoard({ variant = "studio", onOpen }: { variant?: Variant; onOpen?: (href: string) => void }) {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const now = useMinute();
  const view = useVideoView(now);
  const writing = useVideo((s) => s.writing);
  const anyWriting = Object.values(writing).some(Boolean);
  const lamp = videoLamp(view.all, anyWriting);
  const group = variant === "mini" ? "ma-group" : "card";
  const brand = useStudio((s) => s.brand);
  if (!brand && !view.sample) return null;

  return (
    <div className="flex flex-col gap-5">
      <div className={`flex items-start gap-4 ${variant === "mini" ? "" : `${group} p-4 @md:p-5`}`}>
        <LampTile
          role="video"
          size="sm"
          state={lamp.state}
          name={c.lamps.video.name}
          stateText={c.lampState[lamp.state === "warming" ? "warming" : lamp.state === "on" ? "on" : "off"]}
          result={lamp.scripts ? `${lamp.scripts} ${plural(c.lampResult.scripts, lamp.scripts, lang)}` : undefined}
          className="w-[148px] shrink-0"
        />
        <p className="min-w-0 flex-1 text-[15px] leading-relaxed text-ink-2">{c.video.text}</p>
      </div>

      <section aria-labelledby="video-slots-h" className="flex flex-col gap-3">
        <h2 id="video-slots-h" className={variant === "mini" ? "ma-h2 !mt-2" : "text-[18px] font-semibold"}>
          {c.video.slots}
        </h2>
        {view.posts.length ? (
          <ul className="flex flex-col gap-3">
            {view.posts.map((p) => (
              <li key={p.id}>
                <VideoCard post={p} schedule={view.schedule[p.id]} variant={variant} onOpen={onOpen} sample={view.sample} known={view.known} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-1 text-[15px] leading-relaxed text-ink-2">{c.video.empty}</p>
        )}
      </section>

      <IdeaCard variant={variant} />
      <GenerateSoon variant={variant} />
    </div>
  );
}

function VideoCard({
  post,
  schedule,
  variant,
  onOpen,
  sample,
  known,
}: {
  post: PostDraft;
  schedule?: PostSchedule;
  variant: Variant;
  onOpen?: (href: string) => void;
  sample: boolean;
  known: boolean;
}) {
  const c = useCopy();
  const bot = useStudio((s) => s.bot);
  const whenLabel = useWhenLabel();
  const writing = useVideo((s) => !!s.writing[post.id]);
  const note = useVideo((s) => s.notes[post.id]);
  const state = videoState(post, schedule);
  const idea = isVideoIdea(post);
  const plan = post.video?.plan;
  const hook = post.slot?.hook || plan?.hook || post.brief;
  // Queued for its own slot (the time is already in the line): "queued"; going out at another time: when.
  const due = state === "queued" && schedule ? whenLabel(schedule.dueAt) : "";
  const slotWhen = whenOf(post.slot);
  const statusText = due ? (due.toLowerCase() === slotWhen.toLowerCase() ? c.video.status.queuedAtSlot : fmt(c.video.status.queued, { when: due })) : c.video.status[state];
  const link = videoLink(bot, post.id);
  const group = variant === "mini" ? "ma-group" : "card";
  const small = "btn-2 !min-h-10 !px-4 !text-[14px]";

  return (
    <article className={`${group} flex flex-col gap-3 p-4`} aria-busy={writing || undefined}>
      <div className="flex items-center gap-2 text-[13px] text-ink-2">
        <span className="tnum">{idea ? c.video.ideaTag : slotWhen}</span>
        <span aria-hidden>·</span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-[7px] w-[7px] rounded-full" style={{ background: DOT[state] }} />
          {statusText}
        </span>
      </div>
      <h3 className="text-[16.5px] font-semibold leading-snug">{hook}</h3>

      {post.video?.fileId && <VideoThumb post={post} sample={sample} />}

      {writing ? (
        <p role="status" className="breathe text-[14px] text-ink-2">
          {c.video.writing}
        </p>
      ) : state === "needs_script" ? (
        <button type="button" className={`${small} self-start`} onClick={() => void useVideo.getState().write(post.id)}>
          <Clapperboard className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          {c.video.write}
        </button>
      ) : state === "waiting" || state === "received" ? (
        <div className="flex flex-col gap-2">
          {state === "waiting" && <p className="text-[13.5px] leading-snug text-ink-2">{known ? c.video.sendHint : c.video.needsTelegram}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {state === "received" && !idea && known && (
              <button type="button" className={small} onClick={() => void useVideo.getState().approve(post.id)}>
                <Check className="h-4 w-4" strokeWidth={2} aria-hidden />
                {c.video.approve}
              </button>
            )}
            {state === "received" && idea && (
              <Out href={api.botPublishUrl(bot, post.id)} onOpen={onOpen} className={small}>
                {c.video.publish}
              </Out>
            )}
            <Out href={link} onOpen={onOpen} className={state === "waiting" ? small : "link inline-flex min-h-10 items-center px-1 text-[14px] text-ink-2"}>
              {state === "waiting" && <Send className="h-4 w-4" strokeWidth={1.8} aria-hidden />}
              {state === "waiting" ? c.video.send : c.video.sendAgain}
            </Out>
          </div>
          {state === "received" && !idea && !known && <p className="text-[13.5px] leading-snug text-ink-2">{c.video.approveInBot}</p>}
        </div>
      ) : state === "approved" && idea ? (
        <Out href={api.botPublishUrl(bot, post.id)} onOpen={onOpen} className={`${small} self-start`}>
          {c.video.publish}
        </Out>
      ) : state === "stopped" && schedule?.error ? (
        <p className="text-[13.5px] leading-snug text-bad">{schedule.error}</p>
      ) : state === "out" && post.publishedUrl ? (
        <Out href={post.publishedUrl} onOpen={onOpen} className="link inline-flex min-h-10 items-center gap-1.5 self-start text-[14px]">
          {c.video.open}
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
        </Out>
      ) : null}

      {note && (
        <p role={note.tone === "bad" ? "alert" : "status"} className={`text-[13.5px] leading-snug ${note.tone === "bad" ? "text-bad" : "text-ok"}`}>
          {note.text}
          {note.link && (
            <>
              {" "}
              <Out href={note.link} onOpen={onOpen} className="link text-ink">
                {note.linkLabel ?? c.week.continueBtn}
              </Out>
            </>
          )}
        </p>
      )}

      {plan && <Script plan={plan} />}
    </article>
  );
}

/** The script, folded: one line (scenes, length) that opens the whole shot list. */
function Script({ plan }: { plan: NonNullable<NonNullable<PostDraft["video"]>["plan"]> }) {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const [open, setOpen] = useState(false);
  const id = useId();
  const ranges = sceneRanges(plan);
  const n = plan.scenes.length;
  return (
    <div className="border-t border-line pt-2">
      <button type="button" aria-expanded={open} aria-controls={id} className="flex min-h-10 w-full items-center gap-2 text-left text-[14px]" onClick={() => setOpen((v) => !v)}>
        <span className="font-semibold">{c.video.script}</span>
        <span className="tnum text-ink-2">
          {n} {plural(c.video.scenes, n, lang)} · {fmt(c.video.total, { s: planSeconds(plan) })}
        </span>
        <ChevronDown className={`ml-auto h-4 w-4 text-ink-2 transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={1.8} aria-hidden />
      </button>
      {open && (
        <ol id={id} className="mt-1 flex flex-col gap-3 text-[14px] leading-snug">
          <li className="flex flex-col gap-0.5">
            <span className="text-[12.5px] text-ink-3">{c.video.hook}</span>
            <span>{plan.hook}</span>
          </li>
          {plan.scenes.map((s, i) => (
            <li key={i} className="grid grid-cols-[52px_1fr] gap-x-3">
              <span className="tnum pt-px text-[12.5px] text-ink-3">
                {ranges[i].from}–{ranges[i].to} s
              </span>
              <span className="flex flex-col gap-1">
                <span>
                  <span className="text-ink-3">{c.video.film}: </span>
                  {s.visual}
                </span>
                {s.voiceover && (
                  <span>
                    <span className="text-ink-3">{c.video.say}: </span>«{s.voiceover}»
                  </span>
                )}
                {s.caption && (
                  <span>
                    <span className="text-ink-3">{c.video.onScreen}: </span>
                    <span className="font-semibold">{s.caption}</span>
                  </span>
                )}
              </span>
            </li>
          ))}
          {plan.musicMood && (
            <li className="text-ink-2">
              <span className="text-ink-3">{c.video.music}: </span>
              {plan.musicMood}
            </li>
          )}
        </ol>
      )}
    </div>
  );
}

/** The owner's video: its thumbnail from Telegram (through our same-origin route), else an icon; and its length. */
function VideoThumb({ post, sample }: { post: PostDraft; sample: boolean }) {
  const c = useCopy();
  const [src, setSrc] = useState<string | null>(null);
  const thumb = post.video?.thumbFileId;
  useEffect(() => {
    if (sample || !thumb) return;
    let url: string | null = null;
    let live = true;
    void api.videoThumb(post.id).then((u) => {
      if (live) setSrc((url = u));
      else if (u) URL.revokeObjectURL(u);
    });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
      setSrc(null);
    };
  }, [post.id, thumb, sample]);
  const d = fmtDuration(post.video?.duration);
  return (
    <div className="relative grid h-[120px] w-[72px] place-items-center overflow-hidden rounded-[12px] bg-[var(--glass-2)] shadow-[inset_0_0_0_1px_var(--hair)]">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a blob: URL of the owner's own thumbnail
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <Clapperboard className="h-6 w-6 text-ink-2" strokeWidth={1.6} aria-label={c.video.noThumb} />
      )}
      {d && <span className="tnum absolute bottom-1.5 right-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[11.5px] font-medium text-white">{d}</span>}
    </div>
  );
}

/** «Video idea»: an optional brief, then the Videographer writes a new script (saved as a video post). */
function IdeaCard({ variant }: { variant: Variant }) {
  const c = useCopy();
  const writing = useVideo((s) => !!s.writing[IDEA]);
  const note = useVideo((s) => s.notes[IDEA]);
  const [brief, setBrief] = useState("");
  const id = useId();
  const group = variant === "mini" ? "ma-group" : "card";
  const submit = async () => {
    if (await useVideo.getState().idea(brief)) setBrief("");
  };
  return (
    <section aria-labelledby={`${id}-h`} className={`${group} flex flex-col gap-3 p-4`}>
      <h2 id={`${id}-h`} className="text-[16.5px] font-semibold">
        {c.video.idea}
      </h2>
      <label htmlFor={id} className="text-[13.5px] leading-snug text-ink-2">
        {c.video.ideaHint}
      </label>
      <textarea
        id={id}
        className="input !min-h-[88px] !text-[16px]"
        rows={2}
        maxLength={1000}
        value={brief}
        placeholder={c.video.ideaPlaceholder}
        disabled={writing}
        onChange={(e) => setBrief(e.target.value)}
      />
      <button type="button" className="btn-2 !min-h-11 self-start !px-5 !text-[15px]" disabled={writing} onClick={() => void submit()}>
        <Sparkles className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        {writing ? c.video.writing : c.video.ideaBtn}
      </button>
      {note && (
        <p role="alert" className="text-[13.5px] leading-snug text-bad">
          {note.text}
        </p>
      )}
    </section>
  );
}

/** AI video generation: visible as coming, not usable, with one honest line. */
function GenerateSoon({ variant }: { variant: Variant }) {
  const c = useCopy();
  return (
    <div className={`flex flex-col gap-2 ${variant === "mini" ? "px-1 pb-6" : ""}`}>
      <button type="button" className="btn-2 !min-h-11 self-start !px-5 !text-[15px]" disabled aria-disabled="true">
        {c.video.generate}
        <span className="rounded-full bg-[var(--glass-3)] px-2 py-0.5 text-[12px] font-medium text-ink-2">{c.video.soon}</span>
      </button>
      <p className="max-w-[60ch] text-[13.5px] leading-snug text-ink-2">{c.video.generateNote}</p>
    </div>
  );
}
