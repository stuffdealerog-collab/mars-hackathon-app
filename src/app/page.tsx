import Link from "next/link";
import { CalendarClock, Check, Send, ShieldCheck } from "lucide-react";
import { DepartmentRun } from "@/components/landing/DepartmentRun";
import { HeroCopy } from "@/components/landing/HeroCopy";
import { AGENTS, AGENT_ORDER, TG_BOT_URL } from "@/components/uslub/agents";
import { AgentAvatar } from "@/components/uslub/AgentAvatar";
import { GirihStar, Logo } from "@/components/uslub/Girih";

const SCRIPTS = [
  { label: "O'zbek lotin", text: "Qishki trikotaj keldi: 4 rang, S–XL." },
  { label: "Ўзбек кирилл", text: "Қишки трикотаж келди: 4 ранг, S–XL." },
  { label: "Русский", text: "Зимний трикотаж уже здесь: 4 цвета, S–XL." },
  { label: "English", text: "Winter knitwear is in: 4 colours, S–XL." },
];

const PLACES = [
  { name: "Chilonzor va Olmazor onalari", kind: "Telegram guruh", action: "Admin bilan −10% kod" },
  { name: "Toshkent chegirmalari", kind: "Telegram kanal", action: "26-noyabrga reklama post" },
  { name: "Uzum Market", kind: "Marketpleys", action: "10 ta xit mahsulotni joylash" },
];

const SCENES = [
  { s: 2, c: "1 palto" },
  { s: 3, c: "Ish uchun" },
  { s: 3, c: "Dam olish" },
  { s: 3, c: "Kechki" },
  { s: 4, c: "Narx" },
];

const RULES: { what: string; mode: "auto" | "approve" }[] = [
  { what: "Oddiy postlar: yangi mahsulot, maslahat, obraz", mode: "auto" },
  { what: "Aksiya va chegirmalar", mode: "approve" },
  { what: "Narx yozilgan har qanday post", mode: "approve" },
  { what: "Video va Reels", mode: "approve" },
  { what: "Yangi brendning birinchi 5 posti", mode: "approve" },
];

