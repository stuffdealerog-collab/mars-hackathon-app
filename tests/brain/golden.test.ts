import { describe, expect, it } from "vitest";
import { benchLedger, benchmarkFor, summarize } from "../../src/lib/uslub/brain/bench";
import { runRules, statsLedger } from "../../src/lib/uslub/brain/rules";
import { assignHookTypes, buildSkeleton } from "../../src/lib/uslub/brain/skeleton";
import { computeStats } from "../../src/lib/uslub/brain/stats";
import { sufficiency } from "../../src/lib/uslub/brain/sufficiency";
import { channelValidity } from "../../src/lib/uslub/brain/validity";
import { loadFixtures } from "./eval/fixtures";

/**
 * Deterministic regression eval over the frozen golden channels (no network, no LLM).
 * Every change to stats, rules or the skeleton must keep these invariants on real Uzbek channels.
 */
const fixtures = loadFixtures();
const DAY = 86_400_000;

describe.skipIf(fixtures.length === 0)("golden channels: deterministic invariants", () => {
  const prepared = fixtures.map((f) => {
    const now = Date.parse(f.capturedAt);
    const stats = computeStats(f.data, now);
    return { f, now, stats, summary: summarize(stats, f.niche, f.capturedAt) };
  });
  const allSummaries = prepared.map((p) => p.summary);

  it.each(prepared.map((p) => [p.f.handle, p] as const))("%s", (_h, { f, now, stats }) => {
    expect(channelValidity(f.data, now, { role: "own" }).code).not.toBe("squatted");
    const bench = benchmarkFor(allSummaries, f.niche, f.data.channel);
    const rules = runRules(stats, { category: f.niche, competitors: [], bench });
    const ledgerIds = new Set([...statsLedger(stats, []), ...(bench ? benchLedger(bench, { reachRate: stats.reachRate }) : [])].map((e) => e.id));

    // Every id a fired rule cites exists in the ledger (the LLM can only copy what is there).
    for (const r of rules.filter((x) => x.status === "fired")) for (const id of r.ids) if (!id.startsWith("P.") && !id.startsWith("S.calendar")) expect(ledgerIds, `${r.id} cites ${id}`).toContain(id);

    // Honest cold start: no internal hour/format/language winners.
    if (stats.coldStart)
      for (const id of ["R.FORMAT_WINNER", "R.TIME_WINNER", "R.LANGUAGE_WINNER", "R.REPLICATE_WINNERS"]) expect(rules.find((r) => r.id === id)?.status).not.toBe("fired");

    const sk = buildSkeleton({ now, stats, competitors: [], rules, shares: { reach: 30, trust: 40, sale: 30 }, category: f.niche, hasPriceFact: true, hasOfferFact: false, approvedPosts: 12, bot: "uslubbot", lang: "uz", calendar: [], planTag: "gold01", bench });
    assignHookTypes(sk.slots);
    const s = sk.slots;
    expect(s.length).toBeGreaterThanOrEqual(3);
    expect(s.filter((x) => x.goal === "trust").length).toBeGreaterThanOrEqual(1);
    expect(s.filter((x) => x.goal === "sale").length).toBeLessThanOrEqual(3);
    expect(s.filter((x) => x.exp).length).toBe(1);
    for (let i = 0; i < s.length; i++) {
      const x = s[i];
      expect(x.time).not.toMatch(/:00$/);
      if (x.weekday === 4) expect(Number(x.time.slice(0, 2)) < 12 || Number(x.time.slice(0, 2)) >= 14).toBe(true);
      if (x.goal === "reach") expect(x.link).toBeUndefined();
      else expect(x.link).toBe(`https://t.me/uslubbot?start=src_gold01_${x.slot}`);
      if (x.goal === "sale" && i > 0) expect(s[i - 1].goal).toBe("trust");
      for (let j = 0; j < i; j++) if (x.goal === "sale" && s[j].goal === "sale") expect(Math.abs(Date.parse(x.day) - Date.parse(s[j].day)) / DAY).toBeGreaterThan(1);
      if (stats.coldStart) expect(x.timeSource).not.toBe("data");
      if (x.forecast?.status === "ok") {
        const v = x.forecast.views!;
        expect(v.low).toBeLessThanOrEqual(v.mid);
        expect(v.mid).toBeLessThanOrEqual(v.high);
        expect(x.forecast.basis.some((b) => b === "S.recentMedianViews" || b === "S.medianViews" || b === "S.bench.reachRate")).toBe(true);
        // A forecast that is not the channel's own data is labelled a guide (QA 2026-11-25).
        if (x.forecast.confidence !== "data") expect(x.forecast.display).toMatch(/^mo'ljal: /);
      } else expect(stats.medianViews).toBeUndefined();
    }
    // Reach is a share of subscribers: never above 100% (a cake shop showed 194%).
    if (stats.reachRate != null) expect(stats.reachRate).toBeLessThanOrEqual(1);
    const perType = new Map<string, number>();
    for (const x of s) perType.set(x.hookType!, (perType.get(x.hookType!) ?? 0) + 1);
    expect(Math.max(...perType.values())).toBeLessThanOrEqual(2);

    // Every capability is labelled data / benchmark / prior / insufficient.
    for (const item of sufficiency({ stats, bench, competitors: 0 }, "uz")) expect(item.text.length).toBeGreaterThan(10);
  });
});
