"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { COPY, type Copy } from "../ui/copy";
import { rank } from "../ui/format";
import { fmt, LANGS, useCopy, useLang } from "../ui/lang";
import { approveWithUndo, useDesk } from "./desk";
import { useHub } from "./Hub";
import { queueOrder } from "./Queue";
import { pictureBusy, recentBrands, slotKey, useStudio, type Tab } from "./store";
import { copyText, weekText } from "./Tools";
import { publishStep } from "./useHotkeys";

type Command = { id: string; title: string; keywords: string; run: () => void };

/** The same words in uz, ru and en, so a command is found in any of the three languages. */
const all = (get: (c: Copy) => string) => [COPY.uz, COPY.ru, COPY.en].map(get).join(" ");

/** Everything the owner can do from here, in the page's language, built when the palette opens. */
function commands(c: Copy): Command[] {
  const s = useStudio.getState();
  const desk = useDesk.getState();
  const hub = useHub.getState();
  const ready = s.phase === "ready";
  const list: Command[] = [];
  const add = (id: string, title: string, keywords: string, run: () => void) => list.push({ id, title, keywords, run });

  if (ready) {
    const tabs: [Tab, (cc: Copy) => string][] = [
      ["posts", (cc) => cc.tabs.posts],
      ["channel", (cc) => cc.tabs.channel],
      ...(s.pro ? ([["dept", (cc: Copy) => cc.tabs.dept]] as [Tab, (cc: Copy) => string][]) : []),
    ];
    for (const [tab, get] of tabs) add(`tab-${tab}`, get(c), all(get), () => s.setTab(tab));

    // The post in focus: the queue's choice, else the first waiting for the owner.
    const order = queueOrder(s.posts);
    const post = s.tab === "posts" ? (order.find((p) => p.id === desk.focusedPostId) ?? order[0]) : undefined;
    if (post) {
      const script = s.postScript && post.variants[s.postScript]?.trim() ? s.postScript : "uz_latn";
      if (post.status === "draft" && !s.pendingApprove[post.id]) add("approve", c.posts.approve, `${all((cc) => cc.posts.approve)} approve утвердить одобрить`, () => void approveWithUndo(post.id, true));
      if (post.status === "approved" && !s.sample) add("publish", c.publish.toTelegram, `${all((cc) => cc.publish.toTelegram)} joylash publish`, () => publishStep(post, s.postScript));
      if (post.status === "draft" && !s.sample && desk.imageHandle && !pictureBusy(post.id, post.image)) add("image", c.tools.otherImage, all((cc) => cc.tools.otherImage), () => desk.imageHandle?.regenerate());
      add("copy", c.tools.copyText, all((cc) => cc.tools.copyText), () => void copyText(post.variants[script] ?? "").then((ok) => ok && desk.toast({ text: c.tools.copied, ms: 2200 })));
    }
    const next = s.plan?.items.find((it) => !s.posts.some((p) => p.slot && slotKey(p.slot) === slotKey(it)));
    if (next && !s.sample && !s.writingSlot[slotKey(next)]) add("new", c.tools.newPost, all((cc) => cc.tools.newPost), () => void s.writeSlot(next));
    if (s.plan || s.posts.length) add("week", c.tools.copyWeek, all((cc) => cc.tools.copyWeek), () => void copyText(weekText(s.plan, s.posts, c, s.postScript ?? "uz_latn")).then((ok) => ok && desk.toast({ text: c.tools.copied, ms: 2200 })));
  }

  const right = hub.side === "left";
  add("dock", right ? c.hub.moveRight : c.hub.moveLeft, all((cc) => `${cc.hub.moveRight} ${cc.hub.moveLeft}`), () => hub.setSide(right ? "right" : "left"));
  add("fold", hub.collapsed ? c.hub.expand : c.hub.collapse, all((cc) => `${cc.hub.expand} ${cc.hub.collapse}`), () => hub.setCollapsed(!hub.collapsed));
  add("mode", s.pro ? c.mode.simple : c.mode.pro, `${all((cc) => `${cc.mode.simple} ${cc.mode.pro}`)} pro`, () => s.setPro(!s.pro));
  const lang = useLang.getState().lang;
  for (const l of LANGS) if (l !== lang) add(`lang-${l}`, fmt(c.palette.langTo, { lang: c.palette.names[l] }), `${all((cc) => cc.lang.label)} ${c.palette.names[l]} ${l}`, () => useLang.getState().setLang(l));
  if (!s.sample) add("channel-new", c.hub.newChannel, all((cc) => cc.hub.newChannel), () => s.newChannel());
  for (const r of recentBrands()) if (r.id !== s.brand?.id) add(`recent-${r.id}`, r.name, `${all((cc) => cc.hub.recent)} ${r.channel ?? ""}`, () => void s.reopen(r.id));
  return list;
}

