import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { benchLedger, benchmarkFor, type ChannelSummary, nicheOf, summarize } from "../../src/lib/uslub/brain/bench";
import { forecastSlot } from "../../src/lib/uslub/brain/forecast";
import { ageCurve, calibration, changeLines, funnelInput, hints, judgeExperiments, matchPosts, measure, scoreTags, type StoredPlan } from "../../src/lib/uslub/brain/learn";
import { funnelRule, runRules } from "../../src/lib/uslub/brain/rules";
import { parseChannelPage } from "../../src/lib/uslub/brain/scrape";
import { assignFocus, assignHookTypes, buildSkeleton, hookTypeOf, postCount } from "../../src/lib/uslub/brain/skeleton";
import { computeStats } from "../../src/lib/uslub/brain/stats";
import { sufficiency } from "../../src/lib/uslub/brain/sufficiency";
import type { ChannelData, RawPost } from "../../src/lib/uslub/brain/types";

const html = readFileSync(new URL("./fixtures/safiabakery.html", import.meta.url), "utf8");
const NOW = Date.parse("2026-11-24T08:00:00Z");
const H = 3_600_000;

function safia(): ChannelData {
  const p = parseChannelPage("safiabakery", html);
  return { channel: "Safiabakery", title: p.title, subscribers: p.subscribers, posts: p.posts.sort((a, b) => b.id - a.id), complete: false, pages: 1 };
}

const post = (id: number, hoursAgo: number, views: number, extra: Partial<RawPost> = {}): RawPost => ({
  id,
  channel: "shop",
  url: `https://t.me/shop/${id}`,
  text: "Yangi mahsulot keldi",
  postedAt: new Date(NOW - hoursAgo * H).toISOString(),
  views,
  approx: false,
  media: "photo",
  isForward: false,
  links: [],
  ...extra,
});

const summary = (channel: string, reachRate: number, extra: Partial<ChannelSummary> = {}): ChannelSummary => ({
  channel,
  niche: "cafe",
  subscribers: 5000,
  medianViews: Math.round(5000 * reachRate),
  reachRate,
  postsPerWeek: 4,
  maturePosts: 30,
  suspect: false,
  hourLift: { "19-22": 1.3, "10-13": 0.9 },
  formatLift: { photo: 1.0 },
  weekdayLift: {},
  formatMix: { photo: 1 },
  saleShare: 0.3,
  ctaRate: 0.4,
  emojiPer100: 1,
  capturedAt: "2026-11-20T00:00:00Z",
  ...extra,
});

describe("bench", () => {
  it("maps categories and titles to niches", () => {
    expect(nicheOf("cafe bakery")).toBe("cafe");
    expect(nicheOf("", "Safia Cafe & Bakery | Channel")).toBe("cafe");
    expect(nicheOf("stomatologiya klinikasi")).toBe("clinic");
    expect(nicheOf("IELTS o'quv markazi")).toBe("education");
    expect(nicheOf("lavash yetkazib berish")).toBe("fastfood");
    expect(nicheOf("")).toBe("other");
  });

  it("needs 5 clean channels, excludes suspect, thin and own channels, falls back to all niches", () => {
    const rows = [0.2, 0.25, 0.3, 0.35].map((r, i) => summary(`c${i}`, r));
    expect(benchmarkFor(rows, "cafe")).toBeUndefined();
    rows.push(summary("boosted", 0.9, { suspect: true }), summary("thin", 0.5, { maturePosts: 4 }), summary("own", 0.1));
    expect(benchmarkFor(rows, "cafe", "own")).toBeUndefined();
    rows.push(summary("c4", 0.4));
    const b = benchmarkFor(rows, "cafe", "own");
    expect(b?.scope).toBe("niche");
    expect(b?.n).toBe(5);
    expect(b?.reachRate?.median).toBeCloseTo(0.3);
    expect(b?.hourLift["19-22"]).toEqual({ median: 1.3, n: 5 });
    const other = rows.map((r) => ({ ...r, niche: "beauty" as const }));
    expect(benchmarkFor(other, "cafe")?.scope).toBe("all");
    const L = benchLedger(b!, { reachRate: 0.15 }, "uz");
    expect(L.find((e) => e.id === "S.bench.reachRate")?.display).toBe("30% (n=5 kanal, kafe va qandolat)");
    expect(L.find((e) => e.id === "S.bench.relReach")?.display).toBe("0.50×");
  });

  it("summaries carry no post text", () => {
    const s = summarize(computeStats(safia(), NOW), "cafe", new Date(NOW).toISOString());
    expect(JSON.stringify(s)).not.toMatch(/Safia Cafe|tort/i);
    expect(s.channel).toBe("safiabakery");
  });

  it("niche benchmark replaces the prior band in LOW_REACH when competitors are missing", () => {
    const stats = computeStats(safia(), NOW);
    const rows = [1.2, 1.3, 1.4, 1.5, 1.6].map((r, i) => summary(`c${i}`, r));
    const bench = benchmarkFor(rows, "cafe");
    const rules = runRules(stats, { category: "cafe", competitors: [], bench });
    const lr = rules.find((r) => r.id === "R.LOW_REACH");
    expect(lr?.status).toBe("fired");
    expect(lr?.ids).toContain("S.bench.relReach");
    expect(lr?.trigger).toMatch(/nisha, n=5/);
  });
});

