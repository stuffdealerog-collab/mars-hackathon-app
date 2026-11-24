import { Check, ChevronLeft, Link2, MoreVertical, Send, X } from "lucide-react";
import type { AgentRole } from "@/lib/uslub/contract";
import { Deck } from "@/components/lamp/Deck";
import { LampTile } from "@/components/lamp/LampTile";
import { LAMP_ORDER, LAMPS, type LampState } from "@/components/lamp/lamps";
import { Led, LedStrip } from "@/components/lamp/Led";
import { SAMPLE_RESULT } from "./sample";
import { Section } from "./Sections";

function Phone({ label, note, light = false, children }: { label: string; note: string; light?: boolean; children: React.ReactNode }) {
  return (
    <figure className="flex w-[300px] shrink-0 snap-start flex-col gap-3">
      <div className="rounded-[46px] bg-[#1c1c20] p-[9px] shadow-[inset_0_0_0_1px_rgba(255,255,255,.1),0_40px_80px_-30px_rgba(0,0,0,.9)]">
        <div
          className="lw relative h-[600px] overflow-hidden rounded-[38px]"
          data-theme={light ? "light" : undefined}
          style={{ fontFamily: "var(--font-onest)" }}
        >
          <div className="tnum flex h-9 items-center justify-between px-6 pt-1 text-[12.5px] font-semibold" aria-hidden>
            <span>9:41</span>
            <span className="h-[22px] w-[78px] rounded-full bg-black" />
            <span className="flex gap-1">
              <span className="h-2.5 w-4 rounded-[3px] bg-current opacity-80" />
            </span>
          </div>
          {children}
        </div>
      </div>
      <figcaption className="px-2">
        <span className="block text-[15px] font-semibold">{label}</span>
        <span className="block text-[13px] leading-snug text-[var(--ink-2)]">{note}</span>
      </figcaption>
    </figure>
  );
}

function Mark() {
  return (
    <span className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
      <span aria-hidden className="relative h-[18px] w-[18px] rounded-[6px] bg-[var(--glass-2)]" style={{ boxShadow: "inset 0 0 0 1px var(--hair-2)" }}>
        <span className="absolute left-1/2 top-[4px] h-[2px] w-[8px] -translate-x-1/2 rounded-full bg-[#FFD6A0] shadow-[0_0_6px_1px_#FFD6A0]" />
      </span>
      Uslub
    </span>
  );
}

function Panel({ states, results = false }: { states: Partial<Record<AgentRole, LampState>>; results?: boolean }) {
  return (
    <ul className="grid grid-cols-2 gap-2">
      {LAMP_ORDER.map((r) => (
        <LampTile key={r} as="li" role={r} size="sm" state={states[r] ?? "off"} stateLabel={false}>
          {results ? SAMPLE_RESULT[r] : null}
        </LampTile>
      ))}
    </ul>
  );
}

const ALL_ON = Object.fromEntries(LAMP_ORDER.map((r) => [r, r === "publisher" ? "you" : "on"])) as Record<AgentRole, LampState>;

