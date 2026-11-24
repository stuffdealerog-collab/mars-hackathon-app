import "server-only";
import { z } from "zod";
import { channelEmpty } from "@/lib/uslub/http";
import { MIN_CHANNEL_POSTS } from "@/lib/uslub/scrape";
import type { ChannelAudit } from "@/lib/uslub/contract";
import { upcomingEvents } from "./calendar";
import { evidenceText, plainOrNull, templateFinding, whyText } from "./plain";
import { extractIds, groundedCheck } from "./lint";
import { brainJson, GROUNDING, SONNET } from "./llm";
import { type Benchmark, benchLedger, benchmarkFor, type ChannelSummary, type Niche, nicheOf } from "./bench";
import { funnelLedger, learnFor, type LearnReport } from "./learn-run";
import { recordAnalysis, loadSummaries } from "./memory";
import { keyId, postLedger, ruleLedger, runRules, statsLedger, type KbSignals } from "./rules";
import { BrainScrapeError, normalizeChannel, scrapeChannelData } from "./scrape";
import { sufficiency } from "./sufficiency";
import { channelValidity, noPreview, type Validity, type ValidityCode } from "./validity";
import { computeStats, LEXICON, WEEKDAYS } from "./stats";
import { WIN, type ChannelData, type ChannelStats, type Lang, type LedgerEntry, type RuleResult } from "./types";

export type Stage = { stage: string; [k: string]: unknown };
export type OnStage = (e: Stage) => void;

export interface CompetitorIssue {
  channel: string;
  code: ValidityCode | "fetch_failed";
  message: Validity["message"];
  evidence: string;
}

export interface Analysis {
  data: ChannelData;
  stats: ChannelStats;
  competitors: { data: ChannelData; stats: ChannelStats }[];
  competitorIssues: CompetitorIssue[];
  validity: Validity;
  niche: Niche;
  bench?: Benchmark;
  learn?: LearnReport;
  rules: RuleResult[];
  ledger: LedgerEntry[];
  /** Upcoming calendar events (<=14 days) with names in uz/ru/en. */
  calendar: { id: string; name: { uz: string; ru: string; en: string }; daysAway: number }[];
}

const fetchFailed = (handle: string): CompetitorIssue => ({
  channel: `@${handle.replace(/^@/, "")}`,
  code: "fetch_failed",
  message: {
    uz: `@${handle.replace(/^@/, "")} — Telegram javob bermadi, taqqoslashga olinmadi.`,
    ru: `@${handle.replace(/^@/, "")} — Telegram не ответил, в сравнение не взят.`,
    en: `@${handle.replace(/^@/, "")} — Telegram did not answer, left out of the comparison.`,
  },
  evidence: "fetch failed",
});

/**
 * Deterministic part: scrape (own + competitors in parallel), validity gate for competitors,
 * stats, niche benchmark, learn loop over previous plans, rules, ledger. Also records what it saw
 * (snapshots + channel summary) so the next analysis knows more.
 */
