"use client";

import type { NeuroHit, PostDraft, Script } from "@/lib/uslub/contract";
import { Check, PencilLine, Send, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { CountMatrix } from "../uslub/DotMatrix";
import { SCRIPT_LABEL } from "./mocks";

const SCRIPTS: Script[] = ["uz_latn", "uz_cyrl", "ru", "en"];

export function HumanScore({ score }: { score: number }) {
  const tone = score >= 90 ? "#3BE08A" : score >= 75 ? "#FFB547" : "#FF6B5B";
  const word = score >= 90 ? "Odamday" : score >= 75 ? "Tekshirib chiqing" : "Mashinaday";
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]" aria-label={`Inson bali ${score} / 100`}>
      <CountMatrix to={score} dot={3.4} gap={1.6} color={tone} />
      <div className="leading-tight">
        <div className="mono-label">Inson bali</div>
        <div className="text-[12px] font-semibold" style={{ color: tone }}>{word}</div>
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
          className="rounded-md bg-coral/20 px-1 text-left text-fog underline decoration-coral decoration-wavy decoration-[1.5px] underline-offset-4"
        >
          {h.phrase}
        </button>
        <AnimatePresence>
          {open === i && (
            <motion.span
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute left-0 top-full z-20 mt-2 block w-72 rounded-2xl bg-surface-3 p-3.5 text-[13px] shadow-[inset_0_0_0_1px_rgba(255,255,255,.12),0_20px_50px_-12px_rgba(0,0,0,.8)]"
            >
              <span className="mono-label block !text-coral">Neyro-so&apos;z</span>
              <span className="mt-1 block text-mute">Umumiy ibora — mijoz buni reklama deb o&apos;qiydi.</span>
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
                    className="pill-lime mt-2.5 px-3.5 py-1.5 text-[12px]"
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
  publishLabel,
  onChange,
  onApprove,
  onPublish,
}: {
  post: PostDraft;
  state: ReviewState;
  reasons?: string[];
  demo?: boolean;
  publishLabel?: string;
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
        <div role="tablist" aria-label="Yozuv" className="flex flex-wrap gap-1 rounded-full bg-surface-2 p-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
          {SCRIPTS.map((s) => (
            <button
              key={s}
              role="tab"
              type="button"
              aria-selected={script === s}
              onClick={() => setScript(s)}
              className={`relative rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                script === s ? "text-void" : "text-mute hover:text-fog"
              }`}
            >
              {script === s && (
                <motion.span layoutId={`tab-${post.id}`} className="absolute inset-0 rounded-full bg-fog" />
              )}
              <span className="relative">
                {SCRIPT_LABEL[s]}
                {(post.neuroHits[s]?.length ?? 0) > 0 && (
                  <span className="ml-1.5 inline-block h-1.5 w-1.5 -translate-y-0.5 rounded-full bg-coral" />
                )}
              </span>
            </button>
          ))}
        </div>
        <HumanScore score={totalHits === 0 ? Math.max(post.humanScore, 92) : post.humanScore} />
      </div>

      <div className="rounded-[28px] bg-surface-2 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)] sm:p-6">
        {editing ? (
          <textarea
            value={text}
            onChange={(e) => onChange(script, e.target.value)}
            rows={10}
            className="w-full resize-y rounded-2xl border border-edge bg-surface p-3 text-[15px] leading-relaxed text-fog focus:outline-none"
          />
        ) : (
          <Highlighted text={text} hits={hits} onFix={fix} />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[13px] text-mute">
        {hits.length > 0 ? (
          <span>
            <b className="text-coral">{hits.length} ta neyro-so&apos;z</b> — ustiga bosing, Muharrir almashtiradi.
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-ok">
            <Check className="h-4 w-4" /> Neyro-so&apos;zlar yo&apos;q
          </span>
        )}
        {reasons && reasons.length > 0 && state === "waiting" && (
          <span className="rounded-full bg-wait/15 px-2.5 py-0.5 text-[12px] font-semibold text-wait">
            Tasdiq kerak: {reasons.join(", ")}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setEditing(!editing)}
          className="pill-ghost px-4 py-2.5 text-[14px]"
        >
          <PencilLine className="h-4 w-4" /> {editing ? "Tayyor" : "Tahrirlash"}
        </button>
        {state === "waiting" || state === "scheduled" ? (
          <button
            type="button"
            onClick={onApprove}
            className="pill-lime px-5 py-2.5 text-[14px]"
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
          className="pill-ghost px-4 py-2.5 text-[14px] disabled:cursor-not-allowed disabled:opacity-40"
          title={state === "waiting" ? "Avval tasdiqlang" : undefined}
        >
          <Send className="h-4 w-4" />
          {state === "published" ? "Joylandi" : busy ? "Joylanmoqda…" : publishLabel ?? "Telegramga joylash"}
        </button>
      </div>
      {state === "published" && demo && (
        <p className="text-[12px] text-mute">Demo rejim: post kanalga yuborilmadi. Engine ulanganda shu tugma haqiqiy kanalga joylaydi.</p>
      )}
    </div>
  );
}
