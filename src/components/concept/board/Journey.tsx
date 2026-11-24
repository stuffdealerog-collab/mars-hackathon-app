import { LAMPS, LAMP_ORDER } from "@/components/lamp/lamps";
import { Section } from "./Sections";

type Stage = { name: string; ask: string; screen: string; next: string; removed: string; light: number };

/* light = how many of the ten lamps are lit at that moment */
const STAGES: Stage[] = [
  { name: "Увидел ролик или QR", ask: "Это про мой бизнес?", screen: "Лендинг: тёмная панель из десяти ламп и одно поле для ссылки", next: "Вставить ссылку", removed: "Регистрацию и анкету на 20 полей", light: 0 },
  { name: "Понял за 5 секунд", ask: "Что это и что нужно от меня?", screen: "«Bir havola — butun marketing bo‘limi». Под кнопкой: 7 kun bepul", next: "Вставить ссылку", removed: "Слова «AI-агенты» и «нейросети»", light: 1 },
  { name: "Вставил ссылку", ask: "Оно правда читает мой канал?", screen: "LED пишет имя канала и число подписчиков, лампы загораются по очереди", next: "Смотреть, около минуты", removed: "Спиннер без новостей", light: 5 },
  { name: "Вау", ask: "Оно меня поняло?", screen: "Brend DNK: «siz», iliq, 1–2 emoji. Первый пост его голосом", next: "Postlarni ko‘rish", removed: "Пустые карточки «здесь будет результат»", light: 9 },
  { name: "Видит всё", ask: "А что ещё оно умеет?", screen: "Каждая лампа открывается: анализ, план, 10 мест клиентов, Reels", next: "Открыть лампу", removed: "Меню из восьми вкладок", light: 10 },
  { name: "Одобряет", ask: "Этому можно доверять?", screen: "Колода: сверху причина («Narx bor»), правка в одно касание", next: "Tasdiqlash", removed: "Публикацию цен и акций без его «да»", light: 10 },
  { name: "Публикует", ask: "Как это попадёт в канал?", screen: "В Mini App кнопка «Kanalga joylash». В вебе переход в бота", next: "Telegramda joylash", removed: "Копировать и вставлять вручную", light: 10 },
  { name: "Возвращается завтра", ask: "Что было за ночь?", screen: "Утром бот: «Bugungi post tayyor» и вчерашние просмотры на LED", next: "Tasdiqlash", removed: "«Зайди и проверь сам»", light: 8 },
];

const COL = 248;
const GAP = 12;

export function Journey() {
  const W = STAGES.length * COL + (STAGES.length - 1) * GAP;
  const H = 96;
  const pts = STAGES.map((s, i) => [i * (COL + GAP) + COL / 2, H - 10 - (s.light / 10) * (H - 24)] as const);
  const d = pts.reduce((acc, [x, y], i) => {
    if (i === 0) return `M0 ${y} L${x} ${y}`;
    const [px, py] = pts[i - 1];
    const cx = (px + x) / 2;
    return `${acc} C${cx} ${py}, ${cx} ${y}, ${x} ${y}`;
  }, "");
  const line = `${d} L${W} ${pts[pts.length - 1][1]}`;
  return (
    <Section
      id="journey"
      title="Путь владельца"
      lead="Восемь шагов от ролика до возвращения завтра. На каждом экране есть ответ на «что дальше?», и это всегда одно действие владельца. Кривая сверху показывает, сколько ламп горит."
    >
      <div className="-mx-4 overflow-x-auto px-4 pb-3 [scrollbar-width:thin] sm:mx-0 sm:px-0" tabIndex={0} role="region" aria-label="Карта пути, прокрутка вбок">
        <div style={{ width: W }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="block">
            <defs>
              <linearGradient id="jl" x1="0" x2="1" y1="0" y2="0">
                {LAMP_ORDER.map((r, i) => (
                  <stop key={r} offset={i / (LAMP_ORDER.length - 1)} stopColor={LAMPS[r].hue} />
                ))}
              </linearGradient>
              <linearGradient id="jf" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#fff" stopOpacity=".16" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
              <mask id="jm">
                <rect width={W} height={H} fill="url(#jf)" />
              </mask>
            </defs>
            <path d={`${line} L${W} ${H} L0 ${H} Z`} fill="url(#jl)" mask="url(#jm)" />
            <path d={line} fill="none" stroke="url(#jl)" strokeWidth={2.5} strokeLinecap="round" />
            {pts.map(([x, y], i) => (
              <circle key={STAGES[i].name} cx={x} cy={y} r={4} fill="var(--stage)" stroke="url(#jl)" strokeWidth={2} />
            ))}
          </svg>
          <ol className="mt-2 grid" style={{ gridTemplateColumns: `repeat(${STAGES.length}, ${COL}px)`, gap: GAP }}>
            {STAGES.map((s, i) => (
              <li key={s.name} className="flex flex-col gap-3 rounded-[22px] bg-[var(--glass)] p-4" style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}>
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-[17px] font-semibold leading-tight tracking-[-0.01em]">{s.name}</h3>
                  <span className="tnum text-[12px] text-[var(--ink-3)]">{i + 1}/8</span>
                </div>
                <p className="text-[15px] leading-snug">«{s.ask}»</p>
                <p className="text-[13.5px] leading-snug text-[var(--ink-2)]">{s.screen}</p>
                <span className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold text-[var(--lime)]" style={{ boxShadow: "inset 0 0 0 1px var(--lime)" }}>
                  {s.next}
                </span>
                <p className="text-[12.5px] leading-snug text-[var(--ink-3)]">
                  <span className="text-[var(--ink-2)]">Убрали:</span> {s.removed}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Section>
  );
}
