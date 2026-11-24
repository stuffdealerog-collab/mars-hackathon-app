import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { adSignals } from "../../../src/lib/uslub/brain/adcheck";
import { benchmarkFor, NICHE_LABEL, summarize } from "../../../src/lib/uslub/brain/bench";
import { runRules } from "../../../src/lib/uslub/brain/rules";
import { computeStats, pct } from "../../../src/lib/uslub/brain/stats";
import { sufficiency } from "../../../src/lib/uslub/brain/sufficiency";
import { loadFixtures } from "./fixtures";

/** REPORT=1: golden-set tables for docs/brain/eval.md (no network, no LLM). */
it.skipIf(!process.env.REPORT)("golden-set report", () => {
  const fx = loadFixtures();
  const prepared = fx.map((f) => {
    const now = Date.parse(f.capturedAt);
    const stats = computeStats(f.data, now);
    return { f, stats, summary: summarize(stats, f.niche, f.capturedAt) };
  });
  const sums = prepared.map((p) => p.summary);
  const lines: string[] = [];
  lines.push("| niche | channels (clean) | median reach (p25–p75) | posts/week | best hour (median lift, n channels) | sale-post share | CTA share |", "|---|---|---|---|---|---|---|");
  for (const niche of [...new Set(fx.map((f) => f.niche))].sort()) {
    const all = sums.filter((s) => s.niche === niche);
    const b = benchmarkFor(sums, niche);
    if (!b || b.scope !== "niche") {
      lines.push(`| ${NICHE_LABEL[niche].en} | ${all.length} (clean < 5) | not enough data | – | – | – | – |`);
      continue;
    }
    const best = Object.entries(b.hourLift).sort((x, y) => y[1].median - x[1].median)[0];
    lines.push(
      `| ${NICHE_LABEL[niche].en} | ${all.length} (${b.n}) | ${b.reachRate ? `${pct(b.reachRate.median)} (${pct(b.reachRate.p25)}–${pct(b.reachRate.p75)})` : "–"} | ${b.postsPerWeek ?? "–"} | ${best ? `${best[0]} (${best[1].median}×, n=${best[1].n})` : "no bucket with n≥3"} | ${b.saleShare != null ? pct(b.saleShare, 0) : "–"} | ${b.ctaRate != null ? pct(b.ctaRate, 0) : "–"} |`,
    );
  }
  const counts = new Map<string, Record<string, number>>();
  let cold = 0;
  let suspect = 0;
  const suff = new Map<string, number>();
  for (const p of prepared) {
    if (p.stats.coldStart) cold++;
    if (p.stats.suspectBoosted) suspect++;
    const rules = runRules(p.stats, { category: p.f.niche, competitors: [], bench: benchmarkFor(sums, p.f.niche, p.f.data.channel) });
    for (const r of rules) {
      const c = counts.get(r.id) ?? {};
      c[r.status] = (c[r.status] ?? 0) + 1;
      counts.set(r.id, c);
    }
    for (const s of sufficiency({ stats: p.stats, bench: benchmarkFor(sums, p.f.niche, p.f.data.channel), competitors: 0 }, "en"))
      if (s.key === "bestTime") suff.set(s.status, (suff.get(s.status) ?? 0) + 1);
  }
  lines.push("", `channels: ${fx.length} · cold start: ${cold} · suspect (flat views): ${suspect} · best time from: ${[...suff.entries()].map(([k, v]) => `${k} ${v}`).join(", ")}`, "");
  // Ad-check verdicts on these (ordinary, presumably honest) channels: the old fixed 50% line vs niche bands.
  const verdicts = { fixed50: new Map<string, number>(), calibrated: new Map<string, number>() };
  for (const p of prepared) {
    const now = Date.parse(p.f.capturedAt);
    const b = benchmarkFor(sums, p.f.niche, p.f.data.channel);
    const band = b?.reachRate ? { low: Math.max(0.05, b.reachRate.p25 * 0.4), high: Math.max(0.8, b.reachRate.p75 * 1.6), label: p.f.niche } : undefined;
    const old = adSignals(p.f.data, p.stats, now, { errBand: { low: 0.1, high: 0.5, label: "fixed" } }).verdict;
    const cal = adSignals(p.f.data, p.stats, now, { errBand: band }).verdict;
    verdicts.fixed50.set(old, (verdicts.fixed50.get(old) ?? 0) + 1);
    verdicts.calibrated.set(cal, (verdicts.calibrated.get(cal) ?? 0) + 1);
  }
  const fmt = (m: Map<string, number>) => ["ok", "caution", "suspect", "insufficient"].map((k) => `${k} ${m.get(k) ?? 0}`).join(" · ");
  lines.push(`ad-check verdicts — fixed 10–50% line: ${fmt(verdicts.fixed50)}; niche-calibrated: ${fmt(verdicts.calibrated)}`, "");
  lines.push("| rule | fired | not fired | insufficient | inactive |", "|---|---|---|---|---|");
  for (const [id, c] of [...counts.entries()].sort((a, b) => (b[1].fired ?? 0) - (a[1].fired ?? 0))) lines.push(`| ${id} | ${c.fired ?? 0} | ${c.not_fired ?? 0} | ${c.insufficient ?? 0} | ${c.inactive ?? 0} |`);
  writeFileSync(process.env.REPORT_OUT ?? "/dev/stdout", `${lines.join("\n")}\n`);
});
