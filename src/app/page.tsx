import type { AgentRole } from "@/lib/uslub/contract";
import { Check, Send } from "lucide-react";
import Link from "next/link";
import { HeroCopy } from "@/components/landing/HeroCopy";
import { HeroDeck } from "@/components/landing/HeroDeck";
import { OrbMenu } from "@/components/landing/OrbMenu";
import { Ticker } from "@/components/landing/Ticker";
import { GRAD, TG_BOT_URL } from "@/components/uslub/agents";
import { DotMatrix } from "@/components/uslub/DotMatrix";
import { Logo } from "@/components/uslub/Girih";
import { glowBg } from "@/components/uslub/GlowCard";
import { Orb } from "@/components/uslub/Orb";

const g = (k: AgentRole, s = 0.9, at?: string) => glowBg(GRAD[k][0], GRAD[k][1], s, at);

const RULES = [
  { name: "Oddiy postlar", hint: "Maslahat, yangi mahsulot, mijoz obrazi", auto: true },
  { name: "Aksiya va chegirmalar", hint: "Foiz, muddatli takliflar", auto: false },
  { name: "Narxlar", hint: "Matnda so'm yoki narx bor", auto: false },
  { name: "Video", hint: "Reels va TikTok", auto: false },
  { name: "Birinchi 5 post", hint: "Yangi brend ovozini siz tekshirasiz", auto: false },
];

