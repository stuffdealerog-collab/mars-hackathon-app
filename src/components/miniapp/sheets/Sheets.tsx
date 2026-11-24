import type { PostImage, Script } from "@/lib/uslub/contract";
import { Check, Copy, Link2, RefreshCw } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import * as api from "../../studio/api";
import { problemOf, useStudio } from "../../studio/store";
import { ownerText } from "../../ui/format";
import { fmt, LANGS, useCopy, useLang } from "../../ui/lang";
import { parseChannel } from "../../ui/parts";
import { blankNote, hasBlank } from "../blank";
import { useMiniCopy } from "../copy";
import { PRIORITY, useBottomButtons, useNav, type Sheet as SheetT } from "../nav";
import { useClosingConfirmation } from "../native";
import { usePostActions } from "../screens/Post";
import { scriptOf, usePostScript, useWhen } from "../screens/Posts";
import { Sheet } from "../Shell";
import { cloud, confirmNative, haptic, openLink } from "../tg";

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
    case "admin":
      return <AdminSheet leaving={leaving} postId={sheet.postId!} />;
    case "channel":
      return <ChannelSheet leaving={leaving} postId={sheet.postId!} />;
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
  useBottomButtons("sheet", PRIORITY.sheet, !leaving, null);

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
  const editPost = useStudio((s) => s.editPost);
  const close = useNav((s) => s.closeSheet);
  const say = useNav((s) => s.say);
  const { script } = usePostScript();
  const s = post ? scriptOf(post, script) : script;
  const original = post?.variants[s] ?? "";
  const [draft, setDraft] = useState(original);
  const dirty = draft.trim() !== original.trim();
  useClosingConfirmation(dirty && !leaving);

  const save = () => {
    if (!post || !draft.trim()) return;
    editPost(post.id, s, draft.trim());
    haptic.success();
    say(m.post.savedToast, "ok");
    close();
  };
  useBottomButtons("sheet", PRIORITY.sheet, !leaving, { text: c.posts.save, onClick: save, active: dirty && !!draft.trim() });

  return (
    <Sheet title={m.edit.title} leaving={leaving}>
      {post && hasBlank(post) && blankNote(post) && <p className="mb-1 mt-1 px-1 text-[14px] leading-snug text-led">{blankNote(post)}</p>}
      <label htmlFor={`${id}-t`} className="sr-only">
        {c.posts.textLabel}
      </label>
      <textarea
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

/** Starts a fresh picture (regenerate) and follows it until it is ready. */
async function regenerate(postId: string, lang: "uz" | "ru" | "en") {
  const set = (image: PostImage) => useStudio.setState({ posts: useStudio.getState().posts.map((p) => (p.id === postId ? { ...p, image } : p)) });
  set({ status: "queued", refsUsed: 0 });
  try {
    const init = api.tgInitData();
    const res = await fetch("/api/uslub/media/post-image", {
      method: "POST",
      headers: { "content-type": "application/json", ...(init ? { authorization: `tma ${init}` } : {}) },
      body: JSON.stringify({ postId, regenerate: true, lang }),
    });
    const j = (await res.json().catch(() => null)) as { image?: PostImage; error?: string; code?: string } | null;
    if (!res.ok || !j?.image) {
      set({ status: "failed", refsUsed: 0, error: problemOf({ ok: false, status: res.status, code: j?.code ?? "http", error: j?.error }).message });
      return false;
    }
    set(j.image);
    const until = Date.now() + 4 * 60_000;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 4000));
      const g = await api.getPostImage(postId, lang);
      if (!g.ok) continue;
      set(g.data.image);
      if (g.data.image.status === "ready" || g.data.image.status === "failed") return g.data.image.status === "ready";
    }
  } catch {
    set({ status: "failed", refsUsed: 0, error: undefined });
  }
  return false;
}

