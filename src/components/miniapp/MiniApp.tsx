import { BarChart3, Clapperboard, Newspaper } from "lucide-react";
import { LAMP_ORDER, LAMPS } from "../lamp/lamps";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStudio, type Tab } from "../studio/store";
import { fmt, isLang, useInitLang, useLang } from "../ui/lang";
import { parseChannel } from "../ui/parts";
import { useMiniCopy } from "./copy";
import "./miniapp.css";
import { PRIORITY, useBottomButtons, useLatest, useNav, type Route } from "./nav";
import { useBottomBar, useClosingConfirmation, useNativeNav, useTelegramShell, type Theme } from "./native";
import { ChannelScreen } from "./screens/Channel";
import { PostScreen } from "./screens/Post";
import { PostsScreen } from "./screens/Posts";
import { RunScreen } from "./screens/Run";
import { FreshScreen, StartScreen } from "./screens/Start";
import { VideoScreen } from "./screens/Video";
import { EdgeBack, Layer, Skel, Toast } from "./Shell";
import { SheetHost } from "./sheets/Sheets";
import { markIntroSeen, MiniIntro } from "./Intro";
import { decideIntro, forcedByUrl, INTRO_CLOUD_KEY, introSeen, localIntro } from "../onboarding";
import { launchTarget } from "./launch";
import { restart } from "./actions";
import { useResume } from "./sync";
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
  // An edited draft not yet approved lives only on this device: closing would lose it.
  const unsaved = useStudio((s) => s.posts.some((p) => p.status === "draft" && !!s.edited[p.id]));
  const [perf] = useState<"high" | "low">(() => ((window as { __maPerf?: "high" | "low" }).__maPerf === "low" ? "low" : "high"));
  const stack = useNav((s) => s.stack);
  const sheetOpen = useNav((s) => !!s.sheet);
  const [booted, setBooted] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [platform] = useState(() => tg()?.platform ?? "web");

  const insets = useTelegramShell(theme, true);
  // The bottom bar appears with the first screen, not over the launch moment.
  const barShown = useBottomBar(theme, launched);
  useNativeNav(booted, () => {
    if (useNav.getState().intro != null) return; // the intro covers the app: Settings waits
    haptic.tap();
    useNav.getState().openSheet({ name: "settings" });
  });
  const dirtyEdit = useNav((s) => s.dirtyEdit);
  // One owner for Telegram's single closing-confirmation flag (the edit sheet only reports dirtyEdit).
  useClosingConfirmation(phase === "working" || busy || unsaved || dirtyEdit);
  useResume(booted);

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
      const saved = await cloud.get(["lang", "pro", "brand", INTRO_CLOUD_KEY]);
      if (isLang(saved.lang)) useLang.getState().setLang(saved.lang);
      if (saved.pro === "1" || saved.pro === "0") useStudio.getState().setPro(saved.pro === "1");
      const s = useStudio.getState();
      // The link the app was opened with comes first (bot button, startapp=brand_<id> from the
      // desktop Studio), then the brand this owner worked on last.
      const target = launchTarget(window.location.search, tg()?.initDataUnsafe?.start_param);
      // The intro on an ordinary first open only; it opens under the launch moment, which reveals it.
      const intro = decideIntro({
        seen: introSeen(saved[INTRO_CLOUD_KEY]) || localIntro.seen(),
        returning: !!saved.brand,
        withIntent: !!(target.brand || target.channel || s.sample),
        force: forcedByUrl(window.location.search),
      });
      if (intro.mark) markIntroSeen();
      if (intro.show) useNav.getState().openIntro();
      setBooted(true);
      if (s.sample) return; // ?mock=1: the start screen runs the made-up bakery
      // Same rule as the desktop Studio: a brand that is gone or someone else's is forgotten; a
      // network or server failure keeps it and Start offers «Qayta urinish».
      const open = async (id: string) => {
        await s.reopen(id);
        const st = useStudio.getState();
        if (st.phase === "ready") return true;
        const gone = ["brand_not_found", "not_found", "post_not_found", "brand_forbidden"].includes(st.problem?.code ?? "");
        if (gone && id === saved.brand) cloud.remove("brand");
        if (!gone) useNav.setState({ retryBrand: id });
        return false;
      };
      let opened = false;
      if (target.brand) opened = await open(target.brand);
      if (!opened && saved.brand && saved.brand !== target.brand) opened = await open(saved.brand);
      if (opened) {
        const after = useStudio.getState();
        if (target.post && after.posts.some((x) => x.id === target.post)) {
          after.setTab("posts");
          useNav.getState().push({ name: "post", id: target.post });
        }
        return;
      }
      if (target.brand || saved.brand) return; // a failed reopen leaves its message on the start screen
      const name = target.channel ? parseChannel(target.channel) : null;
      if (name) s.startChannel(name);
    })();
  }, [bot]);

  // The work in progress follows the owner: reopening the app brings it back.
  useEffect(() => {
    if (booted && brandId && !useStudio.getState().sample) cloud.set("brand", brandId);
  }, [booted, brandId]);

  // A flow change (start → run → ready) replaces whatever was pushed; a finished run is felt once.
  const lastPhase = useRef(phase);
  useEffect(() => {
    if (lastPhase.current !== phase) {
      const fromRun = lastPhase.current === "working";
      lastPhase.current = phase;
      useNav.getState().clear();
      if (phase === "ready" && fromRun) haptic.success();
    }
  }, [phase]);

  // An empty or private channel: the description form opens on its own, channel prefilled.
  useEffect(() => {
    if (phase === "start" && emptyChannel) useNav.getState().push({ name: "fresh" });
  }, [phase, emptyChannel]);


  const live = stack.filter((s) => !s.leaving);
  const topKey = live[live.length - 1]?.key;
  const baseActive = live.length === 0 && !sheetOpen;

  const vars = {
    "--ma-safe-top": `max(${insets.safe.top}px, env(safe-area-inset-top, 0px))`,
    "--ma-content-top": `${insets.content.top}px`,
    "--ma-bottom": barShown ? "0px" : `max(${insets.safe.bottom}px, env(safe-area-inset-bottom, 0px))`,
  } as React.CSSProperties;

  return (
    <div
      className="ma"
      data-theme={theme}
      data-platform={platform === "android" || platform === "android_x" ? "android" : "ios"}
      data-fullscreen={insets.content.top > 0 ? "true" : "false"}
      data-perf={perf}
      style={vars}
    >
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
      <MiniIntro />
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
  return <PostScreen id={route.id} active={active} />;
}

