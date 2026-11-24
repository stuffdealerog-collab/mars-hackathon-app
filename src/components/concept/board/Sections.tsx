import Image from "next/image";
import { Check } from "lucide-react";
import { Deck } from "@/components/lamp/Deck";
import { LampTile } from "@/components/lamp/LampTile";
import { Led } from "@/components/lamp/Led";
import { PanelDemo } from "./Live";
import { SAMPLE_RESULT } from "./sample";

export function Section({ id, title, lead, children }: { id: string; title: string; lead?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-16 border-t border-[var(--hair)] py-16 sm:py-24">
      <div className="grid gap-9 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-16">
        <header className="lg:sticky lg:top-20 lg:self-start">
          <h2 id={`${id}-h`} className="text-balance text-[30px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[38px]">
            {title}
          </h2>
          {lead && <div className="mt-3 max-w-[40ch] text-[15px] leading-relaxed text-[var(--ink-2)]">{lead}</div>}
        </header>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

const SHIFTS = [
  ["Копия Dribbble-шота про погоду", "Каждый приём получил работу: плитка — сотрудник, свет — его труд, LED — цифры канала"],
  ["Всё светится одинаково", "Светится только то, что работает. Пустой экран — тёмный. Лайм — один на экран"],
  ["Моно-капс, «·», серые полузаголовки", "Один шрифт, нормальный регистр, заголовок говорит сам; капс живёт только в LED-строке"],
  ["Нет нашего мира", "Telegram-пост как главный объект, бегущая строка ташкентского магазина, канал владельца вместо демо"],
];

export function Cover() {
  return (
    <header className="pb-16 pt-10 sm:pb-24 sm:pt-16">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-end">
        <div>
          <h1 className="text-balance text-[48px] font-semibold leading-[0.95] tracking-[-0.035em] sm:text-[76px]">Chiroqlar yonadi</h1>
          <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-[var(--ink-2)]">
            Отдел маркетинга — это панель ламп. Лампа горит, пока сотрудник работает или держит результат. Тёмная — значит ждёт.
            Всё, что решаешь ты, — лаймовое. Цифры канала бегут по LED-строке, как над витриной на Чорсу.
          </p>
          <p className="mt-6 text-[13px] text-[var(--ink-3)]">Концепт-борд для одобрения основателем, 24 ноября. Внутренняя страница.</p>
        </div>
        <PanelDemo />
      </div>
      <ol className="mt-14 grid gap-px overflow-hidden rounded-[22px] bg-[var(--hair)] sm:grid-cols-2">
        {SHIFTS.map(([was, now]) => (
          <li key={was} className="bg-[var(--stage)] p-5">
            <p className="text-[14px] text-[var(--ink-3)] line-through decoration-[var(--ink-3)]/60">{was}</p>
            <p className="mt-2 text-[16px] leading-snug">{now}</p>
          </li>
        ))}
      </ol>
    </header>
  );
}

const REFS = [
  {
    src: "/concept/refs/853222d1.jpg",
    alt: "AI OS: светящиеся градиентные виджеты на чёрном, стопки карточек, радиальное меню",
    who: "AI OS, Slava Komilov",
    take: "Материал света: плотный градиент сверху, уходящий в черноту; стопка карточек как очередь; лаймовая кнопка как единственное действие.",
    drop: "Радиальное меню из шаров и цвет ради цвета: у нас у каждого оттенка есть хозяин.",
  },
  {
    src: "/concept/refs/27a918c7.jpg",
    alt: "AI OS, светлая версия: те же виджеты на светлом фоне",
    who: "AI OS, светлая версия",
    take: "Доказательство, что свет работает и на белом: так выглядят Студия и Mini App в светлой теме Telegram.",
    drop: "Декоративные dot-matrix цифры без смысла (температура, «85»).",
  },
  {
    src: "/concept/refs/f0b6e770.jpg",
    alt: "Приложение дыхательного теста: dot-matrix цифры, крупные скруглённые карточки",
    who: "Breathing test app",
    take: "Dot-matrix цифры как прибор: показывают измерение, а не украшают. Спокойная иерархия: одно число, одна подпись.",
    drop: "Фото-фон с размытием: у владельца нет времени на атмосферу, есть 5 секунд.",
  },
  {
    src: "/concept/refs/76992ebe.jpg",
    alt: "Умный дом: плитки-светильники, свет падает сверху на тёмную плитку",
    who: "Умный дом, «большая практика»",
    take: "Главная метафора: плитка = прибор, свет = включён. Отсюда «лампа горит — сотрудник работает».",
    drop: "Моно-капс подписи LIGHT / LED STRIP: у нас подписи пишутся как речь.",
  },
];

export function Moodboard() {
  return (
    <Section
      id="mood"
      title="Мудборд"
      lead="Твои четыре референса задают планку крафта и отдают материал. Под каждым — что берём и от чего отказываемся."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {REFS.map((r) => (
          <figure key={r.src} className="overflow-hidden rounded-[22px] bg-[var(--glass)]" style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}>
            <div className="relative aspect-[4/5]">
              <Image src={r.src} alt={r.alt} fill sizes="(min-width: 1024px) 420px, (min-width: 640px) 45vw, 92vw" className="object-cover" />
            </div>
            <figcaption className="space-y-2 p-4 text-[14px] leading-relaxed">
              <p className="font-semibold">{r.who}</p>
              <p>
                <span className="text-[var(--lime)]">Берём.</span> {r.take}
              </p>
              <p className="text-[var(--ink-2)]">
                <span className="text-[var(--ink)]">Не берём.</span> {r.drop}
              </p>
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="mt-4 text-[12.5px] text-[var(--ink-3)]">Референсы принадлежат авторам и показаны только как мудборд для внутреннего обсуждения.</p>
    </Section>
  );
}

export function Rules() {
  return (
    <Section
      id="rules"
      title="Пять правил света"
      lead="Это и есть защита от нейрослопа: каждый визуальный приём что-то означает. Нарушил правило — значит, это декор."
    >
      <div className="grid gap-4">
        <article className="rule">
          <div>
            <h3 className="rule__h">Свет = работа</h3>
            <p className="rule__p">Плитка светится, только пока сотрудник работает или держит готовый результат. Пять состояний, макет одинаковый, меняется только свет.</p>
          </div>
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            {(["off", "warming", "on", "you", "error"] as const).map((s) => (
              <LampTile key={s} as="li" role="copywriter" state={s} size="sm">
                {s === "on" || s === "you" ? SAMPLE_RESULT.copywriter : null}
              </LampTile>
            ))}
          </ul>
        </article>

        <article className="rule">
          <div>
            <h3 className="rule__h">Лайм = твоя рука</h3>
            <p className="rule__p">Лайм получает только то, что делает владелец: вставить ссылку, одобрить, опубликовать. Один лайм на экран. У сотрудников лайма нет.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button type="button" className="btn-lime">
              <Check className="h-[18px] w-[18px]" aria-hidden /> Tasdiqlash
            </button>
            <button type="button" className="btn-quiet">Keyinroq</button>
            <span className="flex items-center gap-2 text-[13px] text-[var(--ink-2)]">
              <span className="lamp__you" aria-hidden /> точка «sizni kutmoqda» на лампе
            </span>
          </div>
        </article>

        <article className="rule">
          <div>
            <h3 className="rule__h">LED = измеренные цифры</h3>
            <p className="rule__p">Янтарная бегущая строка, как над ташкентским магазином. Только факты канала и время: подписчики, охват, лучший час. Никогда не украшение.</p>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <Led text="4 210" dot={6} gap={2} label="4 210 obunachi" />
            <Led text="27%" dot={6} gap={2} label="qamrov 27%" />
            <Led text="20:00" dot={6} gap={2} label="eng yaxshi soat 20:00" />
          </div>
        </article>

        <article className="rule">
          <div>
            <h3 className="rule__h">Колода = очередь решений</h3>
            <p className="rule__p">Стопка карточек из AI OS получила работу: это очередь того, что ждёт твоего «да». Одно решение за раз, причина видна сверху.</p>
          </div>
          <div className="max-w-[380px]">
            <Deck
              items={[
                { id: "1", why: "Narx bor — siz tasdiqlaysiz", time: "20:00", text: "Kuzgi palto — 690 000 so‘m. Shu hafta do‘konda o‘lchab ko‘ring 🧥" },
                { id: "2", why: "Birinchi 5 postdan biri", time: "19:30", text: "Yangi kuzgi paltolar keldi — issiq, yengil va har kuni kiyishga qulay." },
                { id: "3", why: "Aksiya — siz tasdiqlaysiz", time: "18:00", text: "Juma kuni ikkinchi sharfga −30%. Faqat do‘konda." },
              ]}
            />
          </div>
        </article>

        <article className="rule">
          <div>
            <h3 className="rule__h">Пунктир = намуна</h3>
            <p className="rule__p">Всё ненастоящее обведено пунктиром и подписано «namuna». Сплошная линия — живые данные канала. Читается и без цвета.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[14px]">
            <span className="namuna">namuna</span>
            <span className="rounded-full px-2.5 py-1 text-[12px] text-[var(--ink)]" style={{ boxShadow: "inset 0 0 0 1px var(--hair-2)" }}>
              jonli: t.me/kanalingiz
            </span>
          </div>
        </article>
      </div>
    </Section>
  );
}
