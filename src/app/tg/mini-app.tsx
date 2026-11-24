"use client";

import Script from "next/script";
import { useCallback, useRef, useState } from "react";
import { DEFAULT_LOCALE, pickLocale, t, type Locale } from "@/lib/i18n";

type Status = "loading" | "ready" | "outside" | "error";

type AuthResponse =
  | { ok: true; user: { first_name: string }; locale: Locale }
  | { ok: false; error: string };

export default function MiniApp() {
  const started = useRef(false);
  const [status, setStatus] = useState<Status>("loading");
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [firstName, setFirstName] = useState("");

  const init = useCallback(async () => {
    if (started.current) return;
    started.current = true;

    const tg = window.Telegram?.WebApp;
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
      setFirstName(data.user.first_name);
      setLocale(data.locale);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  return (
    <div className="tg-app flex min-h-dvh flex-col px-5 py-8">
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onReady={() => void init()}
        onError={() => setStatus("outside")}
      />

      {status === "loading" && <p className="tg-hint m-auto">{t(locale, "app.loading")}</p>}

      {status === "outside" && (
        <p className="tg-hint m-auto max-w-xs text-center">{t(locale, "app.open_in_telegram")}</p>
      )}

      {status === "error" && (
        <p className="tg-hint m-auto max-w-xs text-center">{t(locale, "app.auth_error")}</p>
      )}

      {status === "ready" && (
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {t(locale, "app.hello", { name: firstName || "👋" })}
            </h1>
            <p className="tg-hint mt-2">{t(locale, "app.subtitle")}</p>
          </div>
          <div className="tg-card rounded-2xl p-5">
            <p className="font-medium">{t(locale, "app.placeholder")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
