"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { Studio } from "@/components/studio/Studio";
import { useCopy, useInitLang } from "@/components/ui/lang";
import { LangSwitch, Logo } from "@/components/ui/parts";

type Status = "loading" | "ready" | "outside" | "error";
type Theme = "light" | "dark";

type AuthResponse = { ok: true; user: { first_name: string }; locale: string } | { ok: false; error: string };

/* The parts of telegram-web-app.js this screen uses beyond the shared typings. */
type TgExtras = {
  onEvent?(event: "themeChanged", cb: () => void): void;
  offEvent?(event: "themeChanged", cb: () => void): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
};
type Tg = TelegramWebApp & TgExtras;

/** Our paper colours, painted into Telegram's own chrome so the header matches the page. */
const PAPER: Record<Theme, string> = { light: "#f7f5f0", dark: "#181816" };

function webApp(): Tg | undefined {
  return window.Telegram?.WebApp as Tg | undefined;
}

/** Follows Telegram's light/dark theme. */
function useTelegramTheme(active: boolean) {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const tg = webApp();
    if (!active || !tg) return;
    const apply = () => {
      const next: Theme = tg.colorScheme === "dark" ? "dark" : "light";
      setTheme(next);
      tg.setHeaderColor?.(PAPER[next]);
      tg.setBackgroundColor?.(PAPER[next]);
    };
    apply();
    tg.onEvent?.("themeChanged", apply);
    return () => tg.offEvent?.("themeChanged", apply);
  }, [active]);
  return theme;
}

export default function MiniApp({ bot }: { bot: string }) {
  const started = useRef(false);
  const [status, setStatus] = useState<Status>("loading");
  const [langHint, setLangHint] = useState<string | null>(null);
  const [previewTheme, setPreviewTheme] = useState<Theme | null>(null);
  const tgTheme = useTelegramTheme(status === "ready");
  const theme = previewTheme ?? tgTheme;

  // The whole document follows the theme, so overscroll and the page edge never flash the other colour.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [theme]);

  const init = useCallback(async () => {
    if (started.current) return;
    started.current = true;

    // Dev-only design preview of the in-Telegram screen (no auth). Compiled out of production.
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
    setLangHint(tg.initDataUnsafe?.user?.language_code ?? null);

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
      setLangHint(data.locale);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onReady={() => void init()} onError={() => setStatus("outside")} />
      {status === "ready" ? <Studio bot={bot} inTelegram theme={theme} langHint={langHint} /> : <Outside status={status} bot={bot} />}
    </>
  );
}

function Outside({ status, bot }: { status: Status; bot: string }) {
  useInitLang();
  const c = useCopy();
  return (
    <div className="flex min-h-dvh flex-col bg-paper px-4 pb-10 pt-3 text-ink sm:px-6">
      <header className="flex items-center justify-between">
        <Logo href={null} />
        <LangSwitch />
      </header>
      <div className="mt-16 flex max-w-[440px] flex-col gap-4">
        {status === "loading" && (
          <p className="breathe text-[17px] text-ink-2" role="status">
            {c.tg.loading}
          </p>
        )}
        {status === "outside" && (
          <>
            <h1 className="text-balance text-[28px] font-semibold leading-tight tracking-[-0.02em]">{c.tg.outsideTitle}</h1>
            <p className="text-[16px] leading-relaxed text-ink-2">{c.tg.outsideText}</p>
            <div className="mt-2 grid gap-2.5">
              <a href={`https://t.me/${bot}`} className="btn w-full">
                {c.tg.openBot}
              </a>
              <a href="/studio" className="btn-2 w-full">
                {c.tg.openWeb}
              </a>
            </div>
          </>
        )}
        {status === "error" && <p className="text-[16px] leading-relaxed text-ink-2">{c.tg.authError}</p>}
      </div>
    </div>
  );
}
