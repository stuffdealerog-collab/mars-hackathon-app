import { Led } from "../lamp/Led";
import { num, useCopy, useLang } from "../ui/lang";
import { useStudio } from "./store";

/**
 * The channel's LED sign over every section: measured numbers only (subscribers, average
 * views, reach, posts read), amber dots like a shop sign, the caption under each in Onest.
 * It reaches under the hub's glass to the window's edge, so the glass has dots to frost.
 * Never the naturalness score: that is the model's opinion, not a measurement.
 */
export function ChannelSign({ bleed, side }: { bleed: number; side: "left" | "right" }) {
  const c = useCopy();
  const lang = useLang((s) => s.lang);
  const audit = useStudio((s) => s.audit);
  const problem = useStudio((s) => s.auditProblem);
  const mode = useStudio((s) => s.mode);
  const channel = useStudio((s) => s.brand?.channel);

  const cells: [string, string][] = [];
  if (audit) {
    if (audit.subscribers != null) cells.push([num(audit.subscribers, lang), c.channel.subscribers]);
    if (audit.avgViews != null) cells.push([num(Math.round(audit.avgViews), lang), c.channel.avgViews]);
    if (audit.reachRate != null) cells.push([`${num(audit.reachRate * 100, lang)}%`, c.channel.reach]);
    cells.push([num(audit.postsAnalyzed, lang), c.pro.postsAnalyzed]);
  }
  const measuring = !audit && !problem && mode === "channel" && !!channel;
  // main pads the hub side by `bleed` and the other side by 40 px; the sign undoes both.
  const pad = side === "left" ? { marginLeft: -bleed, paddingLeft: bleed, marginRight: -40, paddingRight: 40 } : { marginRight: -bleed, paddingRight: bleed, marginLeft: -40, paddingLeft: 40 };

  return (
    <div
      className="led-well relative mb-6 border-b border-[var(--hair)] bg-[radial-gradient(rgb(255_181_71/.07)_1px,transparent_1.4px)] [background-size:7px_7px]"
      style={{ ...pad, marginTop: -24, paddingTop: 22, backgroundColor: "var(--led-well, var(--stage))" }}
    >
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-end gap-x-12 gap-y-4 pb-5">
        {cells.length ? (
          cells.map(([v, k]) => (
            <div key={k} className="flex flex-col gap-2">
              <Led text={v} dot={3} gap={1.2} label={v} grid={false} />
              <span className="text-[13px] text-ink-3">{k}</span>
            </div>
          ))
        ) : (
          <p className={`py-3 text-[13px] text-ink-3 ${measuring ? "breathe" : ""}`} role="status">
            {measuring ? c.sign.measuring : c.sign.notMeasured}
          </p>
        )}
      </div>
    </div>
  );
}
