import type { Metadata } from "next";
import Link from "next/link";
import { onest } from "@/components/lamp/font";
import { Colors, Typography } from "@/components/concept/board/Foundations";
import { Inventory } from "@/components/concept/board/Inventory";
import { Journey } from "@/components/concept/board/Journey";
import { Motion } from "@/components/concept/board/MotionSection";
import { Screens } from "@/components/concept/board/Screens";
import { Cover, Moodboard, Rules } from "@/components/concept/board/Sections";
import { SignatureSection } from "@/components/concept/board/SignatureSection";

export const metadata: Metadata = {
  title: "Konsepsiya",
  robots: { index: false, follow: false },
};

const NAV = [
  ["mood", "Мудборд"],
  ["rules", "Правила"],
  ["color", "Цвет"],
  ["type", "Шрифт"],
  ["motion", "Движение"],
  ["parts", "Компоненты"],
  ["journey", "Путь"],
  ["screens", "Экраны"],
  ["signature", "Анимация"],
  ["decide", "Решение"],
] as const;

export default function ConceptPage() {
  return (
    <main className={`lw ${onest.variable} min-h-dvh overflow-x-clip`}>
      <nav aria-label="Разделы борда" className="sticky top-0 z-40 border-b border-[var(--hair)] bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1240px] items-center gap-1 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] sm:px-8">
          <Link href="/" className="mr-3 shrink-0 text-[15px] font-semibold tracking-[-0.01em]">
            Mercat
          </Link>
          {NAV.map(([id, name]) => (
            <a key={id} href={`#${id}`} className="shrink-0 rounded-full px-3 py-1.5 text-[13.5px] text-[var(--ink-2)] transition-colors duration-200 hover:bg-[var(--glass-2)] hover:text-[var(--ink)]">
              {name}
            </a>
          ))}
        </div>
      </nav>
      <div className="mx-auto max-w-[1240px] px-4 sm:px-8">
        <Cover />
        <Moodboard />
        <Rules />
        <Colors />
        <Typography />
        <Motion />
        <Inventory />
        <Journey />
        <Screens />
        <SignatureSection />
        <section id="decide" aria-labelledby="decide-h" className="scroll-mt-16 border-t border-[var(--hair)] py-16 sm:py-24">
          <h2 id="decide-h" className="max-w-[18ch] text-balance text-[34px] font-semibold leading-[1.04] tracking-[-0.03em] sm:text-[52px]">
            Два решения, и я пересобираю продукт
          </h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-2">
            <li className="rounded-[24px] bg-[var(--glass)] p-6" style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}>
              <p className="text-[20px] font-semibold tracking-[-0.01em]">Борд целиком</p>
              <p className="mt-2 text-[15px] leading-relaxed text-[var(--ink-2)]">
                Одобряешь мир «Chiroqlar yonadi» с правилами света, цветом, шрифтом и движением? Или назови, что поменять: я поправлю борд до пересборки.
              </p>
            </li>
            <li className="rounded-[24px] bg-[var(--glass)] p-6" style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}>
              <p className="text-[20px] font-semibold tracking-[-0.01em]">Фирменная анимация: A, B или C</p>
              <p className="mt-2 text-[15px] leading-relaxed text-[var(--ink-2)]">
                Её увидит каждый, кто вставит ссылку, и её же снимаем для Reels. Выбранную сделаю боевой на лендинге и отрендерю в MP4 9:16 со звуком.
              </p>
            </li>
          </ol>
          <p className="mt-6 text-[14px] text-[var(--ink-3)]">Ответ — в чат сессии. После него: лендинг, Студия и Mini App в этом мире, превью на Vercel и PR.</p>
        </section>
      </div>
    </main>
  );
}