describe("forecast", () => {
  const stats = computeStats(safia(), NOW);
  it("uses the channel median and shrunk lifts, with a p25–p75 range", () => {
    const f = forecastSlot({ goal: "sale", format: "photo", time: "11:20", weekday: 3 }, stats, undefined, { lang: "uz" });
    expect(f.status).toBe("ok");
    expect(f.confidence).toBe("data");
    expect(f.views!.low).toBeLessThan(f.views!.mid);
    expect(f.views!.high).toBeGreaterThan(f.views!.mid);
    expect(f.basis[0]).toBe("S.medianViews");
    expect(f.starts?.source).toBe("prior");
    expect(f.display).toMatch(/ko'rish.*botga o'tish \(taxminiy\)/);
  });
  it("falls back to the niche benchmark, then says it cannot forecast", () => {
    const cold = { ...stats, medianViews: undefined, coldStart: true };
    const rows = [0.1, 0.2, 0.3, 0.4, 0.5].map((r, i) => summary(`c${i}`, r));
    const f = forecastSlot({ goal: "reach", format: "photo", time: "20:40", weekday: 0 }, cold, benchmarkFor(rows, "cafe"));
    expect(f.confidence).toBe("benchmark");
    expect(f.views!.mid).toBe(Math.round(8850 * 0.3));
    const none = forecastSlot({ goal: "reach", format: "photo", time: "20:40", weekday: 0 }, cold, undefined, { lang: "ru" });
    expect(none.status).toBe("insufficient");
    expect(none.display).toMatch(/прогноза нет/);
  });
});

