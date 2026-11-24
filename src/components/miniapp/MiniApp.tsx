import { BarChart3, Clapperboard, Newspaper } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStudio, type Tab } from "../studio/store";
import { isLang, useInitLang, useLang } from "../ui/lang";
import { parseChannel } from "../ui/parts";
import { useMiniCopy } from "./copy";
import "./miniapp.css";
import { useLatest, useNav, type Route } from "./nav";
import { useBottomBar, useClosingConfirmation, useNativeNav, useTelegramShell, type Theme } from "./native";
import { ChannelScreen } from "./screens/Channel";
import { PostScreen } from "./screens/Post";
import { PostsScreen } from "./screens/Posts";
import { RunScreen } from "./screens/Run";
import { FreshScreen, StartScreen } from "./screens/Start";
import { VideoScreen } from "./screens/Video";
import { EdgeBack, Layer, Skel, Toast } from "./Shell";
import { SheetHost } from "./sheets/Sheets";
import { cloud, haptic, tg } from "./tg";

/**
 * Mercat inside Telegram: a native-feeling app over the same honest flow as the web Studio
 * (store.ts). Base layer by flow phase, pushed screens above it, sheets on top, Telegram's own
 * Back / Settings / Main / Secondary buttons for navigation and the one decision per screen.
 */
export function MiniApp({ bot, theme, langHint }: { bot: string; theme: Theme; langHint: string | null }) {
  useInitLang(langHint);
  const phase = useStudio((s) => s.phase);
  const brandId = useStudio((s) => s.brand?.id ?? null);
  const emptyChannel = useStudio((s) => s.emptyChannel);
  const busy = useStudio((s) => Object.values(s.busy).some(Boolean));
  const stack = useNav((s) => s.stack);
  const sheetOpen = useNav((s) => !!s.sheet);
  const [booted, setBooted] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [platform] = useState(() => tg()?.platform ?? "web");

  const insets = useTelegramShell(theme, true);
  // The bottom bar appears with the first screen, not over the launch moment.
  const barShown = useBottomBar(theme, launched);
  useNativeNav(booted, () => {
    haptic.tap();
    useNav.getState().openSheet({ name: "settings" });
  });
  useClosingConfirmation(phase === "working" || busy);

  // The document itself never scrolls: each screen scrolls inside its own region.
  useEffect(() => {
    document.documentElement.classList.add("ma-html");
    return () => document.documentElement.classList.remove("ma-html");
  }, []);

  // Boot: the owner's saved language and mode (CloudStorage follows them across devices),
  // then the last brand, a ?brand= / startapp link, or a ?channel= handed over by the bot.
  const bootOnce = useRef(false);
  useEffect(() => {
    if (bootOnce.current) return;
    bootOnce.current = true;
    const st = useStudio.getState();
    st.configure({ bot });
    void (async () => {
      const saved = await cloud.get(["lang", "pro", "brand"]);
      if (isLang(saved.lang)) useLang.getState().setLang(saved.lang);
      if (saved.pro === "1" || saved.pro === "0") useStudio.getState().setPro(saved.pro === "1");
      setBooted(true);
      const s = useStudio.getState();
      if (s.sample) return; // ?mock=1: the start screen runs the made-up bakery
      const p = new URLSearchParams(window.location.search);
      const startParam = tg()?.initDataUnsafe?.start_param ?? "";
      const fromLink = p.get("brand") ?? (startParam.startsWith("brand_") ? startParam.slice(6) : null);
      const brand = fromLink || saved.brand || null;
      if (brand) {
        void s.reopen(brand);
        return;
      }
      const channel = p.get("channel") ?? (startParam.startsWith("ch_") ? startParam.slice(3) : null);
      const name = channel ? parseChannel(channel) : null;
      if (name) s.startChannel(name);
    })();
  }, [bot]);

  // The work in progress follows the owner: reopening the app brings it back.
  useEffect(() => {
    if (booted && brandId && !useStudio.getState().sample) cloud.set("brand", brandId);
  }, [booted, brandId]);

  // A flow change (start → run → ready) replaces whatever was pushed.
  const lastPhase = useRef(phase);
  useEffect(() => {
    if (lastPhase.current !== phase) {
      lastPhase.current = phase;
      useNav.getState().clear();
      if (phase === "ready") haptic.success();
    }
  }, [phase]);

  // An empty or private channel: the description form opens on its own, channel prefilled.
  useEffect(() => {
    if (phase === "start" && emptyChannel) useNav.getState().push({ name: "fresh" });
  }, [phase, emptyChannel]);

  const restart = useCallback(() => {
    useNav.getState().clear();
    useStudio.getState().reset();
    cloud.remove("brand");
    haptic.press();
  }, []);

  const live = stack.filter((s) => !s.leaving);
  const topKey = live[live.length - 1]?.key;
  const baseActive = live.length === 0 && !sheetOpen;

  const vars = {
    "--ma-safe-top": `max(${insets.safe.top}px, env(safe-area-inset-top, 0px))`,
    "--ma-content-top": `${insets.content.top}px`,
    "--ma-bottom": barShown ? "0px" : `max(${insets.safe.bottom}px, env(safe-area-inset-bottom, 0px))`,
  } as React.CSSProperties;

  return (
    <div className="ma" data-theme={theme} data-platform={platform === "android" || platform === "android_x" ? "android" : "ios"} style={vars}>
      <Layer covered={live.length > 0}>
        <Base phase={phase} active={baseActive} />
      </Layer>
      {stack.map((r) => (
        <Layer key={r.key} anim={r.leaving ? "out" : "in"} covered={!r.leaving && r.key !== topKey}>
          <Pushed route={r} active={!r.leaving && r.key === topKey && !sheetOpen} />
          {!r.leaving && r.key === topKey && <EdgeBack routeKey={r.key} />}
        </Layer>
      ))}
      <SheetHost onRestart={restart} />
      <Toast />
      <Launch done={booted} onLeave={() => setLaunched(true)} />
    </div>
  );
}

