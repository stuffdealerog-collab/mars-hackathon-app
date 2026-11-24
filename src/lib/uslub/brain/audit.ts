import "server-only";
import { z } from "zod";
import type { ChannelAudit } from "@/lib/uslub/contract";
import { upcomingEvents } from "./calendar";
import { extractIds, groundedCheck } from "./lint";
import { brainJson, GROUNDING, SONNET } from "./llm";
import { keyId, postLedger, ruleLedger, runRules, statsLedger, type KbSignals } from "./rules";
import { scrapeChannelData } from "./scrape";
import { computeStats, LEXICON, WEEKDAYS, whyLine } from "./stats";
import { WIN, type ChannelData, type ChannelStats, type Lang, type LedgerEntry, type RuleResult } from "./types";

export type Stage = { stage: string; [k: string]: unknown };
export type OnStage = (e: Stage) => void;

export interface Analysis {
  data: ChannelData;
  stats: ChannelStats;
  competitors: { data: ChannelData; stats: ChannelStats }[];
  rules: RuleResult[];
  ledger: LedgerEntry[];
}

/** Deterministic part: scrape (own + competitors in parallel), stats, rules, ledger. */
export async function analyzeDeterministic(input: {
  channel: string;
  competitors?: string[];
  category?: string;
  kb?: KbSignals;
  kbAddress?: string;
  now?: number;
  onStage?: OnStage;
}): Promise<Analysis> {
  const now = input.now ?? Date.now();
  const emit = input.onStage ?? (() => {});
  emit({ stage: "scrape", status: "start" });
  const [own, ...comps] = await Promise.all([
    scrapeChannelData(input.channel, { onPage: (pages, posts) => emit({ stage: "scrape", channel: input.channel, pages, posts }) }),
    ...(input.competitors ?? []).slice(0, 3).map((c) => scrapeChannelData(c).catch(() => null)),
  ]);
  emit({ stage: "scrape", status: "done", posts: own.posts.length, subscribers: own.subscribers ?? null });
  const stats = computeStats(own, now, { kbAddress: input.kbAddress });
  const competitors = comps.filter((c): c is ChannelData => c != null).map((d) => ({ data: d, stats: computeStats(d, now) }));
  emit({ stage: "stats", medianViews: stats.medianViews ?? null, reachRate: stats.reachRate ?? null, postsPerWeek: stats.postsPerWeek, maturePosts: stats.maturePosts });
  const category = input.category ?? "";
  const rules = runRules(stats, {
    category,
    competitors: competitors.map((c) => c.stats),
    kb: input.kb,
    calendar: upcomingEvents(category, now).map((e) => ({ id: e.id, name: e.name.en, daysAway: e.daysAway })),
  });
  emit({ stage: "rules", rules: rules.map((r) => ({ id: r.id, status: r.status, trigger: r.trigger, kind: r.kind })) });
  const cal = upcomingEvents(category, now).map(
    (e): LedgerEntry => ({ id: `S.calendar.${e.id}`, label: e.name.uz, value: e.date, display: `${e.name.uz} (${e.date})`, source: "rule", prior: e.confidence !== "fixed" }),
  );
  const ledger = [...statsLedger(stats, competitors.map((c) => c.stats)), ...postLedger(stats, competitors.map((c) => c.stats)), ...ruleLedger(rules), ...cal];
  return { data: own, stats, competitors, rules, ledger };
}

const FindingsSchema = z.object({
  findings: z.array(
    z.object({
      rule: z.string(),
      kind: z.enum(["problem", "opportunity", "strength"]),
      text: z.string(),
      evidence: z.array(z.string()),
    }),
  ),
});

const D1 = `You are the Analitik of Uslub AI. You explain a Telegram channel audit to a small-business owner in Tashkent who has no marketer. The analysis has been done: code computed the stats and decided which rules fired. Your only job is to explain them so the owner understands and trusts them.

INPUT: firedRules [{id, kind, severity, trigger, effects, ids}], ledger, topPosts, benchmark.

WRITE 3–7 findings:
- Only from firedRules. Do not add findings for rules that did not fire. Do not change a rule's kind. If two rules share one cause (e.g. LOW_REACH + SUSPECT_BOOSTED), merge them into one finding citing both.
- Order: problems by severity, then opportunities, then strengths. Include at least one strength if a strength rule fired, because owners need to know what to keep.
- Each finding: at most 2 sentences. Sentence 1 = what the numbers show, with the number AND its comparison point (neighbouring posts, a competitor, or a prior threshold marked as such). Sentence 2 = what we will do this week, taken from rule.effects, stated concretely (which posts, how many, when).
- For a COLD_START or insufficient-data rule, say what data is missing and how we will collect it (the experiment slot, tracked links).
- Name posts by their P id when one illustrates the point.
- A finding that would fit any channel is wrong. Each one must be specific to this channel's numbers.

Return JSON {findings:[{rule:"R.X", kind:"problem|opportunity|strength", text:"... [ids]", evidence:["S.x","P.y",...]}]}.`;

export type Finding = { rule: string; kind: "problem" | "opportunity" | "strength"; text: string; evidence: string[]; template?: boolean };

