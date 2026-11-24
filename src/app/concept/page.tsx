import { ReviewDemo } from "@/components/concept/ReviewDemo";
import { LiveCanvas } from "@/components/concept/LiveCanvas";
import { StatusIcon, STATUS_TEXT } from "@/components/studio/FlowCanvas";
import { MOCK_BRAND, MOCK_LEADS, MOCK_VIDEO } from "@/components/studio/mocks";
import { RULES } from "@/components/studio/store";
import { AgentAvatar } from "@/components/uslub/AgentAvatar";
import { AGENT_ORDER, AGENTS, TG_BOT_URL } from "@/components/uslub/agents";
import { GirihStar, Logo } from "@/components/uslub/Girih";
import type { NodeStatus } from "@/lib/uslub/contract";
import { Check, Send } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Konsepsiya" };

function Section({
  n,
  id,
  title,
  lead,
  children,
  className = "",
}: {
  n: number;
  id: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-20 border-t border-sand py-14 sm:py-20 ${className}`}>
      <div className="mb-8 grid gap-3 sm:grid-cols-[72px_1fr] sm:gap-6">
        <span className="font-display text-[13px] font-medium tabular-nums text-stone">{String(n).padStart(2, "0")}</span>
        <div className="max-w-2xl">
          <h2 className="font-display text-[26px] font-semibold leading-[1.15] tracking-tight sm:text-[34px]">{title}</h2>
          {lead && <p className="mt-3 text-[16px] leading-relaxed text-stone">{lead}</p>}
        </div>
      </div>
      <div className="sm:pl-[96px]">{children}</div>
    </section>
  );
}

const QUOTES = [
  {
    who: "Marketing direktori (tashkilotchi kompaniya)",
    text: "Menga bitta servis kerak: qanday o'ylashimni o'rgansin va «yozish → tarjima → joylash» ishini o'zi qilsin, men esa topshiriq beray.",
    tone: "border-lapis",
    big: true,
  },
  {
    who: "SMM mutaxassisi",
    text: "Mahsulot videolari kerak, lekin AI'ning sun'iy, bir xil ko'rinishisiz.",
    tone: "border-saffron",
  },
  {
    who: "Marketolog",
    text: "Mahalliy bozor bo'yicha ma'lumot yo'q: qaysi kanal, qaysi guruh, qaysi blogger ishlaydi — taxmin qilamiz.",
    tone: "border-turq",
  },
  {
    who: "Startap asoschilari",
    text: "Eng qiyini — mijoz topish. Kontentni-ku bir amallab yozamiz.",
    tone: "border-clay",
  },
];

const PALETTE = [
  { name: "Paper", hex: "#FAF7F2", role: "Fon", cls: "bg-paper border border-sand", dark: false },
  { name: "Ink", hex: "#13151C", role: "Matn, asosiy tugma", cls: "bg-ink", dark: true },
  { name: "Lapis", hex: "#2747C8", role: "Asosiy rang, havolalar", cls: "bg-lapis", dark: true },
  { name: "Turquoise", hex: "#16A394", role: "Ishlayapti / tayyor", cls: "bg-turq", dark: true },
  { name: "Saffron", hex: "#F2A93B", role: "Tasdiq kutmoqda, aksent", cls: "bg-saffron", dark: false },
  { name: "Clay", hex: "#C8553D", role: "Neyro-so'zlar, xatolar", cls: "bg-clay", dark: true },
];

const PRINCIPLES = [
  { t: "Bosqichma-bosqich ochilish", d: "Avval bitta maydon: «Topshiriq bering». Kanvas — ikkinchi qatlam, kim nima qilayotganini ko'rmoqchi bo'lganlar uchun." },
  { t: "Inson nazoratida", d: "Aksiya, narx, video va yangi brendning birinchi postlari faqat sizning tasdig'ingizdan keyin chiqadi." },
  { t: "AI-shablonlarsiz", d: "Muharrir «neyro-so'zlar»ni belgilaydi va o'rniga oddiy ibora taklif qiladi. Inson bali har postda ko'rinadi." },
  { t: "Telefondan boshqariladi", d: "Telegram Mini App auditoriyasi telefonda. Kanvas kichik ekranda qadamlar ro'yxatiga aylanadi." },
  { t: "To'rt yozuv, bitta ohang", d: "O'zbek lotin, o'zbek kirill, rus va ingliz — har biri alohida tekshiriladi." },
];

const statuses: NodeStatus[] = ["idle", "running", "done", "needs_approval"];

export default function ConceptPage() {
  const dna = MOCK_BRAND.dna;
  return (
    <main className="uslub min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-sand/70 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <Link href="/" aria-label="Uslub AI bosh sahifa">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1 text-[14px] font-semibold">
            <Link href="/" className="rounded-lg px-3 py-2 text-stone hover:text-ink">
              Bosh sahifa
            </Link>
            <Link href="/studio" className="rounded-lg bg-ink px-3.5 py-2 text-white hover:bg-lapis">
              Studiyani ochish
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 sm:px-8">
        {/* Intro */}
        <div className="grid gap-10 py-14 sm:py-20 lg:grid-cols-[1.3fr_1fr] lg:items-end">
          <div>
            <p className="text-[14px] font-semibold text-lapis">Konsepsiya taxtasi · 24-noyabr, MARS AI Hackathon</p>
            <h1 className="mt-4 font-display text-[36px] font-semibold leading-[1.05] tracking-tight sm:text-[56px]">
              Sizning marketing bo&apos;limingiz. Siz faqat tasdiqlaysiz.
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-stone">
              Uslub AI — marketologi yo&apos;q kichik biznes va startaplar uchun AI marketing bo&apos;limi. Egasi topshiriq beradi, AI
              xodimlar reja tuzadi, yozadi, tozalaydi, tarjima qiladi va tasdiqdan keyin Telegramga joylaydi.
            </p>
          </div>
          <div className="rounded-3xl bg-ink p-6 text-white">
            <div className="flex items-center gap-2 text-[14px] font-semibold text-saffron">
              <GirihStar className="h-4 w-4" /> Tasdiqlangan qarorlar
            </div>
            <dl className="mt-4 grid gap-3 text-[14px]">
              {[
                ["Kim uchun", "Marketologi yo'q biznes egasi yoki asoschi"],
                ["Birinchi ekran", "«Topshiriq bering» + tasdiqlash qutisi"],
                ["Asosiy funksiya", "Bir havola — butun marketing bo'limi"],
                ["Nashr", "Oddiy postlar avtopilotda, nozik narsalar tasdiq bilan"],
                ["Narx", "7 kun bepul, keyin oyiga 149 000 so'm"],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[110px_1fr] gap-3 border-t border-white/10 pt-3">
                  <dt className="text-white/55">{k}</dt>
                  <dd className="font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <Section
          n={1}
          id="muammo"
          title="Muammo: marketing besh xil vositada tarqalib ketgan"
          lead="Bugun egasi ChatGPT, Gemini, tarjimon, Google Docs va Telegram orasida yuradi. Saytdagi intervyulardan:"
        >
          <div className="grid gap-4 md:grid-cols-3">
            {QUOTES.map((q) => (
              <figure
                key={q.who}
                className={`border-l-4 ${q.tone} bg-white py-4 pl-5 pr-4 ${q.big ? "md:col-span-3 md:py-6" : ""}`}
              >
                <blockquote className={q.big ? "font-display text-[20px] leading-snug sm:text-[24px]" : "text-[16px] leading-relaxed"}>
                  «{q.text}»
                </blockquote>
                <figcaption className="mt-3 text-[13px] text-stone">{q.who}</figcaption>
              </figure>
            ))}
          </div>
          <p className="mt-4 text-[13px] text-stone">Iqtiboslar mazmunan berilgan (paraphrase), so&apos;zma-so&apos;z emas.</p>
        </Section>

        <Section
          n={2}
          id="goya"
          title="G'oya: topshiriq bering, bo'lim bajaradi"
          lead="Asosiy foydalanuvchi — marketologi yo'q biznes egasi yoki startap asoschisi. U vositalarni emas, xodimlarni boshqaradi."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-sand bg-shell p-5">
              <div className="text-[14px] font-bold text-stone">Hozir</div>
              <ol className="mt-3 grid gap-2 text-[15px]">
                {["ChatGPT'da post yozish", "Gemini'da qayta yozish", "Tarjimonda ruschaga o'girish", "Google Docs'da yig'ish", "Telegramga qo'lda joylash"].map(
                  (s, i) => (
                    <li key={s} className="flex gap-3">
                      <span className="w-5 text-stone tabular-nums">{i + 1}.</span>
                      {s}
                    </li>
                  ),
                )}
              </ol>
            </div>
            <div className="rounded-2xl bg-lapis p-5 text-white">
              <div className="text-[14px] font-bold text-white/70">Uslub AI bilan</div>
              <ol className="mt-3 grid gap-2 text-[15px]">
                {["«Black Friday uchun 1 haftalik kontent va Reels» deb yozasiz", "Strateg vazifani xodimlarga bo'ladi", "Natija tasdiqlash qutisiga tushadi", "Bir bosish — Telegramda"].map(
                  (s, i) => (
                    <li key={s} className="flex gap-3">
                      <span className="w-5 text-white/60 tabular-nums">{i + 1}.</span>
                      {s}
                    </li>
                  ),
                )}
              </ol>
            </div>
          </div>
        </Section>

        <Section n={3} id="jamoa" title="Jamoa: 9 ta AI xodim" lead="Har bir rol — bitta xodim. Egasi ularni ismi bilan taniydi va natijasini ko'radi.">
          <ul className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            {AGENT_ORDER.map((r) => {
              const a = AGENTS[r];
              return (
                <li key={r} className="flex gap-3 border-b border-sand py-4">
                  <AgentAvatar kind={r} size={44} />
                  <div className="min-w-0">
                    <div className="text-[15px] font-bold">{a.name}</div>
                    <div className="text-[12px] text-stone">
                      {a.ru} · {a.en}
                    </div>
                    <p className="mt-1.5 text-[14px] leading-snug text-ink/80">{a.does}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section
          n={4}
          id="kanvas"
          title="Node tizimi: bo'limingiz qanday ishlaydi"
          lead="Har bir tugun — xodim kartasi, chiziqlar — ish uzatilishi. Statuslar jonli o'zgaradi: navbatda, ishlayapti, tayyor, tasdiq kutmoqda."
        >
          <LiveCanvas />
          <div className="mt-6 grid gap-4 text-[14px] md:grid-cols-3">
            {[
              ["1-qatlam", "«Topshiriq bering» maydoni va tasdiqlash qutisi. Ko'pchilik shu yerda qoladi."],
              ["2-qatlam", "«Bo'limingiz qanday ishlaydi» — kanvas. Tugunni bosing, natijasi yon panelda ochiladi."],
              ["3-qatlam", "Tahrirlash: shablon tanlash, xodim qo'shish yoki o'chirish (hackathondan keyin)."],
            ].map(([k, v]) => (
              <div key={k} className="border-t-2 border-ink pt-3">
                <div className="font-bold">{k}</div>
                <p className="mt-1 text-stone">{v}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section
          n={5}
          id="ekranlar"
          title="Asosiy ekranlar"
          lead="Bular rasm emas — prototipdagi jonli komponentlar. Qizil to'lqinli chiziqli iborani bosing: Muharrir uni almashtiradi."
        >
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div className="rounded-3xl border border-sand bg-paper p-4 sm:p-6">
              <div className="mb-4 text-[15px] font-bold">Post ko&apos;rib chiqish</div>
              <ReviewDemo />
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-[0_1px_0_#E6DFD3,0_20px_40px_-28px_rgba(19,21,28,.35)] sm:p-6">
              <div className="flex items-center gap-3">
                <AgentAvatar kind="brand" size={40} />
                <div>
                  <div className="text-[15px] font-bold">Brend DNK · {dna.name}</div>
                  <div className="text-[13px] text-stone">{dna.oneLiner}</div>
                </div>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
                <div className="col-span-2">
                  <dt className="text-stone">Ohang</dt>
                  <dd className="font-semibold">{dna.tone}</dd>
                </div>
                <div>
                  <dt className="text-stone">Murojaat</dt>
                  <dd className="font-semibold">«{dna.address}»</dd>
                </div>
                <div>
                  <dt className="text-stone">Emoji</dt>
                  <dd className="font-semibold">Kam</dd>
                </div>
                <div>
                  <dt className="text-stone">Post uzunligi</dt>
                  <dd className="font-semibold tabular-nums">~{dna.avgPostLength} belgi</dd>
                </div>
                <div>
                  <dt className="text-stone">CTA uslubi</dt>
                  <dd className="font-semibold">{dna.ctaStyle}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-stone">Takrorlanuvchi formatlar</dt>
                  <dd className="mt-1 flex flex-wrap gap-1.5">
                    {dna.recurringFormats.map((f) => (
                      <span key={f} className="rounded-full bg-lapis-soft px-2.5 py-0.5 font-semibold text-lapis">
                        {f}
                      </span>
                    ))}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-turq">Qiling</dt>
                  <dd>
                    <ul className="mt-1 grid gap-1">
                      {dna.doList.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-clay">Qilmang</dt>
                  <dd>
                    <ul className="mt-1 grid gap-1">
                      {dna.dontList.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
                <div className="col-span-2 text-stone">{dna.hashtags.join(" ")}</div>
              </dl>
            </div>

            <div className="rounded-3xl border border-sand bg-white p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <AgentAvatar kind="radar" size={40} />
                <div>
                  <div className="text-[15px] font-bold">Mijoz radar</div>
                  <div className="text-[13px] text-stone">Mijozlaringiz qayerda va nima qilish kerak</div>
                </div>
              </div>
              <ul className="mt-4 grid">
                {MOCK_LEADS.slice(0, 4).map((l) => (
                  <li key={l.name} className="border-t border-sand py-3">
                    <div className="text-[14px] font-bold">{l.name}</div>
                    <p className="mt-0.5 text-[13px] text-stone">{l.why}</p>
                    <p className="mt-1.5 text-[13px] font-semibold text-lapis">{l.action}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="girih-night rounded-3xl bg-night p-5 text-white sm:p-6">
              <div className="flex items-center gap-3">
                <AgentAvatar kind="video" size={40} />
                <div>
                  <div className="text-[15px] font-bold">Videograf · Reels ssenariysi</div>
                  <div className="text-[13px] text-white/60">Hook: {MOCK_VIDEO.hook}</div>
                </div>
              </div>
              <div className="mt-5 flex h-2 overflow-hidden rounded-full">
                {MOCK_VIDEO.scenes.map((s, i) => (
                  <span
                    key={i}
                    style={{ flexGrow: s.seconds }}
                    className={["bg-lapis", "bg-turq", "bg-saffron", "bg-clay", "bg-white/70"][i % 5]}
                  />
                ))}
              </div>
              <ol className="mt-4 grid gap-3">
                {MOCK_VIDEO.scenes.map((s, i) => (
                  <li key={i} className="grid grid-cols-[44px_1fr] gap-3 text-[13px]">
                    <span className="font-display tabular-nums text-white/60">{s.seconds}s</span>
                    <div>
                      <div className="font-semibold">{s.visual}</div>
                      <div className="text-white/65">«{s.voiceover}»</div>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-4 rounded-xl border border-dashed border-white/20 px-3 py-2 text-[12px] text-white/60">
                Tayyor video joyi: render provayderi ulanganda shu yerda chiqadi. Musiqa: {MOCK_VIDEO.musicMood}
              </div>
            </div>
          </div>
          <Link href="/studio" className="mt-6 inline-flex rounded-xl bg-ink px-4 py-2.5 text-[14px] font-bold text-white hover:bg-lapis">
            To&apos;liq prototipni ochish: /studio
          </Link>
        </Section>

        <Section
          n={6}
          id="killer"
          title="Asosiy funksiya: bir havola — butun marketing bo'limi"
          lead="Telegram kanal havolasini qo'yasiz. Taxminan 60 soniyada butun bo'lim kanvasda ishlaydi. Bu ketma-ketlik Reels/TikTok uchun ekrandan yozib olinadi."
        >
          <div className="girih-night overflow-hidden rounded-3xl bg-night p-5 text-white sm:p-8">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white/5 p-2 pl-4">
              <Send className="h-4 w-4 text-saffron" />
              <span className="flex-1 font-semibold text-white/80">t.me/sizning_kanal</span>
              <span className="rounded-xl bg-saffron px-4 py-2 text-[14px] font-bold text-ink">Bo&apos;limni ishga tushirish</span>
            </div>
            <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["0–10 s", "Brend DNK", "Ohang, siz/sen, emoji, CTA, heshteglar — kanaldagi postlardan."],
                ["10–35 s", "1 haftalik postlar", "7 ta post, neyro-so'zlarsiz, 4 yozuvda."],
                ["25–45 s", "10 ta joy", "Mijozlaringiz bor kanallar, guruhlar, blogerlar, tadbirlar."],
                ["35–60 s", "Reels ssenariysi", "Hook, kadrlar, ovoz va subtitrlar."],
              ].map(([t, h, d]) => (
                <li key={h} className="border-t border-white/15 pt-3">
                  <div className="font-display text-[13px] tabular-nums text-saffron">{t}</div>
                  <div className="mt-1 text-[16px] font-bold">{h}</div>
                  <p className="mt-1 text-[13px] text-white/65">{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </Section>

        <Section
          n={7}
          id="nashr"
          title="Nashr: avtopilot va tasdiq aralash"
          lead="Oddiy postlar jadval bo'yicha avtopilotda chiqishi mumkin. Nozik narsalar har doim tasdiqlash qutisidan o'tadi. Har bir elementda qaysi yo'ldan ketgani ko'rinadi."
        >
          <div className="overflow-hidden rounded-2xl border border-sand bg-white">
            <table className="w-full text-left text-[14px]">
              <thead className="bg-shell text-[13px] text-stone">
                <tr>
                  <th className="px-4 py-3 font-semibold">Kontent turi</th>
                  <th className="hidden px-4 py-3 font-semibold sm:table-cell">Qachon qo&apos;llanadi</th>
                  <th className="px-4 py-3 font-semibold">Standart holat</th>
                </tr>
              </thead>
              <tbody>
                {RULES.map((r) => {
                  const auto = r.key === "routine";
                  return (
                    <tr key={r.key} className="border-t border-sand">
                      <td className="px-4 py-3 font-semibold">{r.name}</td>
                      <td className="hidden px-4 py-3 text-stone sm:table-cell">{r.hint}</td>
                      <td className="px-4 py-3">
                        {auto ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-turq-soft px-2.5 py-0.5 text-[12px] font-bold text-turq">
                            Avtopilot · beta
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-saffron-soft px-2.5 py-0.5 text-[12px] font-bold text-[#8a5a10]">
                            Tasdiq kerak
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[13px] text-stone">
            MVP&apos;da qoidalar Studiyadagi sozlama sifatida ishlaydi. Jadval bo&apos;yicha avtomatik joylash hackathondan keyin ulanadi —
            shuning uchun «beta» deb belgilangan.
          </p>
        </Section>

        <Section n={8} id="vizual" title="Vizual til: zamonaviy Samarqand koshinlari" lead="Rang — vazifa uchun, bezak uchun emas. Girih naqshi faqat urg'u sifatida.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {PALETTE.map((p) => (
              <div key={p.name}>
                <div className={`h-20 rounded-2xl ${p.cls}`} />
                <div className="mt-2 text-[14px] font-bold">{p.name}</div>
                <div className="text-[12px] tabular-nums text-stone">{p.hex}</div>
                <div className="text-[12px] text-stone">{p.role}</div>
              </div>
            ))}
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-sand bg-white p-6">
              <div className="text-[13px] text-stone">Unbounded — sarlavhalar</div>
              <div className="mt-2 font-display text-[40px] font-semibold leading-none tracking-tight">Uslub — Услуб</div>
              <div className="mt-6 text-[13px] text-stone">Manrope — interfeys va matn</div>
              <p className="mt-2 text-[17px] leading-relaxed">
                Topshiriq bering — bo&apos;lim bajaradi. Поручите задачу — отдел сделает. Топшириқ беринг.
              </p>
            </div>
            <div className="grid gap-4 rounded-3xl border border-sand bg-white p-6">
              <div>
                <div className="text-[13px] text-stone">Xodim statuslari</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {statuses.map((s) => (
                    <span key={s} className="inline-flex items-center gap-1.5 rounded-full bg-night-2 px-3 py-1 text-[12px] font-semibold text-white">
                      <StatusIcon status={s} /> {STATUS_TEXT[s]}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[13px] text-stone">Tugmalar</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-xl bg-ink px-4 py-2 text-[14px] font-bold text-white">Topshiriq berish</span>
                  <span className="inline-flex items-center gap-1.5 rounded-xl bg-turq px-4 py-2 text-[14px] font-bold text-white">
                    <Check className="h-4 w-4" strokeWidth={3} /> Tasdiqlash
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-xl bg-lapis px-4 py-2 text-[14px] font-bold text-white">
                    <Send className="h-4 w-4" /> Telegramga joylash
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="girih h-20 rounded-2xl border border-sand bg-paper" />
                <div className="girih-night h-20 rounded-2xl bg-night" />
              </div>
            </div>
          </div>
        </Section>

        <Section n={9} id="ux" title="UX tamoyillari">
          <ul className="grid gap-x-10 md:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <li key={p.t} className="border-t border-sand py-4">
                <div className="text-[16px] font-bold">{p.t}</div>
                <p className="mt-1 text-[14px] leading-relaxed text-stone">{p.d}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section n={10} id="narx" title="Narx" lead="MVP uchun bitta tarif. Bu erta narx — hackathondan keyin qayta ko'riladi.">
          <div className="flex flex-col gap-6 rounded-3xl bg-saffron-soft p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <div className="font-display text-[26px] font-semibold leading-tight sm:text-[32px]">7 kun bepul, keyin oyiga 149 000 so&apos;m</div>
              <div className="mt-2 text-[14px] text-stone">7 дней бесплатно, затем 149 000 сум/мес · 7 days free, then 149,000 UZS/month</div>
              <div className="mt-3 text-[14px]">9 ta AI xodim, 4 yozuvda postlar, Telegramga joylash.</div>
            </div>
            <a href={TG_BOT_URL} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-ink px-5 py-3 text-[15px] font-bold text-white hover:bg-lapis">
              <Send className="h-4 w-4" /> 7 kun bepul boshlash
            </a>
          </div>
        </Section>

        <Section n={11} id="roadmap" title="Yo'l xaritasi">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border-2 border-turq bg-white p-5">
              <div className="text-[15px] font-bold text-turq">MVP — bugun</div>
              <ul className="mt-3 grid gap-2 text-[14px]">
                {[
                  "Telegram kanalga joylash (tasdiqdan keyin)",
                  "Brend DNK — kanal yoki matndan",
                  "Postlar 4 yozuvda",
                  "Neyro-so'z filtri va inson bali",
                  "Mijoz radar",
                  "Reels ssenariysi",
                  "Jonli kanvas va 5 shablon",
                  "Avtopilot qoidalari (sozlama sifatida)",
                ].map((s) => (
                  <li key={s} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-turq" strokeWidth={3} />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-sand bg-shell p-5">
              <div className="text-[15px] font-bold text-stone">Hackathondan keyin</div>
              <ul className="mt-3 grid gap-2 text-[14px]">
                {[
                  "Instagram va YouTube'ga joylash",
                  "Jadval bo'yicha avtopilot",
                  "Jamoa a'zolari uchun o'rinlar",
                  "Videoni render qilish",
                  "Natijalar analitikasi",
                ].map((s) => (
                  <li key={s} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-stone" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        <Section n={12} id="stack" title="Texnologiyalar">
          <ul className="flex flex-wrap gap-2 text-[14px]">
            {[
              "Next.js 16 App Router",
              "React 19",
              "Tailwind 4",
              "@xyflow/react — kanvas",
              "motion — animatsiya",
              "zustand — holat",
              "Neon Postgres",
              "grammY — Telegram bot + Mini App",
              "Claude (Anthropic) — AI xodimlar",
              "Vercel, fra1",
            ].map((s) => (
              <li key={s} className="rounded-full border border-sand bg-white px-3.5 py-1.5 font-semibold">
                {s}
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <footer className="border-t border-sand">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-[13px] text-stone sm:px-8">
          <Logo />
          <span>MARS AI Hackathon · Toshkent, 2026</span>
        </div>
      </footer>
    </main>
  );
}