describe("learn loop", () => {
  const plan: StoredPlan = {
    id: "p1",
    tag: "abc123",
    channel: "shop",
    weekOf: "2026-11-17",
    baseline: { medianViews: 1000 },
    createdAt: "2026-11-16T00:00:00Z",
    items: [
      { slot: 1, day: "2026-11-17", time: "08:40", weekday: 0, goal: "reach", format: "photo", hookType: "question" },
      { slot: 2, day: "2026-11-18", time: "12:40", weekday: 1, goal: "trust", format: "photo", hookType: "local", src: "src_abc123_2", exp: "hour" },
      { slot: 3, day: "2026-11-19", time: "20:40", weekday: 2, goal: "sale", format: "photo", hookType: "price", src: "src_abc123_3", forecast: { status: "ok", views: { low: 800, mid: 1000, high: 1300 }, basis: [], confidence: "data", display: "" } },
      { slot: 10, day: "2026-11-20", time: "20:40", weekday: 3, goal: "sale", format: "photo", src: "src_abc123_10" },
    ],
  };
  const at = (day: string, time: string) => (NOW - Date.parse(`${day}T${time}:00+05:00`)) / H;
  const posts = [
    post(50, at("2026-11-17", "09:10"), 1500),
    post(51, at("2026-11-18", "12:45"), 1800, { links: ["https://t.me/uslubbot?start=src_abc123_2"] }),
    post(52, at("2026-11-19", "20:41"), 1200, { links: ["https://t.me/uslubbot?start=src_abc123_3"] }),
    post(53, at("2026-11-20", "20:40"), 900, { links: ["https://t.me/uslubbot?start=src_abc123_1"] }), // _1 must not match slot 10
  ];

  it("matches by tracked link (no prefix collisions) and reach posts by time", () => {
    const m = matchPosts(plan, posts);
    expect(m.get(2)?.post.id).toBe(51);
    expect(m.get(3)?.post.id).toBe(52);
    expect(m.get(10)).toBeUndefined();
    expect(m.get(1)).toEqual({ post: posts[0], match: "time" });
  });

  it("never time-matches a plan that has no link in the channel (someone else's plan)", () => {
    const stranger = { ...plan, tag: "zzz999", items: plan.items.map((i) => ({ ...i, src: i.src?.replace("abc123", "zzz999") })) };
    expect(matchPosts(stranger, posts).size).toBe(0);
  });

  it("measures 72h views, CTR from bot starts, forecast hits, owner-reported sales", () => {
    const out = measure({ plans: [plan], posts, now: NOW, starts: new Map([["src_abc123_3", 18]]), sold: new Map([["abc123:3", 2]]) });
    const s3 = out.find((o) => o.slot === 3)!;
    expect(s3.status).toBe("final");
    expect(s3.lift).toBe(1.2);
    expect(s3.ctr).toBeCloseTo(18 / 1200);
    expect(s3.inRange).toBe(true);
    expect(s3.sold).toBe(2);
    expect(out.find((o) => o.slot === 10)?.status).toBe("not_found");
    expect(calibration(out)).toEqual({ n: 1, inRange: 1, medianRatio: 1.2 });
    const f = funnelInput(out, 7);
    expect(f.posts).toEqual([{ slot: 3, planTag: "abc123", views72: 1200, starts: 18, sold: 2 }]);
  });

  it("prefers the snapshot nearest 72h over today's count", () => {
    const snaps = new Map([[52, [{ postId: 52, ageHours: 70, views: 1100 }, { postId: 52, ageHours: 30, views: 700 }]]]);
    const s3 = measure({ plans: [plan], posts, now: NOW, snapshots: snaps }).find((o) => o.slot === 3)!;
    expect(s3.views).toBe(1100);
    expect(s3.ageHours).toBe(70);
  });

  it("early reads are age-adjusted with the channel's own view curve; too-young posts wait", () => {
    const ps = [
      ...Array.from({ length: 8 }, (_, i) => post(100 + i, 80 + i * 20, 1000)),
      post(120, 10, 400),
      post(121, 12, 400),
      post(122, 30, 800),
      post(123, 34, 800),
    ];
    const curve = ageCurve(ps, NOW);
    expect(curve["6-24"]).toBeCloseTo(0.4);
    expect(curve["24-48"]).toBeCloseTo(0.8);
    const young: StoredPlan = { ...plan, tag: "yng123", items: [{ slot: 2, day: "x", time: "12:40", weekday: 0, goal: "trust", format: "photo", src: "src_yng123_2" }] };
    const p = post(130, 30, 960, { links: ["?start=src_yng123_2"] });
    const o = measure({ plans: [young], posts: [...ps, p], now: NOW })[0];
    expect(o.status).toBe("early");
    expect(o.lift).toBeCloseTo(960 / (1000 * 0.8));
    const q = post(131, 3, 300, { links: ["?start=src_yng123_2"] });
    expect(measure({ plans: [young], posts: [...ps, q], now: NOW })[0].status).toBe("too_early");
  });

  it("scores tags with k=3 shrinkage: hypothesis < 3, supported ≥ 1.2, dropped < 0.8", () => {
    const mk = (lift: number, hour: string, weekOf: string) => ({ planTag: weekOf, weekOf, slot: 1, goal: "sale" as const, format: "photo", hour, status: "final" as const, lift, starts: 0 });
    const scores = scoreTags([mk(1.8, "19-22", "w1"), mk(1.6, "19-22", "w1"), mk(1.7, "19-22", "w2"), mk(0.4, "10-13", "w1"), mk(0.5, "10-13", "w2"), mk(0.3, "10-13", "w2"), mk(2, "07-10", "w1")]);
    const by = (v: string) => scores.find((s) => s.tag === "hour" && s.value === v)!;
    expect(by("19-22")).toMatchObject({ n: 3, score: 1.35, status: "supported", rule: true });
    expect(by("10-13")).toMatchObject({ n: 3, status: "dropped" });
    expect(by("07-10")).toMatchObject({ n: 1, status: "hypothesis" });
    const h = hints([], [plan]);
    expect(h.nextExp).toBe("hour"); // tested once, needs two weeks
    expect(changeLines([], scores, [], { n: 0, inRange: 0 }, "uz")).toEqual([]);
  });

  it("judges the single experiment against the same week, and calls one post a hypothesis", () => {
    const base = { planTag: "t", weekOf: "w", goal: "trust" as const, format: "photo", hour: "10-13", status: "final" as const, starts: 0 };
    const res = judgeExperiments([
      { ...base, slot: 1, lift: 1.0 },
      { ...base, slot: 2, lift: 1.1 },
      { ...base, slot: 3, lift: 1.6, exp: "hour" },
    ]);
    expect(res[0]).toMatchObject({ variable: "hour", verdict: "won", ratio: 1.52 });
    const lines = changeLines([{ ...base, slot: 3, lift: 1.6, exp: "hour" }], [], res, { n: 0, inRange: 0 }, "uz");
    expect(lines[0]).toMatch(/gipoteza/);
  });
});