export function Screens() {
  return (
    <Section
      id="screens"
      title="Телефон и Mini App"
      lead="Кадры собраны из настоящих компонентов, а не нарисованы. Тёмная сцена на лендинге; Mini App берёт тему Telegram, у многих она светлая."
    >
      <div className="-mx-4 flex snap-x snap-mandatory gap-6 overflow-x-auto px-4 pb-4 [scrollbar-width:thin] sm:mx-0 sm:px-0" tabIndex={0} role="region" aria-label="Кадры экранов, прокрутка вбок">
        <Phone label="1. Первый экран" note="LED ещё тёмный: нечего показывать, пока нет ссылки. Поле и лайм выше сгиба.">
          <div className="flex flex-col gap-4 px-4 pt-2">
            <div className="flex items-center justify-between">
              <Mark />
              <span className="text-[13px] text-[var(--ink-2)]">UZ</span>
            </div>
            <LedStrip dot={3} gap={1.5} />
            <h3 className="text-balance text-[32px] font-semibold leading-[1.02] tracking-[-0.03em]">Bir havola — butun marketing bo‘limi</h3>
            <p className="text-[14.5px] leading-snug text-[var(--ink-2)]">Kanalingiz havolasini bering: 10 xodim uni o‘qiydi va bir daqiqada ishga tushadi. Siz faqat tasdiqlaysiz.</p>
            <div className="field !min-h-[54px]">
              <Link2 className="h-[18px] w-[18px] shrink-0 text-[var(--ink-3)]" aria-hidden />
              <span className="flex-1 text-[16px] text-[var(--ink-3)]">t.me/kanalingiz</span>
              <span className="btn-lime !min-h-[44px] !px-4 !text-[15px]">Yoqish</span>
            </div>
            <p className="text-[12.5px] text-[var(--ink-3)]">7 kun bepul, keyin oyiga 149 000 so‘m</p>
            <Panel states={{}} />
          </div>
        </Phone>

        <Phone label="2. Отдел работает" note="LED читает канал, лампы загораются по конвейеру. Строка внизу говорит, кто что делает.">
          <div className="flex flex-col gap-3 px-4 pt-2">
            <LedStrip text="@NAFIS_KIYIM  4 210 OBUNACHI" dot={3} gap={1.2} run label="@nafis_kiyim, 4 210 obunachi" />
            <div className="flex items-baseline justify-between">
              <h3 className="text-[22px] font-semibold tracking-[-0.02em]">Bo‘lim ishlayapti</h3>
              <Led text="0:24" dot={3} gap={1.2} label="24 soniya" />
            </div>
            <p className="text-[13.5px] text-[var(--ink-2)]">Kopirayter birinchi postni sizning ovozingizda yozyapti</p>
            <Panel states={{ brand: "on", analyst: "on", strategist: "on", copywriter: "warming" }} results />
          </div>
        </Phone>

        <Phone label="3. Результат" note="Горит весь спектр. Последняя лампа ждёт твоего решения, отсюда одна кнопка.">
          <div className="flex h-[564px] flex-col">
            <div className="flex flex-col gap-3 overflow-hidden px-4 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[22px] font-semibold tracking-[-0.02em]">Tayyor</h3>
                <span className="namuna">namuna</span>
              </div>
              <p className="-mt-1 text-[13.5px] text-[var(--ink-2)]">3 ta ish sizni kutmoqda</p>
              <Panel states={ALL_ON} results />
            </div>
            <div className="mt-auto flex gap-2 bg-gradient-to-t from-black via-black to-transparent px-3 pb-4 pt-8">
              <span className="btn-quiet !min-h-12 !px-4" aria-hidden><Send className="h-[18px] w-[18px]" /></span>
              <span className="btn-lime !min-h-12 flex-1">Natijalarni ko‘rish</span>
            </div>
          </div>
        </Phone>

        <Phone label="4. Одобрение" note="Одно решение за раз. Причина сверху, правка карандашом, «да» — лаймом.">
          <div className="flex flex-col gap-4 px-4 pt-2">
            <div className="flex items-center gap-2">
              <ChevronLeft className="h-5 w-5 text-[var(--ink-2)]" aria-hidden />
              <h3 className="text-[22px] font-semibold tracking-[-0.02em]">Tasdiqlash</h3>
            </div>
            <div className="pt-6">
              <Deck
                items={[
                  { id: "a", why: "Birinchi 5 postdan biri", time: "20:00", text: "Yangi kuzgi paltolar keldi — issiq, yengil va har kuni kiyishga qulay. 🧥" },
                  { id: "b", why: "Narx bor — siz tasdiqlaysiz", time: "19:30", text: "Kuzgi palto — 690 000 so‘m. Shu hafta do‘konda o‘lchab ko‘ring." },
                  { id: "c", why: "Aksiya — siz tasdiqlaysiz", time: "18:00", text: "Juma kuni ikkinchi sharfga −30%. Faqat do‘konda." },
                ]}
              />
            </div>
          </div>
        </Phone>

        <Phone light label="5. Mini App, светлая тема" note="Тема Telegram, главная кнопка Telegram покрашена в лайм. Публикация прямо отсюда.">
          <div className="flex h-[564px] flex-col">
            <div className="flex items-center justify-between border-b border-[var(--hair)] px-4 pb-2.5 pt-1">
              <span className="flex items-center gap-1 text-[15px] text-[#2a7fd4]"><X className="h-4 w-4" aria-hidden /> Yopish</span>
              <span className="text-center leading-tight">
                <span className="block text-[15px] font-semibold">Uslub AI</span>
                <span className="block text-[12px] text-[var(--ink-3)]">mini ilova</span>
              </span>
              <MoreVertical className="h-4 w-4 text-[#2a7fd4]" aria-hidden />
            </div>
            <div className="flex flex-col gap-3 px-4 pt-4">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[13px] text-[var(--ink-2)]">Kechagi post</p>
                  <Led text="1 240" dot={4} gap={1.5} label="1 240 ko‘rish" />
                </div>
                <span className="namuna">namuna</span>
              </div>
              <p className="pt-2 text-[17px] font-semibold">Bugun 2 ta post sizni kutmoqda</p>
              <ul className="divide-y divide-[var(--hair)] rounded-[18px] bg-[var(--glass)]">
                {[
                  ["Yangi kuzgi paltolar keldi", "Birinchi 5 postdan biri", "20:00"],
                  ["Juma kuni ikkinchi sharfga −30%", "Aksiya", "18:00"],
                ].map(([t, why, time]) => (
                  <li key={t} className="flex items-center gap-3 px-3.5 py-3">
                    <span className="lamp__you" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-medium">{t}</span>
                      <span className="block text-[12.5px] text-[var(--ink-2)]">{why}</span>
                    </span>
                    <span className="tnum text-[12.5px] text-[var(--ink-3)]">{time}</span>
                  </li>
                ))}
              </ul>
              <ul className="grid grid-cols-5 gap-1.5" aria-label="Bo‘lim chiroqlari">
                {LAMP_ORDER.map((r) => (
                  <LampTile key={r} as="li" role={r} state={r === "publisher" || r === "analyst" ? "on" : "off"} size="sm" bare className="!min-h-[46px] !rounded-[12px]" aria-label={LAMPS[r].name} />
                ))}
              </ul>
            </div>
            <div className="mt-auto bg-[var(--lime)] py-3.5 text-center text-[15px] font-semibold text-[var(--lime-ink)]">Tasdiqlash (2)</div>
          </div>
        </Phone>

        <Phone label="6. Завтра утром" note="Бот сам приходит с результатом вчерашнего поста и готовым сегодняшним. Карточка с LED — картинка, которую рисует сервер.">
          <div className="flex h-[564px] flex-col" style={{ background: "#0e1621" }}>
            <div className="flex items-center gap-3 px-4 pb-3 pt-1" style={{ background: "#17212b" }}>
              <ChevronLeft className="h-5 w-5 text-[#6ab3f3]" aria-hidden />
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[#0d0d10]" aria-hidden>
                <span className="h-[2px] w-[10px] rounded-full bg-[#FFD6A0] shadow-[0_0_6px_1px_#FFD6A0]" />
              </span>
              <span className="leading-tight">
                <span className="block text-[15px] font-semibold text-white">Uslub AI</span>
                <span className="block text-[12px] text-[#6d7f8f]">bot</span>
              </span>
            </div>
            <div className="flex flex-1 flex-col justify-end gap-2 p-3">
              <div className="max-w-[250px] overflow-hidden rounded-[16px_16px_16px_6px]" style={{ background: "#182533" }}>
                <div className="flex flex-col items-start gap-1.5 bg-black px-3.5 py-3">
                  <Led text="1 240" dot={5} gap={1.8} label="kecha 1 240 ko‘rish" />
                  <span className="text-[12px] text-[#a39f98]">kecha, 20:00 posti</span>
                </div>
                <p className="px-3 pb-2 pt-2.5 text-[14.5px] leading-snug text-white">
                  Xayrli tong! Kechagi post 1 240 marta ko‘rildi. Bugungi post tayyor, tasdiqlaysizmi?
                  <span className="tnum ml-2 text-[11px] text-[#6d7f8f]">08:30</span>
                </p>
              </div>
              <div className="grid max-w-[250px] grid-cols-2 gap-1.5">
                <span className="rounded-[10px] py-2 text-center text-[14px] font-medium text-white" style={{ background: "#2b5278" }}>Ochish</span>
                <span className="rounded-[10px] py-2 text-center text-[14px] font-medium text-white" style={{ background: "#2b5278" }}>Keyinroq</span>
              </div>
              <span className="namuna mt-1 self-start" style={{ borderColor: "#6d7f8f", color: "#a8b5c2" }}>namuna</span>
            </div>
            <div className="flex items-center gap-2 px-3 pb-4 pt-2" style={{ background: "#17212b" }} aria-hidden>
              <span className="flex-1 rounded-full px-4 py-2.5 text-[14px] text-[#6d7f8f]" style={{ background: "#0e1621" }}>Xabar</span>
              <Check className="h-5 w-5 text-[#6ab3f3]" />
            </div>
          </div>
        </Phone>
      </div>
    </Section>
  );
}
