/**
 * Expected impact of one plan slot, computed by code (never by the LLM).
 * views72 ≈ channel median × shrunk lifts of the slot's hour bucket, format and weekday;
 * the range is the channel's own p25–p75 lift spread. Without own data the niche
 * benchmark gives a wide range; without either the forecast says so.
 * The learn loop later scores each forecast against the real 72h views.
 */
import type { Benchmark } from "./bench";
import { hourBucket, WEEKDAYS } from "./stats";
import type { ChannelStats, Goal, Lang } from "./types";

export interface Forecast {
  status: "ok" | "insufficient";
  views?: { low: number; mid: number; high: number };
  starts?: { low: number; high: number; source: "measured" | "prior" };
  basis: string[];
  confidence: "data" | "baseline" | "benchmark" | "none";
  display: string;
}

export const PRIOR_CTR = { low: 0.003, high: 0.015 }; // spec §B prior: 0.3–1.5% "normal" sale CTR (taxminiy)
const SHRINK_K = 3;

const shrink = (lift: number, n: number) => 1 + (lift - 1) * (n / (n + SHRINK_K));

function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  return s[lo] + (s[Math.ceil(pos)] - s[lo]) * (pos - lo);
}

export function fmtInt(x: number, lang: Lang = "uz"): string {
  const s = Math.round(x).toString();
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, lang === "en" ? "," : " ");
}

const WORDS: Record<Lang, { views: string; starts: string; none: string; prior: string }> = {
  uz: { views: "ko'rish", starts: "botga o'tish", none: "prognoz yo'q: ko'rishlar tarixi yetarli emas", prior: "taxminiy" },
  ru: { views: "просмотров", starts: "переходов в бота", none: "прогноза нет: мало истории просмотров", prior: "ориентир" },
  en: { views: "views", starts: "bot starts", none: "no forecast: not enough view history", prior: "rule of thumb" },
};

export function forecastSlot(
  slot: { goal: Goal; format: string; time: string; weekday: number },
  stats: ChannelStats | undefined,
  bench: Benchmark | undefined,
  opts: { lang?: Lang; ctr?: { low: number; high: number; n: number } } = {},
): Forecast {
  const lang = opts.lang ?? "uz";
  const w = WORDS[lang];
  const basis: string[] = [];
  let views: Forecast["views"];
  let confidence: Forecast["confidence"] = "none";

  if (stats?.medianViews != null) {
    const base = stats.medianViews;
    let mult = 1;
    if (!stats.coldStart) {
      const hb = hourBucket(Number.parseInt(slot.time.slice(0, 2), 10));
      const parts: [string, { value: number | null; n: number } | undefined][] = [
        [`S.hourLift.${hb}`, hb ? stats.hourLift[hb] : undefined],
        [`S.formatLift.${slot.format}`, stats.formatLift[slot.format]],
        [`S.weekdayLift.${WEEKDAYS[slot.weekday]}`, stats.weekdayLift[WEEKDAYS[slot.weekday]]],
      ];
      for (const [id, b] of parts) {
        if (b?.value == null || b.n < 3) continue;
        mult *= shrink(b.value, b.n);
        basis.push(id);
      }
      mult = Math.min(2, Math.max(0.5, mult));
    }
    const mid = base * mult;
    const lifts = stats.lifts.map((x) => x.lift);
    const [lo, hi] = lifts.length >= 10 ? [quantile(lifts, 0.25), quantile(lifts, 0.75)] : [0.65, 1.35];
    views = { low: Math.round(mid * Math.min(lo, 0.95)), mid: Math.round(mid), high: Math.round(mid * Math.max(hi, 1.05)) };
    basis.unshift("S.medianViews");
    confidence = stats.coldStart ? "baseline" : "data";
  } else if (bench?.reachRate && stats?.subscribers) {
    const s = stats.subscribers;
    views = { low: Math.round(s * bench.reachRate.p25), mid: Math.round(s * bench.reachRate.median), high: Math.round(s * bench.reachRate.p75) };
    basis.push("S.bench.reachRate", "S.subscribers");
    confidence = "benchmark";
  }

  if (!views) return { status: "insufficient", basis, confidence: "none", display: w.none };

  let starts: Forecast["starts"];
  if (slot.goal === "sale") {
    const c = opts.ctr && opts.ctr.n >= 3 ? { ...opts.ctr, source: "measured" as const } : { ...PRIOR_CTR, source: "prior" as const };
    starts = { low: Math.max(0, Math.round(views.mid * c.low)), high: Math.max(1, Math.round(views.mid * c.high)), source: c.source };
  }
  const v = `≈${fmtInt(views.mid, lang)} ${w.views} (${fmtInt(views.low, lang)}–${fmtInt(views.high, lang)})`;
  const st = starts ? ` · ${starts.low}–${starts.high} ${w.starts}${starts.source === "prior" ? ` (${w.prior})` : ""}` : "";
  const conf = confidence === "benchmark" ? ` · ${lang === "uz" ? "nisha bo'yicha" : lang === "ru" ? "по нише" : "niche benchmark"}` : "";
  return { status: "ok", views, starts, basis, confidence, display: `${v}${st}${conf}` };
}
