/**
 * Wires the app shell into Telegram's own chrome: colours that match the lamp stage, safe-area
 * insets as CSS variables, fullscreen on phones, vertical swipes off (every screen scrolls inside
 * its own region), the native Back / Settings buttons and the bottom bar (Main + Secondary).
 */
import { useEffect, useState } from "react";
import { atLeast, isMobilePlatform, tg, tgSafe, type Insets, type TgBottomButton } from "./tg";
import { topRegistration, useCanGoBack, useLatest, useNav, type BtnSpec } from "./nav";

export type Theme = "light" | "dark";

/** The stage colour per theme (globals.css --stage), painted into Telegram's header and bars. */
export const STAGE: Record<Theme, string> = { light: "#ffffff", dark: "#000000" };
const LIME = "#d7ff3a";
const LIME_INK = "#0b0c02";
const GLASS: Record<Theme, string> = { light: "#eae9e5", dark: "#17171b" };
const INK: Record<Theme, string> = { light: "#0d0d11", dark: "#f3f1ec" };

const ZERO: Insets = { top: 0, bottom: 0, left: 0, right: 0 };

/** Follows Telegram's colour scheme (or the dev preview's). */
export function useTelegramTheme(active: boolean, forced: Theme | null): Theme {
  // The pre-paint script (app/tg/layout.tsx) already read Telegram's theme from the URL hash.
  const [theme, setTheme] = useState<Theme>(() => (typeof window !== "undefined" && (window as { __maTheme?: Theme }).__maTheme === "light" ? "light" : "dark"));
  useEffect(() => {
    const app = tg();
    if (forced || !active || !app) return;
    const apply = () => setTheme(app.colorScheme === "light" ? "light" : "dark");
    apply();
    app.onEvent?.("themeChanged", apply);
    return () => app.offEvent?.("themeChanged", apply);
  }, [active, forced]);
  return forced ?? theme;
}

/** One-time setup on launch, then colours and insets kept in sync. */
export function useTelegramShell(theme: Theme, active: boolean) {
  const [insets, setInsets] = useState<{ safe: Insets; content: Insets }>({ safe: ZERO, content: ZERO });

  useEffect(() => {
    const app = tg();
    if (!active || !app) return;
    tgSafe(() => app.ready());
    tgSafe(() => app.expand());
    if (atLeast("7.7")) tgSafe(() => app.disableVerticalSwipes?.());
    // Fullscreen only on phones: on desktop clients it would take over the whole monitor.
    if (atLeast("8.0") && isMobilePlatform(app.platform)) {
      tgSafe(() => app.requestFullscreen?.());
      tgSafe(() => app.lockOrientation?.());
    }
    const read = () => setInsets({ safe: app.safeAreaInset ?? ZERO, content: app.contentSafeAreaInset ?? ZERO });
    read();
    const events = ["safeAreaChanged", "contentSafeAreaChanged", "fullscreenChanged"] as const;
    events.forEach((e) => app.onEvent?.(e, read));
    return () => events.forEach((e) => app.offEvent?.(e, read));
  }, [active]);

  useEffect(() => {
    const app = tg();
    if (!active || !app) return;
    const c = STAGE[theme];
    if (atLeast("6.1")) {
      tgSafe(() => app.setHeaderColor?.(c));
      tgSafe(() => app.setBackgroundColor?.(c));
    }
    if (atLeast("7.10")) tgSafe(() => app.setBottomBarColor?.(c));
  }, [theme, active]);

  return insets;
}

function paint(btn: TgBottomButton, spec: BtnSpec | null, primary: boolean, theme: Theme, sec: boolean) {
  if (!spec) {
    tgSafe(() => btn.hideProgress());
    tgSafe(() => btn.hide());
    return;
  }
  const params = {
    text: spec.text,
    color: primary ? LIME : GLASS[theme],
    text_color: primary ? LIME_INK : INK[theme],
    is_active: spec.active !== false && !spec.progress,
    is_visible: true,
    ...(atLeast("7.10") ? { has_shine_effect: !!spec.shine } : {}),
    ...(sec ? { position: "left" as const } : {}),
  };
  tgSafe(() => btn.setParams(params));
  tgSafe(() => (spec.progress ? btn.showProgress(false) : btn.hideProgress()));
}