function DetailsSheet({ leaving, postId }: { leaving: boolean; postId: string }) {
  const c = useCopy();
  const m = useMiniCopy();
  const lang = useLang((s) => s.lang);
  const post = useStudio((s) => s.posts.find((p) => p.id === postId));
  const sample = useStudio((s) => s.sample);
  const when = useWhen();
  const [copied, setCopied] = useState<Script | null>(null);
  useBottomButtons("sheet", PRIORITY.sheet, !leaving, null);
  if (!post) return null;
  const slot = post.slot;
  const img = post.image;
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
  const busy = img?.status === "queued" || img?.status === "running";
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

      {img && (
        <>
          <p className="mb-2 mt-6 px-1 text-[13px] font-medium text-ink-2">{m.details.picture}</p>
          <div className="ma-group">
            {img.prompt && (
              <div className="ma-row !block">
                <p className="text-[13px] text-ink-2">{m.details.prompt}</p>
                <p className="mt-1 line-clamp-6 text-[14px] leading-snug select-text">{img.prompt}</p>
                {img.refsUsed > 0 && <p className="mt-1.5 text-[13px] text-ink-3">{fmt(m.details.refs, { n: img.refsUsed })}</p>}
              </div>
            )}
            {!sample && (
              <button
                type="button"
                className="ma-row ma-press"
                disabled={busy}
                onClick={() => {
                  haptic.press();
                  void regenerate(post.id, lang).then((ok) => (ok ? haptic.success() : undefined));
                }}
              >
                <RefreshCw className={`h-5 w-5 shrink-0 text-ink-2 ${busy ? "animate-spin [animation-duration:1.6s]" : ""}`} aria-hidden />
                <span className="min-w-0 flex-1 text-[16px] font-medium">{busy ? c.posts.image.running : m.details.again}</span>
              </button>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------- admin fix */

/** The bot is not an admin of the channel yet: one tap opens Telegram's own admin picker. */
function AdminSheet({ leaving, postId }: { leaving: boolean; postId: string }) {
  const m = useMiniCopy();
  const href = useStudio((s) => s.postNote[postId]?.href);
  const close = useNav((s) => s.closeSheet);
  const { script } = usePostScript();
  const post = useStudio((s) => s.posts.find((p) => p.id === postId));
  const { publish } = usePostActions();
  // Two steps: open Telegram's admin picker, then publish again (the picker stays one tap away).
  const [step, setStep] = useState<"open" | "retry">("open");
  useBottomButtons(
    "sheet",
    PRIORITY.sheet,
    !leaving,
    step === "open"
      ? {
          text: m.admin.open,
          onClick: () => {
            if (!href) return;
            haptic.tap();
            openLink(href);
            setStep("retry");
          },
        }
      : {
          text: m.admin.retry,
          onClick: () => {
            if (!post) return;
            close();
            void publish(post.id, scriptOf(post, script));
          },
        },
    step === "retry" ? { text: m.admin.open, onClick: () => href && openLink(href) } : null,
  );

  return (
    <Sheet title={m.admin.title} leaving={leaving}>
      <div className="flex flex-col items-center px-2 pb-2 pt-3 text-center">
        <span className="lamp lamp--sm mb-5 w-[88px] !min-h-[64px]" data-state="you" style={{ ["--hue" as string]: "#25D0C2", ["--core" as string]: "#BDFFF7", ["--deep" as string]: "#0A6B74" }} aria-hidden>
          <span className="lamp__spill" />
          <span className="lamp__glow" />
          <span className="lamp__filament" />
        </span>
        <p className="max-w-[34ch] text-[16px] leading-relaxed">{m.admin.text}</p>
        <p className="mt-3 max-w-[34ch] text-[14px] leading-relaxed text-ink-2">{m.admin.step}</p>
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
  const openSheet = useNav((s) => s.openSheet);
  const lang = useLang((s) => s.lang);
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
    const s = scriptOf(post, script);
    const r = await api.publishPost(post.id, s, `@${name}`, lang);
    setBusy(false);
    // Remember the channel for the next posts of this brand.
    useStudio.setState({ input: { ...useStudio.getState().input, channel: name } });
    if (r.ok && r.data.ok) {
      useStudio.setState({ posts: useStudio.getState().posts.map((p) => (p.id === post.id ? { ...p, status: "published", publishedUrl: r.data.url } : p)) });
      haptic.success();
      say(m.post.publishedToast, "ok");
      close();
      return;
    }
    const admin = r.ok ? r.data.addAdminUrl : r.addAdminUrl;
    const text = r.ok ? (r.data.error ?? c.error.generic) : problemOf(r).message;
    useStudio.setState({ postNote: { ...useStudio.getState().postNote, [post.id]: { text, href: admin, tone: "bad" } } });
    if (admin) {
      haptic.warn();
      openSheet({ name: "admin", postId: post.id });
      return;
    }
    haptic.error();
    say(text, "bad");
  };

  useBottomButtons("sheet", PRIORITY.sheet, !leaving, { text: m.channel.go, onClick: () => void go(), active: value.trim().length > 0, progress: busy });

  return (
    <Sheet title={m.channel.title} leaving={leaving}>
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
