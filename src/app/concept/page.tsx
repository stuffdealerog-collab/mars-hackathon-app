import { AuditWidget, StrategyWidget } from "@/components/concept/BrainWidgets";
import { LiveCanvas } from "@/components/concept/LiveCanvas";
import { ReviewDemo } from "@/components/concept/ReviewDemo";
import { MOCK_BRAND, MOCK_LEADS, MOCK_VIDEO } from "@/components/studio/mocks";
import { RULES } from "@/components/studio/store";
import { AGENT_ORDER, AGENTS, GRAD, TG_BOT_URL } from "@/components/uslub/agents";
import { DotMatrix } from "@/components/uslub/DotMatrix";
import { GlowCard } from "@/components/uslub/GlowCard";
import { Logo } from "@/components/uslub/Girih";
import { Orb } from "@/components/uslub/Orb";
import type { AgentRole } from "@/lib/uslub/contract";
import { ArrowUp, Check, Hourglass, Loader2, Send, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Konsepsiya" };

function Section({
  n,
  id,
  title,
  lead,
  children,
}: {
  n: number;
  id: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 py-14 sm:py-20">
      <div className="mb-8 max-w-3xl">
        <span className="font-mono text-[12px] tabular-nums text-dim">{String(n).padStart(2, "0")}</span>
        <h2 className="mt-2 text-[28px] font-bold leading-[1.1] tracking-[-0.02em] sm:text-[40px]">{title}</h2>
        {lead && <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-mute">{lead}</p>}
      </div>
      {children}
    </section>
  );
}

const QUOTES: { who: string; text: string; grad: [string, string] }[] = [
  {
    who: "Marketing direktori, tashkilotchi kompaniya",
    text: "Bitta servis kerak: qanday o'ylashimni o'rgansin va «yozish → tarjima → joylash» ishini o'zi qilsin, men faqat topshiriq beray.",
    grad: GRAD.strategist,
  },
  { who: "SMM mutaxassisi", text: "Mahsulot videolari kerak, lekin AI'ning sun'iy, bir xil ko'rinishisiz.", grad: GRAD.video },
  {
    who: "Marketolog",
    text: "Mahalliy bozor bo'yicha ma'lumot yo'q: qaysi kanal, guruh yoki blogger ishlaydi — taxmin qilamiz.",
    grad: GRAD.analyst,
  },
  { who: "Startap asoschilari", text: "Eng qiyini — mijoz topish. Kontentni bir amallab yozamiz.", grad: GRAD.copywriter },
];

const PRINCIPLES = [
  { t: "Bosqichma-bosqich ochilish", d: "Avval bitta maydon: «Topshiriq bering». Kanvas — ikkinchi qatlam, kim nima qilayotganini ko'rmoqchi bo'lganlar uchun." },
  { t: "Inson nazoratida", d: "Aksiya, narx, video va yangi brendning birinchi 5 posti faqat sizning tasdig'ingizdan keyin chiqadi." },
  { t: "Raqamlar — faqat haqiqiy", d: "Har bir xulosa, KPI va dalil kanal statistikasidan, bilimlar bazasidan yoki manbali qidiruvdan olinadi. To'qima raqam yo'q." },
  { t: "AI-shlakka qarshi", d: "Muharrir neyro-so'zlarni belgilaydi va almashtiradi; har post yonida inson bali turadi." },
  { t: "Telefon birinchi", d: "Mijozlar Telegram Mini App'da: kanvas kichik ekranda vertikal qadamlar ro'yxatiga aylanadi." },
  { t: "4 yozuv, bitta ohang", d: "O'zbek lotin, o'zbek kirill, rus va ingliz — bir xil brend ovozida, alohida tekshiruv bilan." },
];

const STACK = [
  ["Next.js 16 App Router", "Sahifalar, API route'lar, Vercel fra1"],
  ["React 19 + Tailwind 4", "Interfeys va dizayn tokenlari"],
  ["@xyflow/react", "Bo'lim kanvasi (node graf)"],
  ["motion", "Prujinali animatsiyalar, kartalar to'plami"],
  ["zustand", "Studiya holati, avtopilot qoidalari"],
  ["Neon Postgres", "Brend profillari, postlar, statistika"],
  ["grammY + Mini App", "Telegram bot, Telegram orqali joylash"],
  ["Claude (Anthropic)", "Xodimlar: yozish, tahrir, tarjima, reja"],
  ["Miya agenti", "/api/uslub/analyze va /api/uslub/strategy"],
] as const;

const GOAL_DOT: Record<string, string> = { done: "#3be08a", running: "#D7FF3A", wait: "#ffb547", idle: "rgba(255,255,255,.3)" };

export default function ConceptPage() {
  return (
    <main className="uslub min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-edge bg-void/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" aria-label="Bosh sahifa">
            <Logo light />
          </Link>
          <nav className="flex items-center gap-2 text-[14px]">
            <Link href="/" className="hidden px-3 py-2 text-mute hover:text-fog sm:inline">
              Bosh sahifa
            </Link>
            <Link href="/studio" className="pill-lime px-4 py-2 text-[14px]">
              Studiyani ochish
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* ------------------------------------------------------------ hero */}
        <section className="pb-6 pt-12 sm:pt-20">
          <p className="mono-label">Konsepsiya · yo&apos;nalishni tasdiqlash uchun</p>
          <h1 className="mt-4 max-w-4xl text-[40px] font-bold leading-[1.02] tracking-[-0.035em] sm:text-[72px]">
            Uslub AI — sizning marketing bo&apos;limingiz
          </h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-mute">
            Marketologi yo&apos;q kichik biznes egasi uchun. Topshiriq berasiz — 10 ta AI xodim tahlil qiladi, reja tuzadi, yozadi,
            tarjima qiladi va siz tasdiqlagan narsani Telegramga joylaydi.
          </p>
          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { v: "10", l: "AI xodim", g: GRAD.strategist },
              { v: "4", l: "yozuv: UZ lotin, kirill, RU, EN", g: GRAD.translator },
              { v: "60", l: "soniyada butun bo'lim ishga tushadi", g: GRAD.analyst },
            ].map((k) => (
              <GlowCard key={k.l} from={k.g[0]} to={k.g[1]} strength={0.55} className="flex min-h-[170px] flex-col justify-between p-6">
                <DotMatrix value={k.v} dot={6} gap={2.5} />
                <span className="text-[14px] font-semibold text-fog/90">{k.l}</span>
              </GlowCard>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------------ 1 problem */}
        <Section
          n={1}
          id="muammo"
          title="Muammo: marketing besh xil vositada tarqalib ketgan"
          lead="ChatGPT, Gemini, tarjimon, Google Docs va Telegram orasida ko'chirib-qo'yish. Hackathon joyida o'tkazgan suhbatlarimizdan:"
        >
          <div className="grid gap-3 md:grid-cols-2">
            {QUOTES.map((q, i) => (
              <GlowCard
                key={q.who}
                from={q.grad[0]}
                to={q.grad[1]}
                strength={i === 0 ? 0.6 : 0.38}
                at="0% 0%"
                className={`flex flex-col justify-between p-6 ${i === 0 ? "md:row-span-2 md:min-h-[360px]" : "min-h-[170px]"}`}
              >
                <p className={`${i === 0 ? "text-[24px] sm:text-[30px]" : "text-[18px]"} font-semibold leading-snug tracking-tight`}>
                  «{q.text}»
                </p>
                <span className="mono-label mt-6 text-fog/70">{q.who}</span>
              </GlowCard>
            ))}
          </div>
        </Section>

        {/* ------------------------------------------------------------ 2 idea */}
        <Section
          n={2}
          id="goya"
          title="G'oya: topshiriq bering, bo'lim bajaradi"
          lead="Asosiy foydalanuvchi — marketologi yo'q kichik biznes egasi yoki startap asoschisi. Agentliklar emas. U vositalar bilan emas, xodimlar bilan gaplashadi."
        >
          <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div className="rounded-[36px] bg-surface p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)] sm:p-7">
              <div className="mono-label">Studiyaning birinchi ekrani</div>
              <div className="mt-4 flex items-end gap-2 rounded-[24px] bg-surface-2 p-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
                <p className="flex-1 px-3 py-2.5 text-[15px] text-mute">Black Friday uchun 1 haftalik kontent va Reels</p>
                <span className="pill-lime h-11 w-11 shrink-0" aria-hidden>
                  <ArrowUp className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {["Bir havola", "Haftalik kontent", "Aksiya", "Mijoz qidirish", "Reels"].map((t) => (
                  <span key={t} className="rounded-full bg-white/6 px-3 py-1 text-[13px] text-fog/80 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
                    {t}
                  </span>
                ))}
              </div>
              <div className="mt-5 rounded-[24px] bg-surface-2 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]">
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-bold">Tasdiqlash qutisi</span>
                  <span className="rounded-full bg-wait px-2 text-[12px] font-extrabold text-black">3</span>
                </div>
                <ul className="mt-3 space-y-2 text-[13px]">
                  {[
                    ["Black Friday e'loni", "Tasdiq kutmoqda", "wait"],
                    ["Reels: bitta palto — uch obraz", "Tasdiq kutmoqda", "wait"],
                    ["Razmer bo'yicha maslahat", "Avtopilot · jadvalda (beta)", "done"],
                  ].map(([t, s, k]) => (
                    <li key={t} className="flex items-center justify-between gap-3">
                      <span className="truncate">{t}</span>
                      <span className="shrink-0 font-mono text-[11px]" style={{ color: GOAL_DOT[k] }}>
                        {s}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <ol className="space-y-4">
              {[
                ["Topshiriq", "Egasi oddiy so'zlar bilan yozadi yoki kanal havolasini tashlaydi."],
                ["Bo'lim ishlaydi", "Strateg ishni xodimlarga bo'ladi; kanvasda har bir xodim ishlayotgani ko'rinadi."],
                ["Tasdiqlash", "Tayyor ishlar qutiga tushadi. Bir bosishda tasdiqlash yoki tahrirlash."],
                ["Joylash", "SMM-menejer Telegramga joylaydi. Oddiy postlar — avtopilotda (beta)."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-4">
                  <span className="font-mono text-[12px] text-dim">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <div className="text-[17px] font-bold">{t}</div>
                    <p className="mt-0.5 text-[14.5px] leading-relaxed text-mute">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Section>

        {/* ------------------------------------------------------------ 3 team */}
        <Section n={3} id="jamoa" title="Jamoa: 10 ta AI xodim" lead="Har bir rol — bitta xodim va o'z gradienti. Egasi ularni ismi bilan taniydi va natijasini ko'radi.">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {AGENT_ORDER.map((r: AgentRole) => {
              const a = AGENTS[r];
              const [g1, g2] = GRAD[r];
              return (
                <li key={r}>
                  <GlowCard from={g1} to={g2} strength={0.32} className="flex h-full flex-col p-5">
                    <Orb kind={r} size={52} />
                    <div className="mt-4 text-[16px] font-bold">{a.name}</div>
                    <div className="font-mono text-[11px] text-mute">
                      {a.ru} · {a.en}
                    </div>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-fog/80">{a.does}</p>
                  </GlowCard>
                </li>
              );
            })}
          </ul>
        </Section>

        {/* ------------------------------------------------------------ 4 canvas */}
        <Section
          n={4}
          id="kanvas"
          title="Node tizimi: bo'limingiz qanday ishlaydi"
          lead="Kanvas — ikkinchi qatlam. Har bir tugun — xodim: orb, rol, holat va natijaning qisqa ko'rinishi. Ish boshlanganda tugun gradient bilan yonadi, ma'lumot o'tganda chiziq bo'ylab nur yuguradi."
        >
          <LiveCanvas />
          <div className="mt-5 flex flex-wrap gap-2 text-[13px]">
            {[
              ["Navbatda", "idle"],
              ["Ishlayapti", "running"],
              ["Tayyor", "done"],
              ["Tasdiq kutmoqda", "wait"],
            ].map(([t, k]) => (
              <span key={t} className="inline-flex items-center gap-2 rounded-full bg-white/6 px-3 py-1.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
                <span className="h-2 w-2 rounded-full" style={{ background: GOAL_DOT[k], boxShadow: k === "running" ? "0 0 10px #D7FF3A" : undefined }} />
                {t}
              </span>
            ))}
          </div>
        </Section>

        {/* ------------------------------------------------------------ 5 brain */}
        <Section
          n={5}
          id="miya"
          title="Miya: Tahlil va Strategiya"
          lead="Analitik kanalingizning haqiqiy raqamlarini va raqobatchilarni o'qiydi; Strateg shu asosda pozitsiya, ustunlar va haftalik reja tuzadi. Qoida: har bir raqam haqiqiy ma'lumotdan — hech qachon to'qilmaydi."
        >
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <AuditWidget />
            <StrategyWidget />
          </div>
          <p className="mt-3 font-mono text-[11px] text-dim">Namuna: o&apos;ylab topilgan «Nafis» do&apos;koni. Jonli rejimda raqamlar kanalning o&apos;zidan olinadi.</p>
        </Section>

        {/* ------------------------------------------------------------ 6 screens */}
        <Section n={6} id="ekranlar" title="Asosiy ekranlar" lead="Bular — ishlaydigan komponentlar, rasm emas. Neyro-so'z ustiga bosing.">
          <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
            <div className="rounded-[36px] bg-surface p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)] sm:p-6">
              <div className="mb-4 flex items-baseline justify-between gap-2">
                <h3 className="text-[18px] font-bold">Postni ko&apos;rib chiqish</h3>
                <span className="mono-label">4 yozuv · inson bali</span>
              </div>
              <ReviewDemo />
            </div>
            <GlowCard from={GRAD.brand[0]} to={GRAD.brand[1]} strength={0.4} className="p-5 sm:p-6">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-[18px] font-bold">Brend DNK</h3>
                <span className="mono-label text-fog/70">{MOCK_BRAND.channel}</span>
              </div>
              <p className="mt-1 text-[14px] text-fog/80">{MOCK_BRAND.dna.oneLiner}</p>
              <dl className="mt-4 divide-y divide-white/8 text-[13.5px]">
                {[
                  ["Ohang", MOCK_BRAND.dna.tone],
                  ["Murojaat", "«Siz»"],
                  ["Emoji", "Kam (1–2)"],
                  ["Uzunlik", `~${MOCK_BRAND.dna.avgPostLength} belgi`],
                  ["CTA", MOCK_BRAND.dna.ctaStyle],
                ].map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[92px_1fr] gap-3 py-2">
                    <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-mute">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
                <div>
                  <div className="font-bold text-ok">Qiling</div>
                  <ul className="mt-1 space-y-0.5 text-fog/80">
                    {MOCK_BRAND.dna.doList.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="font-bold text-coral">Qilmang</div>
                  <ul className="mt-1 space-y-0.5 text-fog/80">
                    {MOCK_BRAND.dna.dontList.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </GlowCard>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-[36px] bg-surface p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)] sm:p-6">
              <div className="flex items-center gap-3">
                <Orb kind="radar" size={36} />
                <h3 className="text-[18px] font-bold">Mijoz radar</h3>
              </div>
              <ul className="mt-4 space-y-2">
                {MOCK_LEADS.slice(0, 4).map((l) => (
                  <li key={l.name} className="rounded-[20px] bg-surface-2 p-3.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]">
                    <div className="text-[14.5px] font-bold">{l.name}</div>
                    <p className="mt-0.5 text-[13px] text-mute">{l.why}</p>
                    <p className="mt-2 text-[13px]">
                      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-lime">Qadam</span> {l.action}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-[36px] bg-surface p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)] sm:p-6">
              <div className="flex items-center gap-3">
                <Orb kind="video" size={36} />
                <h3 className="text-[18px] font-bold">Videograf: Reels ssenariysi</h3>
              </div>
              <GlowCard from={GRAD.video[0]} to={GRAD.video[1]} strength={0.45} className="mt-4 p-4">
                <span className="mono-label text-fog/70">Hook · birinchi 2 soniya</span>
                <p className="mt-1 text-[18px] font-bold leading-snug">«{MOCK_VIDEO.hook}»</p>
              </GlowCard>
              <ol className="mt-3 space-y-1.5">
                {MOCK_VIDEO.scenes.map((s, i) => {
                  const from = MOCK_VIDEO.scenes.slice(0, i).reduce((a, x) => a + x.seconds, 0);
                  return (
                    <li key={i} className="grid grid-cols-[58px_1fr] gap-3 rounded-[16px] bg-surface-2 px-3 py-2 text-[13px]">
                      <span className="font-mono text-[11.5px] tabular-nums text-lime">
                        {from}–{from + s.seconds}s
                      </span>
                      <span>
                        {s.visual} <span className="text-mute">· «{s.voiceover}»</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
          <Link href="/studio" className="pill-ghost mt-5 px-5 py-2.5 text-[14px]">
            To&apos;liq prototip: /studio
          </Link>
        </Section>

        {/* ------------------------------------------------------------ 7 killer */}
        <Section
          n={7}
          id="bir-havola"
          title="Asosiy funksiya: bir havola — butun marketing bo'limi"
          lead="Telegram kanal havolasini tashlaysiz — taxminan 60 soniyada butun bo'lim kanvasda ishlaydi. Reels va TikTok reklamasi uchun ekrandan yozib olinadigan qilib qurilgan."
        >
          <GlowCard from="#D7FF3A" to="#16B364" strength={0.28} at="50% 100%" className="p-5 sm:p-8">
            <div className="flex items-center gap-2 rounded-full bg-black/50 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,.1)]">
              <Send className="h-4 w-4 text-mute" />
              <span className="flex-1 truncate font-mono text-[14px]">t.me/sizning_kanal</span>
              <span className="pill-lime px-4 py-1.5 text-[13px]">Ishga tushirish</span>
            </div>
            <ol className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              {(
                [
                  ["brand", "0–18 s", "Brend DNK"],
                  ["analyst", "18 s", "60 post tahlili"],
                  ["strategist", "25 s", "Strategiya"],
                  ["copywriter", "30 s", "Haftalik postlar"],
                  ["editor", "38 s", "Neyro-so'zlarsiz"],
                  ["translator", "42 s", "4 yozuv"],
                  ["radar", "50 s", "10 ta joy"],
                  ["video", "55 s", "Reels ssenariy"],
                ] as [AgentRole, string, string][]
              ).map(([r, t, out]) => (
                <li key={r} className="flex flex-col items-start gap-2 rounded-[22px] bg-black/45 p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,.07)]">
                  <Orb kind={r} size={34} />
                  <span className="font-mono text-[11px] text-lime">{t}</span>
                  <span className="text-[13px] font-semibold leading-tight">{out}</span>
                </li>
              ))}
            </ol>
            <div className="mt-5 flex flex-wrap items-center gap-3 text-[14px] text-fog/85">
              <Hourglass className="h-4 w-4 text-wait" /> Hammasi Tasdiqlash qutisiga tushadi — hech narsa sizsiz joylanmaydi.
            </div>
          </GlowCard>
        </Section>

        {/* ------------------------------------------------------------ 8 publishing */}
        <Section
          n={8}
          id="nashr"
          title="Nashr: avtopilot va tasdiq aralash"
          lead="Oddiy postlar jadval bo'yicha o'zi chiqishi mumkin. Nozik narsalar har doim Tasdiqlash qutisi orqali o'tadi."
        >
          <div className="grid items-start gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="overflow-hidden rounded-[32px] bg-surface shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
              <div className="flex items-center justify-between px-5 py-4">
                <span className="text-[16px] font-bold">Avtopilot qoidalari</span>
                <span className="rounded-full bg-white/8 px-2 py-0.5 font-mono text-[10.5px] text-mute">beta</span>
              </div>
              <ul className="divide-y divide-white/6">
                {RULES.map((r) => {
                  const auto = r.key === "routine";
                  return (
                    <li key={r.key} className="flex items-center gap-4 px-5 py-3.5">
                      <div className="min-w-0 flex-1">
                        <div className="text-[14.5px] font-semibold">{r.name}</div>
                        <div className="text-[12.5px] text-mute">{r.hint}</div>
                      </div>
                      <span className={`font-mono text-[11px] ${auto ? "text-ok" : "text-wait"}`}>{auto ? "Avtopilot" : "Tasdiq bilan"}</span>
                      <span aria-hidden className={`relative h-6 w-10 shrink-0 rounded-full ${auto ? "bg-ok" : "bg-white/12"}`}>
                        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white ${auto ? "right-1" : "left-1"}`} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="space-y-3">
              <div className="rounded-[28px] bg-surface p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
                <div className="flex items-center gap-2 text-[15px] font-bold">
                  <Send className="h-4 w-4 text-lime" /> Veb-studiyadan
                </div>
                <p className="mt-1.5 text-[14px] leading-relaxed text-mute">
                  «Telegramga joylash» botga olib o&apos;tadi:{" "}
                  <span className="break-all font-mono text-[12px] text-fog/85">t.me/hackathonproj1_bot?start=publish_&lt;id&gt;</span>. Bot sizni Telegram
                  orqali tasdiqlaydi va kanalga joylaydi.
                </p>
              </div>
              <div className="rounded-[28px] bg-surface p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
                <div className="flex items-center gap-2 text-[15px] font-bold">
                  <Smartphone className="h-4 w-4 text-lime" /> Mini App ichida
                </div>
                <p className="mt-1.5 text-[14px] leading-relaxed text-mute">Telegram ichida ochilgan ilova to&apos;g&apos;ridan-to&apos;g&apos;ri joylaydi — kirish Telegram ma&apos;lumotlari bilan tekshiriladi.</p>
              </div>
              <p className="px-1 text-[13px] text-dim">Jadval bo&apos;yicha avtomatik joylash hackathondan keyin ulanadi; hozircha qoidalar Studiyada saqlanadi.</p>
            </div>
          </div>
        </Section>

        {/* ------------------------------------------------------------ 9 visual */}
        <Section
          n={9}
          id="vizual"
          title="Vizual til: AI OS"
          lead="Qora kanvas, nuqtali to'r va yonib turgan vidjet-kartalar. Har bir xodimning o'z gradienti bor; bitta asosiy harakat — laym tugma."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-[32px] bg-void p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.1)] dot-grid">
              <div className="mono-label">Asos</div>
              <ul className="mt-4 space-y-3 text-[13.5px]">
                {[
                  ["#050506", "Kanvas, nuqtali to'r bilan", "bg-void shadow-[inset_0_0_0_1px_rgba(255,255,255,.2)]"],
                  ["#0E0E11", "Yuzalar, kartalar", "bg-surface shadow-[inset_0_0_0_1px_rgba(255,255,255,.15)]"],
                  ["#F3F3F5", "Matn", "bg-fog"],
                  ["#D7FF3A", "Yagona asosiy harakat", "bg-lime"],
                  ["#3BE08A", "Tayyor", "bg-ok"],
                  ["#FFB547", "Tasdiq kutmoqda", "bg-wait"],
                ].map(([hex, role, cls]) => (
                  <li key={hex} className="flex items-center gap-3">
                    <span className={`h-9 w-9 shrink-0 rounded-[12px] ${cls}`} />
                    <span className="font-mono text-[12px] text-fog/85">{hex}</span>
                    <span className="text-mute">{role}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-[32px] bg-surface p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
              <div className="mono-label">Xodimlar gradientlari</div>
              <ul className="mt-4 grid grid-cols-5 gap-3">
                {AGENT_ORDER.map((r) => (
                  <li key={r} className="flex flex-col items-center gap-1.5">
                    <Orb kind={r} size={40} icon={false} />
                    <span className="max-w-full truncate text-center text-[10.5px] text-mute">{AGENTS[r].name.split(" ")[0]}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 grid grid-cols-2 gap-2">
                {(["editor", "translator"] as AgentRole[]).map((r) => (
                  <GlowCard key={r} from={GRAD[r][0]} to={GRAD[r][1]} className="h-24 p-3">
                    <span className="text-[12px] font-semibold">{AGENTS[r].name}</span>
                  </GlowCard>
                ))}
              </div>
            </div>
            <div className="rounded-[32px] bg-surface p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
              <div className="mono-label">Shrift va raqamlar</div>
              <p className="mt-4 text-[44px] font-bold leading-none tracking-[-0.03em]">Uslub — Услуб</p>
              <p className="mt-2 text-[13px] text-mute">Manrope — sarlavha va matn, lotin va kirill</p>
              <p className="mt-4 font-mono text-[13px] uppercase tracking-[0.08em] text-fog/85">JetBrains Mono · 19:00 · 27%</p>
              <p className="mt-1 text-[13px] text-mute">Kichik yorliqlar, vaqt va dalillar uchun</p>
              <div className="mt-5 flex items-end gap-4">
                <DotMatrix value="96" dot={5} gap={2} color="#D7FF3A" />
                <span className="pb-1 text-[13px] text-mute">Nuqtali raqamlar: inson bali, KPI, hisoblagich</span>
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-[32px] bg-surface p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
              <div className="mono-label">Komponentlar</div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="pill-lime px-5 py-2.5 text-[14px]">Tasdiqlash</span>
                <span className="pill-ghost px-5 py-2.5 text-[14px]">Tahrirlash</span>
                {[
                  ["Ishlayapti", "running", Loader2],
                  ["Tayyor", "done", Check],
                  ["Tasdiq kutmoqda", "wait", Hourglass],
                ].map(([t, k, I]) => {
                  const Icon = I as typeof Check;
                  return (
                    <span key={t as string} className="inline-flex items-center gap-1.5 rounded-full bg-white/6 px-3 py-1.5 text-[12.5px] shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
                      <Icon className="h-3.5 w-3.5" style={{ color: GOAL_DOT[k as string] }} /> {t as string}
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="rounded-[32px] bg-surface p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
              <div className="mono-label">Harakat</div>
              <ul className="mt-3 space-y-1.5 text-[14px] text-fog/85">
                <li>Kartalar to&apos;plami prujina bilan yig&apos;iladi va suriladi.</li>
                <li>Xodim ishni boshlaganda tugun gradient bilan «gullaydi».</li>
                <li>Nuqtali hisoblagichlar raqamga qadar sanaydi.</li>
                <li>«Kamroq harakat» sozlamasi yoqilganda — faqat yakuniy holat.</li>
              </ul>
            </div>
          </div>
        </Section>

        {/* ------------------------------------------------------------ 10 UX */}
        <Section n={10} id="ux" title="UX tamoyillari">
          <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {PRINCIPLES.map((p) => (
              <li key={p.t} className="border-t border-edge pt-4">
                <div className="text-[17px] font-bold">{p.t}</div>
                <p className="mt-1.5 text-[14.5px] leading-relaxed text-mute">{p.d}</p>
              </li>
            ))}
          </ul>
        </Section>

        {/* ------------------------------------------------------------ 11 price */}
        <Section n={11} id="narx" title="Narx" lead="MVP uchun bitta tarif. Bu erta narx — hackathondan keyin qayta ko'riladi.">
          <GlowCard from={GRAD.analyst[0]} to={GRAD.analyst[1]} strength={0.45} className="grid gap-6 p-6 sm:p-8 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <span className="mono-label text-fog/75">Erta narx · 1 tarif</span>
              <p className="mt-3 text-[28px] font-bold leading-tight tracking-tight sm:text-[40px]">7 kun bepul, keyin oyiga 149 000 so&apos;m</p>
              <p className="mt-2 text-[14px] text-fog/75">7 дней бесплатно, затем 149 000 сум/мес · 7 days free, then 149,000 UZS/month</p>
              <p className="mt-3 text-[14px] text-fog/85">10 ta AI xodim, 4 yozuvda postlar, Telegramga joylash.</p>
            </div>
            <div className="flex flex-col items-start gap-3 md:items-end">
              <DotMatrix value="149 000" dot={4.5} gap={1.8} />
              <a href={TG_BOT_URL} target="_blank" rel="noreferrer" className="pill-lime px-5 py-2.5 text-[14px]">
                7 kun bepul boshlash
              </a>
            </div>
          </GlowCard>
        </Section>

        {/* ------------------------------------------------------------ 12 roadmap */}
        <Section n={12} id="roadmap" title="Yo'l xaritasi">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[32px] bg-surface p-6 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-lime shadow-[0_0_10px_#D7FF3A]" />
                <span className="text-[17px] font-bold">MVP — bugun</span>
              </div>
              <ul className="mt-4 space-y-2 text-[14.5px] text-fog/85">
                {[
                  "Telegram kanalga joylash (bot orqali)",
                  "Brend DNK va bilimlar bazasi",
                  "Tahlil va strategiya (miya agenti)",
                  "Postlar 4 yozuvda + neyro-so'z filtri",
                  "Mijoz radar, Reels ssenariysi",
                  "Bo'lim kanvasi va tasdiqlash qutisi",
                ].map((t) => (
                  <li key={t} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-[32px] bg-surface p-6 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-white/40" />
                <span className="text-[17px] font-bold">Hackathondan keyin</span>
              </div>
              <ul className="mt-4 space-y-2 text-[14.5px] text-mute">
                {[
                  "Instagram va YouTube'ga joylash",
                  "Jadval bo'yicha avtopilot",
                  "Jamoa a'zolari uchun o'rinlar",
                  "Videoni render qilish",
                  "Natijalar analitikasi",
                ].map((t) => (
                  <li key={t} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/30" /> {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        {/* ------------------------------------------------------------ 13 stack */}
        <Section n={13} id="stack" title="Texnologiyalar">
          <dl className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            {STACK.map(([k, v]) => (
              <div key={k} className="border-t border-edge py-3">
                <dt className="text-[15px] font-bold">{k}</dt>
                <dd className="text-[13.5px] text-mute">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-edge py-8 text-[13px] text-dim">
          <span>MARS AI Hackathon · Toshkent, 2026</span>
          <div className="flex gap-2">
            <Link href="/studio" className="pill-lime px-4 py-2 text-[13px]">
              Studiyani ochish
            </Link>
            <a href={TG_BOT_URL} target="_blank" rel="noreferrer" className="pill-ghost px-4 py-2 text-[13px]">
              <Send className="h-3.5 w-3.5" /> Telegram bot
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}
