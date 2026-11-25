"use client";

/**
 * The owner's questions, drawn from whatever the engine asks (GET /api/uslub/answers): the goal first, pre-filled
 * from the channel's type, then how customers order and three prices for a shop, or what the channel is about for a
 * blog. Answers go to POST /api/uslub/answers once and every weekly plan and post reuses them. Always skippable.
 * The Brend xotirasi lamp waits for the owner here: it is the employee that remembers the answers.
 */
import { useState } from "react";
import { LampTile } from "../lamp/LampTile";
import { initialAnswers, type AnswerValues, type PriceRow, type Question } from "../ui/answers";
import { useCopy } from "../ui/lang";
import { useStudio } from "./store";

type Variant = "studio" | "mini";

function Choice({ q, value, onPick }: { q: Question; value?: string; onPick: (v: string) => void }) {
  return (
    <div role="radiogroup" aria-label={q.text} className="flex flex-wrap gap-2">
      {(q.options ?? []).map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(o.value)}
            className={`min-h-10 rounded-full px-3.5 text-left text-[14px] leading-tight transition-[background-color,box-shadow,color] duration-150 active:scale-[0.97] ${
              on ? "bg-glass-3 font-semibold text-ink shadow-[inset_0_0_0_1.5px_var(--ink-2)]" : "text-ink-2 shadow-[inset_0_0_0_1px_var(--hair-2)] hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Prices({ rows, onChange, c }: { rows: PriceRow[]; onChange: (rows: PriceRow[]) => void; c: ReturnType<typeof useCopy> }) {
  const set = (i: number, patch: Partial<PriceRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_8.5rem] gap-2">
          <input className="input !min-h-11" placeholder={c.questions.itemPh} aria-label={`${c.questions.itemPh} ${i + 1}`} value={r.name} onChange={(e) => set(i, { name: e.target.value })} />
          <input className="input tnum !min-h-11" inputMode="numeric" placeholder={c.questions.pricePh} aria-label={`${c.questions.pricePh} ${i + 1}`} value={r.price} onChange={(e) => set(i, { price: e.target.value })} />
        </div>
      ))}
    </div>
  );
}

export function QuestionsCard({ variant = "studio" }: { variant?: Variant }) {
  const c = useCopy();
  const q = useStudio((s) => s.questions);
  const [values, setValues] = useState<AnswerValues>(() => initialAnswers(q.list));
  // A new list (the engine asked again after an answer) starts from its own prefill.
  const key = q.list.map((x) => x.key).join(",");
  const [forKey, setForKey] = useState(key);
  if (key !== forKey) {
    setForKey(key);
    setValues(initialAnswers(q.list));
  }

  const box = variant === "mini" ? "ma-group p-4" : "card p-4 @md:p-5";
  if (q.state === "saved")
    return (
      <p role="status" className={`${box} text-[14.5px] leading-snug text-ok`}>
        {c.questions.saved}
      </p>
    );
  if (!q.list.length || !(q.state === "open" || q.state === "saving" || q.state === "error")) return null;
  const saving = q.state === "saving";
  const set = (patch: AnswerValues) => setValues((v) => ({ ...v, ...patch }));

  return (
    <section aria-labelledby="q-h" className={`flex flex-col gap-4 ${box}`}>
      <div className="flex items-center gap-3">
        <LampTile role="brand" size="xs" state={saving ? "warming" : "you"} className="h-10 w-10 shrink-0 !rounded-[12px]" aria-hidden />
        <div className="min-w-0">
          <h2 id="q-h" className="text-[16px] font-semibold leading-tight">
            {c.questions.title}
          </h2>
          <p className="mt-0.5 text-[13.5px] leading-snug text-ink-2">{c.questions.lead}</p>
        </div>
      </div>

      {q.list.map((item) => (
        <div key={item.key} className="flex flex-col gap-2">
          <p className="text-[15px] font-medium leading-snug">{item.text}</p>
          {item.input === "choice" && <Choice q={item} value={item.key === "goal" ? values.goal : values.order} onPick={(v) => set(item.key === "goal" ? { goal: v } : { order: v })} />}
          {item.key === "order" && values.order && values.order !== "mercat_link" && typeof item.prefill !== "string" && (
            <input className="input !min-h-11" placeholder={c.questions.contactPh} aria-label={c.questions.contactLabel} value={values.contact ?? ""} onChange={(e) => set({ contact: e.target.value })} />
          )}
          {item.input === "text" && (
            <textarea className="input !min-h-[84px]" rows={2} placeholder={c.questions.aboutPh} aria-label={item.text} value={values.about ?? ""} onChange={(e) => set({ about: e.target.value })} />
          )}
          {item.input === "prices" && <Prices rows={values.prices ?? []} onChange={(prices) => set({ prices })} c={c} />}
          {item.hint && <p className="text-[13px] leading-snug text-ink-3">{item.hint}</p>}
        </div>
      ))}

      {q.state === "error" && q.message && (
        <p role="alert" className="text-[14px] text-bad">
          {q.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2.5">
        <button type="button" className="btn" disabled={saving} onClick={() => void useStudio.getState().saveAnswers(values)}>
          {saving ? c.questions.saving : c.questions.save}
        </button>
        <button type="button" className="btn-2" disabled={saving} onClick={() => useStudio.getState().skipQuestions()}>
          {c.questions.later}
        </button>
      </div>
    </section>
  );
}
