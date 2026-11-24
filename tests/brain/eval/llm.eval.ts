import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { NICHE_LABEL, summarize } from "../../../src/lib/uslub/brain/bench";
import { computeStats } from "../../../src/lib/uslub/brain/stats";
import { kbFromPosts, loadFixtures, type Fixture } from "./fixtures";

/**
 * LLM eval (BRAIN_EVAL=1). For each golden channel: run the full strategy pipeline on the frozen
 * channel (KB = its own public posts, no web, no DB), collect deterministic metrics, and have an
 * independent judge (claude-opus-5-5, not the generator's model) score every plan item on a
 * 5-criterion 1–3 rubric with the criterion order permuted per item (position-bias control).
 * Writes docs/brain/eval-results/<date>-<promptVersion>.json, the founder's label sheet
 * docs/brain/eval-labels.csv, and gates regressions against docs/brain/eval-baseline.json.
 */
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export const CRITERIA = ["SPECIFIC", "GROUNDED", "NATURAL", "ACTIONABLE", "GOAL_FIT"] as const;
export type Criterion = (typeof CRITERIA)[number];

const RUBRIC: Record<Criterion, string> = {
  SPECIFIC: "1 = the hook could fit any business (no number, product, place or real question); 2 = one specific but weakly used; 3 = a concrete specific from the facts that matters for the slot goal.",
  GROUNDED: "1 = states a fact, number, offer, deadline or promise that is NOT in the facts; 2 = vague implication not quite supported; 3 = every claim is supported by the facts (or no claims).",
  NATURAL: "1 = sounds machine-made or translated (calques, clichés, wrong apostrophes, mixed scripts, stiff phrasing); 2 = understandable with awkward bits; 3 = reads like the owner wrote it in natural Uzbek.",
  ACTIONABLE: "1 = the owner cannot tell what to post/shoot, or the CTA is missing/double; 2 = doable but vague; 3 = clear brief the owner can shoot with a phone this week and exactly one clear CTA.",
  GOAL_FIT: "1 = hook and CTA do not serve the slot goal (reach = shareable/saveable, trust = proof/familiarity, sale = clear offer with price); 2 = partly; 3 = fully.",
};

const JudgeSchema = z.object({
  items: z.array(
    z.object({
      slot: z.number(),
      scores: z.object({ SPECIFIC: z.number(), GROUNDED: z.number(), NATURAL: z.number(), ACTIONABLE: z.number(), GOAL_FIT: z.number() }),
      machine_made: z.boolean(),
      worst: z.string(),
    }),
  ),
});

