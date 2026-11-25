"use client";

/**
 * The week and the queue on screen (the Studio and the Mini App share these):
 * - WeekCard: «Haftani tasdiqlash · N» (the batch the autopilot's own selector lets through, hashed exactly as
 *   shown), what stays out and why, the bot's admin rights in the owner's channel, the autopilot switch and its trial;
 * - ScheduleLine: one post's place in the queue (goes out at …, going out, out, did not go out and why, changed).
 * The SMM-menejer's lamp signs the card: lit while the queue holds posts, waiting for the owner while there is a
 * week to approve.
 */
import type { PostDraft } from "@/lib/uslub/contract";
import { CalendarClock, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LampTile } from "../lamp/LampTile";
import { plural } from "../ui/format";
import { fmt, useCopy, useLang } from "../ui/lang";
import { addBotToChannelUrl } from "../ui/tme";
import { authHeader } from "./api";
import { showPost, whenOf } from "./desk";
import { useStudio, weekChannel } from "./store";
import { postPhase, tashkentWhen, weekContinueUrl, weekPlan, type WeekPlan } from "./week";
import type { WeekSkipReason } from "@/lib/autopilot/types";

type Variant = "studio" | "mini";

/** Now, to the minute: a slot that passes while the screen is open leaves the week. */
export function useMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** The week as it would be approved now (selectWeekBatch over the posts on screen), or exactly one post. */
export function useWeek(postId?: string): WeekPlan {
  const posts = useStudio((s) => s.posts);
  const schedule = useStudio((s) => s.schedule);
  const brand = useStudio((s) => s.brand);
  const typed = useStudio((s) => s.input.channel);
  const sample = useStudio((s) => s.sample);
  const now = useMinute();
  return useMemo(
    () =>
      weekPlan({
        posts,
        schedule,
        channel: weekChannel({ brand, input: { channel: typed }, sample }),
        languages: brand?.dna.languages,
        now,
        ...(postId ? { postIds: [postId] } : {}),
      }),
    [posts, schedule, brand, typed, sample, now, postId],
  );
}

/** "Seshanba 08:00" for a queue time (Tashkent); Russian keeps the weekday lower case mid-sentence. */
export function useWhenLabel() {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  return useCallback(
    (iso: string) => {
      const w = tashkentWhen(iso);
      if (!w) return "";
      const d = c.weekdays[w.weekday];
      return `${lang === "ru" ? d.toLowerCase() : d} ${w.time}`;
    },
    [c, lang],
  );
}

/** The bot can be asked about from this browser: a Telegram owner (Mini App, the bot's link key) or the sample. */
export const knownOwner = (sample: boolean) => sample || !!authHeader();

/** A link that leaves the page: a new tab on the web, Telegram's own opener inside the Mini App. */
function Out({ href, variant, className, onOpen, children }: { href: string; variant: Variant; className?: string; onOpen?: (href: string) => void; children: React.ReactNode }) {
  if (variant === "mini" && onOpen)
    return (
      <button type="button" className={className} onClick={() => onOpen(href)}>
        {children}
      </button>
    );
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className} onClick={() => onOpen?.(href)}>
      {children}
    </a>
  );
}

function skipLine(c: ReturnType<typeof useCopy>, reason: WeekSkipReason, extra: { tokens?: string[]; dates?: string[] }) {
  return fmt(c.week.skip[reason], { tokens: (extra.tokens ?? []).join(", "), dates: (extra.dates ?? []).join(", ") });
}

/**
 * The bot is not an admin of the owner's channel (Telegram told us, or the approval checked): one line naming the
 * channel and one link that adds the bot with the post right. Back from Telegram the rights are read again.
 */
function AdminLine({ variant, onOpen, url, compact = false }: { variant: Variant; onOpen?: (href: string) => void; url?: string; compact?: boolean }) {
  const c = useCopy();
  const bot = useStudio((s) => s.bot);
  const channel = useStudio((s) => weekChannel(s));
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    if (!asked) return;
    const back = () => {
      if (document.visibilityState === "visible") void useStudio.getState().loadAutopilot();
    };
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", back);
    return () => {
      window.removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", back);
    };
  }, [asked]);
  return (
    <div className="flex flex-col gap-2 rounded-[16px] bg-[var(--bad-soft,var(--glass-2))] px-3.5 py-3">
      <p className="text-[14px] leading-snug">{fmt(c.week.admin, { channel: channel ?? c.week.yourChannel })}</p>
      {!compact && <p className="text-[13px] leading-snug text-ink-2">{c.week.adminHint}</p>}
      <Out
        href={url || addBotToChannelUrl(bot)}
        variant={variant}
        onOpen={(h) => {
          setAsked(true);
          onOpen?.(h);
        }}
        className="btn-2 !min-h-10 self-start !px-4 !text-[14px]"
      >
        {c.week.adminBtn}
      </Out>
    </div>
  );
}

