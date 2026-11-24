"use client";

import type { NeuroHit, PostDraft, Script } from "@/lib/uslub/contract";
import { Check, PencilLine, Send, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { SCRIPT_LABEL } from "./mocks";

const SCRIPTS: Script[] = ["uz_latn", "uz_cyrl", "ru", "en"];

export function HumanScore({ score }: { score: number }) {
  const tone = score >= 90 ? "#16A394" : score >= 75 ? "#F2A93B" : "#C8553D";
  const word = score >= 90 ? "Odamday" : score >= 75 ? "Yaxshi, lekin tekshiring" : "Mashinaday";
  return (
    <div className="flex items-center gap-3" aria-label={`Inson bali ${score} / 100`}>
      <div className="relative h-12 w-12 shrink-0">
        <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="#E6DFD3" strokeWidth="3.5" />
          <motion.circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            stroke={tone}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={97.4}
            animate={{ strokeDashoffset: 97.4 * (1 - score / 100) }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-[13px] font-extrabold tabular-nums">{score}</span>
      </div>
      <div className="leading-tight">
        <div className="text-[13px] font-bold">Inson bali</div>
        <div className="text-[12px] text-stone">{word}</div>
      </div>
    </div>
  );
}

function Highlighted({ text, hits, onFix }: { text: string; hits: NeuroHit[]; onFix: (h: NeuroHit) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const sorted = [...hits].filter((h) => h.index >= 0).sort((a, b) => a.index - b.index);
  const parts: React.ReactNode[] = [];
  let at = 0;
  sorted.forEach((h, i) => {
    if (h.index < at) return;
    parts.push(text.slice(at, h.index));
    parts.push(
      <span key={i} className="relative">
        <button
          type="button"
          onClick={() => setOpen(open === i ? null : i)}
          className="rounded bg-clay-soft px-0.5 text-left text-ink underline decoration-clay decoration-wavy decoration-[1.5px] underline-offset-4"
        >
          {h.phrase}
        </button>
        <AnimatePresence>
          {open === i && (
            <motion.span
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute left-0 top-full z-20 mt-2 block w-72 rounded-xl border border-sand bg-white p-3 text-[13px] shadow-[0_12px_32px_-12px_rgba(19,21,28,.35)]"
            >
              <span className="block font-bold text-clay">Neyro-so&apos;z</span>
              <span className="mt-1 block text-stone">Umumiy ibora — mijoz buni reklama deb o&apos;qiydi.</span>
              {h.suggestion && (
                <>
                  <span className="mt-2 block font-semibold">Taklif:</span>
                  <span className="block">{h.suggestion}</span>
                  <button
                    type="button"
                    onClick={() => {
                      onFix(h);
                      setOpen(null);
                    }}
                    className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-[12px] font-bold text-white"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Almashtirish
                  </button>
                </>
              )}
            </motion.span>
          )}
        </AnimatePresence>
      </span>,
    );
    at = h.index + h.phrase.length;
  });
  parts.push(text.slice(at));
  return <div className="whitespace-pre-wrap text-[15px] leading-[1.65]">{parts}</div>;
}

export type ReviewState = "waiting" | "approved" | "published" | "scheduled";

export function PostReview({
  post,
  state,
  reasons,
  demo,
  onChange,
  onApprove,
  onPublish,
}: {
  post: PostDraft;
  state: ReviewState;
  reasons?: string[];
  demo?: boolean;
  onChange: (script: Script, text: string, humanScore?: number) => void;
  onApprove: () => void;
  onPublish: (script: Script) => Promise<void> | void;
}) {
  const [script, setScript] = useState<Script>("uz_latn");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const text = post.variants[script];
  const hits = post.neuroHits[script] ?? [];
  const totalHits = SCRIPTS.reduce((n, s) => n + (post.neuroHits[s]?.length ?? 0), 0);

  const fix = (h: NeuroHit) => {
    if (!h.suggestion) return;
    // Fix the same cliché in every script at once, like the editor would.
    SCRIPTS.forEach((s) => {
      const list = post.neuroHits[s] ?? [];
      const idx = (post.neuroHits[script] ?? []).indexOf(h);
      const twin = s === script ? h : list[idx];
      if (twin?.suggestion) onChange(s, post.variants[s].replace(twin.phrase, twin.suggestion), Math.min(98, post.humanScore + 9));
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Yozuv" className="flex flex-wrap gap-1 rounded-xl bg-shell p-1">
          {SCRIPTS.map((s) => (
            <button
              key={s}
              role="tab"
              type="button"
              aria-selected={script === s}
              onClick={() => setScript(s)}
              className={`relative rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                script === s ? "text-ink" : "text-stone hover:text-ink"
              }`}
            >
              {script === s && (
                <motion.span layoutId={`tab-${post.id}`} className="absolute inset-0 rounded-lg bg-white shadow-sm" />
              )}
              <span className="relative">
                {SCRIPT_LABEL[s]}
                {(post.neuroHits[s]?.length ?? 0) > 0 && (
                  <span className="ml-1.5 inline-block h-1.5 w-1.5 -translate-y-0.5 rounded-full bg-clay" />
                )}
              </span>
            </button>
          ))}
        </div>
        <HumanScore score={totalHits === 0 ? Math.max(post.humanScore, 92) : post.humanScore} />
      </div>

      <div className="rounded-2xl border border-sand bg-white p-4 sm:p-5">
        {editing ? (
          <textarea
            value={text}
            onChange={(e) => onChange(script, e.target.value)}
            rows={10}
            className="w-full resize-y rounded-lg border border-sand bg-paper p-3 text-[15px] leading-relaxed focus:outline-none"
          />
        ) : (
          <Highlighted text={text} hits={hits} onFix={fix} />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[13px] text-stone">
        {hits.length > 0 ? (
          <span>
            <b className="text-clay">{hits.length} ta neyro-so&apos;z</b> — ustiga bosing, Muharrir almashtiradi.
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-turq">
            <Check className="h-4 w-4" /> Neyro-so&apos;zlar yo&apos;q
          </span>
        )}
        {reasons && reasons.length > 0 && state === "waiting" && (
          <span className="rounded-full bg-saffron-soft px-2.5 py-0.5 text-[12px] font-semibold text-[#8a5a10]">
            Tasdiq kerak: {reasons.join(", ")}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setEditing(!editing)}
          className="inline-flex items-center gap-2 rounded-xl border border-sand bg-white px-4 py-2.5 text-[14px] font-semibold hover:border-ink/30"
        >
          <PencilLine className="h-4 w-4" /> {editing ? "Tayyor" : "Tahrirlash"}
        </button>
        {state === "waiting" || state === "scheduled" ? (
          <button
            type="button"
            onClick={onApprove}
            className="inline-flex items-center gap-2 rounded-xl bg-turq px-4 py-2.5 text-[14px] font-bold text-white hover:brightness-110"
          >
            <Check className="h-4 w-4" strokeWidth={3} /> Tasdiqlash
          </button>
        ) : null}
        <button
          type="button"
          disabled={state === "published" || busy || state === "waiting"}
          onClick={async () => {
            setBusy(true);
            await onPublish(script);
            setBusy(false);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-lapis px-4 py-2.5 text-[14px] font-bold text-white hover:bg-lapis-deep disabled:cursor-not-allowed disabled:opacity-40"
          title={state === "waiting" ? "Avval tasdiqlang" : undefined}
        >
          <Send className="h-4 w-4" />
          {state === "published" ? "Joylandi" : busy ? "Joylanmoqda…" : "Telegramga joylash"}
        </button>
      </div>
      {state === "published" && demo && (
        <p className="text-[12px] text-stone">Demo rejim: post kanalga yuborilmadi. Engine ulanganda shu tugma haqiqiy kanalga joylaydi.</p>
      )}
    </div>
  );
}