/**
 * Ctrl/⌘ K in the desktop Studio (Pro): every section and action by name, in any of the three
 * languages. Opaque glass on a dark veil, no blur; a modal dialog whose field is a combobox over
 * the list; focus stays inside and goes back where it came from.
 */
export function CommandPalette() {
  const c = useCopy();
  const pro = useStudio((s) => s.pro);
  const reduce = useReducedMotion() ?? false;
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [list, setList] = useState<Command[]>([]);
  const field = useRef<HTMLInputElement>(null);
  const back = useRef<HTMLElement | null>(null);

  const show = () => {
    back.current = document.activeElement as HTMLElement | null;
    setList(commands(COPY[useLang.getState().lang]));
    setQuery("");
    setActive(0);
    setOpen(true);
  };
  const hide = () => {
    setOpen(false);
    // Back to where the owner was; nowhere (not body) if that element is gone.
    const to = back.current;
    if (to && to !== document.body && to.isConnected) to.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!pro) return;
    const onKey = (e: KeyboardEvent) => {
      // e.code, so it works in any keyboard layout; preventDefault, or Firefox takes the focus away.
      if (e.code !== "KeyK" || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      e.preventDefault();
      if (open) hide();
      else show();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pro, open]);

  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);

  if (!open) return null;
  const shown = list
    .map((cmd) => [cmd, rank(query, `${cmd.title} ${cmd.keywords}`)] as const)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([cmd]) => cmd);
  const at = Math.min(active, Math.max(shown.length - 1, 0));
  const run = (cmd?: Command) => {
    if (!cmd) return;
    hide();
    cmd.run();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-[rgb(0_0_0/.5)] px-4 pt-[14vh]"
      onMouseDown={(e) => e.target === e.currentTarget && hide()}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={c.palette.title}
        className="w-full max-w-[600px] overflow-hidden rounded-[20px] bg-glass-3 shadow-[inset_0_0_0_1px_var(--hair-2),0_30px_70px_-24px_rgb(0_0_0/.85)]"
        initial={reduce ? false : { opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      >
        <input
          ref={field}
          role="combobox"
          aria-expanded="true"
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={shown[at] ? `${id}-${shown[at].id}` : undefined}
          aria-label={c.palette.title}
          placeholder={c.palette.placeholder}
          spellCheck={false}
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (shown.length) setActive((at + (e.key === "ArrowDown" ? 1 : shown.length - 1)) % shown.length);
            } else if (e.key === "Enter") {
              // The palette's Enter is the palette's alone: without stopPropagation it went on to the
              // window's hotkeys after the palette closed and approved (or published) the post in focus.
              e.preventDefault();
              e.stopPropagation();
              if (!e.repeat) run(shown[at]);
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              hide();
            } else if (e.key === "Tab") e.preventDefault(); // the field is the dialog's only stop
          }}
          className="w-full border-b border-[var(--hair)] bg-transparent px-5 py-4 text-[16px] text-ink outline-none placeholder:text-ink-3"
        />
        <ul id={`${id}-list`} role="listbox" aria-label={c.palette.title} className="max-h-[50vh] overflow-auto p-1.5">
          {shown.map((cmd, i) => (
            <li
              key={cmd.id}
              id={`${id}-${cmd.id}`}
              role="option"
              aria-selected={i === at}
              onMouseMove={() => i !== at && setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => run(cmd)}
              className={`flex min-h-10 cursor-pointer items-center rounded-[12px] px-3 text-[14.5px] ${i === at ? "bg-[rgb(255_255_255/.08)] text-ink" : "text-ink-2"}`}
            >
              {cmd.title}
            </li>
          ))}
          {!shown.length && (
            <li role="presentation" className="px-3 py-3 text-[14px] text-ink-3">
              {c.palette.empty}
            </li>
          )}
        </ul>
      </motion.div>
    </div>
  );
}