describe("R.FUNNEL_LEAK", () => {
  it("is inactive without plans, insufficient without ≥500-view tracked posts", () => {
    expect(funnelRule(undefined).status).toBe("inactive");
    expect(funnelRule({ plans: 1, posts: [{ slot: 1, planTag: "t", views72: 300, starts: 2 }] }).status).toBe("insufficient");
  });
  it("names the leak: offer (CTR < 0.3%), follow-up (CTR ≥ 1%, 0 orders), owner task", () => {
    expect(funnelRule({ plans: 1, posts: [{ slot: 1, planTag: "t", views72: 2000, starts: 2 }] }).data?.leak).toBe("offer");
    const f = funnelRule({ plans: 1, posts: [{ slot: 1, planTag: "t", views72: 1000, starts: 15, sold: 0 }] });
    expect(f.status).toBe("fired");
    expect(f.data?.leak).toBe("followup");
    expect(funnelRule({ plans: 1, posts: [{ slot: 1, planTag: "t", views72: 1000, starts: 6 }], weekOrders: 0 }).data?.leak).toBe("owner");
    expect(funnelRule({ plans: 1, posts: [{ slot: 1, planTag: "t", views72: 1000, starts: 15 }], weekOrders: 7 }).status).toBe("not_fired");
    expect(funnelRule({ plans: 1, posts: [{ slot: 1, planTag: "t", views72: 1000, starts: 15 }] }).trigger).toMatch(/orders: not reported/);
  });
});