/** The autopilot switch: Mondays the next week is written and the report comes; the 7-day trial starts with it. */
export function AutopilotRow({ variant, onOpen, compact = false }: { variant: Variant; onOpen?: (href: string) => void; compact?: boolean }) {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const auto = useStudio((s) => s.autopilot);
  const busy = useStudio((s) => s.autopilotBusy);
  const sample = useStudio((s) => s.sample);
  const bot = useStudio((s) => s.bot);
  const brandId = useStudio((s) => s.brand?.id);
  const [cont, setCont] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!brandId) return null;
  const known = knownOwner(sample);
  const on = !!auto?.on;
  const days = auto?.trialDaysLeft;
  const trial = days == null ? null : days > 0 ? fmt(plural(c.autopilot.trial, days, lang), { n: days }) : c.autopilot.trialEnded;
  const continueUrl = cont ?? (!known ? weekContinueUrl(bot, brandId) : null);
  const flip = async () => {
    setErr(null);
    const r = await useStudio.getState().toggleAutopilot(!on);
    if (!r.ok && r.continueUrl) setCont(r.continueUrl);
    else if (!r.ok && r.message) setErr(r.message);
  };
  return (
    <div className="flex items-start gap-3">
      {continueUrl ? null : (
        <button type="button" role="switch" aria-checked={on} aria-labelledby="ap-h" className="switch mt-0.5" disabled={busy} onClick={() => void flip()}>
          <span className="switch__knob" aria-hidden />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <p id="ap-h" className="text-[15px] font-semibold leading-snug">
          {c.autopilot.title}
          {trial && on && <span className="tnum block text-[13px] font-normal text-ink-2">{trial}</span>}
        </p>
        {(!compact || auto?.paused) && <p className="mt-0.5 text-[13.5px] leading-snug text-ink-2">{auto?.paused ? c.autopilot.paused : on ? c.autopilot.on : c.autopilot.off}</p>}
        {continueUrl && (
          <Out
            href={continueUrl}
            variant={variant}
            onOpen={(h) => {
              useStudio.getState().handOverWeek();
              onOpen?.(h);
            }}
            className="link mt-1.5 inline-flex min-h-10 items-center text-[14px] text-ink"
          >
            {c.autopilot.continue}
          </Out>
        )}
        {err && <p role="alert" className="mt-1 text-[13.5px] text-bad">{err}</p>}
      </div>
    </div>
  );
}

/**
 * «Haftani tasdiqlash»: the posts that can go out at their time, one tap, the same count the server approves.
 * `variant="mini"` leaves the tap to Telegram's MainButton and opens links with Telegram's own opener.
 */
export function WeekCard({ variant = "studio", onOpen, compact = false }: { variant?: Variant; onOpen?: (href: string) => void; compact?: boolean }) {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const plan = useWeek();
  const week = useStudio((s) => s.week);
  const brandId = useStudio((s) => s.brand?.id);
  const bot = useStudio((s) => s.bot);
  const sample = useStudio((s) => s.sample);
  const schedule = useStudio((s) => s.schedule);
  const posts = useStudio((s) => s.posts);
  const admin = useStudio((s) => s.botAdmin);
  if (!brandId || !posts.length) return null;
  const known = knownOwner(sample);
  const n = plan.toQueue.length;
  const held = Object.values(schedule).filter((s) => s.status === "queued" || s.status === "sending" || s.status === "blocked").length;
  const sending = week.state === "sending";
  const adminUrl = week.state === "done" ? week.adminUrl : undefined;
  const needsAdmin = !!adminUrl || (!!admin && !admin.canPost && admin.status !== "unknown" && (held > 0 || n > 0));
  const byId = new Map(posts.map((p) => [p.id, p]));
  const skipped = plan.skipped.slice(0, 4);
  const pad = variant === "mini" ? "ma-group p-4" : `card ${compact ? "p-3.5" : "p-4 @md:p-5"}`;
  const label = sending ? c.week.sending : fmt(c.week.approve, { n });

  return (
    <section aria-label={c.autopilot.title} className={`flex flex-col gap-3.5 ${pad}`}>
      <div className="flex items-center gap-3">
        {/* The narrow Pro queue column has the hub's lamps beside it: the button takes the whole width there. */}
        {!compact && <LampTile role="publisher" size="xs" state={sending ? "warming" : held ? "on" : n ? "you" : "off"} className="h-11 w-11 shrink-0 !rounded-[12px]" aria-hidden />}
        <div className="min-w-0 flex-1">
          {n > 0 && variant === "studio" ? (
            known ? (
              <button type="button" className={`btn ${compact ? "w-full" : ""}`} disabled={sending} onClick={() => void useStudio.getState().approveWeek()}>
                {label}
              </button>
            ) : (
              // The server does not know this browser's owner: the bot shows the same week and approves it.
              <a href={weekContinueUrl(bot, brandId)} target="_blank" rel="noreferrer" className={`btn ${compact ? "w-full" : ""}`} onClick={() => useStudio.getState().handOverWeek()}>
                {label}
              </a>
            )
          ) : n > 0 ? (
            <p className="text-[15.5px] font-semibold leading-snug">{label}</p>
          ) : held ? (
            <p className="text-[15px] leading-snug">{c.week.allQueued}</p>
          ) : (
            <p className="text-[15px] font-semibold leading-snug">{c.autopilot.title}</p>
          )}
        </div>
      </div>
      {n > 0 && (!compact || !known) && <p className="text-[13.5px] leading-snug text-ink-2">{known ? c.week.approveHint : c.week.continueText}</p>}

      {week.state === "done" && (
        <p role="status" className="text-[14px] leading-snug text-ok">
          {fmt(plural(c.week.done, week.queued, lang), { n: week.queued })}
        </p>
      )}
      {week.state === "changed" && (
        <p role="status" className="text-[14px] leading-snug text-ink">
          {c.week.changed}
        </p>
      )}
      {week.state === "failed" && (
        <p role="alert" className="text-[14px] leading-snug text-bad">
          {week.message}
        </p>
      )}
      {week.state === "continue" && (
        <div className="flex flex-col gap-2">
          <p className="text-[14px] leading-snug">{c.week.continueText}</p>
          <Out href={week.continueUrl} variant={variant} onOpen={onOpen} className="btn-2 !min-h-10 self-start !px-4 !text-[14px]">
            {c.week.continueBtn}
          </Out>
        </div>
      )}

      {skipped.length > 0 && (
        <div>
          <p className="text-[13px] text-ink-3">{c.week.left}</p>
          <ul className="mt-1 flex flex-col">
            {skipped.map((s) => {
              const p = byId.get(s.postId);
              return (
                <li key={s.postId} className="flex items-baseline gap-2 py-1 text-[13.5px] leading-snug">
                  <span className="tnum shrink-0 text-ink-2">{whenOf(p?.slot)}</span>
                  <span className="min-w-0 flex-1 text-ink">{skipLine(c, s.reason, s)}</span>
                  {variant === "studio" && (
                    <button type="button" className="link shrink-0 text-ink-2" onClick={() => showPost(s.postId)}>
                      {c.approve.show}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {needsAdmin && <AdminLine variant={variant} onOpen={onOpen} url={adminUrl} compact={compact} />}
      <div className="border-t border-line pt-3.5">
        <AutopilotRow variant={variant} onOpen={onOpen} compact={compact} />
      </div>
    </section>
  );
}

/**
 * One post's place in the queue, said under it. `onPublish` stays the owner's way out when the queue could not send
 * it (blocked, failed, expired); a post whose send was cut off is never offered again (it may be in the channel).
 */
export function ScheduleLine({ post, variant = "studio", onOpen, action = true }: { post: PostDraft; variant?: Variant; onOpen?: (href: string) => void; action?: boolean }) {
  const c = useCopy();
  const bot = useStudio((st) => st.bot);
  const s = useStudio((st) => st.schedule[post.id]);
  const busy = useStudio((st) => st.week.state === "sending");
  const whenLabel = useWhenLabel();
  const phase = postPhase(post, s);
  if (phase.kind === "none" || (phase.kind === "out" && post.status === "published")) return null;
  const row = "flex items-start gap-2.5 text-[14px] leading-snug";
  if (phase.kind === "queued")
    return (
      <div className={row} role="status">
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-lime" aria-hidden />
        <span>
          <span className="block font-medium text-ink">{fmt(c.schedule.queued, { when: whenLabel(phase.dueAt) })}</span>
          <span className="block text-[13px] text-ink-2">{c.schedule.queuedHint}</span>
        </span>
      </div>
    );
  if (phase.kind === "sending")
    return (
      <p className={`${row} breathe text-ink-2`} role="status">
        {c.schedule.sending}
      </p>
    );
  if (phase.kind === "out")
    return (
      <p className={`${row} text-ok`} role="status">
        {c.schedule.out}
        {phase.url && (
          <Out href={phase.url} variant={variant} onOpen={onOpen} className="link inline-flex items-center gap-1 text-ink">
            {c.posts.openPost}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </Out>
        )}
      </p>
    );
  if (phase.kind === "changed")
    return (
      <div className="flex flex-col gap-2">
        <p className={`${row} text-ink`} role="status">
          <span aria-hidden className="mt-[0.5em] h-1.5 w-1.5 shrink-0 rounded-full bg-led shadow-[0_0_8px_var(--led)]" />
          {c.schedule.changed}
        </p>
        {variant === "studio" && action && <ReapproveButton post={post} busy={busy} />}
      </div>
    );
  if (phase.kind === "unknown")
    return (
      <p className={`${row} text-ink`} role="status">
        {phase.why ?? c.schedule.unknown}
      </p>
    );
  return (
    <div className="flex flex-col gap-2">
      <p className={`${row} text-bad`} role="alert">
        {c.schedule.stopped}
        {phase.why ? `: ${phase.why}` : ""}
      </p>
      {/* The week card explains the rights; here one link, the same one. */}
      {phase.status === "blocked" && (
        <Out href={addBotToChannelUrl(bot)} variant={variant} onOpen={onOpen} className="btn-2 !min-h-10 self-start !px-4 !text-[14px]">
          {c.week.adminBtn}
        </Out>
      )}
    </div>
  );
}

/** «Qayta tasdiqlash»: this version of a changed post goes back in the queue for its slot. */
export function ReapproveButton({ post, busy, className = "btn self-start" }: { post: PostDraft; busy?: boolean; className?: string }) {
  const c = useCopy();
  const sending = useStudio((s) => s.week.state === "sending");
  const on = busy ?? sending;
  return (
    <button type="button" className={className} disabled={on} onClick={() => void useStudio.getState().approveWeek([post.id])}>
      {on ? c.week.sending : c.schedule.reapprove}
    </button>
  );
}

/** «Seshanba 08:00 da o‘zi chiqsin»: an approved post the queue does not hold yet goes in for its slot. */
export function QueueOne({ post }: { post: PostDraft }) {
  const c = useCopy();
  const sample = useStudio((s) => s.sample);
  const held = useStudio((s) => !!s.schedule[post.id]);
  const busy = useStudio((s) => s.week.state === "sending");
  const ready = useWeek(post.id).batch.ready[0];
  if (held || post.status !== "approved" || !ready || !knownOwner(sample)) return null;
  const w = tashkentWhen(ready.dueAt);
  const when = w ? `${c.weekdays[w.weekday]} ${w.time}` : "";
  return (
    <button type="button" className="link self-start text-[14px] text-ink-2" disabled={busy} onClick={() => void useStudio.getState().approveWeek([post.id])}>
      {fmt(c.schedule.queueOne, { when })}
    </button>
  );
}

/**
 * While the queue holds a post that is due soon, its state is read again every minute the page is visible, so
 * "goes out at 08:00" turns into "out" with its link without a reload (refreshPosts also reads the queue).
 */
export function useQueuePoll(active = true) {
  const live = useStudio((s) => s.phase === "ready" && !s.sample && Object.values(s.schedule).some((x) => x.status === "queued" || x.status === "sending"));
  useEffect(() => {
    if (!active || !live) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void useStudio.getState().refreshPosts();
    }, 60_000);
    return () => clearInterval(t);
  }, [active, live]);
}
