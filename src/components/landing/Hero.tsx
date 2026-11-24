"use client";

import { Link2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { LedStrip } from "@/components/lamp/Led";

type Lang = "uz" | "ru" | "en";

const COPY: Record<Lang, { h: string; sub: string; cta: string; busy: string; ph: string; sample: string; price: string; bad: string; label: string }> = {
  uz: {
    h: "Bir havola — butun marketing bo‘limi",
    sub: "Telegram kanalingiz havolasini bering. 10 ta xodim kanalni o‘qiydi va bir daqiqada ovozingizni, bir haftalik postlarni va mijozlaringiz turgan joylarni tayyorlaydi. Siz faqat tasdiqlaysiz.",
    cta: "Bo‘limni yoqish",
    busy: "Yoqilmoqda…",
    ph: "t.me/kanalingiz",
    sample: "Namuna kanalda ko‘rish",
    price: "7 kun bepul, keyin oyiga 149 000 so‘m",
    bad: "Havola t.me/kanal yoki @kanal ko‘rinishida bo‘lsin.",
    label: "Telegram kanal havolasi",
  },
  ru: {
    h: "Одна ссылка — целый отдел маркетинга",
    sub: "Дайте ссылку на свой Telegram-канал. Десять сотрудников прочитают его и за минуту подготовят ваш голос, посты на неделю и места, где сидят ваши клиенты. Вы только утверждаете.",
    cta: "Включить отдел",
    busy: "Включаем…",
    ph: "t.me/vash_kanal",
    sample: "Посмотреть на примере",
    price: "7 дней бесплатно, потом 149 000 сум в месяц",
    bad: "Ссылка должна выглядеть как t.me/kanal или @kanal.",
    label: "Ссылка на Telegram-канал",
  },
  en: {
    h: "One link. A whole marketing department.",
    sub: "Paste your Telegram channel link. Ten employees read it and, within a minute, return your voice, a week of posts and the places your customers are. You only approve.",
    cta: "Turn on the department",
    busy: "Turning on…",
    ph: "t.me/your_channel",
    sample: "See it on a sample channel",
    price: "7 days free, then 149,000 UZS a month",
    bad: "Use a link like t.me/channel or @channel.",
    label: "Telegram channel link",
  },
};

const LANGS: Lang[] = ["uz", "ru", "en"];

/** Accepts t.me/x, https://t.me/x, @x or a bare username. */
export function parseChannel(v: string): string | null {
  const m = v.trim().match(/^(?:https?:\/\/)?(?:t(?:elegram)?\.me\/(?:s\/)?|@)?([A-Za-z][A-Za-z0-9_]{3,31})\/?$/);
  return m ? m[1] : null;
}

export function Hero() {
  const router = useRouter();
  const id = useId();
  const [lang, setLang] = useState<Lang>("uz");
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const c = COPY[lang];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = parseChannel(value);
    if (!name) {
      setError(true);
      return;
    }
    setBusy(true);
    router.push(`/studio?demo=bir-havola&channel=${encodeURIComponent(`t.me/${name}`)}`);
  };

  const typed = parseChannel(value);
  return (
    <div className="flex flex-col">
      {/* The shop sign stays dark until there is a real channel to read: then it spells it. */}
      <LedStrip text={typed ? `@${typed.toUpperCase()}` : undefined} dot={3} gap={1.5} className="mb-6 max-w-[460px]" label={typed ? `@${typed}` : undefined} />
      <div role="radiogroup" aria-label="Til / Язык / Language" className="seg w-fit">
        {LANGS.map((l) => (
          <button key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => setLang(l)} className="seg__item !min-h-8 !px-3 !text-[13px] uppercase">
            {l}
          </button>
        ))}
      </div>

      <h1 lang={lang} className="mt-6 max-w-[14ch] text-balance text-[40px] font-semibold leading-[1] tracking-[-0.035em] sm:text-[64px]">
        {c.h}
      </h1>
      <p lang={lang} className="mt-4 max-w-[46ch] text-[16px] leading-[1.5] text-[var(--ink-2)] sm:text-[17px]">
        {c.sub}
      </p>

      <form id="havola" onSubmit={submit} noValidate className="mt-7 scroll-mt-24">
        <div className="field" data-invalid={error || undefined}>
          <Link2 className="h-5 w-5 shrink-0 text-[var(--ink-3)]" aria-hidden />
          <label htmlFor={id} className="sr-only">
            {c.label}
          </label>
          <input
            id={id}
            name="channel"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={c.ph}
            value={value}
            aria-invalid={error || undefined}
            aria-describedby={error ? `${id}-err` : undefined}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(false);
            }}
          />
          <button type="submit" disabled={busy} className="btn-lime !min-h-[50px] shrink-0 !px-5 max-[380px]:!px-4 max-[380px]:!text-[15px]">
            {busy ? c.busy : c.cta}
          </button>
        </div>
        <p id={`${id}-err`} role="alert" className="mt-2 min-h-5 px-2 text-[13px] text-[var(--bad)]">
          {error ? c.bad : ""}
        </p>
      </form>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-2 text-[13.5px]">
        <span className="text-[var(--ink-3)]">{c.price}</span>
        <Link href="/studio?demo=bir-havola&mock=1" className="text-[var(--ink)] underline decoration-[var(--hair-2)] underline-offset-4 hover:decoration-[var(--ink-2)]">
          {c.sample}
        </Link>
      </div>
    </div>
  );
}
