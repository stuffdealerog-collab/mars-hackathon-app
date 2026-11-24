import type { AgentRole, PostDraft, Script } from "@/lib/uslub/contract";
import dynamic from "next/dynamic";
import { LAMPS } from "../lamp/lamps";
import { ownerText } from "../ui/format";
import { fmt, useCopy, useLang } from "../ui/lang";
import type { Lamps } from "./Department";
import { refsWording, whenOf } from "./desk";
import { slotKey, useStudio } from "./store";

const PlanRowDetails = dynamic(() => import("./pro/ProDetails").then((m) => m.PlanRowDetails), { ssr: false });

const SCRIPTS: Script[] = ["uz_latn", "uz_cyrl", "ru", "en"];
const SHORT: Record<Script, string> = { uz_latn: "UZ", uz_cyrl: "ЎЗ", ru: "RU", en: "EN" };

/**
 * Postlar · Pro, right column: the post's insides, each section signed by the employee who
 * made it (a filament in their colour, lit when their lamp is). Built from the same pieces as
 * PostDetails; it sizes itself from its own container.
 */
export function Inspector({ post, script, lamps }: { post: PostDraft; script: Script; lamps: Lamps }) {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const plan = useStudio((s) => s.plan);
  const edited = useStudio((s) => s.edited[post.id]);
  const setPostScript = useStudio((s) => s.setPostScript);
  const fresh = useStudio((s) => s.mode === "fresh");
  const visual = useStudio((s) => s.brand?.visual);
  const slot = post.slot;
  const item = slot ? plan?.items.find((it) => slotKey(it) === slotKey(slot)) : undefined;
  const hits = edited?.[script] ? [] : (post.neuroHits[script] ?? []);
  const img = post.image;
  const sample = useStudio((s) => s.sample);
  const imgWord = sample ? c.sample.noImage : !img ? c.lampState.off : img.status === "ready" ? c.lampState.on : img.status === "failed" ? c.lampState.error : c.lampState.warming;

  return (
    <aside aria-label={c.pro.label} className="@container card flex flex-col divide-y divide-line">
      {slot && (
      <Section role="strategist" lamps={lamps} title={c.insp.plan}>
        {slot ? (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13.5px] leading-snug">
            <dt className="text-ink-2">{c.pro.goal}</dt>
            <dd>{c.channel.goal[slot.goal]}</dd>
            {slot.hook && (
              <>
                <dt className="text-ink-2">{c.pro.hook}</dt>
                <dd>{ownerText(slot.hook, lang)}</dd>
              </>
            )}
            {slot.cta && (
              <>
                <dt className="text-ink-2">{c.pro.cta}</dt>
                <dd>{ownerText(slot.cta, lang)}</dd>
              </>
            )}
          </dl>
        ) : (
          <p className="text-[13.5px] text-ink-2">{post.brief}</p>
        )}
        {slot && <p className="tnum mt-2 text-[12.5px] text-ink-3">{fmt(c.queue.suggest, { when: whenOf(slot) })}</p>}
        {item && <PlanRowDetails item={item} />}
      </Section>
      )}

      <Section role="translator" lamps={lamps} title={c.insp.lang}>
        <div className="seg" role="group" aria-label={c.posts.langLabel}>
          {SCRIPTS.filter((s) => post.variants[s]?.trim()).map((s, i) => (
            <button key={s} type="button" aria-pressed={script === s} title={`${c.posts.scriptNames[s]} · ${i + 1}`} aria-keyshortcuts={String(i + 1)} onClick={() => setPostScript(s)}>
              {SHORT[s]}
            </button>
          ))}
        </div>
        {edited && Object.keys(edited).length > 0 && <p className="mt-2 text-[12.5px] text-ink-3">{c.insp.cyrlStale}</p>}
      </Section>

      <Section role="editor" lamps={lamps} title={c.lamps.editor.name}>
        <p className="tnum text-[13.5px] font-medium">{fmt(c.insp.natural, { n: post.humanScore })}</p>
        <p className="mt-1 text-[13px] leading-snug">
          <span className="text-ink-2">{c.pro.flagged}: </span>
          <span className={hits.length ? "text-bad" : "text-ink-2"}>{hits.length ? [...new Set(hits.map((h) => h.phrase))].slice(0, 6).join(", ") : c.pro.none}</span>
        </p>
      </Section>

      <Section role="designer" lamps={lamps} title={c.insp.image}>
        <p className="text-[13.5px]">
          {imgWord}
          {img?.refsUsed ? <span className="text-ink-2"> · {refsWording(c, img.refsUsed, fresh, visual)}</span> : null}
        </p>
        {img?.error && <p className="mt-1 text-[12.5px] text-bad">{img.error}</p>}
      </Section>

      <Section role="copywriter" lamps={lamps} title={c.insp.brief}>
        <p className="text-[13.5px] leading-relaxed text-ink-2">{ownerText(post.brief.split("\n")[0], lang)}</p>
      </Section>
    </aside>
  );
}

/** A section signed by its employee: a 3 x 14 filament in their colour, lit when they are. */
function Section({ role, lamps, title, children }: { role: AgentRole; lamps: Lamps; title: string; children: React.ReactNode }) {
  const c = useCopy();
  const lit = lamps.state[role] === "on" || lamps.state[role] === "you" || lamps.state[role] === "warming";
  return (
    <section className="px-4 py-3.5 @md:px-5">
      <h3 className="mb-2 flex items-center gap-2.5 text-[13px]">
        <span
          aria-hidden
          className="h-3.5 w-[3px] rounded-full transition-[opacity,box-shadow] duration-300"
          style={{ background: LAMPS[role].hue, opacity: lit ? 1 : 0.28, boxShadow: lit ? `0 0 8px ${LAMPS[role].hue}` : "none" }}
        />
        <span className="font-semibold">{c.lamps[role].name}</span>
        {title !== c.lamps[role].name && <span className="text-ink-2">· {title}</span>}
      </h3>
      {children}
    </section>
  );
}
