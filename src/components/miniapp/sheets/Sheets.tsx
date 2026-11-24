import type { Script } from "@/lib/uslub/contract";
import { Check, Copy, Laptop, Link2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import * as api from "../../studio/api";
import { problemOf, useStudio } from "../../studio/store";
import { ownerText } from "../../ui/format";
import { fmt, LANGS, useCopy, useLang } from "../../ui/lang";
import { parseChannel } from "../../ui/parts";
import { blankNote, blankTokens } from "../blank";
import { useMiniCopy } from "../copy";
import { PRIORITY, useBottomButtons, useNav, type Sheet as SheetT } from "../nav";
import { useClosingConfirmation } from "../native";
import { scriptOf, usePostScript, useWhen } from "../screens/Posts";
import { Sheet } from "../Shell";
import { cloud, confirmNative, haptic, openLink, popup } from "../tg";

/** Renders the open sheet (one at a time). */
export function SheetHost({ onRestart }: { onRestart: () => void }) {
  const sheet = useNav((s) => s.sheet);
  const leaving = useNav((s) => s.sheetLeaving);
  if (!sheet) return null;
  return <SheetBody key={`${sheet.name}:${sheet.postId ?? ""}`} sheet={sheet} leaving={leaving} onRestart={onRestart} />;
}

function SheetBody({ sheet, leaving, onRestart }: { sheet: SheetT; leaving: boolean; onRestart: () => void }) {
  switch (sheet.name) {
    case "settings":
      return <SettingsSheet leaving={leaving} onRestart={onRestart} />;
    case "lang":
      return <LangSheet leaving={leaving} />;
    case "edit":
      return <EditSheet leaving={leaving} postId={sheet.postId!} />;
    case "details":
      return <DetailsSheet leaving={leaving} postId={sheet.postId!} />;
    case "channel":
      return <ChannelSheet leaving={leaving} postId={sheet.postId!} />;
    default:
      return null;
  }
}

/* --------------------------------------------------------------- settings */

function SettingsSheet({ leaving, onRestart }: { leaving: boolean; onRestart: () => void }) {
  const c = useCopy();
  const m = useMiniCopy();
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const pro = useStudio((s) => s.pro);
  const setPro = useStudio((s) => s.setPro);
  const phase = useStudio((s) => s.phase);
  const sample = useStudio((s) => s.sample);
  const brandId = useStudio((s) => s.brand?.id);
  const say = useNav((s) => s.say);
  const [handing, setHanding] = useState(false);
  useBottomButtons("sheet", PRIORITY.sheet, !leaving, null);

  /** A signed link to the desktop Studio for this brand (the server only mints it for a live Telegram session). */
  const toDesktop = async () => {
    if (!brandId || handing) return;
    haptic.tap();
    setHanding(true);
    const init = api.tgInitData();
    try {
      const res = await fetch("/api/uslub/handoff", {
        method: "POST",
        headers: { "content-type": "application/json", ...(init ? { authorization: `tma ${init}` } : {}) },
        body: JSON.stringify({ brandId, lang }),
      });
      const j = (await res.json().catch(() => null)) as { url?: string; error?: string; code?: string } | null;
      if (res.ok && j?.url) openLink(j.url);
      else {
        haptic.error();
        say(problemOf({ ok: false, status: res.status, code: j?.code ?? "http", error: j?.error }).message, "bad");
      }
    } catch {
      haptic.error();
      say(c.error.network, "bad");
    } finally {
      setHanding(false);
    }
  };

  return (
    <Sheet title={m.settings.title} leaving={leaving}>
      <p className="mb-2 mt-3 px-1 text-[13px] font-medium text-ink-2">{m.settings.lang}</p>
      <div className="seg flex w-full" role="group" aria-label={m.settings.lang}>
        {LANGS.map((l) => (
          <button
            key={l}
            type="button"
            lang={l}
            className="!min-h-11 flex-1 !text-[15px]"
            aria-pressed={lang === l}
            onClick={() => {
              if (l === lang) return;
              haptic.select();
              setLang(l);
              cloud.set("lang", l);
            }}
          >
            {l === "uz" ? "O‘zbekcha" : l === "ru" ? "Русский" : "English"}
          </button>
        ))}
      </div>

      <p className="mb-2 mt-6 px-1 text-[13px] font-medium text-ink-2">{m.settings.mode}</p>
      <div className="ma-group">
        <div className="ma-row">
          <span className="min-w-0 flex-1">
            <span id="ma-pro-l" className="block text-[16px] font-medium">
              {c.pro.label}
            </span>
            <span className="mt-0.5 block text-[13.5px] leading-snug text-ink-2">{m.settings.proHint}</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={pro}
            aria-labelledby="ma-pro-l"
            className="switch"
            onClick={() => {
              haptic.select();
              setPro(!pro);
              cloud.set("pro", !pro ? "1" : "0");
            }}
          >
            <span className="switch__knob" />
          </button>
        </div>
      </div>

      {phase !== "start" && !sample && (
        <div className="ma-group mt-6">
          {brandId && !!api.tgInitData() && (
            <button type="button" className="ma-row ma-press" disabled={handing} onClick={() => void toDesktop()}>
              <Laptop className="h-5 w-5 shrink-0 text-ink-2" strokeWidth={1.8} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className={`block text-[16px] font-medium ${handing ? "breathe" : ""}`}>{m.settings.desktop}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-ink-2">{m.settings.desktopHint}</span>
              </span>
            </button>
          )}
          <button
            type="button"
            className="ma-row ma-press justify-center text-[16px] font-medium text-bad"
            onClick={async () => {
              haptic.tap();
              if (await confirmNative(m.settings.restartAsk)) onRestart();
            }}
          >
            {m.settings.restart}
          </button>
        </div>
      )}
      <p className="mt-6 text-center text-[12px] text-ink-3">Mercat · beta</p>
    </Sheet>
  );
}

/* ------------------------------------------------------------ post language */

function LangSheet({ leaving }: { leaving: boolean }) {
  const c = useCopy();
  const setPostScript = useStudio((s) => s.setPostScript);
  const close = useNav((s) => s.closeSheet);
  const { script, available } = usePostScript();
  useBottomButtons("sheet", PRIORITY.sheet, !leaving, null);
  return (
    <Sheet title={c.posts.langLabel} leaving={leaving}>
      <div className="ma-group mt-3" role="radiogroup" aria-label={c.posts.langLabel}>
        {available.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={script === s}
            className="ma-row ma-press"
            onClick={() => {
              haptic.select();
              setPostScript(s);
              setTimeout(close, 120);
            }}
          >
            <span className="min-w-0 flex-1 text-[16px]">{c.posts.scriptNames[s]}</span>
            {script === s && <Check className="h-5 w-5 shrink-0 text-ink" aria-hidden />}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------------------------- edit */

function EditSheet({ leaving, postId }: { leaving: boolean; postId: string }) {
  const c = useCopy();
  const m = useMiniCopy();
  const id = useId();
  const post = useStudio((s) => s.posts.find((p) => p.id === postId));
  const note = useStudio((s) => s.postNote[postId]);
  const editPost = useStudio((s) => s.editPost);
  const close = useNav((s) => s.closeSheet);
  const say = useNav((s) => s.say);
  const { script } = usePostScript();
  const s = post ? scriptOf(post, script) : script;
  const original = post?.variants[s] ?? "";
  const [draft, setDraft] = useState(original);
  const area = useRef<HTMLTextAreaElement>(null);
  const dirty = draft.trim() !== original.trim();
  const tokens = post ? blankTokens(post, s) : [];
  const hint = (post && blankNote(post)) || (note?.tone === "hint" ? note.text : null);
  useClosingConfirmation(dirty && !leaving);

  // A post with a blank opens on the blank: the cursor selects it, ready to be typed over.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const t = setTimeout(() => {
      const at = tokens.map((tok) => el.value.indexOf(tok)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
      el.focus({ preventScroll: true });
      if (at != null) {
        const tok = tokens.find((x) => el.value.indexOf(x) === at)!;
        el.setSelectionRange(at, at + tok.length);
      }
    }, 420);
    return () => clearTimeout(t);
    // only when the sheet opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = () => {
    if (!post || !draft.trim()) return;
    editPost(post.id, s, draft.trim());
    // Changed text needs the owner's approval again before it can go out.
    if (post.status === "approved") useStudio.setState({ posts: useStudio.getState().posts.map((p) => (p.id === post.id ? { ...p, status: "draft" } : p)) });
    haptic.success();
    say(m.post.savedToast, "ok");
    close();
  };
  useBottomButtons("sheet", PRIORITY.sheet, !leaving, { text: c.posts.save, onClick: save, active: dirty && !!draft.trim() });

  return (
    <Sheet title={m.edit.title} leaving={leaving}>
      {hint && <p className="ma-hint mb-2 mt-1">{hint}</p>}
      <label htmlFor={`${id}-t`} className="sr-only">
        {c.posts.textLabel}
      </label>
      <textarea
        ref={area}
        id={`${id}-t`}
        lang={s === "ru" ? "ru" : s === "en" ? "en" : "uz"}
        className="input mt-2 min-h-[46dvh] !rounded-2xl !text-[16px]"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <p className="mt-2 px-1 text-[13px] text-ink-3">
        {c.posts.scriptNames[s]} · {m.edit.hint}
      </p>
    </Sheet>
  );
}

/* ----------------------------------------------------------------- details */

/** Professional rejim: what the post was made from, how natural it reads, every script to copy. */
function DetailsSheet({ leaving, postId }: { leaving: boolean; postId: string }) {
  const c = useCopy();
  const m = useMiniCopy();
  const lang = useLang((s) => s.lang);
  const post = useStudio((s) => s.posts.find((p) => p.id === postId));
  const when = useWhen();
  const [copied, setCopied] = useState<Script | null>(null);
  useBottomButtons("sheet", PRIORITY.sheet, !leaving, null);
  if (!post) return null;
  const slot = post.slot;
  const scripts = (["uz_latn", "uz_cyrl", "ru", "en"] as Script[]).filter((s) => post.variants[s]?.trim());
  const rows: [string, string][] = [];
  if (slot) {
    const w = when(post);
    if (w) rows.push([m.details.when, w]);
    rows.push([m.details.goal, c.channel.goal[slot.goal]]);
    if (slot.hook) rows.push([m.details.hook, ownerText(slot.hook, lang)]);
    if (slot.cta) rows.push([m.details.cta, ownerText(slot.cta, lang)]);
  }
  if (post.brief && post.brief !== slot?.hook) rows.push([m.details.brief, ownerText(post.brief, lang)]);
  const flagged = [...new Set(scripts.flatMap((s) => (post.neuroHits[s] ?? []).map((h) => h.phrase)))];

  return (
    <Sheet title={m.details.title} leaving={leaving}>
      {rows.length > 0 && (
        <dl className="ma-group mt-3">
          {rows.map(([k, v]) => (
            <div key={k} className="ma-row !items-start">
              <dt className="w-[34%] shrink-0 text-[14px] leading-snug text-ink-2">{k}</dt>
              <dd className="min-w-0 flex-1 text-[15px] leading-snug">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-4 px-1 text-[13.5px]">
        <span className="tnum font-medium">{fmt(c.pro.natural, { n: post.humanScore })}</span>
        {flagged.length > 0 && (
          <>
            <span className="text-ink-2"> · {c.pro.flagged}: </span>
            <span className="text-bad">{flagged.slice(0, 6).join(", ")}</span>
          </>
        )}
      </p>

      <p className="mb-2 mt-6 px-1 text-[13px] font-medium text-ink-2">{m.details.texts}</p>
      <div className="ma-group">
        {scripts.map((s) => (
          <div key={s} className="ma-row !block">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-ink-2">{c.posts.scriptNames[s]}</span>
              <button
                type="button"
                className="ma-iconbtn -my-2 -mr-3 !h-10 !w-10"
                aria-label={copied === s ? m.details.copied : m.details.copy}
                onClick={() => {
                  void navigator.clipboard?.writeText(post.variants[s] ?? "").then(
                    () => {
                      haptic.tap();
                      setCopied(s);
                    },
                    () => undefined,
                  );
                }}
              >
                {copied === s ? <Check className="h-[18px] w-[18px] text-ok" aria-hidden /> : <Copy className="h-[18px] w-[18px]" aria-hidden />}
              </button>
            </div>
            <p lang={s === "ru" ? "ru" : s === "en" ? "en" : "uz"} className="mt-1 line-clamp-6 whitespace-pre-line text-[14.5px] leading-snug select-text">
              {post.variants[s]}
            </p>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------- channel for fresh */

/** A brand made from a description with no channel yet: ask where to publish. */
function ChannelSheet({ leaving, postId }: { leaving: boolean; postId: string }) {
  const c = useCopy();
  const m = useMiniCopy();
  const id = useId();
  const [value, setValue] = useState("");
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const close = useNav((s) => s.closeSheet);
  const say = useNav((s) => s.say);
  const post = useStudio((s) => s.posts.find((p) => p.id === postId));
  const { script } = usePostScript();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => input.current?.focus(), 400);
    return () => clearTimeout(t);
  }, []);

  const go = async () => {
    const name = parseChannel(value);
    if (!name || !post) {
      setBad(true);
      haptic.error();
      return;
    }
    haptic.press();
    setBusy(true);
    // The store publishes to the typed channel and keeps it as this brand's channel on success.
    const r = await useStudio.getState().publish(post.id, scriptOf(post, script), `@${name}`);
    setBusy(false);
    if (r.ok) {
      haptic.success();
      say(m.post.publishedToast, "ok");
      close();
      return;
    }
    haptic.error();
    close();
    const text = r.message || c.error.generic;
    const admin = r.adminUrl;
    if (!popup(text, admin ? { text: m.admin.open, onPress: () => openLink(admin) } : undefined)) say(text, "bad");
  };

  useBottomButtons("sheet", PRIORITY.sheet, !leaving, { text: m.channel.go, onClick: () => void go(), active: value.trim().length > 0, progress: busy });

  return (
    <Sheet title={c.posts.channelAsk} leaving={leaving}>
      <form
        noValidate
        className="mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}
      >
        <label htmlFor={id} className="sr-only">
          {c.start.linkLabel}
        </label>
        <div className="ma-field" data-invalid={bad || undefined}>
          <Link2 className="h-5 w-5 shrink-0 text-ink-3" aria-hidden />
          <input
            ref={input}
            id={id}
            inputMode="url"
            enterKeyHint="send"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={c.start.linkPh}
            value={value}
            aria-invalid={bad || undefined}
            onChange={(e) => {
              setValue(e.target.value);
              if (bad) setBad(false);
            }}
          />
        </div>
        <p role={bad ? "alert" : undefined} className={`mt-2.5 px-1 text-[14px] ${bad ? "text-bad" : "text-ink-3"}`}>
          {bad ? c.start.linkBad : m.channel.text}
        </p>
      </form>
    </Sheet>
  );
}
