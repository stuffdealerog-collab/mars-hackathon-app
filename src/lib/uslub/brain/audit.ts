import "server-only";
import { createHash } from "node:crypto";
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
import { loadBrainCache, loadSubscriberSnapshots, recordAnalysis, loadSummaries, saveBrainCache } from "./memory";
import { type ChannelTypeGuess, defaultGoalFor, detectChannelType, isGrowthType } from "./channel-type";
import { growthLedger, growthSignals, type SubscriberTrend, subscriberTrendOf } from "./growth";
import { keyId, postLedger, ruleLedger, runRules, statsLedger, type KbSignals } from "./rules";
import { BrainScrapeError, normalizeChannel, scrapeChannelData } from "./scrape";
import { sufficiency } from "./sufficiency";
import { channelValidity, noPreview, type Validity, type ValidityCode } from "./validity";
import { computeStats, LEXICON, WEEKDAYS } from "./stats";
import { WIN, type ChannelData, type ChannelStats, type ChannelType, type Lang, type LedgerEntry, type RuleResult } from "./types";

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
  /** What kind of channel this is (given by the brand, else detected from the posts): rules and findings follow it. */
  channelType: ChannelType;
  /** The detection behind it (missing when the brand's stored type was used). */
  typeGuess?: ChannelTypeGuess;
  /** Subscribers over the days Mercat measured them, when it has (channel_snapshots). */
  subscriberTrend?: SubscriberTrend;
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
  /** The brand's stored channel type; missing = detected here from the channel's posts, title and rhythm. */
  channelType?: ChannelType;
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
  // What kind of channel this is: the brand's stored type, else read from the posts (owner correction 2).
  const typeGuess = input.channelType ? undefined : detectChannelType({ posts: own.posts, title: own.title, postsPerWeek: stats.postsPerWeek });
  const channelType: ChannelType = input.channelType ?? typeGuess?.type ?? "business";
  emit({ stage: "type", channelType, confidence: typeGuess?.confidence ?? 1, goal: defaultGoalFor(channelType) });
  const [summaries, learn, snapshots] = await Promise.all([
    input.preloaded?.summaries ?? (live ? loadSummaries(now).catch(() => [] as ChannelSummary[]) : Promise.resolve([] as ChannelSummary[])),
    live ? learnFor(own.channel, own.posts, now, lang, { brandId: input.ownerVerified ? input.brandId : undefined, ownerReports: Boolean(input.ownerVerified && input.brandId) }).catch(() => undefined) : Promise.resolve(undefined),
    live && isGrowthType(channelType) ? loadSubscriberSnapshots(own.channel).catch(() => []) : Promise.resolve([] as { day: string; subscribers: number }[]),
  ]);
  const subscriberTrend = subscriberTrendOf(snapshots);
  const bench = benchmarkFor(summaries, niche, own.channel);
  emit({ stage: "bench", niche, n: bench?.n ?? 0, scope: bench?.scope ?? null, reachMedian: bench?.reachRate?.median ?? null });
  if (learn) emit({ stage: "learn", plans: learn.plans.length, measured: learn.outcomes.filter((o) => o.status === "final").length, changes: learn.changes });

  const rules = runRules(stats, {
    category,
    competitors: competitors.map((c) => c.stats),
    kb: input.kb,
    calendar: upcomingEvents(category, now).map((e) => ({ id: e.id, name: e.name.en, daysAway: e.daysAway, kind: e.kind })),
    bench,
    funnel: learn?.funnel,
    channelType,
    posts: own.posts,
    subscriberTrend,
    similar: competitors.map((c) => `@${c.data.channel}`),
  });
  emit({ stage: "rules", rules: rules.map((r) => ({ id: r.id, status: r.status, trigger: r.trigger, kind: r.kind })) });
  const growthEntries = isGrowthType(channelType) ? growthLedger(growthSignals(own.posts, new Map(stats.lifts.map((x) => [x.post.id, x.lift])), own.channel), subscriberTrend) : [];
  const cal = upcomingEvents(category, now).map(
    (e): LedgerEntry => ({ id: `S.calendar.${e.id}`, label: e.name[lang], value: e.date, display: `${e.name[lang]} (${e.date})`, source: "rule", prior: e.confidence !== "fixed" }),
  );
  const ledger = [
    ...statsLedger(stats, competitors.map((c) => c.stats)),
    ...(bench ? benchLedger(bench, { reachRate: stats.reachRate }, lang) : []),
    ...(learn ? [...learn.ledger, ...funnelLedger(learn.funnel)] : []),
    ...growthEntries,
    ...postLedger(stats, competitors.map((c) => c.stats)),
    ...ruleLedger(rules),
    ...cal,
  ];

  if (live) {
    // Best-effort memory writes; the answer never waits on them failing.
    void Promise.allSettled([recordAnalysis(own, stats, niche, now), ...competitors.map((c) => recordAnalysis(c.data, c.stats, niche, now))]);
  }
  const calendar = upcomingEvents(category, now).map((e) => ({ id: e.id, name: e.name, daysAway: e.daysAway }));
  return { data: own, stats, competitors, competitorIssues, validity, niche, bench, learn, rules, ledger, calendar, channelType, typeGuess, subscriberTrend };
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
- For a COLD_START or insufficient-data rule, say what data is missing and how we will collect it (the experiment slot, the views of the new posts).
- To point at a post, quote its first few words in «» and put its P id only in the end brackets.
- A finding that would fit any channel is wrong. Each one must be specific to this channel's numbers.
- channelType tells what the channel is. A blog, expert, media or community channel is not a shop: talk about readers, views, forwards, replies, series and subscribers; never advise prices, orders, delivery, contacts or "how to order", and never call its readers customers.

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
          channelType: a.channelType,
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
    const text = templateFinding(r, a.stats, lang, { value, calendar: a.calendar, channelType: a.channelType });
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

