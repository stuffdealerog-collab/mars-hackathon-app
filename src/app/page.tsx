import { Send } from "lucide-react";
import Link from "next/link";
import { PanelDemo } from "@/components/concept/board/Live";
import { Hero } from "@/components/landing/Hero";
import { Mark } from "@/components/lamp/Mark";
import { Deck } from "@/components/lamp/Deck";
import { DnaCard } from "@/components/lamp/Dna";
import { LampTile } from "@/components/lamp/LampTile";
import { LAMP_ORDER } from "@/components/lamp/lamps";
import { TgPost } from "@/components/lamp/TgPost";
import { TG_BOT_URL } from "@/components/uslub/agents";

const SAMPLE_DNA: [string, string][] = [
  ["Murojaat", "«siz»"],
  ["Ohang", "iliq, do‘stona, qisqa"],
  ["Emoji", "postga 1–2 ta"],
  ["Uzunlik", "~740 belgi"],
  ["Chaqiriq", "«do‘konga keling»"],
];

const RULES: { name: string; hint: string; auto: boolean }[] = [
  { name: "Oddiy postlar", hint: "Maslahat, yangi mahsulot, mijoz obrazi", auto: true },
  { name: "Narx va aksiya", hint: "Matnda so‘m, foiz yoki chegirma bor", auto: false },
  { name: "Video", hint: "Reels va TikTok", auto: false },
  { name: "Birinchi 5 post", hint: "Yangi ovozni siz tekshirasiz", auto: false },
];

