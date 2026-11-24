"use client";

import { Link2, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { TG_BOT_URL } from "@/components/uslub/agents";

type Lang = "uz" | "ru" | "en";

const COPY: Record<Lang, { title: [string, string]; sub: string; run: string; tg: string; sample: string; placeholder: string }> = {
  uz: {
    title: ["Bir havola —", "butun marketing bo'limi"],
    sub: "Telegram kanalingiz havolasini bering. 60 soniyada brend ovozingiz, bir haftalik postlar 4 yozuvda, Reels ssenariysi va mijozlaringiz turgan 10 joy tayyor. Siz faqat tasdiqlaysiz.",
    run: "Bo'limni ishga tushirish",
    tg: "Telegram botda ochish",
    sample: "Namuna kanal bilan ko'rish",
    placeholder: "t.me/sizning_kanal",
  },
  ru: {
    title: ["Одна ссылка —", "целый отдел маркетинга"],
    sub: "Дайте ссылку на свой Telegram-канал. Через 60 секунд — голос бренда, посты на неделю на 4 языках, сценарий Reels и 10 мест, где сидят ваши клиенты. Вы только утверждаете.",
    run: "Запустить отдел",
    tg: "Открыть бота в Telegram",
    sample: "Посмотреть на примере",
    placeholder: "t.me/vash_kanal",
  },
  en: {
    title: ["One link.", "A whole marketing department."],
    sub: "Paste your Telegram channel link. In 60 seconds: your brand voice, a week of posts in 4 scripts, a Reels script and 10 places where your customers are. You only approve.",
    run: "Start the department",
    tg: "Open the Telegram bot",
    sample: "Try a sample channel",
    placeholder: "t.me/your_channel",
  },
};

const LANGS: { key: Lang; label: string }[] = [
  { key: "uz", label: "UZ" },
  { key: "ru", label: "RU" },
  { key: "en", label: "EN" },
];

export function HeroCopy() {
  const [lang, setLang] = useState<Lang>("uz");
  const c = COPY[lang];

  return (
    <div className="flex flex-col">
      <div role="radiogroup" aria-label="Til" className="inline-flex w-fit gap-1 rounded-full bg-white/[.06] p-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
        {LANGS.map((l) => (
          <button
            key={l.key}
            type="button"
            role="radio"
            aria-checked={lang === l.key}
            onClick={() => setLang(l.key)}
            className={`rounded-full px-3.5 py-1.5 font-mono text-[12px] tracking-[0.08em] transition-colors ${
              lang === l.key ? "bg-fog text-void" : "text-mute hover:text-fog"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      <h1
        lang={lang}
        className="mt-7 text-[2.5rem] font-extrabold leading-[0.98] tracking-[-0.045em] text-fog sm:text-[3.6rem] lg:text-[4.4rem]"
      >
        <span className="block text-mute">{c.title[0]}</span>
        <span className="block">{c.title[1]}</span>
      </h1>

      <p className="mt-6 max-w-[34rem] text-[17px] leading-relaxed text-mute">{c.sub}</p>

      <form
        action="/studio"
        className="mt-8 flex max-w-[34rem] flex-col gap-2 rounded-[28px] bg-white/[.05] p-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,.1)] sm:flex-row sm:items-center sm:rounded-full"
      >
        <input type="hidden" name="demo" value="bir-havola" />
        <label htmlFor="hero-channel" className="flex min-w-0 flex-1 items-center gap-2.5 px-3">
          <Link2 className="h-4 w-4 shrink-0 text-mute" aria-hidden />
          <span className="sr-only">Telegram kanal havolasi</span>
          <input
            id="hero-channel"
            name="channel"
            placeholder={c.placeholder}
            className="min-w-0 flex-1 bg-transparent py-3 font-mono text-[15px] text-fog outline-none placeholder:text-dim"
            autoComplete="off"
          />
        </label>
        <button type="submit" className="pill-lime px-6 py-3.5 text-[15px]">
          {c.run}
        </button>
      </form>

      <div className="mt-5 flex flex-wrap items-center gap-3 text-[14px]">
        <a href={TG_BOT_URL} target="_blank" rel="noreferrer" className="pill-ghost px-4 py-2.5">
          <Send className="h-4 w-4" aria-hidden />
          {c.tg}
        </a>
        <Link href="/studio?demo=bir-havola" className="px-2 py-2 text-mute underline decoration-edge-2 underline-offset-4 hover:text-fog">
          {c.sample}
        </Link>
      </div>
    </div>
  );
}
