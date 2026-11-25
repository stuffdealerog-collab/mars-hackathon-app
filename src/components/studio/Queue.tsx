import type { PostDraft, PostSchedule, Script } from "@/lib/uslub/contract";
import { LampTile } from "../lamp/LampTile";
import { fmt, useCopy } from "../ui/lang";
import { useDesk, whenOf } from "./desk";
import { pictureBusy, useStudio } from "./store";

type Group = { key: "draft" | "approved" | "scheduled" | "published"; title: string; posts: PostDraft[] };

/** An approved post the queue will send (or is sending); one it stopped waits for the owner's hand with the others. */
const inQueue = (p: PostDraft, schedule: Record<string, PostSchedule>) => {
  const st = schedule[p.id]?.status;
  return p.status === "approved" && (st === "queued" || st === "sending" || st === "sent");
};

/** Monday first, then the time; posts without a slot go last in their group. */
function bySlot(a: PostDraft, b: PostDraft) {
  if (!a.slot || !b.slot) return a.slot ? -1 : b.slot ? 1 : 0;
  return `${a.slot.day} ${a.slot.time}`.localeCompare(`${b.slot.day} ${b.slot.time}`);
}

/** Drafts, then approved (waiting for a hand), then scheduled, then published; inside each by slot. The queue's and J/K's order. */
export function queueOrder(posts: PostDraft[], schedule: Record<string, PostSchedule> = {}): PostDraft[] {
  return [
    posts.filter((p) => p.status === "draft"),
    posts.filter((p) => p.status === "approved" && !inQueue(p, schedule)),
    posts.filter((p) => inQueue(p, schedule)),
    posts.filter((p) => p.status === "published"),
  ].flatMap((g) => g.sort(bySlot));
}

/** The owner's posts in the order of the decisions they wait for: theirs first. */
export function useQueue(): Group[] {
  const c = useCopy();
  const posts = useStudio((s) => s.posts);
  const schedule = useStudio((s) => s.schedule);
  const groups: Group[] = [
    { key: "draft", title: c.queue.waiting, posts: posts.filter((p) => p.status === "draft").sort(bySlot) },
    { key: "approved", title: c.queue.approved, posts: posts.filter((p) => p.status === "approved" && !inQueue(p, schedule)).sort(bySlot) },
    { key: "scheduled", title: c.queue.scheduled, posts: posts.filter((p) => inQueue(p, schedule)).sort(bySlot) },
    { key: "published", title: c.queue.published, posts: posts.filter((p) => p.status === "published").sort(bySlot) },
  ];
  return groups.filter((g) => g.posts.length);
}

/**
 * Postlar · Pro, left column: a listbox grouped by status. Roving focus (one tab stop), J/K and
 * the arrows move it (useHotkeys), a click or Enter on an option shows that post in the preview.
 */
export function Queue({ script }: { script: (p: PostDraft) => Script }) {
  const c = useCopy();
  const groups = useQueue();
  const focused = useDesk((s) => s.focusedPostId);
  const setFocused = useDesk((s) => s.setFocused);
  const flat = groups.flatMap((g) => g.posts);
  const current = flat.find((p) => p.id === focused) ?? flat[0];

  return (
    <div className="card flex flex-col gap-1 p-2">
      <div role="listbox" aria-label={c.tabs.posts} className="flex flex-col gap-1">
        {groups.map((g) => (
          <div key={g.key} role="group" aria-labelledby={`qg-${g.key}`} className="flex flex-col gap-0.5">
            <p id={`qg-${g.key}`} className="px-2.5 pb-1 pt-2.5 text-[12.5px] text-ink-3">
              {g.title} · <span className="tnum">{g.posts.length}</span>
            </p>
            {g.posts.map((p) => (
              <Row key={p.id} post={p} script={script(p)} active={p.id === current?.id} onPick={() => setFocused(p.id)} />
            ))}
          </div>
        ))}
      </div>
      <p className="px-2.5 pb-1.5 pt-3 text-[12.5px] leading-snug text-ink-3">{c.queue.notAuto}</p>
    </div>
  );
}

function Row({ post, script, active, onPick }: { post: PostDraft; script: Script; active: boolean; onPick: () => void }) {
  const c = useCopy();
  const text = post.variants[script] ?? "";
  const first = text.split("\n").find((l) => l.trim())?.trim() ?? "";
  const when = whenOf(post.slot);
  const url = post.image?.url;
  const sample = useStudio((s) => s.sample);
  return (
    <div
      id={`q-${post.id}`}
      role="option"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      data-queue-option
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === " ") {
          e.preventDefault();
          onPick();
        }
      }}
      className={`flex h-16 cursor-pointer items-center gap-3 rounded-[16px] px-1.5 outline-none transition-colors duration-150 focus-visible:shadow-[0_0_0_2px_var(--focus)] ${
        active ? "bg-glass-3" : "hover:bg-glass-2"
      }`}
    >
      {url ? (
        <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[12px] bg-glass-2 shadow-[inset_0_0_0_1px_var(--hair)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        </span>
      ) : sample ? null : (
        // No picture yet: the Dizayner's small lamp, warming while it draws, its ember otherwise.
        <LampTile role="designer" size="xs" state={pictureBusy(post.id, post.image) ? "warming" : "off"} className="h-14 w-14 shrink-0 !rounded-[12px]" aria-hidden />
      )}
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[14px] leading-tight ${active ? "text-ink" : "text-ink-2"}`}>{first}</span>
        {when && <span className={`tnum mt-0.5 block truncate text-[12px] ${active ? "text-ink-2" : "text-ink-3"}`}>{fmt(c.queue.suggest, { when })}</span>}
      </span>
      {post.status === "draft" && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime shadow-[0_0_8px_var(--lime)]" />}
    </div>
  );
}
