/**
 * Asboblar: four quiet tools in the hub for what is in focus. A post (another picture, the
 * product photo, copy the text, download the picture) or the channel (a new post, add photos,
 * copy the week, make the bot an admin). Never Tasdiqlash or Joylash: those live on the post.
 */
import { ClipboardList, Copy, Download, ImagePlus, Package, PenLine, RefreshCw, ShieldCheck } from "lucide-react";
import { instagramFor } from "./PostTools";
import { isVideoPost } from "../video/model";
import type { ContentPlan, PostDraft, Script } from "@/lib/uslub/contract";
import type { Copy as CopyText } from "../ui/copy";
import { weekday } from "../ui/format";
import { fmt, useCopy } from "../ui/lang";
import { useDesk } from "./desk";
// Hub renders Tools; the store is read only on a click, so the cycle is safe.
import { useHub } from "./Hub";
import { pictureBusy, slotKey, useStudio } from "./store";

type Tool = { key: string; icon: typeof Copy; label: string; run: () => void; off?: string | true };

/** The week as plain text: each plan day with its hook, then every post in the chosen script. */
export function weekText(plan: ContentPlan | null, posts: PostDraft[], c: CopyText, script: Script): string {
  const lines: string[] = [];
  for (const it of plan?.items ?? []) {
    const d = weekday(it.day);
    lines.push(`${d != null ? c.weekdays[d] : it.day} ${it.time}: ${it.hook}`);
  }
  for (const p of posts) lines.push("", `${p.slot ? `${p.slot.day} ${p.slot.time}` : ""}`.trim(), p.variants[script] ?? p.variants.uz_latn ?? "");
  return lines.join("\n").trim();
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function Tools({ collapsed }: { collapsed: boolean }) {
  const c = useCopy();
  const s = useStudio();
  const desk = useDesk();
  const ready = s.phase === "ready";
  const onPosts = ready && s.tab === "posts" && s.posts.length > 0;
  const post = onPosts ? (s.posts.find((p) => p.id === desk.focusedPostId) ?? s.posts[0]) : null;
  const script = s.postScript && post?.variants[s.postScript]?.trim() ? s.postScript : "uz_latn";
  const notInSample = s.sample ? c.tools.notInSample : undefined;
  const done = (ok: boolean) => ok && desk.toast({ text: c.tools.copied, ms: 2200 });

  let tools: Tool[];
  let context: string;
  if (post) {
    const i = s.posts.indexOf(post) + 1;
    context = fmt(c.tools.ctxPost, { i, n: s.posts.length });
    // Off while this post's picture is being started or drawn: a second start would be a second paid one.
    const waiting = !post.image && s.steps.some((x) => x.key === "images" && (x.status === "run" || x.status === "wait"));
    const drawing = pictureBusy(post.id, post.image) || waiting;
    // A video post goes out as the owner's video: its picture tools stay off (that picture is never sent).
    const video = isVideoPost(post);
    const draftOnly = notInSample ?? (video || post.status !== "draft" || drawing || !desk.imageHandle ? true : undefined);
    tools = [
      { key: "img", icon: RefreshCw, label: c.tools.otherImage, run: () => desk.imageHandle?.regenerate(), off: draftOnly },
      { key: "photo", icon: Package, label: c.tools.productPhoto, run: () => desk.imageHandle?.pickPhoto(), off: draftOnly },
      { key: "copy", icon: Copy, label: c.tools.copyText, run: () => void copyText(post.variants[script] ?? "").then(done) },
      {
        // The picture cropped to 4:5 and saved, the caption on the clipboard (the channel's own hashtags, t.me links).
        key: "ig",
        icon: Download,
        label: c.instagram.btn,
        run: () => void instagramFor(post, script).then((r) => desk.toast({ text: c.instagram[r], tone: r === "failed" ? "bad" : "ok", ms: 3600 })),
        off: video ? true : undefined,
      },
    ];
  } else {
    context = c.tools.ctxChannel;
    const next = s.plan?.items.find((it) => !s.posts.some((p) => p.slot && slotKey(p.slot) === slotKey(it)));
    const channel = s.brand?.channel?.replace(/^@/, "");
    tools = [
      {
        key: "new",
        icon: PenLine,
        label: c.tools.newPost,
        off: notInSample ?? (!ready ? true : !s.plan ? c.tools.needPlan : !next ? c.tools.allWritten : s.writingSlot[slotKey(next)] ? true : undefined),
        run: () => next && void s.writeSlot(next),
      },
      {
        key: "photos",
        icon: ImagePlus,
        label: c.tools.addPhotos,
        off: notInSample ?? (!ready ? true : undefined),
        run: () => {
          // Opens the picker inside this click when Kanal is on screen; otherwise goes there first.
          if (desk.refsHandle) desk.refsHandle.addPhotos();
          else s.setTab("channel");
        },
      },
      {
        key: "week",
        icon: ClipboardList,
        label: c.tools.copyWeek,
        off: !ready || (!s.plan && !s.posts.length) ? true : undefined,
        run: () => void copyText(weekText(s.plan, s.posts, c, script)).then(done),
      },
      {
        key: "admin",
        icon: ShieldCheck,
        label: c.tools.botAdmin,
        off: !channel ? true : undefined,
        // The intro's add-the-bot card: the three steps, and its button opens Telegram's
        // add-to-channel link (ui/tme.ts) with the post right already on.
        run: () => useHub.setState({ intro: "admin" }),
      },
    ];
  }
  // Before the work is ready the tools stay in place, switched off, so nothing jumps later.
  if (!ready) tools = tools.map((t) => ({ ...t, off: true }));

  return (
    <section aria-label={c.tools.title} className={`mt-5 ${collapsed ? "px-2" : "px-4"}`}>
      {!collapsed && (
        <p className="mb-2 px-1.5 text-[13px] text-ink-3">
          {c.tools.title} · {context}
        </p>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        {tools.map((t) => {
          const off = !!t.off;
          const why = typeof t.off === "string" ? t.off : undefined;
          return (
            <button
              key={t.key}
              type="button"
              aria-disabled={off || undefined}
              aria-label={why ? `${t.label}. ${why}` : t.label}
              title={why ? `${t.label} · ${why}` : t.label}
              onClick={() => !off && t.run()}
              className={`flex min-h-11 items-center gap-2 rounded-[12px] py-1 text-left text-[12.5px] leading-[1.2] transition-[background-color,color,transform] duration-150 active:scale-[0.96] ${
                collapsed ? "justify-center" : "px-2.5"
              } ${off ? "cursor-not-allowed text-ink-3 opacity-60" : "text-ink-2 hover:bg-[rgb(255_255_255/.07)] hover:text-ink"}`}
            >
              <t.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
              {!collapsed && <span className="line-clamp-2">{t.label}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
