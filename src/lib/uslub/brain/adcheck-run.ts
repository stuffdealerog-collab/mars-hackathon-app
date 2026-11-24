import "server-only";
import { adSignals, SOURCES, type AdCheck, type AdSignal } from "./adcheck";
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
  const check = adSignals(data, stats, now, { priceUzs: input.priceUzs, history: input.history });
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