/**
 * How long an analysis stays fresh: reopening the channel within it shows the saved analysis (no scrape, no paid
 * step, no new stats row); `refresh: true` runs it again. The written findings are reused as long for the same
 * channel, language, competitors and newest post.
 */
export const ANALYSIS_FRESH_MS = 24 * 3600_000;
export const AUDIT_CACHE_MS = ANALYSIS_FRESH_MS;

/** Cache key of a whole saved analysis: the same channel, language, competitors, category (and brand, if given). */
export function analysisViewKey(input: { channel: string; competitors?: string[]; category?: string; brandId?: string; channelType?: ChannelType }, lang: Lang): string {
  const channel = normalizeChannel(input.channel) ?? input.channel.trim().toLowerCase();
  const comps = [...(input.competitors ?? [])].map((c) => normalizeChannel(c) ?? c.toLowerCase()).sort();
  // A given channel type (the brand's stored one) is part of the key: a growth channel's findings are other findings.
  const raw = JSON.stringify(["v2", channel, lang, comps, (input.category ?? "").trim().toLowerCase(), input.brandId ?? "", ...(input.channelType ? [input.channelType] : [])]);
  return `auditview:${createHash("sha256").update(raw).digest("hex").slice(0, 32)}`;
}

/** Cache key of an audit's written findings: a new post on the channel (or other competitors) makes a new key. */
export function auditCacheKey(a: Pick<Analysis, "data">, input: { competitors?: string[]; category?: string; channelType?: ChannelType }, lang: Lang): string {
  const newest = a.data.posts.reduce((m, p) => Math.max(m, p.id), 0);
  const comps = [...(input.competitors ?? [])].map((c) => normalizeChannel(c) ?? c.toLowerCase()).sort();
  const raw = JSON.stringify(["v2", a.data.channel.toLowerCase(), lang, newest, comps, (input.category ?? "").trim().toLowerCase(), ...(input.channelType ? [input.channelType] : [])]);
  return `audit:${createHash("sha256").update(raw).digest("hex").slice(0, 32)}`;
}

