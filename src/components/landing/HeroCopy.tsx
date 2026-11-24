"use client";

import Link from "next/link";
import { Send } from "lucide-react";
import { useState } from "react";
import { TG_BOT_URL } from "@/components/uslub/agents";

type Lang = "uz" | "ru" | "en";

const COPY: Record<Lang, { title: [string, string]; sub: string; run: string; tg: string; placeholder: string }> = {
  uz: {
    title: ["Bir havola —", "butun marketing bo'limi"],
    sub: "Telegram kanalingiz havolasini bering. 60 soniyada brend ovozingiz, bir haftalik postlar 4 yozuvda, Reels ssenariysi va mijozlaringiz turgan 10 joy tayyor bo'ladi. Siz faqat tasdiqlaysiz.",
    run: "Bo'limni ishga tushirish",
    tg: "Telegram botda ochish",
    placeholder: "t.me/sizning_kanal",
  },
  ru: {
    title: ["Одна ссылка —", "целый отдел маркетинга"],
    sub: "Дайте ссылку на свой Telegram-канал. Через 60 секунд у вас голос бренда, посты на неделю на 4 языках, сценарий Reels и 10 мест, где сидят ваши клиенты. Вы только утверждаете.",
    run: "Запустить отдел",
    tg: "Открыть бота в Telegram",
    placeholder: "t.me/vash_kanal",
  },
  en: {
    title: ["One link.", "A whole marketing department."],
    sub: "Paste your Telegram channel link. In 60 seconds you get your brand voice, a week of posts in 4 scripts, a Reels script and 10 places where your customers are. You only approve.",
    run: "Start the department",
    tg: "Open the Telegram bot",
    placeholder: "t.me/your_channel",
  },
};

const LANGS: { key: Lang; label: string }[] = [
  { key: "uz", label: "O'zbek" },
  { key: "ru", label: "Русский" },
  { key: "en", label: "English" },
];

export function HeroCopy() {
  const [lang, setLang] = useState<Lang>("uz");
  const c = COPY[lang];

  return (
    <div className="flex flex-col">
      <div role="radiogroup" aria-label="Til" className="inline-flex w-fit rounded-full border border-sand bg-white/70 p-1 text-[13px]">
        {LANGS.map((l) => (
          <button
            key={l.key}
            role="radio"
            aria-checked={lang === l.key}
            onClick={() => setLang(l.key)}
            className={`rounded-full px-3 py-1.5 font-semibold transition-colors ${
              lang === l.key ? "bg-ink text-paper" : "text-stone hover:text-ink"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      <h1
        lang={lang === "uz" ? "uz" : lang}
        className="mt-7 font-display text-[2.35rem] font-semibold leading-[1.02] tracking-[-0.035em] text-ink sm:text-[3.4rem] lg:text-[4.1rem]"
      >
        <span className="block text-stone">{c.title[0]}</span>
        <span className="block">{c.title[1]}</span>
      </h1>

      <p className="mt-6 max-w-[34rem] text-[17px] leading-relaxed text-stone sm:text-lg">{c.sub}</p>

      <form
        action="/studio"
        className="mt-8 flex max-w-[34rem] flex-col gap-2 rounded-2xl border border-sand bg-white p-2 shadow-[0_1px_0_#e6dfd3,0_12px_32px_-18px_rgba(19,21,28,.35)] sm:flex-row sm:items-center"
      >
        <input type="hidden" name="demo" value="bir-havola" />
        <label htmlFor="hero-channel" className="sr-only">
          Telegram kanal havolasi
        </label>
        <input
          id="hero-channel"
          name="channel"
          placeholder={c.placeholder}
          className="min-w-0 flex-1 rounded-xl bg-transparent px-3 py-3 text-[16px] text-ink outline-none placeholder:text-stone/70"
          autoComplete="off"
        />
        <button
          type="submit"
          className="rounded-xl bg-lapis px-5 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-lapis-deep"
        >
          {c.run}
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[15px]">
        <a
          href={TG_BOT_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 font-semibold text-ink underline decoration-sand decoration-2 underline-offset-4 hover:decoration-lapis"
        >
          <Send className="h-4 w-4 text-lapis" aria-hidden />
          {c.tg}
        </a>
        <Link href="/studio?demo=bir-havola" className="text-stone hover:text-ink">
          {lang === "uz" ? "Namuna kanal bilan ko'rish" : lang === "ru" ? "Посмотреть на примере" : "Try it with a sample channel"}
        </Link>
      </div>
    </div>
  );
}