/** Deterministic permutation (mulberry32) so a re-run judges with the same orders. */
function permute<T>(xs: readonly T[], seed: number): T[] {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

type PlanItemOut = { slot: number; goal: string; format: string; hookType?: string; hook: string; cta: string; brief: string; critic: string; fails?: { check: string }[]; forecast?: { display: string } };

async function judge(fx: Fixture, facts: { id: string; quote: string }[], items: PlanItemOut[]) {
  const { getAnthropic } = await import("../../../src/lib/uslub/llm");
  const { wellFormed } = await import("../../../src/lib/uslub/brain/llm");
  const cut = (t: string, n: number) => Array.from(t).slice(0, n).join("");
  const anchors = fx.data.posts.filter((p) => p.text.length > 80).slice(0, 3).map((p) => cut(p.text, 400));
  const blocks = items.map((it, i) => {
    const order = permute(CRITERIA, fx.handle.length * 97 + it.slot * 13 + i);
    return `ITEM slot=${it.slot} goal=${it.goal} format=${it.format}\nhook: ${it.hook || "(empty)"}\ncta: ${it.cta}\nbrief: ${it.brief.split("\n— Dalil")[0]}\nScore in this order: ${order.join(", ")}`;
  });
  const res = await getAnthropic().beta.messages.parse(
    {
      model: "claude-opus-5-5",
      max_tokens: 8000,
      output_config: { effort: "medium", format: betaZodOutputFormat(JudgeSchema) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system:
        "You are a strict senior marketer in Tashkent who reads Uzbek natively. You grade a weekly Telegram plan written by an AI for a small business. " +
        "Judge only against the business FACTS given (they are the business's own public posts) and the rubric. Be harsh: a 3 means you would publish it as is.\n" +
        `RUBRIC (1–3):\n${CRITERIA.map((c) => `${c}: ${RUBRIC[c]}`).join("\n")}\n` +
        "machine_made = true if a native reader would suspect an AI wrote the hook or CTA. worst = the single worst phrase quoted, or empty.",
      messages: [
        {
          role: "user",
          content: wellFormed(`BUSINESS: ${fx.data.title ?? fx.handle} (${NICHE_LABEL[fx.niche].en})\nFACTS:\n${cut(facts.map((f) => `${f.id}: ${f.quote}`).join("\n"), 6000)}\n\nOWNER'S OWN POSTS (voice reference):\n${anchors.join("\n---\n")}\n\n${blocks.join("\n\n")}`),
        },
      ],
    },
    { timeout: 120_000 },
  );
  if (res.stop_reason !== "end_turn" || !res.parsed_output) throw new Error(`judge stop_reason=${res.stop_reason}`);
  return res.parsed_output.items;
}

type JudgedItem = PlanItemOut & { judge?: z.infer<typeof JudgeSchema>["items"][number] };
type RunRow = { items: JudgedItem[]; metrics: { hardFails: number; emptyHook: boolean; neuroHits: number; humanScore: number; critic: string }[]; pipelineMs: number };

function summarizeRun(results: Record<string, unknown>[], promptVersion: string) {
  const ok = results.filter((r) => !r.error) as unknown as RunRow[];
  const judgedItems = ok.flatMap((r) => r.items.filter((i) => i.judge));
  const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);
  const allMetrics = ok.flatMap((r) => r.metrics);
  const secs = ok.map((r) => r.pipelineMs / 1000).sort((a, b) => a - b);
  return {
    promptVersion,
    runAt: new Date().toISOString(),
    channels: results.map((r) => r.handle as string),
    errors: results.filter((r) => r.error).map((r) => `${r.handle}: ${r.error}`),
    items: allMetrics.length,
    judged: judgedItems.length,
    judge: Object.fromEntries(CRITERIA.map((c) => [c, mean(judgedItems.map((i) => i.judge!.scores[c]))])) as Record<Criterion, number | null>,
    anyOne: judgedItems.length ? Math.round((judgedItems.filter((i) => CRITERIA.some((c) => i.judge!.scores[c] <= 1)).length / judgedItems.length) * 100) / 100 : null,
    allThree: judgedItems.length ? Math.round((judgedItems.filter((i) => CRITERIA.every((c) => i.judge!.scores[c] >= 3)).length / judgedItems.length) * 100) / 100 : null,
    machineMade: judgedItems.length ? Math.round((judgedItems.filter((i) => i.judge!.machine_made).length / judgedItems.length) * 100) / 100 : null,
    residualHardFails: allMetrics.reduce((a, m) => a + m.hardFails, 0),
    emptyHooks: allMetrics.filter((m) => m.emptyHook).length,
    neuroHits: allMetrics.reduce((a, m) => a + m.neuroHits, 0),
    meanHumanScore: mean(allMetrics.map((m) => m.humanScore)),
    critic: Object.fromEntries(["passed", "fixed", "owner_input", "timeout"].map((st) => [st, allMetrics.filter((m) => m.critic === st).length])),
    pipelineSeconds: { median: secs.length ? secs[Math.floor((secs.length - 1) / 2)] : null, max: secs.length ? secs[secs.length - 1] : null },
  };
}

function pickChannels(all: Fixture[]): Fixture[] {
  const want = process.env.EVAL_CHANNELS?.split(",").map((s) => s.trim().toLowerCase());
  if (want?.length) return all.filter((f) => want.includes(f.handle.toLowerCase()));
  const seen = new Set<string>();
  const out: Fixture[] = [];
  for (const f of all) {
    if (seen.has(f.niche) || f.data.posts.length < 10) continue;
    seen.add(f.niche);
    out.push(f);
  }
  return out.slice(0, Number(process.env.EVAL_N ?? 8));
}

describe.skipIf(!process.env.BRAIN_EVAL)("Brain LLM eval", () => {
  it("runs plans on golden channels and judges them", async () => {
    const { buildStrategy, PROMPT_VERSION } = await import("../../../src/lib/uslub/brain/strategy");
    const { analyzeNeuro } = await import("../../../src/lib/uslub/neuro");
    const all = loadFixtures();
    const chosen = pickChannels(all);
    expect(chosen.length).toBeGreaterThan(0);
    const summaries = all.map((f) => summarize(computeStats(f.data, Date.parse(f.capturedAt)), f.niche, f.capturedAt));
    if (process.env.EVAL_JOBS_OUT)
      writeFileSync(process.env.EVAL_JOBS_OUT, JSON.stringify(chosen.map((fx) => ({ handle: fx.handle, category: NICHE_LABEL[fx.niche].en, brandName: fx.data.title, knowledge: kbFromPosts(fx.data) }))));

    const results: Record<string, unknown>[] = [];
    const queue = [...chosen];
    const worker = async () => {
      for (let fx = queue.shift(); fx; fx = queue.shift()) {
        const t = Date.now();
        try {
          const r = await buildStrategy({
            knowledge: kbFromPosts(fx.data),
            category: NICHE_LABEL[fx.niche].en,
            brandName: fx.data.title,
            lang: "uz",
            now: Date.parse(fx.capturedAt),
            preloaded: { own: fx.data, summaries },
            web: false,
            save: false,
          });
          const items = r.plan.items as unknown as PlanItemOut[];
          const judged = await judge(fx, r.facts, items).catch((err: unknown) => {
            console.warn(`judge failed for ${fx.handle}`, err instanceof Error ? err.message : err);
            return [];
          });
          const metrics = items.map((it) => {
            const neuro = analyzeNeuro(`${it.hook}\n${it.cta}`, "uz_latn");
            return {
              slot: it.slot,
              critic: it.critic,
              hardFails: (it.fails ?? []).filter((f) => ["GROUNDED", "PRICE", "URGENCY"].includes(f.check)).length,
              emptyHook: !it.hook,
              hookLen: it.hook.length,
              neuroHits: neuro.hits.length,
              humanScore: neuro.humanScore,
            };
          });
          results.push({
            handle: fx.handle,
            niche: fx.niche,
            elapsedMs: Date.now() - t,
            pipelineMs: r.elapsedMs,
            facts: r.facts.length,
            factList: r.facts.map(({ id, quote }) => ({ id, quote })),
            firedRules: r.firedRules.map((x) => x.id),
            ownerQuestions: r.ownerQuestions.length,
            positioningHasFact: /\bF\d+\b/.test(r.strategy.positioning),
            strategyOk: Boolean(r.strategy.positioning),
            rationale: r.plan.rationale.split("\n").filter(Boolean).length,
            items: items.map((it) => ({ ...it, judge: judged.find((j) => j.slot === it.slot) })),
            metrics,
          });
          console.log(`✓ ${fx.handle} ${Math.round((Date.now() - t) / 1000)}s, ${items.length} items, judged ${judged.length}`);
        } catch (err) {
          results.push({ handle: fx.handle, niche: fx.niche, error: err instanceof Error ? err.message : String(err) });
          console.warn(`✗ ${fx.handle}`, err instanceof Error ? err.message : err);
        }
      }
    };
    await Promise.all(Array.from({ length: Number(process.env.EVAL_CONCURRENCY ?? 2) }, worker));

    const summary = summarizeRun(results, PROMPT_VERSION);
    const dir = new URL("../../../docs/brain/eval-results/", import.meta.url);
    mkdirSync(dir, { recursive: true });
    const stamp = `${summary.runAt.slice(0, 16).replace(/[:T]/g, "")}-${PROMPT_VERSION}`;
    writeFileSync(new URL(`${stamp}.json`, dir), `${JSON.stringify({ summary, results }, null, 1)}\n`);

    // Founder's label sheet (judge scores are NOT in it, so the labels stay blind).
    const esc = (s: string) => `"${s.replace(/"/g, '""').replace(/\n/g, " ")}"`;
    const ok = results.filter((r) => !r.error) as unknown as RunRow[];
    const rows = ["id,channel,slot,goal,format,hook,cta,brief,SPECIFIC,GROUNDED,NATURAL,ACTIONABLE,GOAL_FIT,MACHINE_MADE,COMMENT"];
    for (const r of ok as unknown as ({ handle: string } & RunRow)[])
      for (const it of r.items) rows.push([esc(`${r.handle}#${it.slot}`), r.handle, it.slot, it.goal, it.format, esc(it.hook), esc(it.cta), esc(it.brief.split("\n— Dalil")[0].slice(0, 300)), "", "", "", "", "", "", ""].join(","));
    writeFileSync(new URL("../../../docs/brain/eval-labels.csv", import.meta.url), `${rows.join("\n")}\n`);
    writeFileSync(new URL("latest.json", dir), `${JSON.stringify({ file: `${stamp}.json`, summary }, null, 1)}\n`);
    console.log(JSON.stringify(summary, null, 1));

    // Regression gate against the committed baseline (same channel set only).
    const baseUrl = new URL("../../../docs/brain/eval-baseline.json", import.meta.url);
    if (!existsSync(baseUrl) || process.env.EVAL_UPDATE_BASELINE) writeFileSync(baseUrl, `${JSON.stringify(summary, null, 1)}\n`);
    else {
      const base = JSON.parse(readFileSync(baseUrl, "utf8")) as typeof summary;
      if (JSON.stringify(base.channels) === JSON.stringify(summary.channels)) {
        for (const c of CRITERIA) if (base.judge[c] != null && summary.judge[c] != null) expect(summary.judge[c] as number, `judge ${c} regressed`).toBeGreaterThanOrEqual((base.judge[c] as number) - 0.15);
        expect(summary.residualHardFails, "residual hard fails regressed").toBeLessThanOrEqual(base.residualHardFails);
      }
    }
    expect(summary.errors.length).toBeLessThan(chosen.length);
  });
});

/** Judges Brain v1 plans (dumped by the v1 worktree runner) with the same judge and rubric, for the v1 vs v2 table. */
describe.skipIf(!process.env.EVAL_V1_FILE)("Brain v1 judged with the same rubric", () => {
  it("judges v1 plans", async () => {
    const { analyzeNeuro } = await import("../../../src/lib/uslub/neuro");
    const v1 = JSON.parse(readFileSync(process.env.EVAL_V1_FILE as string, "utf8")) as { handle: string; error?: string; pipelineMs?: number; facts?: { id: string; quote: string }[]; items?: PlanItemOut[]; criticReport?: { slot: number; status: string; fails: { check: string }[] }[] }[];
    const fixtures = new Map(loadFixtures().map((f) => [f.handle.toLowerCase(), f]));
    const rows: Record<string, unknown>[] = [];
    for (const r of v1) {
      const fx = fixtures.get(r.handle.toLowerCase());
      if (r.error || !fx || !r.items) {
        rows.push({ handle: r.handle, error: r.error ?? "no fixture" });
        continue;
      }
      const items = r.items.map((it) => ({ ...it, critic: r.criticReport?.find((c) => c.slot === it.slot)?.status ?? "?", fails: r.criticReport?.find((c) => c.slot === it.slot)?.fails ?? [] }));
      const judged = await judge(fx, r.facts ?? [], items).catch(() => []);
      rows.push({
        handle: r.handle,
        pipelineMs: r.pipelineMs,
        items: items.map((it) => ({ ...it, judge: judged.find((j) => j.slot === it.slot) })),
        metrics: items.map((it) => {
          const neuro = analyzeNeuro(`${it.hook}\n${it.cta}`, "uz_latn");
          return { slot: it.slot, critic: it.critic, hardFails: it.fails.filter((f) => ["GROUNDED", "PRICE", "URGENCY"].includes(f.check)).length, emptyHook: !it.hook, hookLen: it.hook.length, neuroHits: neuro.hits.length, humanScore: neuro.humanScore };
        }),
      });
      console.log(`v1 judged ${r.handle}: ${judged.length}/${items.length}`);
    }
    const summary = summarizeRun(rows, "v1@fbf9bb7");
    const dir = new URL("../../../docs/brain/eval-results/", import.meta.url);
    writeFileSync(new URL(`${summary.runAt.slice(0, 16).replace(/[:T]/g, "")}-v1.json`, dir), `${JSON.stringify({ summary, results: rows }, null, 1)}\n`);
    console.log(JSON.stringify(summary, null, 1));
    expect(summary.items).toBeGreaterThan(0);
  });
});

/** Re-judges items that have no judge score (e.g. a transient judge error) in an existing results file. */
describe.skipIf(!process.env.EVAL_REJUDGE)("re-judge missing items", () => {
  it("fills missing judge scores and recomputes the summary", async () => {
    const file = process.env.EVAL_REJUDGE as string;
    const run = JSON.parse(readFileSync(file, "utf8")) as { summary: ReturnType<typeof summarizeRun>; results: (Record<string, unknown> & { handle: string; items?: JudgedItem[]; facts?: number })[] };
    const fixtures = new Map(loadFixtures().map((f) => [f.handle.toLowerCase(), f]));
    for (const r of run.results) {
      if (!r.items || r.items.every((i) => i.judge)) continue;
      const fx = fixtures.get(r.handle.toLowerCase());
      if (!fx) continue;
      const facts = (r.factList as { id: string; quote: string }[] | undefined) ?? [];
      const judged = await judge(fx, facts, r.items);
      r.items = r.items.map((it) => ({ ...it, judge: it.judge ?? judged.find((j) => j.slot === it.slot) }));
      console.log(`re-judged ${r.handle}: ${judged.length}`);
    }
    run.summary = { ...summarizeRun(run.results, run.summary.promptVersion), runAt: run.summary.runAt };
    writeFileSync(file, `${JSON.stringify(run, null, 1)}\n`);
    console.log(JSON.stringify(run.summary, null, 1));
  });
});
