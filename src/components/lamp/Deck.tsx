"use client";

import { Check, PencilLine, Send } from "lucide-react";
import { useState } from "react";
import { DeckStack } from "./DeckStack";
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
  const [leaving, setLeaving] = useState(false);
  const top = left[0];
  const approve = () => {
    if (!top || leaving) return;
    setLeaving(true);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => {
      setLeft((l) => l.slice(1));
      setLeaving(false);
    }, reduce ? 0 : 320);
  };
  return (
    <div className="flex flex-col gap-3">
      <div aria-live="polite">
        {top ? (
          <DeckStack key={top.id} why={top.why} depth={Math.min(2, left.length - 1)} leaving={leaving}>
            <TgPost name={name} tone={tone} text={top.text} time={top.time} sample={sample} />
          </DeckStack>
        ) : (
          <div className="grid min-h-[180px] place-items-center rounded-[22px] text-center" style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}>
            <div>
              <Check className="mx-auto h-7 w-7 text-[var(--lime)]" aria-hidden />
              <p className="mt-2 text-[16px] font-semibold">Hammasi tasdiqlandi</p>
              <p className="mt-1 text-[13px] text-[var(--ink-2)]">Endi kanalga joylash qoldi.</p>
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        {top ? (
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