/**
 * Telegram's bottom bar follows the top-most declaration. Returns whether the bar is showing,
 * so the layout drops its own bottom safe-area padding while Telegram's bar owns that edge.
 */
export function useBottomBar(theme: Theme, active: boolean): boolean {
  const regs = useNav((s) => s.regs);
  const top = topRegistration(regs);
  const main = top?.main ?? null;
  const secondary = top?.secondary ?? null;
  const current = useLatest<{ main: BtnSpec | null; secondary: BtnSpec | null }>({ main, secondary });

  // Click handlers are installed once and call whatever the top declaration holds now.
  useEffect(() => {
    const app = tg();
    if (!active || !app) return;
    const onMain = () => current.current.main?.onClick();
    const onSec = () => current.current.secondary?.onClick();
    app.MainButton?.onClick(onMain);
    if (atLeast("7.10")) app.SecondaryButton?.onClick(onSec);
    return () => {
      app.MainButton?.offClick(onMain);
      app.SecondaryButton?.offClick(onSec);
      tgSafe(() => app.MainButton?.hide());
      tgSafe(() => app.SecondaryButton?.hide());
    };
  }, [active, current]);

  const mainSig = main ? `${main.text}|${main.active !== false}|${!!main.progress}|${!!main.shine}` : "";
  const secSig = secondary ? `${secondary.text}|${secondary.active !== false}|${!!secondary.progress}` : "";
  useEffect(() => {
    const app = tg();
    if (!active || !app) return;
    if (app.MainButton) paint(app.MainButton, current.current.main, true, theme, false);
    if (app.SecondaryButton && atLeast("7.10")) paint(app.SecondaryButton, current.current.secondary, false, theme, true);
    // An old client without SecondaryButton: the secondary action stays reachable in the screen itself.
  }, [active, theme, mainSig, secSig, current]);

  return !!main || (!!secondary && atLeast("7.10"));
}

/** Whether Telegram can draw a secondary button; screens render their own otherwise. */
export const hasNativeSecondary = () => atLeast("7.10");

/** Native Back (sheet → stack) and Settings buttons. */
export function useNativeNav(active: boolean, onSettings: () => void) {
  const canBack = useCanGoBack();
  const settingsRef = useLatest(onSettings);

  useEffect(() => {
    const app = tg();
    if (!active || !app?.BackButton || !atLeast("6.1")) return;
    const onBack = () => useNav.getState().back();
    app.BackButton.onClick(onBack);
    return () => app.BackButton?.offClick(onBack);
  }, [active]);

  useEffect(() => {
    const app = tg();
    if (!active || !app?.BackButton || !atLeast("6.1")) return;
    tgSafe(() => (canBack ? app.BackButton!.show() : app.BackButton!.hide()));
  }, [active, canBack]);

  useEffect(() => {
    const app = tg();
    if (!active || !app?.SettingsButton || !atLeast("7.0")) return;
    const cb = () => settingsRef.current();
    app.SettingsButton.onClick(cb);
    tgSafe(() => app.SettingsButton!.show());
    return () => {
      app.SettingsButton?.offClick(cb);
      tgSafe(() => app.SettingsButton?.hide());
    };
  }, [active, settingsRef]);

  // Escape and the browser's back key do the same outside Telegram (dev preview, desktop).
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") useNav.getState().back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);
}

/** Asks before closing while work would be lost (a run in progress, an unsaved edit). */
export function useClosingConfirmation(on: boolean) {
  useEffect(() => {
    const app = tg();
    if (!app || !atLeast("6.2")) return;
    tgSafe(() => (on ? app.enableClosingConfirmation?.() : app.disableClosingConfirmation?.()));
  }, [on]);
}
