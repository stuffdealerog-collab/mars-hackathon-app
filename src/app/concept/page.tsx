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
  ["mood", "Референсы"],
  ["rules", "Правила"],
  ["color", "Цвет"],
  ["type", "Шрифт"],
  ["motion", "Движение"],
  ["parts", "Компоненты"],
  ["journey", "Путь"],
  ["screens", "Экраны"],
  ["signature", "Анимация"],
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
      </div>
    </main>
  );
}
