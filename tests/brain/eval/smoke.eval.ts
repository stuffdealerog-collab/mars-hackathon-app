import { existsSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Live end-to-end smoke (SMOKE=1): one real channel, web on, nothing saved. Prints the stage timeline. */
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

describe.skipIf(!process.env.SMOKE)("live strategy smoke", () => {
  it("streams stages and finishes under the 60 s route limit", async () => {
    const { buildStrategy } = await import("../../../src/lib/uslub/brain/strategy");
    const t0 = Date.now();
    const timeline: string[] = [];
    const r = await buildStrategy({
      knowledge: process.env.SMOKE_KB ?? "",
      channel: process.env.SMOKE_CHANNEL ?? "safiabakery",
      competitors: (process.env.SMOKE_COMPETITORS ?? "lesailes_uz,bonapetit_uz").split(",").filter(Boolean),
      category: process.env.SMOKE_CATEGORY ?? "cafe bakery",
      lang: "uz",
      save: false,
      onStage: (e) => timeline.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${e.stage}${e.status ? `:${String(e.status)}` : ""}${e.item ? ` slot ${(e.item as { slot: number }).slot}` : ""}`),
    });
    writeFileSync(process.env.SMOKE_OUT ?? "/dev/null", JSON.stringify({ ...r, timeline }, null, 1));
    console.log(timeline.join("\n"));
    console.log(JSON.stringify({ elapsed: r.elapsedMs, items: r.plan.items.length, critic: r.criticReport.map((c) => c.status), web: r.web.length, issues: r.competitorIssues.map((i) => `${i.channel}:${i.code}`), positioning: r.strategy.positioning.slice(0, 200) }, null, 1));
    expect(r.elapsedMs).toBeLessThan(60_000);
  });
});
