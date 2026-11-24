/**
 * DEV ONLY (`/tg?preview=light|dark`): a stand-in for window.Telegram.WebApp so the native code
 * paths (fullscreen, safe areas, Main/Secondary/Back/Settings buttons, haptics, CloudStorage)
 * run in a plain browser. It draws Telegram's own chrome (status bar, the fullscreen pills and
 * the bottom bar) so screenshots show what a phone shows. Never imported in production.
 */
import type { BottomButtonParams, Insets, TgApp, TgBottomButton, TgEvent, TgSimpleButton } from "./tg";

type Listener = () => void;

const PROFILES: Record<"ios" | "android", { safe: Insets; content: Insets }> = {
  ios: { safe: { top: 44, bottom: 34, left: 0, right: 0 }, content: { top: 46, bottom: 0, left: 0, right: 0 } },
  android: { safe: { top: 24, bottom: 16, left: 0, right: 0 }, content: { top: 48, bottom: 0, left: 0, right: 0 } },
};

export function installTelegramMock(opts: { scheme: "light" | "dark"; platform: "ios" | "android"; lang: string }): TgApp {
  const existing = (window as unknown as { Telegram?: { WebApp?: TgApp & { __mock?: true } } }).Telegram?.WebApp;
  if (existing?.__mock) return existing; // React dev mode runs effects twice
  const listeners = new Map<string, Set<Listener>>();
  const emit = (e: string) => listeners.get(e)?.forEach((cb) => cb());
  const zero: Insets = { top: 0, bottom: 0, left: 0, right: 0 };
  const profile = PROFILES[opts.platform];
  const log = (...a: unknown[]) => console.debug("[tg-mock]", ...a);

  const chrome = document.createElement("div");
  chrome.id = "tg-mock-chrome";
  document.body.appendChild(chrome);

  const dark = opts.scheme === "dark";
  const ink = dark ? "#fff" : "#000";
  const pillBg = dark ? "rgba(40,40,44,.86)" : "rgba(235,235,238,.92)";

  const state = { bottomBar: "#000000", header: "#000000", fullscreen: false };

  function bottomButton(kind: "main" | "secondary"): TgBottomButton & { params: BottomButtonParams; progress: boolean; fire(): void } {
    const clicks = new Set<Listener>();
    const b = {
      params: { text: kind === "main" ? "Continue" : "Cancel", is_visible: false, is_active: true, position: "left" } as BottomButtonParams,
      progress: false,
      get isVisible() {
        return !!b.params.is_visible;
      },
      get isActive() {
        return b.params.is_active !== false;
      },
      setParams(p: BottomButtonParams) {
        Object.assign(b.params, p);
        draw();
      },
      show() {
        b.setParams({ is_visible: true });
      },
      hide() {
        b.setParams({ is_visible: false });
      },
      showProgress() {
        b.progress = true;
        draw();
      },
      hideProgress() {
        b.progress = false;
        draw();
      },
      onClick(cb: Listener) {
        clicks.add(cb);
      },
      offClick(cb: Listener) {
        clicks.delete(cb);
      },
      fire() {
        if (b.params.is_active === false || b.progress) return;
        log(kind, "button clicked:", b.params.text);
        clicks.forEach((cb) => cb());
      },
    };
    return b;
  }

  function simpleButton(name: string): TgSimpleButton & { fire(): void } {
    const clicks = new Set<Listener>();
    const b = {
      isVisible: false,
      show() {
        b.isVisible = true;
        draw();
      },
      hide() {
        b.isVisible = false;
        draw();
      },
      onClick(cb: Listener) {
        clicks.add(cb);
      },
      offClick(cb: Listener) {
        clicks.delete(cb);
      },
      fire() {
        log(name, "clicked");
        clicks.forEach((cb) => cb());
      },
    };
    return b;
  }

  const main = bottomButton("main");
  const secondary = bottomButton("secondary");
  const back = simpleButton("BackButton");
  const settings = simpleButton("SettingsButton");

  const app: TgApp & { __mock: true } = {
    __mock: true,
    initData: "",
    initDataUnsafe: { user: { id: 1, first_name: "Preview", language_code: opts.lang } },
    version: "8.0",
    platform: opts.platform,
    colorScheme: opts.scheme,
    themeParams: dark ? { bg_color: "#000000", text_color: "#ffffff" } : { bg_color: "#ffffff", text_color: "#000000" },
    isFullscreen: false,
    safeAreaInset: zero,
    contentSafeAreaInset: zero,
    isVersionAtLeast: (v: string) => Number(v.split(".")[0]) <= 8,
    ready: () => log("ready()"),
    expand: () => log("expand()"),
    close: () => log("close()"),
    requestFullscreen() {
      state.fullscreen = true;
      app.isFullscreen = true;
      app.safeAreaInset = profile.safe;
      app.contentSafeAreaInset = profile.content;
      log("requestFullscreen()");
      draw();
      emit("fullscreenChanged");
      emit("safeAreaChanged");
      emit("contentSafeAreaChanged");
    },
    lockOrientation: () => log("lockOrientation()"),
    setHeaderColor: (c) => {
      state.header = c;
      draw();
    },
    setBackgroundColor: (c) => log("setBackgroundColor", c),
    setBottomBarColor: (c) => {
      state.bottomBar = c;
      draw();
    },
    enableClosingConfirmation: () => log("closing confirmation ON"),
    disableClosingConfirmation: () => log("closing confirmation off"),
    disableVerticalSwipes: () => log("vertical swipes off"),
    enableVerticalSwipes: () => log("vertical swipes on"),
    openTelegramLink: (u) => log("openTelegramLink", u),
    openLink: (u) => log("openLink", u),
    showConfirm: (m, cb) => cb(window.confirm(m)),
    showPopup: (params, cb) => {
      log("showPopup", params.message, (params.buttons ?? []).map((b) => b.text ?? b.type).join(" | "));
      const act = (params.buttons ?? []).find((b) => b.id);
      if (act) cb?.(window.confirm(`${params.message}

[OK] = ${act.text}`) ? act.id! : "");
      else {
        window.alert(params.message);
        cb?.("");
      }
    },
    onEvent: (e: TgEvent, cb: Listener) => {
      if (!listeners.has(e)) listeners.set(e, new Set());
      listeners.get(e)!.add(cb);
    },
    offEvent: (e: TgEvent, cb: Listener) => listeners.get(e)?.delete(cb),
    MainButton: main,
    SecondaryButton: secondary,
    BackButton: back,
    SettingsButton: settings,
    HapticFeedback: {
      impactOccurred: (s) => log("haptic impact", s),
      notificationOccurred: (t) => log("haptic notification", t),
      selectionChanged: () => log("haptic selection"),
    },
    CloudStorage: {
      setItem: (k, v, cb) => {
        localStorage.setItem(`tgcs:${k}`, v);
        log("CloudStorage.setItem", k, v);
        setTimeout(() => cb?.(null, true), 20);
      },
      getItems: (keys, cb) => {
        const out: Record<string, string> = {};
        keys.forEach((k) => (out[k] = localStorage.getItem(`tgcs:${k}`) ?? ""));
        setTimeout(() => cb(null, out), 40);
      },
      removeItem: (k, cb) => {
        localStorage.removeItem(`tgcs:${k}`);
        setTimeout(() => cb?.(null, true), 20);
      },
    },
  };

  function btnHtml(id: string, b: typeof main, primary: boolean) {
    const p = b.params;
    const bg = p.color ?? (primary ? "#2481cc" : pillBg);
    const fg = p.text_color ?? (primary ? "#fff" : ink);
    const label = b.progress ? `<span class="tgm-spin" style="border-color:${fg};border-right-color:transparent"></span>` : escapeHtml(p.text ?? "");
    return `<button type="button" data-tgm="${id}" style="flex:1;min-width:0;height:50px;border-radius:12px;border:0;background:${bg};color:${fg};font:600 17px/1 -apple-system,system-ui,sans-serif;opacity:${p.is_active === false ? 0.45 : 1};position:relative;overflow:hidden">${label}${p.has_shine_effect ? '<span class="tgm-shine"></span>' : ""}</button>`;
  }

  function draw() {
    const top = app.safeAreaInset!.top;
    const ctop = app.contentSafeAreaInset!.top;
    const showMain = main.isVisible;
    const showSec = secondary.isVisible;
    const barH = showMain || showSec ? 10 + 50 + 10 + profile.safe.bottom : 0;
    document.documentElement.style.setProperty("--tg-bottom-bar", `${barH}px`);
    const statusInk = dark ? "#fff" : "#000";
    const pills = state.fullscreen
      ? `<div style="position:fixed;left:0;right:0;top:${top}px;height:${ctop}px;display:flex;align-items:center;justify-content:space-between;padding:0 10px;pointer-events:none;z-index:2">
          <button type="button" data-tgm="${back.isVisible ? "back" : "close"}" style="pointer-events:auto;height:30px;padding:0 12px;border-radius:999px;border:0;background:${pillBg};color:${ink};font:500 15px/1 -apple-system,system-ui,sans-serif;backdrop-filter:blur(12px)">${back.isVisible ? "‹ Back" : "✕ Close"}</button>
          <span style="pointer-events:auto;display:flex;gap:0;height:30px;border-radius:999px;background:${pillBg};color:${ink};font:600 15px/30px -apple-system,system-ui,sans-serif">
            <span style="padding:0 10px">⌄</span><button type="button" data-tgm="settings" title="Settings" style="border:0;background:none;color:inherit;padding:0 12px;font:inherit">⋯</button>
          </span>
        </div>`
      : "";
    const status = state.fullscreen
      ? `<div style="position:fixed;left:0;right:0;top:0;height:${top}px;display:flex;align-items:center;justify-content:space-between;padding:0 26px;font:600 15px/1 -apple-system,system-ui,sans-serif;color:${statusInk};pointer-events:none;z-index:2"><span>9:41</span><span style="letter-spacing:2px">▪▪▪ ◔</span></div>`
      : "";
    const bar = barH
      ? `<div style="position:fixed;left:0;right:0;bottom:0;height:${barH}px;background:${state.bottomBar};display:flex;gap:10px;padding:10px 12px ${10 + profile.safe.bottom}px;box-sizing:border-box;z-index:2">
          ${showSec && secondary.params.position !== "right" ? btnHtml("secondary", secondary, false) : ""}
          ${showMain ? btnHtml("main", main, true) : ""}
          ${showSec && secondary.params.position === "right" ? btnHtml("secondary", secondary, false) : ""}
        </div>`
      : "";
    chrome.innerHTML = `<style>
      .tgm-spin{display:inline-block;width:20px;height:20px;border:2.5px solid;border-radius:50%;animation:tgm-spin .8s linear infinite;vertical-align:middle}
      @keyframes tgm-spin{to{transform:rotate(360deg)}}
      .tgm-shine{position:absolute;inset:0;background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.45) 50%,transparent 70%);transform:translateX(-100%);animation:tgm-shine 2.6s ease-in-out infinite}
      @keyframes tgm-shine{60%,100%{transform:translateX(100%)}}
    </style>${status}${pills}${bar}`;
    emit("viewportChanged");
  }

  chrome.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-tgm]");
    if (!t) return;
    const id = t.dataset.tgm;
    if (id === "main") main.fire();
    else if (id === "secondary") secondary.fire();
    else if (id === "back") back.fire();
    else if (id === "settings" && settings.isVisible) settings.fire();
    else if (id === "close") log("close tapped");
  });

  draw();
  // Read-only, so a telegram-web-app.js that loads late cannot replace the stand-in.
  const holder = {};
  Object.defineProperty(holder, "WebApp", { value: app, writable: false, enumerable: true });
  Object.defineProperty(window, "Telegram", { value: holder, writable: false, configurable: true });
  return app;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}