/* -------------------------------------------------------------------- tabs */

/** The phone has three tabs; the desktop's "Bo‘lim" lives in the Strip and Panel here. */
type PhoneTab = Exclude<Tab, "dept">;
const TAB_ICONS: Record<PhoneTab, typeof BarChart3> = { channel: BarChart3, posts: Newspaper, video: Clapperboard };
const TABS: PhoneTab[] = ["channel", "posts", "video"];

function Tabs({ active }: { active: boolean }) {
  const m = useMiniCopy();
  const tab: PhoneTab = useStudio((s) => (s.tab === "dept" ? "channel" : s.tab));
  const setTab = useStudio((s) => s.setTab);
  // The badge counts what waits for the owner: drafts to approve.
  const count = useStudio((s) => s.posts.filter((p) => p.status === "draft").length);
  const push = useNav((s) => s.push);
  // Right after a run the store opens Kanal (the channel was read) with one step on to the posts.
  const firstLook = useStudio((s) => s.justFinished);
  const openPost = useCallback((id: string) => push({ name: "post", id }), [push]);
  // On Postlar, one step: open the first post that still waits for the owner.
  const next = useStudio((s) => (s.posts.find((p) => p.status === "draft") ?? s.posts.find((p) => p.status === "approved"))?.id ?? null);
  const total = useStudio((s) => s.posts.length);
  const toPosts = () => {
    haptic.tap();
    setTab("posts");
  };
  const main =
    tab === "channel" && firstLook && total > 0
      ? { text: fmt(m.seePosts, { n: total }), onClick: toPosts }
      : tab === "posts" && next
        ? { text: m.review, onClick: () => (haptic.tap(), openPost(next)) }
        : null;
  useBottomButtons("tabs", PRIORITY.base, active && !!main, main);

  // After the run, a failed «Postini yozish», «Qayta yozish» or plan rebuild is said once, never silent.
  const problem = useStudio((s) => s.problem);
  const said = useRef<unknown>(null);
  useEffect(() => {
    if (!problem || said.current === problem) return;
    said.current = problem;
    haptic.error();
    useNav.getState().say(problem.message, "bad");
  }, [problem]);

  const pick = (t: PhoneTab) => {
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
    // The full moment on the first open; afterwards just long enough to light the lamp.
    let seen = false;
    try {
      seen = localStorage.getItem("mercat.launch") === "1";
      localStorage.setItem("mercat.launch", "1");
    } catch {
      /* private mode: every open is a first open */
    }
    const wait = Math.max(0, (reduce ? 250 : seen ? 700 : 1250) - (Date.now() - shownAt));
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
        <div className="ma-launch__ten" aria-hidden>
          {LAMP_ORDER.map((r, i) => (
            <span key={r} style={{ background: LAMPS[r].hue, boxShadow: `0 0 8px ${LAMPS[r].hue}`, animationDelay: `${520 + i * 45}ms` }} />
          ))}
        </div>
        <div className="ma-launch__name">Mercat</div>
      </div>
    </div>
  );
}