export default function Home() {
  return (
    <main className="uslub min-h-dvh overflow-x-clip">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Logo light />
        <nav aria-label="Asosiy" className="flex items-center gap-1 text-[14px]">
          <Link href="/studio" className="rounded-full px-3 py-2 font-semibold text-fog hover:bg-white/[.06]">
            Studiya
          </Link>
          <Link href="/concept" className="hidden rounded-full px-3 py-2 text-mute hover:text-fog sm:inline-block">
            Konsepsiya
          </Link>
          <a href={TG_BOT_URL} target="_blank" rel="noreferrer" className="pill-ghost ml-1 px-3.5 py-2 text-[13px]">
            <Send className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Telegram</span>
          </a>
        </nav>
      </header>

      {/* Hero: the killer feature */}
      <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pb-20 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:pt-14">
        <HeroCopy />
        <HeroDeck />
      </section>

      {/* What you get in 60 seconds */}
      <section aria-labelledby="out-h" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <h2 id="out-h" className="max-w-xl text-[2rem] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[2.6rem]">
            60 soniyada nima olasiz
          </h2>
          <p className="max-w-sm text-[15px] text-mute">Bir havoladan. Kanalingizda allaqachon bor narsalardan.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <article className="relative flex min-h-[260px] flex-col justify-between overflow-hidden rounded-[32px] p-6 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)] sm:col-span-2" style={{ background: g("copywriter") }}>
            <div className="flex items-start justify-between">
              <span className="text-[15px] font-bold text-[#0b0b0e]">Bir haftalik postlar</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#0b0b0e]/65">Kopirayter · Tarjimon</span>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Ticker to={7} dot={8} gap={3} label="7 ta post" />
                <p className="mt-3 text-[14px] text-white/80">sizning ovozingizda, 4 yozuvda</p>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[13px]">
                {["O'zbek lotin", "Ўзбек кирилл", "Русский", "English"].map((s) => (
                  <span key={s} className="rounded-full bg-black/40 px-3 py-1.5 font-semibold text-fog">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </article>

          <article className="flex min-h-[260px] flex-col justify-between overflow-hidden rounded-[32px] p-6 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]" style={{ background: g("radar") }}>
            <span className="text-[15px] font-bold text-[#0b0b0e]">Mijozlaringiz turgan joylar</span>
            <div>
              <Ticker to={10} dot={7} gap={3} label="10 ta joy" />
              <p className="mt-3 text-[14px] text-white/80">kanallar, guruhlar, bloggerlar — har biriga aniq qadam</p>
            </div>
          </article>

          <article className="flex min-h-[260px] flex-col justify-between overflow-hidden rounded-[32px] p-6 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]" style={{ background: g("editor") }}>
            <span className="text-[15px] font-bold text-fog">Inson bali</span>
            <div>
              <Ticker to={94} dot={7} gap={3} label="Inson bali 94" />
              <p className="mt-3 text-[14px] text-white/80">neyro-so&apos;zlar olib tashlangan, matn odamday</p>
            </div>
          </article>

          <article className="flex min-h-[220px] flex-col justify-between overflow-hidden rounded-[32px] p-6 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]" style={{ background: g("brand", 0.85) }}>
            <span className="text-[15px] font-bold text-[#0b0b0e]">Brend DNK</span>
            <p className="text-[14px] leading-relaxed text-white/85">Ohang, «siz» yoki «sen», emoji, post uzunligi, chaqiriq uslubi — kanalingizdan o&apos;qiladi.</p>
          </article>

          <article className="flex min-h-[220px] flex-col justify-between overflow-hidden rounded-[32px] p-6 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]" style={{ background: g("analyst", 0.85) }}>
            <span className="text-[15px] font-bold text-[#0b0b0e]">Kanal tahlili</span>
            <div>
              <Ticker to={27} suffix="%" dot={6} gap={3} label="27% qamrov" />
              <p className="mt-3 text-[14px] text-white/80">qamrov, eng yaxshi soatlar, raqobatchilar</p>
            </div>
          </article>

          <article className="flex min-h-[220px] flex-col justify-between overflow-hidden rounded-[32px] p-6 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)] sm:col-span-2" style={{ background: g("video", 0.85, "0% 0%") }}>
            <div className="flex items-start justify-between">
              <span className="text-[15px] font-bold text-[#0b0b0e]">Reels ssenariysi</span>
              <DotMatrix value="0:15" dot={5} gap={2} color="#0b0b0e" off="rgba(0,0,0,.12)" label="15 soniya" />
            </div>
            <ol className="grid grid-cols-5 gap-1.5" aria-label="Kadrlar">
              {["1 palto", "Ish uchun", "Dam olish", "Kechki", "Narx"].map((s, i) => (
                <li key={s} className="rounded-2xl bg-black/45 px-2 py-3 text-center">
                  <span className="block font-mono text-[10px] text-white/55">{[2, 3, 3, 3, 4][i]}s</span>
                  <span className="mt-1 block text-[11px] font-semibold leading-tight text-fog sm:text-[12px]">{s}</span>
                </li>
              ))}
            </ol>
          </article>
        </div>
      </section>

      {/* Team: radial orb menu */}
      <section aria-labelledby="team-h" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="mb-6 max-w-2xl">
          <h2 id="team-h" className="text-[2rem] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[2.6rem]">
            Sizning marketing bo&apos;limingiz
          </h2>
          <p className="mt-3 text-[16px] text-mute">
            O&apos;nta AI xodim, har birining bitta ishi bor. Markazda — siz: topshiriq berasiz va tasdiqlaysiz.
          </p>
        </div>
        <OrbMenu />
      </section>

      {/* Human in the loop + autopilot rules */}
      <section aria-labelledby="ok-h" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
          <div>
            <h2 id="ok-h" className="text-[2rem] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[2.6rem]">
              Siz faqat tasdiqlaysiz
            </h2>
            <p className="mt-4 max-w-md text-[16px] leading-relaxed text-mute">
              Oddiy postlar jadval bo&apos;yicha o&apos;zi chiqishi mumkin. Aksiya, narx, video va yangi brendning birinchi postlari esa
              doim tasdiqlash qutisiga tushadi — bir bosishda tasdiqlaysiz.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <Orb kind="approval" size={40} glow />
              <span className="text-[14px] text-fog">Hech narsa sizsiz joylanmaydi, agar o&apos;zingiz ruxsat bermasangiz.</span>
            </div>
          </div>

          <div className="overflow-hidden rounded-[32px] shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]" style={{ background: glowBg("#3b5bff", "#7c3aed", 0.55, "100% 0%") }}>
            <div className="flex items-center justify-between px-6 pt-5">
              <span className="text-[15px] font-bold">Avtopilot qoidalari</span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-fog">Jadval · beta</span>
            </div>
            <ul className="mt-3 divide-y divide-white/[.07] px-2 pb-2">
              {RULES.map((r) => (
                <li key={r.name} className="flex items-center gap-4 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold text-fog">{r.name}</div>
                    <div className="text-[13px] text-mute">{r.hint}</div>
                  </div>
                  <span className={`hidden font-mono text-[10px] uppercase tracking-[0.08em] sm:inline ${r.auto ? "text-ok" : "text-wait"}`}>
                    {r.auto ? "Avtopilot" : "Tasdiq bilan"}
                  </span>
                  <span aria-hidden className={`relative h-6 w-11 shrink-0 rounded-full ${r.auto ? "bg-lime" : "bg-white/15"}`}>
                    <span className={`absolute top-1 h-4 w-4 rounded-full ${r.auto ? "right-1 bg-void" : "left-1 bg-white/70"}`} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="narx" aria-labelledby="price-h" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="relative overflow-hidden rounded-[40px] p-6 shadow-[inset_0_0_0_1px_rgba(255,255,255,.1)] sm:p-10" style={{ background: glowBg("#d7ff3a", "#16b364", 0.75, "15% 0%") }}>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-end">
            <div>
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#0b0b0e]/70">Erta narx · bitta tarif</span>
              <h2 id="price-h" className="mt-3 text-[2rem] font-extrabold leading-[1.05] tracking-[-0.035em] text-[#0b0b0e] sm:text-[2.6rem]">
                7 kun bepul, keyin oyiga 149 000 so&apos;m
              </h2>
              <div className="mt-6">
                <DotMatrix value="149 000" dot={6} gap={3} label="149 000 so'm oyiga" />
                <span className="mt-2 block font-mono text-[11px] uppercase tracking-[0.08em] text-white/60">so&apos;m / oy</span>
              </div>
              <p className="mt-5 text-[14px] text-white/70" lang="ru">7 дней бесплатно, затем 149 000 сум/мес</p>
              <p className="text-[14px] text-white/70" lang="en">7 days free, then 149,000 UZS/month</p>
            </div>
            <div>
              <ul className="space-y-2.5 text-[15px] text-fog">
                {["10 ta AI xodim", "Postlar 4 yozuvda", "Kanal tahlili va mijoz radar", "Telegramga joylash"].map((f) => (
                  <li key={f} className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-lime" strokeWidth={3} aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex flex-wrap gap-2">
                <a href={TG_BOT_URL} target="_blank" rel="noreferrer" className="pill-lime px-6 py-3.5 text-[15px]">
                  7 kun bepul boshlash
                </a>
                <Link href="/studio" className="pill-ghost px-5 py-3.5 text-[15px]">
                  Studiyani ochish
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 text-center sm:px-6">
        <h2 className="mx-auto max-w-2xl text-[2rem] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[2.8rem]">
          Kanalingiz havolasini bering — qolganini bo&apos;lim qiladi
        </h2>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Link href="/studio?demo=bir-havola" className="pill-lime px-7 py-4 text-[16px]">
            Bo&apos;limni ishga tushirish
          </Link>
          <a href={TG_BOT_URL} target="_blank" rel="noreferrer" className="pill-ghost px-6 py-4 text-[16px]">
            <Send className="h-4 w-4" aria-hidden />
            Telegram bot
          </a>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-white/[.07] px-4 py-6 sm:px-6">
        <Logo light />
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-dim">MARS AI Hackathon · Toshkent, 2026</span>
      </footer>
    </main>
  );
}