describe("skeleton v2", () => {
  const stats = computeStats(safia(), NOW);
  const rules = runRules(stats, { category: "cafe bakery", competitors: [] });
  const base = { now: NOW, stats, competitors: [], rules, shares: { reach: 35, trust: 25, sale: 40 }, category: "cafe bakery", hasPriceFact: true, hasOfferFact: false, approvedPosts: 12, bot: "uslubbot", lang: "uz" as const, calendar: [] };

  it("tracked links carry the plan tag; every slot gets a forecast", () => {
    const sk = buildSkeleton({ ...base, planTag: "k3x9qa" });
    for (const s of sk.slots) {
      if (s.goal === "reach") expect(s.link).toBeUndefined();
      else expect(s.link).toBe(`https://t.me/uslubbot?start=src_k3x9qa_${s.slot}`);
      expect(s.forecast?.status).toBe("ok");
    }
  });

  it("uses the niche's best hour (timeSource=benchmark) when the channel has no winner", () => {
    const rows = [0.2, 0.25, 0.3, 0.35, 0.4].map((r, i) => summary(`c${i}`, r));
    const sk = buildSkeleton({ ...base, bench: benchmarkFor(rows, "cafe") });
    const noExp = sk.slots.filter((s) => !s.exp);
    expect(noExp.every((s) => s.timeSource === "benchmark")).toBe(true);
    expect(noExp[0].evidence).toContain("S.bench.hourLift.19-22");
  });

  it("learned hour beats competitors and benchmark; learn picks the next experiment", () => {
    const learned = { supported: [{ tag: "hour" as const, value: "16-19", n: 3, score: 1.4, weeks: 2, status: "supported" as const, rule: true }], dropped: [], testedVars: { hour: 2 }, nextExp: "format" as const };
    const sk = buildSkeleton({ ...base, learned });
    expect(sk.slots.filter((s) => !s.exp).every((s) => s.timeSource === "learned")).toBe(true);
    expect(sk.slots.find((s) => s.exp)?.exp).toBe("format");
  });

  it("code assigns hook types (≤2 per type, never dropped ones) and rotates fact focus", () => {
    const sk = buildSkeleton({ ...base, planTag: "k3x9qa" });
    assignHookTypes(sk.slots, { dropped: ["price"] });
    const counts = new Map<string, number>();
    for (const s of sk.slots) counts.set(s.hookType!, (counts.get(s.hookType!) ?? 0) + 1);
    expect([...counts.values()].every((n) => n <= 2)).toBe(true);
    expect(counts.has("price")).toBe(false);
    const facts = [
      { id: "F1", type: "price" },
      { id: "F2", type: "price" },
      { id: "F3", type: "address" },
      { id: "F4", type: "hours" },
      { id: "F5", type: "story" },
      { id: "F6", type: "review" },
    ];
    assignFocus(sk.slots, facts, rules);
    const sale = sk.slots.filter((s) => s.goal === "sale");
    expect(sale.every((s) => s.focus!.some((f) => f === "F1" || f === "F2"))).toBe(true);
    expect(hookTypeOf("Napoleon — 45 000 so'm")).toBe("price");
    expect(hookTypeOf("Nega tort qimmat?")).toBe("question");
  });
});

describe("post count cap", () => {
  it("OVERPOSTING never plans more than 10 posts (a 40-a-week channel got 28 in v1)", () => {
    const stats = { ...computeStats(safia(), NOW), postsPerWeek: 40, postsInWindow: 60 };
    const rules = [{ id: "R.OVERPOSTING", name: "", status: "fired" as const, kind: "problem" as const, severity: 2 as const, trigger: "", ids: [], effects: "" }];
    expect(postCount(stats, rules)).toBe(10);
  });
});

describe("sufficiency", () => {
  it("says which claims rest on data, benchmark, rule of thumb or nothing", () => {
    const stats = computeStats(safia(), NOW);
    const items = sufficiency({ stats, competitors: 0, facts: { prices: 0, proof: 1 } }, "uz");
    const by = (k: string) => items.find((i) => i.key === k)!;
    expect(by("bestTime").status).toBe("prior");
    expect(by("competitors").text).toMatch(/kerak kamida 2/);
    // Owner-facing panel: no developer notation.
    for (const i of items) expect(i.text).not.toMatch(/n=|≥|×/);
    expect(by("learn").text).toMatch(/72 soat/);
    expect(by("prices").status).toBe("insufficient");
    expect(by("benchmark").status).toBe("insufficient");
  });
});