export async function analyzeDeterministic(input: {
  channel: string;
  competitors?: string[];
  category?: string;
  kb?: KbSignals;
  kbAddress?: string;
  lang?: Lang;
  brandId?: string;
  /** True only when the caller is the verified Telegram owner of brandId and the channel is the brand's own. */
  ownerVerified?: boolean;
  now?: number;
  onStage?: OnStage;
  /** Frozen channel data (eval harness): no network, no learning, no recording. */
  preloaded?: { own: ChannelData; competitors?: ChannelData[]; summaries?: ChannelSummary[] };
}): Promise<Analysis> {
  const now = input.now ?? Date.now();
  const lang = input.lang ?? "uz";
  const emit = input.onStage ?? (() => {});
  const live = !input.preloaded;
  emit({ stage: "scrape", status: "start" });
  type CompResult = { handle: string; data?: ChannelData; err?: unknown };
  const [own, comps] = input.preloaded
    ? [input.preloaded.own, (input.preloaded.competitors ?? []).map((d): CompResult => ({ handle: d.channel, data: d }))]
    : await Promise.all([
        scrapeChannelData(input.channel, { onPage: (pages, posts) => emit({ stage: "scrape", channel: input.channel, pages, posts }) }),
        Promise.all(
          (input.competitors ?? []).slice(0, 3).map((c) =>
            scrapeChannelData(c).then(
              (data): CompResult => ({ handle: c, data }),
              (err: unknown): CompResult => ({ handle: c, err }),
            ),
          ),
        ),
      ]);
  emit({ stage: "scrape", status: "done", posts: own.posts.length, subscribers: own.subscribers ?? null });

  // Validity gate: a squatted, empty, dead or private "competitor" never becomes a benchmark row.
  const competitorIssues: CompetitorIssue[] = [];
  const validComps: ChannelData[] = [];
  for (const c of comps) {
    if (!c.data) {
      const handle = normalizeChannel(c.handle) ?? c.handle;
      if (c.err instanceof BrainScrapeError && c.err.code === "NO_PUBLIC_PREVIEW") {
        const v = noPreview(handle);
        competitorIssues.push({ channel: `@${handle}`, code: v.code, message: v.message, evidence: v.evidence });
      } else competitorIssues.push(fetchFailed(handle));
      continue;
    }
    if (c.data.channel.toLowerCase() === own.channel.toLowerCase()) continue;
    const v = channelValidity(c.data, now, { role: "competitor", serviceTexts: c.data.serviceTexts });
    if (v.ok) validComps.push(c.data);
    else competitorIssues.push({ channel: `@${c.data.channel}`, code: v.code, message: v.message, evidence: v.evidence });
  }
  const validity = channelValidity(own, now, { role: "own", serviceTexts: own.serviceTexts });
  if (competitorIssues.length) emit({ stage: "validity", competitorIssues });

  const stats = computeStats(own, now, { kbAddress: input.kbAddress });
  const competitors = validComps.map((d) => ({ data: d, stats: computeStats(d, now) }));
  emit({ stage: "stats", medianViews: stats.medianViews ?? null, reachRate: stats.reachRate ?? null, postsPerWeek: stats.postsPerWeek, maturePosts: stats.maturePosts });

  const category = input.category ?? "";
  const niche = nicheOf(category, own.title);
  const [summaries, learn] = await Promise.all([
    input.preloaded?.summaries ?? (live ? loadSummaries(now).catch(() => [] as ChannelSummary[]) : Promise.resolve([] as ChannelSummary[])),
    live ? learnFor(own.channel, own.posts, now, lang, { brandId: input.ownerVerified ? input.brandId : undefined, ownerReports: Boolean(input.ownerVerified && input.brandId) }).catch(() => undefined) : Promise.resolve(undefined),
  ]);
  const bench = benchmarkFor(summaries, niche, own.channel);
  emit({ stage: "bench", niche, n: bench?.n ?? 0, scope: bench?.scope ?? null, reachMedian: bench?.reachRate?.median ?? null });
  if (learn) emit({ stage: "learn", plans: learn.plans.length, measured: learn.outcomes.filter((o) => o.status === "final").length, changes: learn.changes });

  const rules = runRules(stats, {
    category,
    competitors: competitors.map((c) => c.stats),
    kb: input.kb,
    calendar: upcomingEvents(category, now).map((e) => ({ id: e.id, name: e.name.en, daysAway: e.daysAway })),
    bench,
    funnel: learn?.funnel,
  });
  emit({ stage: "rules", rules: rules.map((r) => ({ id: r.id, status: r.status, trigger: r.trigger, kind: r.kind })) });
  const cal = upcomingEvents(category, now).map(
    (e): LedgerEntry => ({ id: `S.calendar.${e.id}`, label: e.name.uz, value: e.date, display: `${e.name.uz} (${e.date})`, source: "rule", prior: e.confidence !== "fixed" }),
  );
  const ledger = [
    ...statsLedger(stats, competitors.map((c) => c.stats)),
    ...(bench ? benchLedger(bench, { reachRate: stats.reachRate }, lang) : []),
    ...(learn ? [...learn.ledger, ...funnelLedger(learn.funnel)] : []),
    ...postLedger(stats, competitors.map((c) => c.stats)),
    ...ruleLedger(rules),
    ...cal,
  ];

  if (live) {
    // Best-effort memory writes; the answer never waits on them failing.
    void Promise.allSettled([recordAnalysis(own, stats, niche, now), ...competitors.map((c) => recordAnalysis(c.data, c.stats, niche, now))]);
  }
  const calendar = upcomingEvents(category, now).map((e) => ({ id: e.id, name: e.name, daysAway: e.daysAway }));
  return { data: own, stats, competitors, competitorIssues, validity, niche, bench, learn, rules, ledger, calendar };
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

const D1 = `You are the Analitik of Mercat, an AI marketing department. You explain a Telegram channel audit to a small-business owner in Tashkent who has no marketer. The analysis has been done: code computed the stats and decided which rules fired. Your only job is to explain them so the owner understands and trusts them.

INPUT: firedRules [{id, kind, severity, trigger, effects, ids}], ledger, topPosts, benchmark.

WRITE 3–7 findings. The owner reads them as they are, so write like a person, not a report:
- Only from firedRules. Do not add findings for rules that did not fire. Do not change a rule's kind. If two rules share one cause (e.g. LOW_REACH + SUSPECT_BOOSTED), merge them into one finding citing both.
- Order: problems by severity, then opportunities, then strengths. Include at least one strength if a strength rule fired, because owners need to know what to keep.
- Each finding: exactly 2 plain sentences. Sentence 1 = what the numbers show, with the number AND its comparison point (neighbouring posts, a competitor, or a prior threshold marked as such). Sentence 2 = one concrete fix for this week, taken from rule.effects (which posts, how many, when).
- Plain words only: no variable or field names (reachRate, ctaRate, lift, CV, trigger...), no "n=", no "×" — say "40% ko'proq" / "на 40% больше" / "40% more". Percentages and counts copied from the ledger display.
- The ids in square brackets go only at the very END of each finding, never inside a sentence.
- For a COLD_START or insufficient-data rule, say what data is missing and how we will collect it (the experiment slot, tracked links).
- To point at a post, quote its first few words in «» and put its P id only in the end brackets.
- A finding that would fit any channel is wrong. Each one must be specific to this channel's numbers.

Return JSON {findings:[{rule:"R.X", kind:"problem|opportunity|strength", text:"... [ids]", evidence:["S.x","P.y",...]}]}.`;

export type Finding = { rule: string; kind: "problem" | "opportunity" | "strength"; text: string; evidence: string[]; template?: boolean };

export async function writeFindings(a: Analysis, lang: Lang, onStage?: OnStage, opts: { llm?: boolean } = {}): Promise<Finding[]> {
  const fired = a.rules.filter((r) => r.status === "fired");
  const ledgerMap = new Map(a.ledger.map((e) => [e.id, e]));
  let raw: Finding[] = [];
  if (fired.length && opts.llm !== false) {
    try {
      const res = await brainJson({
        schema: FindingsSchema,
        model: SONNET,
        effort: "medium",
        purpose: "findings",
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
  const covered = new Set<string>();
  for (const f of raw) {
    const ids = extractIds(f.text);
    const fails = groundedCheck(f.text, ledgerMap, f.evidence.filter((e) => ledgerMap.has(e)));
    const ruleOk = firedIds.has(f.rule) && f.kind === (fired.find((r) => r.id === f.rule) as RuleResult).kind;
    // The owner sees the sentence without ids; one that still reads like a log line falls back to the template.
    const plain = plainOrNull(f.text, lang);
    if (!ids.length || fails.length || !ruleOk || !plain || covered.has(f.rule)) {
      onStage?.({ stage: "findings", dropped: f.rule, reasons: [...fails.map((x) => x.reason).slice(0, 3), ...(plain ? [] : ["not plain language"])] });
      continue;
    }
    for (const r of [f.rule, ...ids.filter((i) => firedIds.has(i))]) covered.add(r);
    kept.push({ ...f, text: plain, evidence: [...new Set([...ids, ...f.evidence.filter((e) => ledgerMap.has(e))])] });
  }
  const value = (id: string) => {
    const v = ledgerMap.get(id)?.value;
    return typeof v === "number" ? v : undefined;
  };
  for (const r of fired) {
    if (r.id === "R.FUNNEL_LEAK" || covered.has(r.id)) continue;
    const text = templateFinding(r, a.stats, lang, { value, calendar: a.calendar });
    if (!text) continue;
    covered.add(r.id);
    kept.push({ rule: r.id, kind: r.kind, text, evidence: [...r.ids.filter((i) => ledgerMap.has(i)), r.id], template: true });
  }
  const order = { problem: 0, opportunity: 1, strength: 2 };
  kept.sort((x, y) => order[x.kind] - order[y.kind]);
  for (const f of kept) onStage?.({ stage: "findings", finding: f });
  return kept;
}

export function assembleAudit(a: Analysis, findings: Finding[], lang: Lang = "uz"): ChannelAudit {
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
    topPosts: top.map(({ post, lift }) => ({ url: post.url, views: post.views, why: whyText(post, lift, lang) })),
    findings: findings.map((f) => ({ kind: f.kind, text: f.text, evidence: evidenceText(f.evidence, ledger, lang) })),
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

export async function runAudit(input: { channel: string; competitors?: string[]; lang?: Lang; category?: string; brandId?: string; onStage?: OnStage }) {
  const a = await analyzeDeterministic(input);
  // An empty channel has nothing to audit: the Studio switches to fresh mode (launch plan from the owner's description).
  if (a.data.posts.length < MIN_CHANNEL_POSTS) throw channelEmpty(a.data.channel, a.data.posts.length ? "few_posts" : "no_preview", a.data.posts.length);
  const findings = await writeFindings(a, input.lang ?? "uz", input.onStage);
  const audit = assembleAudit(a, findings, input.lang ?? "uz");
  input.onStage?.({ stage: "done" });
  return {
    audit,
    ledger: a.ledger,
    rules: a.rules,
    firedRules: a.rules.filter((r) => r.status === "fired"),
    findings,
    stats: summarizeStats(a.stats),
    validity: a.validity,
    competitorIssues: a.competitorIssues,
    niche: a.niche,
    bench: a.bench ? { ...a.bench, channels: undefined, channelCount: a.bench.channels.length } : null,
    learn: a.learn ? { plans: a.learn.plans, outcomes: a.learn.outcomes, scores: a.learn.scores, experiments: a.learn.experiments, calibration: a.learn.calibration, changes: a.learn.changes } : null,
    sufficiency: sufficiency({ stats: a.stats, bench: a.bench, competitors: a.competitors.length, learn: a.learn }, input.lang ?? "uz"),
  };
}

/** Stats without raw posts (for the UI chips). */
export function summarizeStats(s: ChannelStats) {
  const { lifts, ...rest } = s;
  return { ...rest, topLifts: [...lifts].sort((a, b) => b.lift - a.lift).slice(0, 5).map((x) => ({ id: `P.${x.post.channel}/${x.post.id}`, lift: x.lift, url: x.post.url })) };
}

export { keyId };
