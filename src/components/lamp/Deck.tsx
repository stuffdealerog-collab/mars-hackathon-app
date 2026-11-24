"use client";

import { Check, PencilLine, Send } from "lucide-react";
import { useState } from "react";
import { TgPost } from "./TgPost";

export interface DeckItem {
  id: string;
  why: string; // why it waits for the owner ("Narx bor", "Birinchi post")
  text: string;
  time: string;
}

/**
 * The approval queue as a stacked deck: one decision at a time.
 * Approve sends the top card away; the next one steps forward.
 * The container height is fixed, so nothing below it moves.
 */
export function Deck({
  items,
  name = "Nafis kiyim",
  tone = "#C86B3C",
  sample = true,
  publishHref,
}: {
  items: DeckItem[];
  name?: string;
  tone?: string;
  sample?: boolean;
  publishHref?: string;
}) {
  const [left, setLeft] = useState(items);
  const [leaving, setLeaving] = useState<string | null>(null);
  const top = left[0];
  const approve = () => {
    if (!top || leaving) return;
    setLeaving(top.id);
    window.setTimeout(() => {
      setLeft((l) => l.slice(1));
      setLeaving(null);
    }, 320);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="relative h-[268px]" aria-live="polite">
        {left.length === 0 ? (
          <div className="grid h-full place-items-center rounded-[22px] text-center" style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}>
            <div>
              <Check className="mx-auto h-7 w-7 text-[var(--lime)]" aria-hidden />
              <p className="mt-2 text-[16px] font-semibold">Hammasi tasdiqlandi</p>
              <p className="mt-1 text-[13px] text-[var(--ink-2)]">Endi kanalga joylash qoldi.</p>
            </div>
          </div>
        ) : (
          left.slice(0, 3).map((it, i) => (
            <div
              key={it.id}
              className="deck-card absolute inset-x-0 bottom-0"
              data-depth={i}
              data-leaving={leaving === it.id || undefined}
              aria-hidden={i > 0 || undefined}
            >
              <p className="mb-2 flex items-center gap-2 px-1 text-[12.5px] text-[var(--ink-2)]">
                <span className="lamp__you" aria-hidden />
                {it.why}
              </p>
              <TgPost name={name} tone={tone} text={it.text} time={it.time} sample={sample} />
            </div>
          ))
        )}
      </div>
      <div className="flex gap-2">
        {left.length > 0 ? (
          <>
            <button type="button" className="btn-lime flex-1" onClick={approve}>
              <Check className="h-[18px] w-[18px]" aria-hidden /> Tasdiqlash
            </button>
            <button type="button" className="btn-quiet" aria-label="Tahrirlash">
              <PencilLine className="h-[18px] w-[18px]" aria-hidden />
            </button>
          </>
        ) : (
          <a href={publishHref ?? "#"} className="btn-lime flex-1">
            <Send className="h-[18px] w-[18px]" aria-hidden /> Telegramda joylash
          </a>
        )}
      </div>
      <p className="tnum text-center text-[12.5px] text-[var(--ink-3)]">{left.length > 0 ? `${left.length} ta ish sizni kutmoqda` : "Navbat bo‘sh"}</p>
    </div>
  );
}
