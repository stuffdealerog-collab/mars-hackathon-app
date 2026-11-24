"use client";

import { Board, Lamps, Prism, SigFrame } from "../signature";
import { Section } from "./Sections";

const OPTIONS = [
  {
    key: "A",
    name: "Chiroqlar",
    mod: Lamps,
    idea: "Десять ламп загораются по конвейеру, всё быстрее, как барабанная дробь. Потом поверх встаёт готовый пост и лаймовое «Tasdiqlash».",
    why: "Ближе всего к самому продукту: это ровно то, что владелец увидит после вставки ссылки. Десять ударов легко положить на звук.",
    risk: "Самый ожидаемый из трёх.",
    Comp: Lamps.SigLamps,
  },
  {
    key: "B",
    name: "Spektr",
    mod: Prism,
    idea: "Ссылка сжимается в белую точку, падает и расщепляется на десять лучей. Лучи бьют в лампы, лампы складываются в колоду, сверху лежит пост.",
    why: "Самый кинематографичный: один большой удар-расщепление хорошо стопорит ленту в первые 3 секунды.",
    risk: "Абстрактнее: без подписи можно не понять, что это сотрудники.",
    Comp: Prism.SigPrism,
  },
  {
    key: "C",
    name: "Yugurgan satr",
    mod: Board,
    idea: "Весь экран — LED-табло магазина. Ссылка бежит строкой, потом табло переписывается результатами: «OVOZ: SIZ», «QAMROV 27%», «10 JOY». Финал — «TASDIQLAYSIZMI?».",
    why: "Самый локальный и читаемый на телефоне: огромные буквы, механические щелчки, бегущую строку узнаёт каждый.",
    risk: "Показывает результат, а не отдел: десяти сотрудников в кадре нет.",
    Comp: Board.SigBoard,
  },
] as const;

export function SignatureSection() {
  return (
    <Section
      id="signature"
      title="Фирменный момент"
      lead="Что происходит после вставки ссылки. Три варианта по 14–15 секунд в 9:16, с битами под звук. Каждый запускается сам, когда долистаешь, и по кнопке «Ещё раз»."
    >
      <div className="-mx-4 flex snap-x snap-mandatory gap-8 overflow-x-auto px-4 pb-4 [scrollbar-width:thin] sm:mx-0 sm:px-0 xl:grid xl:grid-cols-3 xl:overflow-visible" tabIndex={0} role="region" aria-label="Три варианта анимации, прокрутка вбок">
        {OPTIONS.map((o) => (
          <article key={o.key} className="flex w-[320px] shrink-0 snap-start flex-col gap-5 xl:w-auto">
            <div>
              <h3 className="text-[24px] font-semibold tracking-[-0.02em]">
                {o.key}. {o.name}
              </h3>
              <p className="mt-2 text-[14.5px] leading-relaxed">{o.idea}</p>
              <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-2)]">
                <span className="text-[var(--ink)]">Почему зацепит.</span> {o.why}
              </p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--ink-2)]">
                <span className="text-[var(--ink)]">Риск.</span> {o.risk}
              </p>
            </div>
            <SigFrame title={`${o.key}. ${o.name}`} length={o.mod.LENGTH} beats={o.mod.BEATS}>
              {(p) => <o.Comp {...p} />}
            </SigFrame>
          </article>
        ))}
      </div>
    </Section>
  );
}
