import { Geist } from "next/font/google";
import { LAMPS, LAMP_ORDER } from "@/components/lamp/lamps";
import { Led } from "@/components/lamp/Led";
import { Section } from "./Sections";

// Only for the side-by-side comparison on the internal board: never preloaded, so other pages do not pay for it.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap", preload: false });

const NEUTRALS = [
  ["stage", "#000000", "Сцена. Настоящий чёрный: на нём свет ламп читается как свет"],
  ["glass", "#0D0D10", "Погашенная лампа, поля"],
  ["glass-2", "#17171B", "Поднятые поверхности, пост, поле ввода"],
  ["hair", "rgb 255 / 7%", "Единственная граница: 1px внутри"],
  ["ink", "#F3F1EC", "Текст. Тёплый белый, 18.6 : 1 на сцене"],
  ["ink-2", "#A39F98", "Вторичный текст, 8.0 : 1 на сцене, 6.8 : 1 на поле"],
  ["ink-3", "#85817A", "Третичный текст и плейсхолдеры, 5.4 : 1 на сцене, 4.6 : 1 на поле"],
] as const;

const SIGNALS = [
  ["lime", "#D7FF3A", "Твоя рука: вставить, одобрить, опубликовать"],
  ["led", "#FFB547", "Измеренные цифры и время. Совпадает с лампой Аналитика"],
  ["bad", "#FF5A4E", "Ошибка: нить лампы краснеет, свет гаснет"],
] as const;

