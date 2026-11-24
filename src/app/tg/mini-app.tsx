"use client";

import { Send } from "lucide-react";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mark } from "@/components/lamp/Mark";
import { Studio } from "@/components/studio/Studio";
import { useStudio } from "@/components/studio/store";
import { TG_BOT_URL } from "@/components/uslub/agents";
import { DEFAULT_LOCALE, pickLocale, t, type Locale } from "@/lib/i18n";

type Status = "loading" | "ready" | "outside" | "error";
type Theme = "light" | "dark";

type AuthResponse = { ok: true; user: { first_name: string }; locale: Locale } | { ok: false; error: string };

/* The parts of telegram-web-app.js this screen uses beyond the shared typings. */
type MainButton = {
  setParams(p: { text?: string; color?: string; text_color?: string; is_visible?: boolean; is_active?: boolean }): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
  show(): void;
  hide(): void;
};
type TgExtras = {
  MainButton?: MainButton;
  onEvent?(event: "themeChanged", cb: () => void): void;
  offEvent?(event: "themeChanged", cb: () => void): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
};
type Tg = TelegramWebApp & TgExtras;

const LIME = "#D7FF3A";
const LIME_INK = "#0B0C02";

function webApp(): Tg | undefined {
  return window.Telegram?.WebApp as Tg | undefined;
}

/** Follow Telegram's light/dark theme and paint Telegram's own chrome to match. */
function useTelegramTheme(active: boolean) {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    const tg = webApp();
    if (!active || !tg) return;
    const apply = () => {
      const next: Theme = tg.colorScheme === "light" ? "light" : "dark";
      setTheme(next);
      const bg = next === "light" ? "#ffffff" : "#000000";
      tg.setHeaderColor?.(bg);
      tg.setBackgroundColor?.(bg);
    };
    apply();
    tg.onEvent?.("themeChanged", apply);
    return () => tg.offEvent?.("themeChanged", apply);
  }, [active]);
  return theme;
}

/**
 * Telegram's native MainButton is the owner's hand, painted lime:
 * approve the next waiting item, then open the first approved one to publish.
 */
function useMainButton(active: boolean) {
  const inbox = useStudio((s) => s.inbox);
  const running = useStudio((s) => s.running);
  const reviewing = useStudio((s) => s.reviewing);
  const handler = useRef<() => void>(() => {});

  useEffect(() => {
    const mb = webApp()?.MainButton;
    if (!active || !mb) return;
    const { setItem, review, setView } = useStudio.getState();
    const waiting = inbox.filter((i) => i.state === "waiting");
    const approved = inbox.filter((i) => i.state === "approved");
    // While a post is open for review, its own buttons decide; the MainButton must not act on another card.
    if (running || inbox.length === 0 || reviewing) {
      mb.hide();
      return;
    }
    if (waiting.length > 0) {
      const next = waiting[0];
      handler.current = () => {
        webApp()?.HapticFeedback?.impactOccurred("light");
        setView("delegate");
        setItem(next.id, { state: "approved" });
      };
      mb.setParams({ text: `Tasdiqlash (${waiting.length})`, color: LIME, text_color: LIME_INK, is_visible: true, is_active: true });
    } else if (approved.length > 0) {
      const first = approved[0];
      handler.current = () => {
        if (first.type === "post" && first.postId) review(first.postId);
        else setView("video");
      };
      mb.setParams({ text: "Kanalga joylash", color: LIME, text_color: LIME_INK, is_visible: true, is_active: true });
    } else {
      mb.hide();
    }
  }, [active, running, inbox, reviewing]);

  useEffect(() => {
    const mb = webApp()?.MainButton;
    if (!active || !mb) return;
    const click = () => handler.current();
    mb.onClick(click);
    return () => mb.offClick(click);
  }, [active]);
}

export default function MiniApp() {
  const started = useRef(false);
  const [status, setStatus] = useState<Status>("loading");
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [previewTheme, setPreviewTheme] = useState<Theme | null>(null);
  const tgTheme = useTelegramTheme(status === "ready");
  const theme = previewTheme ?? tgTheme;
  useMainButton(status === "ready");

  const init = useCallback(async () => {
    if (started.current) return;
    started.current = true;

    // Dev-only design preview of the in-Telegram screen (no auth, sample data). Compiled out of production.
    if (process.env.NODE_ENV !== "production") {
      const preview = new URLSearchParams(window.location.search).get("preview");
      if (preview === "light" || preview === "dark") {
        setPreviewTheme(preview);
        setStatus("ready");
        return;
      }
    }

    const tg = webApp();
    if (!tg?.initData) {
      setStatus("outside");
      return;
    }
    tg.ready();
    tg.expand();
    setLocale(pickLocale(tg.initDataUnsafe?.user?.language_code));

    try {
      // The server validates the initData signature; never trust initDataUnsafe for auth.
      const res = await fetch("/api/auth/telegram", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: tg.initData }),
      });
      const data = (await res.json().catch(() => null)) as AuthResponse | null;
      if (!res.ok || !data?.ok) {
        setStatus("error");
        return;
      }
      setLocale(data.locale);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onReady={() => void init()} onError={() => setStatus("outside")} />

      {status === "ready" ? (
        <Studio inTelegram theme={theme} />
      ) : (
        <div className="lw flex min-h-dvh flex-col items-start justify-between gap-10 px-5 py-8">
          <Mark href={null} />
          <div className="flex flex-col gap-4">
            {status === "loading" && (
              <p className="text-[17px] text-[var(--ink-2)]" aria-live="polite">
                {t(locale, "app.loading")}
              </p>
            )}
            {status === "outside" && (
              <>
                <h1 className="max-w-[16ch] text-balance text-[30px] font-semibold leading-[1.05] tracking-[-0.03em]">Bu ekran Telegram ichida ochiladi</h1>
                <p className="max-w-[40ch] text-[15px] leading-relaxed text-[var(--ink-2)]">Botni oching va «Ochish» tugmasini bosing yoki Studiyani brauzerda oching.</p>
                <div className="grid w-full max-w-[360px] gap-2">
                  <a href={TG_BOT_URL} className="btn-lime w-full">
                    <Send className="h-4 w-4" aria-hidden /> Botni ochish
                  </a>
                  <a href="/studio" className="btn-quiet w-full">
                    Brauzerda Studiya
                  </a>
                </div>
              </>
            )}
            {status === "error" && <p className="max-w-[40ch] text-[15px] leading-relaxed text-[var(--ink-2)]">{t(locale, "app.auth_error")}</p>}
          </div>
          <span />
        </div>
      )}
    </>
  );
}
