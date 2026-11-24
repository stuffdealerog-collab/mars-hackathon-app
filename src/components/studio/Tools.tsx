/**
 * Asboblar: four quiet tools in the hub for what is in focus. A post (another picture, the
 * product photo, copy the text, download the picture) or the channel (a new post, add photos,
 * copy the week, make the bot an admin). Never Tasdiqlash or Joylash: those live on the post.
 */
import { ClipboardList, Copy, Download, ImagePlus, Package, PenLine, RefreshCw, ShieldCheck } from "lucide-react";
import { weekday } from "../ui/format";
import { fmt, useCopy } from "../ui/lang";
import { useDesk } from "./desk";
import { slotKey, useStudio } from "./store";

type Tool = { key: string; icon: typeof Copy; label: string; run: () => void; off?: string | true };

async function copyText(text: string): Promise<boolean> {
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
    const draftOnly = notInSample ?? (post.status !== "draft" ? true : !desk.imageHandle ? true : undefined);
    const url = post.image?.url;
    tools = [
      { key: "img", icon: RefreshCw, label: c.tools.otherImage, run: () => desk.imageHandle?.regenerate(), off: draftOnly },
      { key: "photo", icon: Package, label: c.tools.productPhoto, run: () => desk.imageHandle?.pickPhoto(), off: draftOnly },
      { key: "copy", icon: Copy, label: c.tools.copyText, run: () => void copyText(post.variants[script] ?? "").then(done) },
      {
        key: "dl",
        icon: Download,
        label: c.tools.download,
        off: url ? undefined : true,
        run: () => {
          if (!url) return;
          const day = post.slot?.day ?? new Date().toISOString().slice(0, 10);
          void fetch(url)
            .then((r) => (r.ok ? r.blob() : Promise.reject()))
            .then((blob) => {
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `mercat-${day}.jpg`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 4000);
            })
            // The picture host may refuse a cross-site read: open it, the browser can save it.
            .catch(() => window.open(url, "_blank", "noopener"));
        },
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
        run: () => {
          const lines: string[] = [];
          for (const it of s.plan?.items ?? []) {
            const d = weekday(it.day);
            lines.push(`${d != null ? c.weekdays[d] : it.day} ${it.time}: ${it.hook}`);
          }
          for (const p of s.posts) lines.push("", `${p.slot ? `${p.slot.day} ${p.slot.time}` : ""}`.trim(), p.variants[script] ?? p.variants.uz_latn ?? "");
          void copyText(lines.join("\n").trim()).then(done);
        },
      },
      {
        key: "admin",
        icon: ShieldCheck,
        label: c.tools.botAdmin,
        off: !channel ? true : undefined,
        run: () => window.open(`https://t.me/${s.bot}?startchannel&admin=post_messages`, "_blank", "noopener"),
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
