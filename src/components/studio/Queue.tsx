import type { PostDraft, Script } from "@/lib/uslub/contract";
import { fmt, useCopy } from "../ui/lang";
import { useDesk, whenOf } from "./desk";
import { useStudio } from "./store";

type Group = { key: "draft" | "approved" | "published"; title: string; posts: PostDraft[] };

/** Monday first, then the time; posts without a slot go last in their group. */
function bySlot(a: PostDraft, b: PostDraft) {
  if (!a.slot || !b.slot) return a.slot ? -1 : b.slot ? 1 : 0;
  return `${a.slot.day} ${a.slot.time}`.localeCompare(`${b.slot.day} ${b.slot.time}`);
}

/** Drafts, then approved, then published; inside each by slot. The queue's and J/K's order. */
export function queueOrder(posts: PostDraft[]): PostDraft[] {
  return (["draft", "approved", "published"] as const).flatMap((st) => posts.filter((p) => p.status === st).sort(bySlot));
}

/** The owner's posts in the order of the decisions they wait for: theirs first. */
export function useQueue(): Group[] {
  const c = useCopy();
  const posts = useStudio((s) => s.posts);
  const groups: Group[] = [
    { key: "draft", title: c.queue.waiting, posts: posts.filter((p) => p.status === "draft").sort(bySlot) },
    { key: "approved", title: c.queue.approved, posts: posts.filter((p) => p.status === "approved").sort(bySlot) },
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
      className={`flex h-14 cursor-pointer items-center gap-3 rounded-[14px] px-2 outline-none transition-colors duration-150 focus-visible:shadow-[0_0_0_2px_var(--focus)] ${
        active ? "bg-glass-3" : "hover:bg-glass-2"
      }`}
    >
      <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[10px] bg-glass-2 shadow-[inset_0_0_0_1px_var(--hair)]">
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[14px] leading-tight ${active ? "text-ink" : "text-ink-2"}`}>{first}</span>
        {when && <span className="tnum mt-0.5 block truncate text-[12px] text-ink-3">{fmt(c.queue.suggest, { when })}</span>}
      </span>
      {post.status === "draft" && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime shadow-[0_0_8px_var(--lime)]" />}
    </div>
  );
}
