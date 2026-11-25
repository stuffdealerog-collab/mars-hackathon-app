import { describe, expect, it } from "vitest";
import { growthSignals, rubricMarkers, subscriberTrendOf } from "../src/lib/uslub/brain/growth";
import { templateFinding } from "../src/lib/uslub/brain/plain";
import { pillarShares, planGoals, runRules, SALES_RULES } from "../src/lib/uslub/brain/rules";
import { buildKpis, buildSkeleton, metricText } from "../src/lib/uslub/brain/skeleton";
import { computeStats } from "../src/lib/uslub/brain/stats";
import type { ChannelData, RawPost, RuleResult } from "../src/lib/uslub/brain/types";

const NOW = Date.parse("2026-11-25T09:00:00Z");
const DAY = 86_400_000;

function channel(texts: string[], opts: { views?: (i: number) => number; subscribers?: number; channel?: string } = {}): ChannelData {
  const ch = opts.channel ?? "dilnoza_yozadi";
  const posts: RawPost[] = texts.map((text, i) => ({
    id: 100 - i,
    channel: ch,
    url: `https://t.me/${ch}/${100 - i}`,
    text,
    postedAt: new Date(NOW - (i * 3 + 4) * DAY + ((i * 5) % 9) * 3600_000).toISOString(),
    views: opts.views ? opts.views(i) : 800 + ((i * 137) % 300),
    approx: false,
    media: i % 3 === 0 ? "photo" : "text",
    isForward: false,
    links: [],
  }));
  return { channel: ch, title: "Dilnoza yozadi", subscribers: opts.subscribers ?? 2000, posts, complete: false, pages: 2 };
}

const PLAIN_BLOG = Array.from({ length: 16 }, (_, i) => `Bugun men ${i + 1}-marta yangi kitob o'qidim. Kitob haqida fikrlarim shunday bo'ldi, menga juda yoqdi.`);

const ENGAGED_BLOG = Array.from({ length: 16 }, (_, i) =>
  i % 3 === 0
    ? `#kitob_tavsiya: ${i + 1}-kitob. Bu hafta o'qiganim haqida qisqacha.\n#kitob_tavsiya`
    : i % 2 === 0
      ? `Siz bu hafta nima o'qidingiz? Izohlarda yozing, men ham o'qiyman.`
      : `Do'stim @kitobxon_qiz kanalida ajoyib ro'yxat bor — o'qib chiqing. Men ham u yerdan topdim.`,
);

const status = (rules: RuleResult[], id: string) => rules.find((r) => r.id === id)?.status;

describe("growth rules (blog, expert, media, community)", () => {
  const data = channel(PLAIN_BLOG);
  const stats = computeStats(data, NOW);

  it("sales rules never fire for a growth channel; growth rules run instead", () => {
    const rules = runRules(stats, { category: "", competitors: [], channelType: "blog", posts: data.posts, kb: { hasPrices: false, hasProducts: false, hasOffer: false, proofFacts: 0 } });
    for (const id of SALES_RULES) {
      const r = rules.find((x) => x.id === id);
      if (r) expect(r.status, id).toBe("inactive");
    }
    expect(status(rules, "R.SERIES")).toBe("fired");
    expect(rules.find((r) => r.id === "R.SERIES")?.kind).toBe("opportunity");
    expect(status(rules, "R.NO_ENGAGEMENT")).toBe("fired");
    expect(status(rules, "R.CROSS_PROMO")).toBe("fired");
    // No subscriber snapshots yet: the trend says so instead of guessing.
    expect(status(rules, "R.SUBS_TREND")).toBe("insufficient");
  });

  it("a business keeps its sales rules and gets no growth rules", () => {
    const rules = runRules(stats, { category: "kafe", competitors: [], posts: data.posts, kb: { hasPrices: true, hasProducts: true, hasOffer: false, proofFacts: 0 } });
    expect(rules.some((r) => ["R.SERIES", "R.NO_ENGAGEMENT", "R.CROSS_PROMO", "R.SUBS_TREND"].includes(r.id))).toBe(false);
    expect(rules.find((r) => r.id === "R.TRUST_GAP")?.status).not.toBe("inactive");
  });

  it("questions, a rubric that earns views and mentions of other channels: the growth rules do not fire (the rubric is a strength)", () => {
    const d = channel(ENGAGED_BLOG, { views: (i) => (i % 3 === 0 ? 2000 : 900) });
    const s = computeStats(d, NOW);
    const rules = runRules(s, { category: "", competitors: [], channelType: "blog", posts: d.posts });
    expect(status(rules, "R.NO_ENGAGEMENT")).toBe("not_fired");
    expect(status(rules, "R.CROSS_PROMO")).toBe("not_fired");
    const series = rules.find((r) => r.id === "R.SERIES");
    expect(series?.status).toBe("fired");
    expect(series?.kind).toBe("strength");
    expect(series?.data?.keep).toBe("#kitob_tavsiya");
  });

  it("subscriber trend from daily snapshots: a drop is a problem, growth a strength", () => {
    const down = subscriberTrendOf([
      { day: "2026-11-24", subscribers: 1900 },
      { day: "2026-11-10", subscribers: 2000 },
    ]);
    expect(down).toEqual({ from: 2000, to: 1900, days: 14, n: 2 });
    const rules = runRules(stats, { category: "", competitors: [], channelType: "media", posts: data.posts, subscriberTrend: down });
    const r = rules.find((x) => x.id === "R.SUBS_TREND");
    expect(r?.status).toBe("fired");
    expect(r?.kind).toBe("problem");
    const up = runRules(stats, { category: "", competitors: [], channelType: "media", posts: data.posts, subscriberTrend: { from: 1000, to: 1100, days: 20, n: 15 } }).find((x) => x.id === "R.SUBS_TREND");
    expect(up?.kind).toBe("strength");
    expect(subscriberTrendOf([{ day: "2026-11-24", subscribers: 10 }])).toBeUndefined();
  });

  it("rubric markers: hashtags, a 'Label:' opening and part numbers", () => {
    expect(rubricMarkers("Kun maslahati: suvni ko'p iching").map((m) => m.marker)).toContain("kun maslahati");
    expect(rubricMarkers("Hikoya, 3-qism. Davomi bor").map((m) => m.marker)).toContain("series:qism");
    expect(rubricMarkers("Matn\n#maslahat").map((m) => m.marker)).toContain("#maslahat");
    const sig = growthSignals(channel(PLAIN_BLOG).posts, new Map(), "dilnoza_yozadi");
    expect(sig.rubrics).toEqual([]);
    expect(sig.questionShare).toBe(0);
  });

  it("growth findings talk about readers, never prices or orders", () => {
    const rules = runRules(stats, { category: "", competitors: [], channelType: "blog", posts: data.posts });
    for (const lang of ["uz", "ru", "en"] as const)
      for (const r of rules.filter((x) => x.status === "fired")) {
        const t = templateFinding(r, stats, lang, { channelType: "blog", value: () => 0.05 });
        if (!t) continue;
        expect(t, `${r.id} ${lang}`).not.toMatch(/narx|buyurtma|цен[аыу]|заказ|price|order/i);
      }
  });
});