export async function runAudit(input: {
  channel: string;
  competitors?: string[];
  lang?: Lang;
  category?: string;
  brandId?: string;
  /**
   * The brand's stored channel type, as its confirmed goal plans it (planTypeFor): a brand whose owner wants
   * subscribers gets growth findings, never price or how-to-order ones. Missing = detected from the posts.
   */
  channelType?: ChannelType;
  onStage?: OnStage;
  /** true = analyze again even if this channel was analyzed in the last 24 h (ANALYSIS_FRESH_MS). */
  refresh?: boolean;
  /** Runs right before the paid Claude step (not on a cache hit): the route takes its daily budget unit here. */
  beforeLlm?: () => Promise<void>;
}) {
  const lang = input.lang ?? "uz";
  // A fresh saved analysis comes back as it was: reopening a brand never pays for the same analysis twice.
  const viewKey = analysisViewKey(input, lang);
  const saved = input.refresh ? null : await loadBrainCache<SavedAnalysis>(viewKey, ANALYSIS_FRESH_MS).catch(() => null);
  if (saved?.audit) {
    input.onStage?.({ stage: "cached", analyzedAt: saved.analyzedAt });
    input.onStage?.({ stage: "done" });
    return { ...saved, cached: true as const };
  }
  const result = await analyzeFresh(input, lang);
  // Template fallbacks (the model failed) are not kept: the next open tries the real explanation again.
  // Awaited (a few ms against a minute-long analysis): a serverless function may stop once the answer is sent.
  if (!result.findings.length || result.findings.some((f) => !f.template)) await saveBrainCache(viewKey, result).catch(() => undefined);
  return { ...result, cached: false as const };
}

type SavedAnalysis = Awaited<ReturnType<typeof analyzeFresh>>;

async function analyzeFresh(input: Parameters<typeof runAudit>[0], lang: Lang) {
  const a = await analyzeDeterministic(input);
  // An empty channel has nothing to audit: the Studio switches to fresh mode (launch plan from the owner's description).
  if (a.data.posts.length < MIN_CHANNEL_POSTS) throw channelEmpty(a.data.channel, a.data.posts.length ? "few_posts" : "no_preview", a.data.posts.length);
  // Nothing in the last 90 days, or not a real business channel (stale, renamed "for sale"): no findings from 0 posts.
  if (a.stats.postsInWindow === 0 || !a.validity.ok) {
    const reason = a.validity.code === "no_preview" ? "no_preview" : a.validity.code === "stale" || a.stats.postsInWindow === 0 ? "stale" : "few_posts";
    throw channelEmpty(a.data.channel, reason, a.stats.postsInWindow);
  }
  // The written findings (one Sonnet call) are reused while the channel has no new post; the numbers stay live.
  const key = auditCacheKey(a, input, lang);
  const cached = input.refresh ? null : await loadBrainCache<Finding[]>(key, AUDIT_CACHE_MS).catch(() => null);
  let findings: Finding[];
  if (cached?.length) {
    findings = cached;
    input.onStage?.({ stage: "findings", cached: true });
    for (const f of findings) input.onStage?.({ stage: "findings", finding: f });
  } else {
    await input.beforeLlm?.();
    findings = await writeFindings(a, lang, input.onStage);
    // Template fallbacks (the LLM failed) are not kept: the next open tries the real explanation again.
    if (findings.some((f) => !f.template)) void saveBrainCache(key, findings);
  }
  const audit = assembleAudit(a, findings, lang);
  input.onStage?.({ stage: "done" });
  return {
    audit,
    /** When the channel was read for this analysis (a saved analysis keeps its time). */
    analyzedAt: new Date().toISOString(),
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
    // What kind of channel this is and the goal it starts with (owner correction 2); the Studio pre-fills the goal question.
    channelType: a.channelType,
    typeConfidence: a.typeGuess?.confidence ?? 1,
    goal: defaultGoalFor(a.channelType),
    sufficiency: sufficiency({ stats: a.stats, bench: a.bench, competitors: a.competitors.length, learn: a.learn }, input.lang ?? "uz"),
  };
}

/** Stats without raw posts (for the UI chips). */
export function summarizeStats(s: ChannelStats) {
  const { lifts, ...rest } = s;
  return { ...rest, topLifts: [...lifts].sort((a, b) => b.lift - a.lift).slice(0, 5).map((x) => ({ id: `P.${x.post.channel}/${x.post.id}`, lift: x.lift, url: x.post.url })) };
}

export { keyId };
