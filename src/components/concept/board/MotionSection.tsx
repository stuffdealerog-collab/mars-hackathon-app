import { BallisticNumber, LampSwitch } from "./Live";
import { Section } from "./Sections";

const DUR = [
  ["Нажатие", "120 ms", "ease-out", "кнопка проседает до 0.97"],
  ["Состояние", "200 ms", "ease-out", "hover, переключатель, нить лампы"],
  ["Панель", "360 ms", "ease-out", "колода, шторка, результат в лампе"],
  ["Лампа загорается", "720 ms", "мерцание → ease-out", "две короткие просадки, потом ровный свет"],
  ["Лампа гаснет", "1000 ms", "ease-in", "остывает дольше, чем загорается"],
  ["Шаг конвейера", "420 → 170 ms", "ускорение", "следующая лампа загорается всё быстрее"],
];

const CURVES: { n: string; css: string; pts: [number, number, number, number] }[] = [
  { n: "ease-out (expo)", css: "cubic-bezier(.16, 1, .3, 1)", pts: [0.16, 1, 0.3, 1] },
  { n: "ease-in (expo)", css: "cubic-bezier(.7, 0, .84, 0)", pts: [0.7, 0, 0.84, 0] },
  { n: "ease-in-out", css: "cubic-bezier(.65, 0, .35, 1)", pts: [0.65, 0, 0.35, 1] },
];

/* lamp-on keyframes from globals.css, as opacity over time */
const FLICKER: [number, number][] = [
  [0, 0],
  [0.08, 0.75],
  [0.12, 0.18],
  [0.21, 0.9],
  [0.27, 0.5],
  [0.46, 1],
  [1, 1],
];

function Curve({ pts }: { pts: [number, number, number, number] }) {
  const W = 120;
  const H = 80;
  const [x1, y1, x2, y2] = pts;
  return (
    <svg viewBox={`-6 -6 ${W + 12} ${H + 12}`} className="h-24 w-full" aria-hidden>
      <rect x={0} y={0} width={W} height={H} fill="none" stroke="var(--hair-2)" />
      <path d={`M0 ${H} C ${x1 * W} ${H - y1 * H}, ${x2 * W} ${H - y2 * H}, ${W} 0`} fill="none" stroke="var(--led)" strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  );
}

export function Motion() {
  const W = 260;
  const H = 80;
  return (
    <Section
      id="motion"
      title="Движение"
      lead="Лампы разогреваются, а не выскакивают. Макет рисуется первым и больше не двигается, меняется только свет. На экране один оркестрованный момент, всё остальное — короткая обратная связь."
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="overflow-hidden rounded-[22px]" style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}>
          <table className="w-full text-left text-[14px]">
            <caption className="sr-only">Длительности</caption>
            <thead className="text-[12.5px] text-[var(--ink-2)]">
              <tr className="border-b border-[var(--hair)]">
                <th scope="col" className="px-4 py-3 font-medium">Что</th>
                <th scope="col" className="px-2 py-3 font-medium">Сколько</th>
                <th scope="col" className="hidden px-2 py-3 font-medium sm:table-cell">Кривая</th>
                <th scope="col" className="px-4 py-3 font-medium">Как выглядит</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hair)]">
              {DUR.map(([a, b, c, d]) => (
                <tr key={a}>
                  <th scope="row" className="px-4 py-3 font-semibold">{a}</th>
                  <td className="tnum whitespace-nowrap px-2 py-3">{b}</td>
                  <td className="hidden px-2 py-3 text-[var(--ink-2)] sm:table-cell">{c}</td>
                  <td className="px-4 py-3 text-[var(--ink-2)]">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <LampSwitch />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CURVES.map((c) => (
          <figure key={c.n} className="rounded-[22px] bg-[var(--glass)] p-4" style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}>
            <Curve pts={c.pts} />
            <figcaption className="mt-2 text-[14px] font-semibold">
              {c.n}
              <span className="tnum block text-[12px] font-normal text-[var(--ink-2)]">{c.css}</span>
            </figcaption>
          </figure>
        ))}
        <figure className="rounded-[22px] bg-[var(--glass)] p-4" style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}>
          <svg viewBox={`-6 -6 ${W + 12} ${H + 12}`} className="h-24 w-full" aria-hidden>
            <rect x={0} y={0} width={W} height={H} fill="none" stroke="var(--hair-2)" />
            <polyline points={FLICKER.map(([t, o]) => `${t * W},${H - o * H}`).join(" ")} fill="none" stroke="var(--led)" strokeWidth={2.5} strokeLinejoin="round" />
          </svg>
          <figcaption className="mt-2 text-[14px] font-semibold">
            Разогрев лампы
            <span className="block text-[12px] font-normal text-[var(--ink-2)]">яркость во времени, 720 ms</span>
          </figcaption>
        </figure>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
        <BallisticNumber />
        <ul className="space-y-2.5 text-[15px] leading-relaxed">
          <li><span className="font-semibold">Цифры оседают с массой.</span> <span className="text-[var(--ink-2)]">Пружина k 170, трение 18: число чуть перелетает и садится. Никогда не прыгает мгновенно.</span></li>
          <li><span className="font-semibold">Выход быстрее входа.</span> <span className="text-[var(--ink-2)]">Кроме ламп: остывание длиннее, как у настоящей нити.</span></li>
          <li><span className="font-semibold">Reduce motion.</span> <span className="text-[var(--ink-2)]">Мерцания нет, лампа плавно включается за 150 ms, бегущая строка стоит, колода просто сменяется. Смысл состояния остаётся.</span></li>
        </ul>
      </div>
    </Section>
  );
}
