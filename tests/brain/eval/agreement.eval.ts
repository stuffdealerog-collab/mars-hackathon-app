import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv, weightedKappa } from "./agreement";
import { CRITERIA } from "./llm.eval";

/** Judge vs founder labels: exact agreement and quadratic-weighted kappa per criterion. */
const labelsUrl = new URL("../../../docs/brain/eval-labels.csv", import.meta.url);
const latestUrl = new URL("../../../docs/brain/eval-results/latest.json", import.meta.url);

describe.skipIf(!existsSync(labelsUrl) || !existsSync(latestUrl))("judge vs human agreement", () => {
  it("computes kappa on labelled rows", () => {
    const [head, ...rows] = parseCsv(readFileSync(labelsUrl, "utf8"));
    const col = (name: string) => head.indexOf(name);
    const latest = JSON.parse(readFileSync(latestUrl, "utf8")) as { file: string };
    const run = JSON.parse(readFileSync(new URL(latest.file, latestUrl), "utf8")) as {
      results: { handle: string; items?: { slot: number; judge?: { scores: Record<string, number>; machine_made: boolean } }[] }[];
    };
    const judgeOf = new Map<string, { scores: Record<string, number>; machine_made: boolean }>();
    for (const r of run.results) for (const it of r.items ?? []) if (it.judge) judgeOf.set(`${r.handle}#${it.slot}`, it.judge);
    const out: Record<string, unknown> = {};
    for (const c of CRITERIA) {
      const h: number[] = [];
      const j: number[] = [];
      for (const row of rows) {
        const v = Number(row[col(c)]);
        const jd = judgeOf.get(row[col("id")]);
        if (![1, 2, 3].includes(v) || !jd) continue;
        h.push(v);
        j.push(Math.min(3, Math.max(1, Math.round(jd.scores[c]))));
      }
      out[c] = { n: h.length, exact: h.length ? Math.round((h.filter((x, i) => x === j[i]).length / h.length) * 100) / 100 : null, kappa: weightedKappa(h, j), humanMean: h.length ? Math.round((h.reduce((a, b) => a + b, 0) / h.length) * 100) / 100 : null, judgeMean: j.length ? Math.round((j.reduce((a, b) => a + b, 0) / j.length) * 100) / 100 : null };
    }
    const mh: number[] = [];
    const mj: number[] = [];
    for (const row of rows) {
      const v = row[col("MACHINE_MADE")]?.trim().toLowerCase();
      const jd = judgeOf.get(row[col("id")]);
      if (!jd || !["y", "n", "yes", "no", "ha", "yo'q", "1", "0"].includes(v)) continue;
      mh.push(["y", "yes", "ha", "1"].includes(v) ? 2 : 1);
      mj.push(jd.machine_made ? 2 : 1);
    }
    out.MACHINE_MADE = { n: mh.length, exact: mh.length ? Math.round((mh.filter((x, i) => x === mj[i]).length / mh.length) * 100) / 100 : null, kappa: weightedKappa(mh, mj, 2) };
    writeFileSync(new URL("../../../docs/brain/eval-agreement.json", import.meta.url), `${JSON.stringify(out, null, 1)}\n`);
    console.log(JSON.stringify(out, null, 1));
    expect(Object.keys(out).length).toBe(CRITERIA.length + 1);
  });
});