function Base({ phase, active }: { phase: string; active: boolean }) {
  return (
    <div key={phase} className="ma-base-in flex min-h-0 flex-1 flex-col">
      {phase === "start" && <StartScreen active={active} />}
      {phase === "working" && <RunScreen active={active} />}
      {phase === "reopening" && <Reopening />}
      {phase === "ready" && <Tabs active={active} />}
    </div>
  );
}

function Pushed({ route, active }: { route: Route; active: boolean }) {
  if (route.name === "fresh") return <FreshScreen active={active} />;
  return <PostScreen start={route.index} active={active} />;
}

/* -------------------------------------------------------------------- tabs */

const TAB_ICONS: Record<Tab, typeof BarChart3> = { channel: BarChart3, posts: Newspaper, video: Clapperboard };
const TABS: Tab[] = ["channel", "posts", "video"];

function Tabs({ active }: { active: boolean }) {
  const m = useMiniCopy();
  const tab = useStudio((s) => s.tab);
  const setTab = useStudio((s) => s.setTab);
  // The badge counts what waits for the owner: drafts to approve.
  const count = useStudio((s) => s.posts.filter((p) => p.status === "draft").length);
  const push = useNav((s) => s.push);
  const openPost = useCallback((index: number) => push({ name: "post", index }), [push]);

  const pick = (t: Tab) => {
    if (t === tab) return;
    haptic.select();
    setTab(t);
  };

  return (
    <>
      <div className="ma-tabs">
        {TABS.map((t) => (
          <div key={t} className="ma-tabpanel" data-active={tab === t ? "true" : "false"} role="tabpanel" id={`ma-panel-${t}`} aria-labelledby={`ma-tab-${t}`} inert={tab !== t ? true : undefined}>
            {t === "channel" && <ChannelScreen onOpenPost={openPost} />}
            {t === "posts" && <PostsScreen onOpen={openPost} active={active && tab === "posts"} />}
            {t === "video" && <VideoScreen />}
          </div>
        ))}
      </div>
      <nav className="ma-tabbar ma-chrome" role="tablist" aria-label="Mercat">
        {TABS.map((t) => {
          const Icon = TAB_ICONS[t];
          return (
            <button key={t} id={`ma-tab-${t}`} type="button" role="tab" aria-selected={tab === t} aria-controls={`ma-panel-${t}`} className="ma-tabbtn" onClick={() => pick(t)}>
              <span className="ma-tabbtn__filament" aria-hidden />
              <Icon className="ma-tabbtn__icon h-6 w-6" strokeWidth={tab === t ? 2.1 : 1.8} aria-hidden />
              {m.tabs[t]}
              {t === "posts" && count > 0 && <span className="ma-tabbtn__badge">{count}</span>}
            </button>
          );
        })}
      </nav>
    </>
  );
}

/* -------------------------------------------------------------- reopening */

function Reopening() {
  return (
    <div className="ma-scroll" role="status" aria-busy="true">
      <div className="ma-pad">
        <div className="flex items-center gap-3">
          <Skel className="h-12 w-12 !rounded-full" />
          <div className="flex-1">
            <Skel className="h-7 w-2/3" />
            <Skel className="mt-2 h-4 w-1/3" />
          </div>
        </div>
        <Skel className="mt-6 h-[30px]" />
        <div className="mt-6 grid grid-cols-2 gap-2.5">
          {[0, 1, 2, 3].map((i) => (
            <Skel key={i} className="h-[86px] !rounded-[18px]" />
          ))}
        </div>
        <Skel className="mt-8 h-5 w-1/2" />
        <Skel className="mt-3 h-[180px] !rounded-[18px]" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ launch */

/** The first frame is the stage, never a white flash: one lamp lights, the spectrum draws, in. */
function Launch({ done, onLeave }: { done: boolean; onLeave: () => void }) {
  const leave = useLatest(onLeave);
  const [shownAt] = useState(() => Date.now());
  const [state, setState] = useState<"on" | "leaving" | "gone">("on");
  useEffect(() => {
    if (!done) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wait = Math.max(0, (reduce ? 250 : 1250) - (Date.now() - shownAt));
    const t1 = setTimeout(() => {
      setState("leaving");
      leave.current();
    }, wait);
    const t2 = setTimeout(() => setState("gone"), wait + 290);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [done, shownAt, leave]);
  if (state === "gone") return null;
  return (
    <div className="ma-launch ma-chrome" data-leaving={state === "leaving" || undefined} aria-hidden>
      <div>
        <div className="ma-launch__lamp mx-auto">
          <span className="ma-launch__spill" />
          <span className="ma-launch__glow" />
          <span className="ma-launch__filament" />
        </div>
        <div className="ma-launch__spectrum" />
        <div className="ma-launch__name">Mercat</div>
      </div>
    </div>
  );
}
