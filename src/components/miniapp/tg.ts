/**
 * The parts of telegram-web-app.js the Mini App uses (Bot API 6.1 … 8.x), typed locally,
 * with small helpers that degrade quietly on older Telegram clients.
 * https://core.telegram.org/bots/webapps
 */

export type Insets = { top: number; bottom: number; left: number; right: number };

export type BottomButtonParams = {
  text?: string;
  color?: string;
  text_color?: string;
  is_active?: boolean;
  is_visible?: boolean;
  has_shine_effect?: boolean;
  position?: "left" | "right" | "top" | "bottom";
};

export interface TgBottomButton {
  isVisible: boolean;
  isActive: boolean;
  setParams(p: BottomButtonParams): void;
  show(): void;
  hide(): void;
  showProgress(leaveActive?: boolean): void;
  hideProgress(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

export interface TgSimpleButton {
  isVisible: boolean;
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

export type TgEvent =
  | "themeChanged"
  | "viewportChanged"
  | "safeAreaChanged"
  | "contentSafeAreaChanged"
  | "fullscreenChanged"
  | "fullscreenFailed"
  | "activated"
  | "deactivated";

export interface TgApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name?: string; language_code?: string }; start_param?: string };
  version: string;
  platform: string;
  colorScheme?: "light" | "dark";
  themeParams?: Record<string, string>;
  isFullscreen?: boolean;
  safeAreaInset?: Insets;
  contentSafeAreaInset?: Insets;
  isVersionAtLeast?(v: string): boolean;
  ready(): void;
  expand(): void;
  close(): void;
  requestFullscreen?(): void;
  lockOrientation?(): void;
  setHeaderColor?(c: string): void;
  setBackgroundColor?(c: string): void;
  setBottomBarColor?(c: string): void;
  enableClosingConfirmation?(): void;
  disableClosingConfirmation?(): void;
  disableVerticalSwipes?(): void;
  enableVerticalSwipes?(): void;
  openTelegramLink?(url: string): void;
  openLink?(url: string): void;
  showConfirm?(message: string, cb: (ok: boolean) => void): void;
  showPopup?(
    params: { title?: string; message: string; buttons?: { id?: string; type?: "default" | "ok" | "close" | "cancel" | "destructive"; text?: string }[] },
    cb?: (buttonId: string) => void,
  ): void;
  onEvent?(e: TgEvent, cb: () => void): void;
  offEvent?(e: TgEvent, cb: () => void): void;
  MainButton?: TgBottomButton;
  SecondaryButton?: TgBottomButton;
  BackButton?: TgSimpleButton;
  SettingsButton?: TgSimpleButton;
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
    selectionChanged(): void;
  };
  CloudStorage?: {
    setItem(key: string, value: string, cb?: (err: string | null, ok?: boolean) => void): void;
    getItems(keys: string[], cb: (err: string | null, values?: Record<string, string>) => void): void;
    removeItem(key: string, cb?: (err: string | null, ok?: boolean) => void): void;
  };
}

/** The live WebApp object, or undefined outside Telegram (and before the script loads). */
export function tg(): TgApp | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Telegram?: { WebApp?: TgApp } }).Telegram?.WebApp;
}

/** "8.0" >= "7.10" style comparison, for clients without isVersionAtLeast. */
export function atLeast(v: string, app = tg()): boolean {
  if (!app) return false;
  if (app.isVersionAtLeast) {
    try {
      return app.isVersionAtLeast(v);
    } catch {
      /* fall through */
    }
  }
  const a = (app.version || "6.0").split(".").map(Number);
  const b = v.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d > 0;
  }
  return true;
}

/** Phones and tablets, where fullscreen and orientation lock make sense (never desktop clients). */
export const isMobilePlatform = (p?: string) => p === "ios" || p === "android" || p === "android_x";

/** Runs a Telegram call that may be missing or throw on an older client. */
function safe(fn: () => void) {
  try {
    fn();
  } catch {
    /* unsupported on this client */
  }
}

/** Haptics are punctuation: one per discrete action, never per frame. */
export const haptic = {
  tap: () => safe(() => atLeast("6.1") && tg()?.HapticFeedback?.impactOccurred("light")),
  press: () => safe(() => atLeast("6.1") && tg()?.HapticFeedback?.impactOccurred("medium")),
  select: () => safe(() => atLeast("6.1") && tg()?.HapticFeedback?.selectionChanged()),
  success: () => safe(() => atLeast("6.1") && tg()?.HapticFeedback?.notificationOccurred("success")),
  warn: () => safe(() => atLeast("6.1") && tg()?.HapticFeedback?.notificationOccurred("warning")),
  error: () => safe(() => atLeast("6.1") && tg()?.HapticFeedback?.notificationOccurred("error")),
};

/** t.me links open inside Telegram; nothing in the app sends the owner to a browser page. */
export function openLink(url: string) {
  const app = tg();
  if (!app) {
    window.open(url, "_blank", "noopener");
    return;
  }
  if (/^https:\/\/t\.me\//.test(url) && app.openTelegramLink) safe(() => app.openTelegramLink!(url));
  else if (app.openLink) safe(() => app.openLink!(url));
}

/** A native yes/no. Falls back to the browser's confirm outside Telegram. */
export function confirmNative(message: string): Promise<boolean> {
  const app = tg();
  if (app?.showConfirm && atLeast("6.2")) {
    return new Promise((resolve) => {
      try {
        app.showConfirm!(message, (ok) => resolve(!!ok));
      } catch {
        resolve(window.confirm(message));
      }
    });
  }
  return Promise.resolve(window.confirm(message));
}

/**
 * A native popup for an outcome the owner must read (a refused approve or publish). Telegram caps
 * the message at 256 and a button at 64 characters, so the text is cut with «…»; the full text
 * stays on the screen. Returns false when the client cannot show one (the caller falls back).
 */
export function popup(message: string, action?: { text: string; onPress: () => void }): boolean {
  const app = tg();
  if (!app?.showPopup || !atLeast("6.2")) return false;
  const text = message.length > 240 ? `${message.slice(0, 239).trimEnd()}…` : message;
  const buttons = action ? [{ id: "act", type: "default" as const, text: action.text.slice(0, 64) }, { type: "close" as const }] : [{ type: "close" as const }];
  try {
    app.showPopup({ message: text, buttons }, (id) => {
      if (id === "act") action?.onPress();
    });
    return true;
  } catch {
    return false;
  }
}

/** CloudStorage (Bot API 6.9): the owner's settings follow them across devices. */
export const cloud = {
  get(keys: string[]): Promise<Record<string, string>> {
    const app = tg();
    if (!app?.CloudStorage || !atLeast("6.9")) return Promise.resolve({});
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({}), 1500);
      try {
        app.CloudStorage!.getItems(keys, (err, values) => {
          clearTimeout(timer);
          resolve(err || !values ? {} : values);
        });
      } catch {
        clearTimeout(timer);
        resolve({});
      }
    });
  },
  set(key: string, value: string) {
    const app = tg();
    if (!app?.CloudStorage || !atLeast("6.9")) return;
    safe(() => app.CloudStorage!.setItem(key, value));
  },
  remove(key: string) {
    const app = tg();
    if (!app?.CloudStorage || !atLeast("6.9")) return;
    safe(() => app.CloudStorage!.removeItem(key));
  },
};

export { safe as tgSafe };
