"use client";

import { useRef, useState } from "react";
import type { Lang } from "../ui/format";
import { INTRO_COPY } from "./copy";
import { Onboarding } from "./Onboarding";

/**
 * Dev-only stage for the intro (/tg/intro?variant=desktop&theme=light&lang=ru, &only=admin for
 * the add-the-bot card alone): the intro over a plain stage with a link field, so the end can
 * show where it hands over.
 */
export function IntroPreview({ variant, theme, lang, bot, only }: { variant: "phone" | "desktop"; theme: "dark" | "light"; lang: Lang; bot: string; only: "admin" | null }) {
  const [open, setOpen] = useState(true);
  const field = useRef<HTMLInputElement>(null);
  const t = INTRO_COPY[lang];
  return (
    <div data-theme={theme} className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--stage)] p-6 text-[var(--ink)]">
      <input ref={field} name="channel" className="input max-w-[420px]" placeholder="t.me/kanal" aria-label="t.me/kanal" />
      <button type="button" className="btn-2" onClick={() => setOpen(true)}>
        {t.again}
      </button>
      <Onboarding
        open={open}
        only={only}
        lang={lang}
        bot={bot}
        variant={variant}
        onClose={(how) => {
          setOpen(false);
          if (how === "done") setTimeout(() => field.current?.focus(), 280);
        }}
      />
    </div>
  );
}