export function Colors() {
  return (
    <Section
      id="color"
      title="Цвет"
      lead="Десять ламп идут по конвейеру от тёплого белого к бирюзе. Когда загорелся весь отдел, панель читается как один спектр. Лайм в спектр не входит: он твой."
    >
      <div className="overflow-hidden rounded-[24px]" style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}>
        <div className="flex h-24 sm:h-28" aria-hidden>
          {LAMP_ORDER.map((r) => (
            <div
              key={r}
              className="flex-1"
              style={{ background: `radial-gradient(160% 110% at 50% -10%, ${LAMPS[r].core} 0%, ${LAMPS[r].hue} 28%, ${LAMPS[r].deep} 70%, #000 100%)` }}
            />
          ))}
        </div>
        <ol className="grid grid-cols-2 gap-px bg-[var(--hair)] sm:grid-cols-5">
          {LAMP_ORDER.map((r, i) => (
            <li key={r} className="bg-[var(--stage)] px-3.5 py-3">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: LAMPS[r].hue, boxShadow: `0 0 10px ${LAMPS[r].hue}` }} aria-hidden />
                <span className="text-[14px] font-semibold">{LAMPS[r].name}</span>
              </div>
              <div className="tnum mt-1 text-[12px] leading-relaxed text-[var(--ink-2)]">
                {i + 1}-lampa, {LAMPS[r].hue}
                <br />
                yadro {LAMPS[r].core}
                <br />
                chuqur {LAMPS[r].deep}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <div>
          <h3 className="text-[19px] font-semibold tracking-[-0.01em]">Сцена и текст</h3>
          <ul className="mt-3 divide-y divide-[var(--hair)]">
            {NEUTRALS.map(([n, v, d]) => (
              <li key={n} className="flex items-center gap-3 py-2.5">
                <span className="h-9 w-9 shrink-0 rounded-[10px]" style={{ background: n === "hair" ? "rgb(255 255 255 / .07)" : v, boxShadow: "inset 0 0 0 1px var(--hair-2)" }} aria-hidden />
                <span className="min-w-0">
                  <span className="text-[14px] font-semibold">{n}</span> <span className="tnum text-[13px] text-[var(--ink-2)]">{v}</span>
                  <span className="block text-[13px] text-[var(--ink-2)]">{d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-[19px] font-semibold tracking-[-0.01em]">Сигналы</h3>
          <ul className="mt-3 divide-y divide-[var(--hair)]">
            {SIGNALS.map(([n, v, d]) => (
              <li key={n} className="flex items-center gap-3 py-2.5">
                <span className="h-9 w-9 shrink-0 rounded-[10px]" style={{ background: v }} aria-hidden />
                <span className="min-w-0">
                  <span className="text-[14px] font-semibold">{n}</span> <span className="tnum text-[13px] text-[var(--ink-2)]">{v}</span>
                  <span className="block text-[13px] text-[var(--ink-2)]">{d}</span>
                </span>
              </li>
            ))}
          </ul>
          <h3 className="mt-7 text-[19px] font-semibold tracking-[-0.01em]">Светлая тема (Mini App, Студия)</h3>
          <p className="mt-1 text-[13px] text-[var(--ink-2)]">Сцена белая, лампы те же. Текст #0D0D11 (19.4 : 1), вторичный #5B5852 (7.1 : 1), третичный #6E6A63 (5.4 : 1). LED темнеет до #C26A00: крупные точки, 3.9 : 1.</p>
          <div className="lw mt-3 flex items-center gap-3 rounded-[18px] p-3" data-theme="light" style={{ boxShadow: "inset 0 0 0 1px var(--hair-2)" }}>
            <span className="h-9 w-9 rounded-[10px] bg-[var(--glass)]" aria-hidden />
            <span className="h-9 w-9 rounded-[10px] bg-[var(--glass-2)]" aria-hidden />
            <Led text="1 240" dot={4} gap={1.5} />
            <span className="ml-auto text-[14px] font-semibold">Matn</span>
          </div>
        </div>
      </div>
    </Section>
  );
}

const SCALE = [
  { n: "Display", px: "76 / 48", lh: "0.95", tr: "-0.035em", w: "600", cls: "text-[48px] sm:text-[76px] leading-[0.95] tracking-[-0.035em] font-semibold", s: "Bir havola" },
  { n: "H1", px: "44 / 34", lh: "1.02", tr: "-0.03em", w: "600", cls: "text-[34px] sm:text-[44px] leading-[1.02] tracking-[-0.03em] font-semibold", s: "Butun marketing bo‘limi" },
  { n: "H2", px: "30 / 24", lh: "1.1", tr: "-0.02em", w: "620", cls: "text-[24px] sm:text-[30px] leading-[1.1] tracking-[-0.02em] font-[620]", s: "Sizni 3 ta ish kutmoqda" },
  { n: "H3", px: "20", lh: "1.2", tr: "-0.01em", w: "620", cls: "text-[20px] leading-[1.2] tracking-[-0.01em] font-[620]", s: "Brend xotirasi" },
  { n: "Body L", px: "17", lh: "1.5", tr: "0", w: "400", cls: "text-[17px] leading-[1.5]", s: "Kanalingiz havolasini bering. Qolganini bo‘lim qiladi." },
  { n: "Body", px: "15", lh: "1.5", tr: "0", w: "400", cls: "text-[15px] leading-[1.5]", s: "Yangi kuzgi paltolar keldi — issiq, yengil va har kuni kiyishga qulay." },
  { n: "Small", px: "13", lh: "1.4", tr: "0", w: "500", cls: "text-[13px] leading-[1.4] font-medium", s: "3 ta ish sizni kutmoqda" },
];

const SPECIMEN = [
  ["Oʻzbek lotin", "O‘zbekiston, g‘oya, sho‘rva, bo‘lim, tasdiqlash"],
  ["Ўзбек кирилл", "Ўзбекистон, ғоя, шўрва, қўл, ҳафта"],
  ["Русский", "Целый отдел маркетинга по одной ссылке"],
  ["English", "A whole marketing department from one link"],
];

export function Typography() {
  return (
    <Section
      id="type"
      title="Шрифт"
      lead="Один шрифт на всё: Onest. Спокойный гротеск с крупным очком, держит узбекскую кириллицу (ў қ ғ ҳ). Характер даёт свет, шрифт не спорит. Капс живёт только в LED."
    >
      <div className="space-y-px overflow-hidden rounded-[24px] bg-[var(--hair)]">
        {SCALE.map((r) => (
          <div key={r.n} className="grid gap-2 bg-[var(--stage)] p-4 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-baseline sm:gap-6 sm:p-5">
            <div className="tnum text-[12.5px] leading-relaxed text-[var(--ink-2)]">
              <span className="block text-[13.5px] font-semibold text-[var(--ink)]">{r.n}</span>
              {r.px} px
              <br />
              межстрочный {r.lh}, трекинг {r.tr}, вес {r.w}
            </div>
            <p className={`min-w-0 text-balance ${r.cls}`}>{r.s}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[13px] text-[var(--ink-2)]">
        Шаг шкалы ≈ 1.25. Мобильный / десктоп через «/». Цифры в таблицах моноширинные по ширине (tabular-nums), цифры канала — LED.
      </p>

      <div className={`mt-8 grid gap-4 md:grid-cols-2 ${geist.variable}`}>
        <figure className="rounded-[22px] bg-[var(--glass)] p-5" style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}>
          <figcaption className="text-[13px] text-[var(--ink-2)]">
            <span className="font-semibold text-[var(--lime)]">Onest</span> — выбран. Google Fonts, OFL, без лицензионного риска
          </figcaption>
          <ul className="mt-3 space-y-2">
            {SPECIMEN.map(([l, t]) => (
              <li key={l} className="text-[19px] leading-snug">
                <span className="block text-[12px] text-[var(--ink-3)]">{l}</span>
                {t}
              </li>
            ))}
          </ul>
        </figure>
        <figure className="rounded-[22px] bg-[var(--glass)] p-5" style={{ boxShadow: "inset 0 0 0 1px var(--hair)", fontFamily: "var(--font-geist)" }}>
          <figcaption className="text-[13px] text-[var(--ink-2)]" style={{ fontFamily: "var(--font-onest)" }}>
            <span className="font-semibold text-[var(--ink)]">Geist</span> — из подборки Awwwards, кириллица есть, но это шрифт по умолчанию в каждом новом Next.js
          </figcaption>
          <ul className="mt-3 space-y-2">
            {SPECIMEN.map(([l, t]) => (
              <li key={l} className="text-[19px] leading-snug">
                <span className="block text-[12px] text-[var(--ink-3)]">{l}</span>
                {t}
              </li>
            ))}
          </ul>
        </figure>
      </div>

      <div className="mt-8 flex flex-wrap items-end gap-8 rounded-[22px] bg-[var(--glass)] p-5" style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}>
        <div>
          <p className="mb-2 text-[13px] text-[var(--ink-2)]">LED 5×7, точка 8 px (на телефоне 4 px)</p>
          <span className="hidden sm:block"><Led text="@KANALINGIZ" dot={8} gap={2.5} label="@kanalingiz" /></span>
          <span className="sm:hidden"><Led text="@KANALINGIZ" dot={4} gap={1.4} label="@kanalingiz" /></span>
        </div>
        <div>
          <p className="mb-2 text-[13px] text-[var(--ink-2)]">точка 4 px, внутри лампы</p>
          <Led text="QAMROV 27%" dot={4} gap={1.5} />
        </div>
      </div>
    </Section>
  );
}