export default function Home() {
  return (
    <main className="lw min-h-dvh overflow-x-clip">
      <header className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-4 px-4 py-4 sm:px-8 sm:py-6">
        <Mark />
        <nav aria-label="Asosiy" className="flex items-center gap-1.5">
          <Link href="/studio" prefetch={false} className="inline-flex min-h-11 items-center rounded-full px-3.5 text-[14px] font-medium text-[var(--ink-2)] transition-colors duration-200 hover:text-[var(--ink)]">
            Studiya
          </Link>
          <a href={TG_BOT_URL} target="_blank" rel="noreferrer" aria-label="Telegram bot" className="btn-quiet !min-h-11 !px-3.5 !text-[14px]">
            <Send className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Telegram</span>
          </a>
        </nav>
      </header>

      {/* First viewport: the promise, the one field, and the department still dark. */}
      <section className="mx-auto grid w-full grid-cols-1 max-w-[1180px] gap-10 px-4 pb-16 pt-2 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:items-start lg:gap-16 lg:pb-24 lg:pt-8">
        <Hero />
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 lg:mt-14" aria-label="Bo‘lim xodimlari: havola berilganda yonadi">
          {LAMP_ORDER.map((r) => (
            <LampTile key={r} as="li" role={r} state="off" size="sm" showJob stateLabel={false} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="proof-h" className="border-t border-[var(--hair)]">
        <div className="mx-auto grid w-full grid-cols-1 max-w-[1180px] gap-10 px-4 py-16 sm:px-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16 lg:py-24">
          <div>
            <h2 id="proof-h" className="max-w-[16ch] text-balance text-[32px] font-semibold leading-[1.04] tracking-[-0.03em] sm:text-[44px]">
              Bir daqiqadan keyin nima ko‘rasiz
            </h2>
            <p className="mt-3 max-w-[46ch] text-[16px] leading-relaxed text-[var(--ink-2)]">
              Har bir chiroq bitta xodim. U ishlayotganda yonadi va natijani ichida ushlab turadi. Pastda o‘ylab topilgan kiyim do‘koni misolida, sizning kanalingizda raqamlar va postlar sizniki bo‘ladi.
            </p>
            <div className="mt-8">
              <PanelDemo cols="grid-cols-2" />
            </div>
          </div>
          <div className="flex flex-col gap-4 lg:pt-28">
            <TgPost
              name="Nafis kiyim"
              sample
              text={"Yangi kuzgi paltolar keldi — issiq, yengil va har kuni kiyishga qulay. 🧥\n\nO‘lchamingizni yozing, ertagacha olib qo‘yamiz."}
              time="20:00"
            />
            <p className="px-1 text-[13.5px] text-[var(--ink-2)]">Kopirayter yozdi, Muharrir neyro-so‘zlarni olib tashladi, Tarjimon kirill, rus va ingliz tiliga o‘girdi.</p>
            <DnaCard rows={SAMPLE_DNA} sample />
          </div>
        </div>
      </section>

      <section aria-labelledby="ok-h" className="border-t border-[var(--hair)]">
        <div className="mx-auto grid w-full grid-cols-1 max-w-[1180px] gap-10 px-4 py-16 sm:px-8 lg:grid-cols-2 lg:gap-16 lg:py-24">
          <div>
            <h2 id="ok-h" className="text-balance text-[32px] font-semibold leading-[1.04] tracking-[-0.03em] sm:text-[44px]">
              Siz faqat tasdiqlaysiz
            </h2>
            <p className="mt-3 max-w-[46ch] text-[16px] leading-relaxed text-[var(--ink-2)]">
              Tayyor ishlar navbatga tushadi: bitta karta, bitta qaror. Narx, aksiya, video va birinchi beshta post doim sizning «ha»ingizni kutadi.
            </p>
            <ul className="mt-8 divide-y divide-[var(--hair)] rounded-[22px] bg-[var(--glass)] px-5" style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}>
              {RULES.map((r) => (
                <li key={r.name} className="flex items-center gap-4 py-4">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">{r.name}</span>
                    <span className="block text-[13px] text-[var(--ink-2)]">{r.hint}</span>
                  </span>
                  <span className="text-right text-[13px] text-[var(--ink-2)]">{r.auto ? "o‘zi chiqadi, beta" : "tasdiq bilan"}</span>
                  <span aria-hidden className="switch pointer-events-none" data-on={r.auto}>
                    <span className="switch__knob" />
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="max-w-[420px] lg:pt-24">
            <Deck
              items={[
                { id: "1", why: "Narx bor, siz tasdiqlaysiz", time: "20:00", text: "Kuzgi palto 690 000 so‘m. Shu hafta do‘konda o‘lchab ko‘ring." },
                { id: "2", why: "Birinchi beshta postdan biri", time: "19:30", text: "Yangi kuzgi paltolar keldi — issiq, yengil va har kuni kiyishga qulay." },
                { id: "3", why: "Aksiya, siz tasdiqlaysiz", time: "18:00", text: "Juma kuni ikkinchi sharfga −30%. Faqat do‘konda." },
              ]}
              publishHref="#havola"
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="price-h" className="border-t border-[var(--hair)]">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-4 py-16 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:py-24">
          <div>
            <h2 id="price-h" className="max-w-[18ch] text-balance text-[32px] font-semibold leading-[1.04] tracking-[-0.03em] sm:text-[44px]">
              7 kun bepul. Keyin oyiga 149 000 so‘m.
            </h2>
            <p className="mt-3 max-w-[50ch] text-[16px] leading-relaxed text-[var(--ink-2)]">
              Bitta tarif: 10 xodim, to‘rt yozuvda postlar, kanal tahlili, mijoz radar va Telegramga joylash.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="#havola" className="btn-lime">Havolani qo‘yish</a>
            <a href={TG_BOT_URL} target="_blank" rel="noreferrer" className="btn-quiet">
              <Send className="h-4 w-4" aria-hidden /> Telegram bot
            </a>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-3 border-t border-[var(--hair)] px-4 py-6 text-[13px] text-[var(--ink-3)] sm:px-8">
        <Mark />
        <span>MARS AI Hackathon, Toshkent, 2026</span>
      </footer>
    </main>
  );
}