export default function Home() {
  return (
    <main className="uslub min-h-dvh">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Link href="/" aria-label="Uslub AI bosh sahifa">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 text-[15px] sm:gap-2">
          <Link href="/concept" className="hidden rounded-lg px-3 py-2 text-stone hover:text-ink sm:inline-block">
            Konsepsiya
          </Link>
          <Link href="/studio" className="rounded-lg px-3 py-2 font-semibold text-ink hover:bg-shell">
            Studiyani ochish
          </Link>
          <a
            href={TG_BOT_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 font-semibold text-paper hover:bg-lapis-deep"
          >
            <Send className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Telegram</span>
          </a>
        </nav>
      </header>

      {/* Hero: the killer feature */}
      <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-16 pt-6 sm:px-6 lg:grid-cols-[1.08fr_1fr] lg:items-center lg:gap-14 lg:pb-24 lg:pt-12">
        <HeroCopy />
        <DepartmentRun />
      </section>

      <div className="girih h-14 border-y border-sand" aria-hidden />

      {/* What you get in 60 seconds */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="max-w-2xl">
          <h2 className="font-display text-[1.9rem] font-semibold leading-tight tracking-[-0.03em] sm:text-[2.6rem]">
            60 soniyada nima olasiz
          </h2>
          <p className="mt-4 text-[17px] leading-relaxed text-stone">
            ChatGPT, tarjimon va Google Docs orasida yugurish shart emas. Marketologingiz bo&apos;lmasa ham, bo&apos;lim
            to&apos;liq ishlaydi: har bir xodim o&apos;z ishini qiladi va natijani sizga topshiradi.
          </p>
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-12">
          {/* Brand DNA */}
          <article className="rounded-3xl bg-ink p-6 text-paper sm:p-8 lg:col-span-5 lg:row-span-2">
            <div className="flex items-center gap-3">
              <AgentAvatar kind="brand" size={40} />
              <h3 className="font-display text-xl font-semibold">Brend DNK</h3>
            </div>
            <p className="mt-3 text-[15px] leading-relaxed text-paper/70">
              Kanalingizdagi postlardan ovozingizni o&apos;qiydi. Keyingi har bir matn shu kartaga qarab yoziladi.
            </p>
            <dl className="mt-6 divide-y divide-white/10 text-[15px]">
              {[
                ["Ohang", "Iliq, xotirjam, maqtanchoqliksiz"],
                ["Murojaat", "«Siz»"],
                ["Emoji", "Kam — postda 1–2 ta"],
                ["Post uzunligi", "~420 belgi"],
                ["Chaqiriq", "«@nafis_admin ga razmeringizni yozing»"],
                ["Yozmaydi", "«Ajoyib imkoniyat», taymerlar"],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:gap-4">
                  <dt className="w-32 shrink-0 text-paper/50">{k}</dt>
                  <dd className="text-paper">{v}</dd>
                </div>
              ))}
            </dl>
          </article>

          {/* Posts in 4 scripts */}
          <article className="rounded-3xl border border-sand bg-white p-6 sm:p-8 lg:col-span-7">
            <div className="flex items-center gap-3">
              <AgentAvatar kind="translator" size={40} />
              <h3 className="font-display text-xl font-semibold">1 haftalik post, 4 yozuvda</h3>
            </div>
            <ul className="mt-6 grid gap-2 sm:grid-cols-2">
              {SCRIPTS.map((s) => (
                <li key={s.label} className="rounded-2xl bg-shell px-4 py-3">
                  <span className="text-[13px] font-semibold text-turq">{s.label}</span>
                  <span className="mt-1 block text-[15px] leading-snug">{s.text}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[14px] text-stone">
              Muharrir «neyro-so&apos;zlar»ni olib tashlaydi va har bir postga inson balini qo&apos;yadi.
            </p>
          </article>

          {/* Radar */}
          <article className="rounded-3xl border border-sand bg-white p-6 sm:p-8 lg:col-span-4">
            <div className="flex items-center gap-3">
              <AgentAvatar kind="radar" size={40} />
              <h3 className="font-display text-xl font-semibold">Mijozlaringiz turgan 10 joy</h3>
            </div>
            <ul className="mt-5 flex flex-col divide-y divide-sand">
              {PLACES.map((p) => (
                <li key={p.name} className="py-3">
                  <span className="block text-[15px] font-semibold leading-snug">{p.name}</span>
                  <span className="block text-[13px] text-stone">
                    {p.kind}: {p.action}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[14px] text-stone">va yana 7 ta joy, har biri «nega» va «nima qilish» bilan.</p>
          </article>

          {/* Reels */}
          <article className="rounded-3xl bg-lapis p-6 text-white sm:p-8 lg:col-span-3">
            <div className="flex items-center gap-3">
              <AgentAvatar kind="video" size={40} ring />
              <h3 className="font-display text-xl font-semibold">Reels ssenariysi</h3>
            </div>
            <p className="mt-3 text-[15px] leading-snug text-white/80">«Bitta palto — uch xil obraz.»</p>
            <div className="mt-5 flex h-16 gap-1" aria-label="5 ta kadr, jami 15 soniya">
              {SCENES.map((sc, i) => (
                <div
                  key={i}
                  className="flex flex-col justify-end rounded-lg bg-white/15 px-1.5 py-1"
                  style={{ flex: sc.s }}
                >
                  <span className="text-[11px] font-semibold tabular-nums">{sc.s}s</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[13px] text-white/70">5 kadr · ovoz · subtitr · musiqa kayfiyati</p>
          </article>
        </div>
      </section>

      {/* The team */}
      <section className="border-t border-sand bg-shell/60">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="font-display text-[1.9rem] font-semibold leading-tight tracking-[-0.03em] sm:text-[2.6rem]">
              Jamoangiz
            </h2>
            <p className="max-w-md text-[17px] leading-relaxed text-stone">
              9 ta AI xodim — har birining o&apos;z vazifasi bor. Siz topshiriq berasiz, ular bir-biriga ish uzatadi.
            </p>
          </div>
          <ul className="mt-12 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            {AGENT_ORDER.map((role) => {
              const a = AGENTS[role];
              return (
                <li key={role} className="flex gap-4 border-t border-sand py-6">
                  <AgentAvatar kind={role} size={52} />
                  <div className="min-w-0">
                    <h3 className="text-[17px] font-bold leading-tight">{a.name}</h3>
                    <p className="text-[13px] text-stone">
                      {a.ru} / {a.en}
                    </p>
                    <p className="mt-2 text-[15px] leading-relaxed text-ink/80">{a.does}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* Human in the loop + autopilot rules */}
      <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-24">
        <div>
          <h2 className="font-display text-[1.9rem] font-semibold leading-tight tracking-[-0.03em] sm:text-[2.6rem]">
            Siz faqat tasdiqlaysiz
          </h2>
          <p className="mt-4 text-[17px] leading-relaxed text-stone">
            Muhim narsa sizning ruxsatingizsiz chiqmaydi. Oddiy kundalik postlarni avtopilotga qo&apos;yishingiz mumkin, narx,
            chegirma va video esa har doim tasdiqlash qutisiga tushadi.
          </p>
          <div className="mt-8 flex flex-col gap-4 text-[15px]">
            <p className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-turq" aria-hidden />
              <span>Bir bosishda tasdiqlash: matnni ko&apos;rasiz, tahrirlaysiz yoki kanalga joylaysiz.</span>
            </p>
            <p className="flex gap-3">
              <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-saffron" aria-hidden />
              <span>
                Jadval bo&apos;yicha avtopilot hozir beta holatda: qoidalarni sozlaysiz, avtomatik joylash hakatondan keyin
                ulanadi.
              </span>
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-sand bg-white p-2">
          <div className="flex items-center justify-between px-4 pb-2 pt-3">
            <h3 className="text-[15px] font-bold">Avtopilot qoidalari</h3>
            <span className="rounded-full bg-saffron-soft px-2.5 py-0.5 text-[12px] font-semibold text-ink">beta</span>
          </div>
          <ul className="divide-y divide-sand">
            {RULES.map((r) => (
              <li key={r.what} className="flex items-center justify-between gap-4 px-4 py-3.5">
                <span className="text-[15px] leading-snug">{r.what}</span>
                {r.mode === "auto" ? (
                  <span className="inline-flex shrink-0 items-center gap-2 text-[13px] font-semibold text-turq">
                    <span className="relative h-5 w-9 rounded-full bg-turq" aria-hidden>
                      <span className="absolute right-0.5 top-0.5 h-4 w-4 rounded-full bg-white" />
                    </span>
                    Avtopilot
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-2 text-[13px] font-semibold text-ink">
                    <span className="relative h-5 w-9 rounded-full bg-sand" aria-hidden>
                      <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white" />
                    </span>
                    Tasdiq kerak
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Pricing: one early MVP plan */}
      <section id="narx" className="border-t border-sand bg-shell/60">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-16 lg:py-24">
          <div>
            <h2 className="font-display text-[1.9rem] font-semibold leading-tight tracking-[-0.03em] sm:text-[2.6rem]">
              Narx
            </h2>
            <p className="mt-4 max-w-md text-[17px] leading-relaxed text-stone">
              Bitta tarif, hamma xodim ichida. Bu dastlabki narx: birinchi foydalanuvchilar uchun shunday qoladi.
            </p>
          </div>

          <div className="rounded-3xl border border-sand bg-white p-6 sm:p-8">
            <p className="font-display text-[1.6rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2rem]">
              7 kun bepul, keyin oyiga 149 000 so&apos;m
            </p>
            <p lang="ru" className="mt-2 text-[15px] text-stone">
              7 дней бесплатно, затем 149 000 сум/мес
            </p>
            <p lang="en" className="text-[15px] text-stone">
              7 days free, then 149,000 UZS/month
            </p>

            <ul className="mt-6 flex flex-col gap-2.5 border-t border-sand pt-6 text-[15px]">
              {[
                "9 ta AI xodim: brend xotirasidan mijoz radarigacha",
                "Postlar 4 yozuvda: lotin, kirill, rus, ingliz",
                "Telegram kanalga joylash, tasdig'ingiz bilan",
              ].map((x) => (
                <li key={x} className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-turq" strokeWidth={3} aria-hidden />
                  <span>{x}</span>
                </li>
              ))}
            </ul>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a
                href={TG_BOT_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-lapis px-5 py-3 font-semibold text-white hover:bg-lapis-deep"
              >
                <Send className="h-4 w-4" aria-hidden />7 kun bepul boshlash
              </a>
              <Link
                href="/studio"
                className="rounded-xl px-5 py-3 text-center font-semibold text-ink ring-1 ring-sand hover:bg-shell"
              >
                Avval studiyani ko&apos;rish
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="px-4 pb-10 sm:px-6">
        <div className="girih-night mx-auto flex w-full max-w-6xl flex-col items-start gap-8 overflow-hidden rounded-[28px] bg-night px-6 py-12 text-white sm:px-12 sm:py-16 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <GirihStar className="mt-1 hidden h-10 w-10 shrink-0 text-saffron sm:block" />
            <div>
              <h2 className="font-display text-[1.7rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.2rem]">
                Marketing bo&apos;limingiz bugun ishga tushadi
              </h2>
              <p className="mt-3 max-w-xl text-[16px] text-white/70">
                Kanal havolasini bering yoki botga yozing. Birinchi natijalar bir daqiqada tayyor.
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              href="/studio?demo=bir-havola"
              className="rounded-xl bg-saffron px-5 py-3 text-center font-semibold text-night hover:bg-[#f5b85a]"
            >
              Studiyani ochish
            </Link>
            <a
              href={TG_BOT_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold text-white ring-1 ring-white/25 hover:bg-white/10"
            >
              <Send className="h-4 w-4" aria-hidden />
              Telegram botda ochish
            </a>
          </div>
        </div>
        <footer className="mx-auto flex w-full max-w-6xl flex-col gap-2 py-8 text-[13px] text-stone sm:flex-row sm:justify-between">
          <span>MARS AI Hackathon · Toshkent, 2026</span>
          <span className="flex gap-4">
            <Link href="/concept" className="hover:text-ink">
              Konsepsiya
            </Link>
            <Link href="/studio" className="hover:text-ink">
              Studiya
            </Link>
          </span>
        </footer>
      </section>
    </main>
  );
}
