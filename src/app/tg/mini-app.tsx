"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { MiniApp } from "@/components/miniapp/MiniApp";
import { useTelegramTheme, type Theme } from "@/components/miniapp/native";
import { tg } from "@/components/miniapp/tg";
import { useCopy, useInitLang } from "@/components/ui/lang";
import { LangSwitch, Logo } from "@/components/ui/parts";

type Status = "loading" | "ready" | "outside" | "error";

type AuthResponse = { ok: true; user: { first_name: string }; locale: string } | { ok: false; error: string };

export default function MiniAppEntry({ bot }: { bot: string }) {
  const started = useRef(false);
  const [status, setStatus] = useState<Status>("loading");
  const [langHint, setLangHint] = useState<string | null>(null);
  const [preview, setPreview] = useState<Theme | null>(null);
  // Decided on the first client render, so the real telegram-web-app.js never loads over the dev mock.
  const [mockLoad] = useState(
    () => process.env.NODE_ENV !== "production" && typeof window !== "undefined" && /[?&]preview=(light|dark)/.test(window.location.search),
  );
  const tgTheme = useTelegramTheme(status === "ready", preview);
  const theme = preview ?? tgTheme;

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
    const app = tg();
    if (!app?.initData) {
      setStatus("outside");
      return;
    }
    setLangHint(app.initDataUnsafe?.user?.language_code ?? null);
    // The app shell opens at once (launch moment); the server checks the initData signature in parallel.
    setStatus("ready");
    try {
      const res = await fetch("/api/auth/telegram", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: app.initData }),
      });
      const data = (await res.json().catch(() => null)) as AuthResponse | null;
      if (!res.ok || !data?.ok) {
        setStatus("error");
        return;
      }
      if (!app.initDataUnsafe?.user?.language_code) setLangHint(data.locale);
    } catch {
      /* offline: the shell still works; each call reports its own network error */
    }
  }, []);

  // Dev-only preview of the in-Telegram app with a stand-in WebApp object. Compiled out of production.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const p = new URLSearchParams(window.location.search);
    const scheme = p.get("preview");
    if (scheme !== "light" && scheme !== "dark") return;
    void import("@/components/miniapp/mock").then(({ installTelegramMock }) => {
      installTelegramMock({ scheme, platform: p.get("platform") === "android" ? "android" : "ios", lang: p.get("tglang") ?? "uz" });
      // Test handles for driving states the sample cannot reach (publish errors, fresh brands).
      void Promise.all([import("@/components/studio/store"), import("@/components/miniapp/nav")]).then(([s, n]) => {
        (window as unknown as { __ma: unknown }).__ma = { studio: s.useStudio, nav: n.useNav };
      });
      setPreview(scheme);
      setLangHint(p.get("tglang") ?? "uz");
      started.current = true;
      setStatus("ready");
    });
  }, []);

  return (
    <>
      {!mockLoad && (
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onReady={() => void init()} onError={() => setStatus("outside")} />
      )}
      {status === "ready" ? (
        <MiniApp bot={bot} theme={theme} langHint={langHint} />
      ) : status === "loading" ? (
        <div className="fixed inset-0 bg-stage" aria-busy="true" />
      ) : (
        <Outside status={status} bot={bot} />
      )}
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
