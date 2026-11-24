/**
 * Claude usage accounting (pure). One entry per API call; `summarizeUsage` turns a run's entries into the
 * row we log to `events` (type "llm_usage") so the real cost per route run is visible.
 * Prices: USD per million tokens, Anthropic first-party list prices as of 2026-11 (estimate only).
 */

export interface UsageEntry {
  model: string;
  purpose?: string;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  webSearches: number;
  ms: number;
}

type Price = { input: number; output: number; cacheWrite: number; cacheRead: number };

const PRICES: Record<string, Price> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
  "claude-sonnet-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
};
const WEB_SEARCH_USD = 0.01;

/** Reads an SDK `usage` object defensively (fields differ by endpoint and SDK version). */
export function usageEntry(model: string, usage: unknown, ms: number, purpose?: string): UsageEntry {
  const u = (usage ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const server = (u.server_tool_use ?? {}) as Record<string, unknown>;
  return {
    model,
    purpose,
    input: n(u.input_tokens),
    output: n(u.output_tokens),
    cacheWrite: n(u.cache_creation_input_tokens),
    cacheRead: n(u.cache_read_input_tokens),
    webSearches: n(server.web_search_requests),
    ms: Math.round(ms),
  };
}

/** Price row for a model id; dated snapshots and fallback ids ("claude-haiku-5-5-2026…") match by prefix. */
function priceFor(model: string): Price {
  const key = Object.keys(PRICES)
    .sort((a, b) => b.length - a.length)
    .find((k) => model === k || model.startsWith(`${k}-`) || model.startsWith(`${k}@`));
  return PRICES[key ?? ""] ?? (/haiku/i.test(model) ? PRICES["claude-haiku-5-5"] : /opus/i.test(model) ? PRICES["claude-opus-5-5"] : PRICES["claude-sonnet-5-5"]);
}

export function estimateUsd(e: UsageEntry): number {
  const p = priceFor(e.model);
  return (e.input * p.input + e.output * p.output + e.cacheWrite * p.cacheWrite + e.cacheRead * p.cacheRead) / 1e6 + e.webSearches * WEB_SEARCH_USD;
}

export interface UsageSummary {
  route: string;
  calls: number;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  webSearches: number;
  usd: number;
  byModel: Record<string, { calls: number; input: number; output: number; cacheWrite: number; cacheRead: number; webSearches: number; usd: number }>;
  byPurpose: Record<string, number>;
  slowestMs: number;
}

const round4 = (x: number) => Math.round(x * 10_000) / 10_000;

export function summarizeUsage(route: string, entries: UsageEntry[]): UsageSummary {
  const s: UsageSummary = { route, calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, webSearches: 0, usd: 0, byModel: {}, byPurpose: {}, slowestMs: 0 };
  for (const e of entries) {
    const usd = estimateUsd(e);
    s.calls++;
    s.input += e.input;
    s.output += e.output;
    s.cacheWrite += e.cacheWrite;
    s.cacheRead += e.cacheRead;
    s.webSearches += e.webSearches;
    s.usd += usd;
    s.slowestMs = Math.max(s.slowestMs, e.ms);
    const m = (s.byModel[e.model] ??= { calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, webSearches: 0, usd: 0 });
    m.calls++;
    m.input += e.input;
    m.output += e.output;
    m.cacheWrite += e.cacheWrite;
    m.cacheRead += e.cacheRead;
    m.webSearches += e.webSearches;
    m.usd = round4(m.usd + usd);
    const key = e.purpose ?? "other";
    s.byPurpose[key] = (s.byPurpose[key] ?? 0) + 1;
  }
  s.usd = round4(s.usd);
  return s;
}
