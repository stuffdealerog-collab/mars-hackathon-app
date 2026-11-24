import { existsSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Live end-to-end smoke (SMOKE=1): one real channel, web on, nothing saved. Prints the stage timeline. */
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

describe.skipIf(!process.env.SMOKE_MANY)("live strategy load smoke", () => {
  it("runs several channels at once and reports time to skeleton, first item, strategy, done", async () => {
    const { buildStrategy } = await import("../../../src/lib/uslub/brain/strategy");
    const chans = (process.env.SMOKE_MANY as string).split(",");
    const rows = await Promise.all(
      chans.map(async (ch) => {
        const t0 = Date.now();
        const at: Record<string, number> = {};
        const mark = (k: string) => (at[k] ??= Math.round((Date.now() - t0) / 100) / 10);
        try {
          const r = await buildStrategy({
            knowledge: "",
            channel: ch,
            lang: "uz",
            save: false,
            onStage: (e) => {
              if (e.stage === "skeleton") mark("skeleton");
              if (e.stage === "item") mark("firstItem");
              if (e.stage === "web") mark("web");
              if (e.stage === "strategy") mark("strategy");
            },
          });
          mark("done");
          return { ch, ...at, facts: r.facts.length, web: r.web.length, strategyOk: Boolean(r.strategy.positioning), critic: r.criticReport.map((c) => c.status[0]).join("") };
        } catch (err) {
          return { ch, error: err instanceof Error ? err.message : String(err), done: Math.round((Date.now() - t0) / 100) / 10 };
        }
      }),
    );
    console.log(JSON.stringify(rows));
    writeFileSync(process.env.SMOKE_OUT ?? "/dev/null", JSON.stringify(rows, null, 1));
    for (const r of rows) expect((r as { done: number }).done).toBeLessThan(50);
  });
});

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
