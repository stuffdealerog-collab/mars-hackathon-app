import "server-only";
import { adSignals, SOURCES, type AdCheck, type AdSignal } from "./adcheck";
import { benchmarkFor, nicheOf, NICHE_LABEL } from "./bench";
import { loadSummaries } from "./memory";
import { BrainScrapeError, normalizeChannel, scrapeChannelData } from "./scrape";
import { computeStats } from "./stats";
import type { Lang } from "./types";
import { channelValidity, noPreview, type Validity } from "./validity";

export type LocalSignal = Omit<AdSignal, "note"> & { note: string };

export interface AdCheckResponse {
  channel: string;
  title?: string;
  subscribers?: number;
  verdict: AdCheck["verdict"];
  summary: string;
  signals: LocalSignal[];
  err?: number;
  matureMedian?: number;
  adMedian?: AdCheck["adMedian"];
  expectedAdViews?: AdCheck["expectedAdViews"];
  cpm?: AdCheck["cpm"];
  priceBand?: AdCheck["priceBand"];
  validity: Omit<Validity, "message"> & { message: string };
  sources: typeof SOURCES;
}

/** Scrapes a channel and runs the ad-placement check. A handle without a public preview gives an honest "insufficient" answer, not an error. */
export async function runAdCheck(input: {
  channel: string;
  priceUzs?: number;
  category?: string;
  lang?: Lang;
  now?: number;
  history?: { at: string; subscribers: number }[];
}): Promise<AdCheckResponse> {
  const lang = input.lang ?? "uz";
  const now = input.now ?? Date.now();
  const handle = normalizeChannel(input.channel);
  let data;
  try {
    data = await scrapeChannelData(input.channel, { maxPosts: 60, now });
  } catch (err) {
    if (err instanceof BrainScrapeError && err.code === "NO_PUBLIC_PREVIEW" && handle) {
      const v = noPreview(handle);
      return {
        channel: `@${handle}`,
        verdict: "insufficient",
        summary: v.message[lang],
        signals: [],
        validity: { ...v, message: v.message[lang] },
        sources: SOURCES,
      };
    }
    throw err;
  }
  const stats = computeStats(data, now);
  const validity = channelValidity(data, now, { role: "competitor" });
  // The "normal" reach band comes from real channels of the same niche when we have ≥5 of them.
  const niche = nicheOf(input.category, data.title);
  const bench = benchmarkFor(await loadSummaries(now).catch(() => []), niche, data.channel);
  const errBand = bench?.reachRate
    ? { low: Math.max(0.05, bench.reachRate.p25 * 0.4), high: Math.max(0.8, bench.reachRate.p75 * 1.6), label: `${NICHE_LABEL[niche][lang]}, n=${bench.n}` }
    : undefined;
  const check = adSignals(data, stats, now, { priceUzs: input.priceUzs, history: input.history, errBand });
  const unusable = validity.code === "empty" || validity.code === "squatted";
  return {
    channel: `@${data.channel}`,
    title: data.title,
    subscribers: data.subscribers,
    verdict: unusable ? "insufficient" : check.verdict,
    summary: unusable ? validity.message[lang] : check.summary[lang],
    signals: check.signals.map((s) => ({ ...s, note: s.note[lang] })),
    err: check.err,
    matureMedian: check.matureMedian,
    adMedian: check.adMedian,
    expectedAdViews: check.expectedAdViews,
    cpm: check.cpm,
    priceBand: check.priceBand,
    validity: { ...validity, message: validity.message[lang] },
    sources: SOURCES,
  };
}