describe("growth plan: pillars, skeleton, KPIs", () => {
  const data = channel(PLAIN_BLOG);
  const stats = computeStats(data, NOW);
  const rules = runRules(stats, { category: "", competitors: [], channelType: "blog", posts: data.posts });

  it("pillars are reach / engage / grow and sum to 100; no answers push engage up", () => {
    const p = pillarShares("considered", rules, "blog");
    expect(planGoals("blog")).toEqual(["reach", "engage", "grow"]);
    expect(p.final.trust + p.final.sale).toBe(0);
    expect(p.final.reach + p.final.engage + p.final.grow).toBe(100);
    expect(p.final.engage).toBeGreaterThan(p.base.engage - 1);
  });

  it("a growth week has no sale or trust slots, no tracked links and no bot-start targets", () => {
    const p = pillarShares("considered", rules, "blog");
    const sk = buildSkeleton({ now: NOW, stats, competitors: [], rules, shares: p.final, category: "", hasPriceFact: true, hasOfferFact: true, approvedPosts: 12, bot: "mercatai", lang: "ru", calendar: [], planTag: "ab12cd", channelType: "blog" });
    const goals = new Set(sk.slots.map((s) => s.goal));
    expect([...goals].every((g) => ["reach", "engage", "grow"].includes(g))).toBe(true);
    expect(goals.has("engage")).toBe(true);
    expect(goals.has("grow")).toBe(true);
    for (const s of sk.slots) {
      expect(s.link).toBeUndefined();
      expect(s.metric).not.toMatch(/бот/);
      expect(s.approvalReasons).not.toContain("narx");
    }
    const kpis = buildKpis(stats, rules, sk.slots.length, sk.slots, "ru", { channelType: "blog" });
    expect(kpis.some((k) => /бот|ссылк/i.test(k.metric))).toBe(false);
    expect(kpis.some((k) => /Подписчики/.test(k.metric))).toBe(true);
  });

  it("a sales week without the opt-in has no links and no bot-start promises", () => {
    const bizRules = runRules(stats, { category: "kafe", competitors: [], kb: { hasPrices: true, hasProducts: true, hasOffer: false, proofFacts: 3 } });
    const p = pillarShares("impulse", bizRules);
    const sk = buildSkeleton({ now: NOW, stats, competitors: [], rules: bizRules, shares: p.final, category: "kafe", hasPriceFact: true, hasOfferFact: false, approvedPosts: 12, lang: "uz", calendar: [], planTag: "ab12cd" });
    expect(sk.slots.every((s) => !s.link)).toBe(true);
    expect(sk.slots.every((s) => !/botni/.test(s.metric))).toBe(true);
    expect(sk.slots.every((s) => !s.forecast?.starts)).toBe(true);
    const kpis = buildKpis(stats, bizRules, sk.slots.length, sk.slots, "uz");
    expect(kpis.some((k) => /havola|botga/i.test(k.metric))).toBe(false);
    expect(metricText("sale", 500, "en", { link: false })).toBe("≥500 views in 72 h and ≥1 order (from your weekly answer)");
    expect(metricText("engage", 500, "uz")).toMatch(/izohlar/);
  });
});