export async function writeFindings(a: Analysis, lang: Lang, onStage?: OnStage): Promise<Finding[]> {
  const fired = a.rules.filter((r) => r.status === "fired");
  const ledgerMap = new Map(a.ledger.map((e) => [e.id, e]));
  let raw: Finding[] = [];
  if (fired.length) {
    try {
      const res = await brainJson({
        schema: FindingsSchema,
        model: SONNET,
        effort: "medium",
        maxTokens: 8000,
        system: `${GROUNDING(lang, "'", LEXICON)}\n\n${D1}`,
        prompt: JSON.stringify({
          lang,
          firedRules: fired.map(({ id, name, kind, severity, trigger, effects, ids }) => ({ id, name, kind, severity, trigger, effects, ids })),
          ledger: a.ledger.map(({ id, label, display, n, window, prior }) => ({ id, label, display, n, window, prior })),
          topPosts: a.ledger.filter((e) => e.source === "post").slice(0, 8).map(({ id, label, quote }) => ({ id, label, quote: quote?.slice(0, 160) })),
          benchmark: a.competitors.map((c) => ({ channel: c.stats.channel, reachRate: c.stats.reachRate, postsPerWeek: c.stats.postsPerWeek, suspect: c.stats.suspectBoosted })),
        }),
      });
      raw = res.findings;
    } catch (err) {
      console.warn("[brain/audit] findings LLM failed, using templates", err instanceof Error ? err.message : err);
    }
  }
  const firedIds = new Set(fired.map((r) => r.id));
  const kept: Finding[] = [];
  for (const f of raw) {
    const ids = extractIds(f.text);
    const fails = groundedCheck(f.text, ledgerMap, f.evidence.filter((e) => ledgerMap.has(e)));
    const ruleOk = firedIds.has(f.rule) && f.kind === (fired.find((r) => r.id === f.rule) as RuleResult).kind;
    if (!ids.length || fails.length || !ruleOk) {
      onStage?.({ stage: "findings", dropped: f.rule, reasons: fails.map((x) => x.reason).slice(0, 3) });
      continue;
    }
    kept.push({ ...f, evidence: [...new Set([...ids, ...f.evidence.filter((e) => ledgerMap.has(e))])] });
  }
  for (const r of fired) {
    if (r.id === "R.FUNNEL_LEAK") continue;
    if (!kept.some((f) => f.rule === r.id || extractIds(f.text).includes(r.id)))
      kept.push({ rule: r.id, kind: r.kind, text: `${r.name}: ${r.trigger} [${[...r.ids.filter((i) => ledgerMap.has(i)), r.id].join(", ")}]`, evidence: [...r.ids.filter((i) => ledgerMap.has(i)), r.id], template: true });
  }
  const order = { problem: 0, opportunity: 1, strength: 2 };
  kept.sort((x, y) => order[x.kind] - order[y.kind]);
  for (const f of kept) onStage?.({ stage: "findings", finding: f });
  return kept;
}

const evidenceLine = (ids: string[], ledger: Map<string, LedgerEntry>) =>
  ids
    .map((id) => {
      const e = ledger.get(id);
      if (!e) return id;
      if (e.source === "rule") return id;
      const meta = [e.n != null && e.source === "stats" ? `n=${e.n}` : "", e.window ?? ""].filter(Boolean).join(", ");
      return `${id}=${e.display}${meta ? ` (${meta})` : ""}`;
    })
    .join(" · ");

export function assembleAudit(a: Analysis, findings: Finding[]): ChannelAudit {
  const s = a.stats;
  const ledger = new Map(a.ledger.map((e) => [e.id, e]));
  const bestHours = Object.entries(s.hourLift)
    .filter(([, b]) => b.value != null && b.n >= 3 && b.value >= WIN)
    .map(([k]) => Number.parseInt(k.split("-")[0], 10));
  const bestWeekdays = Object.entries(s.weekdayLift)
    .filter(([, b]) => b.value != null && b.n >= 3 && b.value >= WIN)
    .map(([k]) => WEEKDAYS.indexOf(k));
  const top = [...s.lifts].filter(() => !s.coldStart).sort((x, y) => y.lift - x.lift).slice(0, 3);
  return {
    channel: `@${a.data.channel}`,
    title: a.data.title,
    subscribers: a.data.subscribers,
    postsAnalyzed: s.postsInWindow,
    postsPerWeek: Math.round(s.postsPerWeek * 10) / 10,
    avgViews: s.medianViews != null ? Math.round(s.medianViews) : undefined,
    reachRate: s.reachRate,
    bestHours,
    bestWeekdays,
    formatMix: s.formatMix,
    topPosts: top.map(({ post, lift }) => ({ url: post.url, views: post.views, why: whyLine(post, lift) })),
    findings: findings.map((f) => ({ kind: f.kind, text: f.text, evidence: evidenceLine(f.evidence, ledger) })),
    benchmark: a.competitors.map(({ stats: c }) => ({
      channel: `@${c.channel}`,
      subscribers: c.subscribers,
      avgViews: c.medianViews != null ? Math.round(c.medianViews) : undefined,
      reachRate: c.reachRate,
      postsPerWeek: Math.round(c.postsPerWeek * 10) / 10,
      ...(c.suspectBoosted ? { suspectBoosted: true, note: "excluded from the median" } : {}),
    })),
  };
}

export async function runAudit(input: { channel: string; competitors?: string[]; lang?: Lang; category?: string; onStage?: OnStage }) {
  const a = await analyzeDeterministic(input);
  const findings = await writeFindings(a, input.lang ?? "uz", input.onStage);
  const audit = assembleAudit(a, findings);
  input.onStage?.({ stage: "done" });
  return {
    audit,
    ledger: a.ledger,
    rules: a.rules,
    firedRules: a.rules.filter((r) => r.status === "fired"),
    findings,
    stats: summarizeStats(a.stats),
  };
}

/** Stats without raw posts (for the UI chips). */
export function summarizeStats(s: ChannelStats) {
  const { lifts, ...rest } = s;
  return { ...rest, topLifts: [...lifts].sort((a, b) => b.lift - a.lift).slice(0, 5).map((x) => ({ id: `P.${x.post.channel}/${x.post.id}`, lift: x.lift, url: x.post.url })) };
}

export { keyId };
