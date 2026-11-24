import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { factNumbers, groundedCheck, lintItem, parseNumber } from "../../src/lib/uslub/brain/lint";
import { cycleOf, largestRemainder, pillarShares, runRules, statsLedger } from "../../src/lib/uslub/brain/rules";
import { normalizeChannel, parseChannelPage, parseCount } from "../../src/lib/uslub/brain/scrape";
import { buildSkeleton, goalCounts, postCount } from "../../src/lib/uslub/brain/skeleton";
import { computeLifts, computeStats, detectLang, features, hourBucket, median } from "../../src/lib/uslub/brain/stats";
import type { ChannelData, LedgerEntry, RawPost, RuleResult } from "../../src/lib/uslub/brain/types";

const html = readFileSync(new URL("./fixtures/safiabakery.html", import.meta.url), "utf8");
const NOW = Date.parse("2026-11-24T08:00:00Z"); // 13:00 Tashkent

const post = (over: Partial<RawPost> & { id: number; at: string }): RawPost => ({
  channel: "kafe",
  url: `https://t.me/kafe/${over.id}`,
  text: "",
  postedAt: over.at,
  views: 1000,
  approx: false,
  media: "photo",
  isForward: false,
  links: [],
  ...over,
});

describe("scrape parsing", () => {
  it("normalizes channel input", () => {
    expect(normalizeChannel("@kafe_uz")).toBe("kafe_uz");
    expect(normalizeChannel("https://t.me/s/kafe_uz/12")).toBe("kafe_uz");
    expect(normalizeChannel("t.me/kafe_uz?x=1")).toBe("kafe_uz");
    expect(normalizeChannel("a b")).toBeNull();
  });

  it("parses view counts with suffixes", () => {
    expect(parseCount("12.3K")).toEqual({ value: 12300, approx: true });
    expect(parseCount("3,4M")).toEqual({ value: 3_400_000, approx: true });
    expect(parseCount("845")).toEqual({ value: 845, approx: false });
    expect(parseCount("abc")).toBeNull();
  });

  it("parses the saved t.me/s fixture: header, posts, views, dates, media", () => {
    const page = parseChannelPage("safiabakery", html);
    expect(page.title).toBeTruthy();
    expect(page.subscribers).toBe(8850);
    expect(page.posts.length).toBeGreaterThanOrEqual(15);
    const p = page.posts.find((x) => x.id === 1694);
    expect(p).toBeDefined();
    expect(p?.postedAt).toBe("2026-11-23T12:15:43.000Z");
    expect(page.posts.every((x) => x.url.startsWith("https://t.me/"))).toBe(true);
    expect(page.posts.filter((x) => x.views != null).length).toBeGreaterThan(10);
    expect(page.posts.some((x) => x.approx)).toBe(true);
    expect(new Set(page.posts.map((x) => x.media)).size).toBeGreaterThanOrEqual(1);
  });

  it("returns no posts and no header for an unknown page", () => {
    const page = parseChannelPage("x", "<html><body>nothing</body></html>");
    expect(page.posts).toEqual([]);
    expect(page.hasHeader).toBe(false);
  });
});

describe("features", () => {
  it("detects price, hidden price, CTA, promo and language", () => {
    const f = features(post({ id: 1, at: "2026-11-20T15:00:00Z", text: "Somsa — 12 000 so'm\nBuyurtma: +998 90 123 45 67" }));
    expect(f.hasPrice).toBe(true);
    expect(f.phone).toBe(true);
    expect(f.hasCTA).toBe(true);
    expect(f.isSale).toBe(true);
    expect(f.lang).toBe("uz-Latn");
    expect(f.hourBucket).toBe("19-22"); // 15:00 UTC = 20:00 Tashkent
    expect(features(post({ id: 2, at: "2026-11-20T15:00:00Z", text: "Narxi lichkada" })).hiddenPrice).toBe(true);
    expect(features(post({ id: 3, at: "2026-11-20T15:00:00Z", text: "Скидка 20% на все торты" })).isPromo).toBe(true);
    expect(detectLang("Қандай ажойиб кун")).toBe("uz-Cyrl");
    expect(detectLang("Привет, как дела")).toBe("ru");
  });

  it("buckets hours and excludes the night", () => {
    expect(hourBucket(8)).toBe("07-10");
    expect(hourBucket(23)).toBe("22-01");
    expect(hourBucket(3)).toBeNull();
  });
});

describe("stats", () => {
  it("median and lifts vs neighbours", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    const ps = Array.from({ length: 12 }, (_, i) => post({ id: i + 1, at: new Date(NOW - (i + 4) * 86_400_000).toISOString(), views: i === 5 ? 3000 : 1000 }));
    const lifts = computeLifts(ps);
    expect(lifts.get(6)).toBeCloseTo(3, 5);
    expect(lifts.get(1)).toBeCloseTo(1, 5);
  });

  it("computes channel stats from the fixture", () => {
    const page = parseChannelPage("safiabakery", html);
    const data: ChannelData = { channel: "safiabakery", subscribers: page.subscribers, title: page.title, posts: page.posts, complete: false, pages: 1 };
    const s = computeStats(data, NOW);
    expect(s.subscribers).toBe(8850);
    expect(s.postsInWindow).toBe(page.posts.length);
    expect(s.medianViews).toBeGreaterThan(0);
    expect(s.reachRate).toBeCloseTo((s.medianViews as number) / 8850, 6);
    expect(s.postsPerWeek).toBeGreaterThan(0);
    const mix = Object.values(s.formatMix).reduce((a, b) => a + b, 0);
    expect(mix).toBeCloseTo(1, 6);
    // ledger entries carry exact display strings
    const L = statsLedger(s, []);
    expect(L.find((e) => e.id === "S.reachRate")?.display).toMatch(/%$/);
  });

  it("flags cold start below 10 mature posts and never guesses subscribers", () => {
    const data: ChannelData = { channel: "kafe", posts: [post({ id: 1, at: "2026-11-10T10:00:00Z" })], complete: true, pages: 1 };
    const s = computeStats(data, NOW);
    expect(s.coldStart).toBe(true);
    expect(s.subscribers).toBeUndefined();
    expect(s.reachRate).toBeUndefined();
    const rules = runRules(s, { category: "cafe", competitors: [] });
    expect(rules.find((r) => r.id === "R.COLD_START")?.status).toBe("fired");
    expect(rules.find((r) => r.id === "R.LOW_REACH")?.status).toBe("insufficient");
  });
});

describe("rules", () => {
  const mk = (n: number, opts: Partial<RawPost> = {}, every = 1) =>
    Array.from({ length: n }, (_, i) => post({ id: i + 1, at: new Date(NOW - (4 + i * every) * 86_400_000).toISOString(), ...opts }));

  it("fires LOW_REACH, DEAD_ENDS and HIDDEN_PRICE on a weak channel", () => {
    const posts = mk(20, { views: 300, text: "Yangi tortlar. Narxi lichkada" });
    posts.forEach((p, i) => (p.views = 250 + (i % 5) * 40));
    const s = computeStats({ channel: "kafe", subscribers: 5000, posts, complete: false, pages: 2 }, NOW);
    const rules = runRules(s, { category: "cafe", competitors: [], kb: { hasPrices: true, hasProducts: true, hasOffer: false, proofFacts: 0 } });
    const st = (id: string) => rules.find((r) => r.id === id)?.status;
    expect(st("R.LOW_REACH")).toBe("fired");
    expect(st("R.DEAD_ENDS")).toBe("fired");
    expect(st("R.HIDDEN_PRICE")).toBe("fired");
    expect(st("R.TRUST_GAP")).toBe("fired");
    expect(rules).toHaveLength(20);
    expect(rules.find((r) => r.id === "R.LOW_REACH")?.trigger).toMatch(/taxminiy/);
  });

  it("flags SUSPECT_BOOSTED when views are suspiciously flat", () => {
    const s = computeStats({ channel: "kafe", subscribers: 2000, posts: mk(15, { views: 1000 }), complete: false, pages: 1 }, NOW);
    expect(s.suspectBoosted).toBe(true);
    expect(runRules(s, { category: "", competitors: [] }).find((r) => r.id === "R.SUSPECT_BOOSTED")?.status).toBe("fired");
  });

  it("fires INCONSISTENT for long gaps", () => {
    const s = computeStats({ channel: "kafe", subscribers: 500, posts: mk(12, {}, 7), complete: true, pages: 1 }, NOW);
    expect(runRules(s, { category: "", competitors: [] }).find((r) => r.id === "R.INCONSISTENT")?.status).toBe("fired");
  });

  it("pillar shares: base split + rule deltas, clamped and renormalized", () => {
    expect(cycleOf("cafe")).toBe("impulse");
    expect(cycleOf("clinic")).toBe("high-trust");
    expect(cycleOf("clothing shop")).toBe("considered");
    const fired = (ids: string[]) => ids.map((id) => ({ id, status: "fired" }) as RuleResult);
    const p = pillarShares("impulse", fired(["R.LOW_REACH", "R.TRUST_GAP"]));
    expect(p.base).toEqual({ reach: 35, trust: 25, sale: 40 });
    expect(p.final).toEqual({ reach: 35, trust: 35, sale: 30 });
    expect(p.steps).toHaveLength(2);
    expect(largestRemainder([1, 1, 1], 100)).toEqual([34, 33, 33]);
  });
});

describe("skeleton", () => {
  it("post count follows cadence", () => {
    const s = (ppw: number, inWin = 10) => ({ postsPerWeek: ppw, postsInWindow: inWin }) as never;
    expect(postCount(undefined, [])).toBe(3);
    expect(postCount(s(2), [])).toBe(3);
    expect(postCount(s(5), [])).toBe(7);
    expect(postCount(s(12), [])).toBe(10);
  });

  it("caps sale posts and keeps ≥1 trust post", () => {
    const c = goalCounts(7, { reach: 35, trust: 25, sale: 40 }, [{ id: "R.TRUST_GAP", status: "fired" } as RuleResult], true);
    expect(c.sale).toBeLessThanOrEqual(2);
    expect(c.trust).toBeGreaterThanOrEqual(1);
    expect(goalCounts(5, { reach: 35, trust: 25, sale: 40 }, [], false).sale).toBe(0);
  });

  it("builds a 7-day plan from tomorrow with no :00 times, no juma slot, a trust post before each sale", () => {
    const sk = buildSkeleton({
      now: NOW,
      competitors: [],
      rules: [],
      shares: { reach: 35, trust: 25, sale: 40 },
      category: "cafe",
      hasPriceFact: true,
      hasOfferFact: false,
      approvedPosts: 12,
      bot: "uslub_bot",
      lang: "uz",
      calendar: [{ id: "blackfriday", name: "Qora juma", daysAway: 3 }],
    });
    expect(sk.weekOf).toBe("2026-11-25");
    expect(sk.slots.length).toBe(3);
    for (const s of sk.slots) {
      expect(s.time.endsWith(":00")).toBe(false);
      if (s.weekday === 4) expect(Number(s.time.slice(0, 2)) >= 12 && Number(s.time.slice(0, 2)) < 14).toBe(false);
      if (s.goal === "reach") expect(s.link).toBeUndefined();
      else expect(s.link).toMatch(/^https:\/\/t\.me\/uslub_bot\?start=src_\d{4}_\d+$/);
    }
    sk.slots.forEach((s, i) => {
      if (s.goal === "sale") expect(sk.slots[i - 1]?.goal).toBe("trust");
    });
    expect(sk.slots.filter((s) => s.exp).length).toBe(1);
    expect(sk.slots.some((s) => s.calendarEvent === "Qora juma")).toBe(true);
  });
});

describe("lint", () => {
  const ledger = new Map<string, LedgerEntry>([
    ["S.reachRate", { id: "S.reachRate", label: "reach", value: 0.062, display: "6.2%", n: 28, source: "stats" }],
    ["F1", { id: "F1", label: "price", value: "Somsa 12 000 so'm", display: "Somsa — 12 000 so'm", source: "kb" }],
    ["R.LOW_REACH", { id: "R.LOW_REACH", label: "low", value: "x", display: "reachRate 6.2% < 10%", source: "rule" }],
  ]);

  it("normalizes prices: 45 000 = 45k = 45 ming", () => {
    expect(parseNumber("45 000")).toBe(45000);
    expect(parseNumber("45", "k")).toBe(45000);
    expect(parseNumber("45", "ming")).toBe(45000);
    expect(factNumbers("Narx 45k so'm, soat 19:00, 2026-11-27").map((n) => n.value)).toEqual([45000]);
  });

  it("GROUNDED passes copied numbers and fails laundered ones", () => {
    expect(groundedCheck("Qamrov 6.2% [S.reachRate, R.LOW_REACH]", ledger)).toEqual([]);
    expect(groundedCheck("Somsa 12 000 so'm [F1]", ledger)).toEqual([]);
    expect(groundedCheck("Somsa 12k so'm [F1]", ledger)).toEqual([]);
    expect(groundedCheck("Qamrov 2x oshdi, 30% tejang [S.reachRate]", ledger).length).toBeGreaterThan(0);
    expect(groundedCheck("1000+ mijoz [F1]", ledger).length).toBeGreaterThan(0);
    expect(groundedCheck("x [F9]", ledger)[0]?.reason).toMatch(/does not exist/);
  });

  it("plan item checks: CTA link count, greeting hook, urgency, hidden price", () => {
    const ctx = { ledger, priceFacts: [ledger.get("F1") as LedgerEntry], deadlineFacts: 0, recentHooks: [], competitorTexts: [], emojiCap: 2, address: "siz" as const };
    const ok = lintItem({ slot: 1, goal: "sale", hook: "Somsa — 12 000 so'm. Nega aynan shu narx?", cta: "Botga yozing: {{LINK}}", brief: "Tandirni suratga oling [F1]", factIds: ["F1"] }, ctx);
    expect(ok).toEqual([]);
    const bad = lintItem({ slot: 2, goal: "sale", hook: "Assalomu alaykum! Shoshiling, faqat bugun", cta: "Narxi lichkada", brief: "", factIds: [] }, ctx);
    const checks = new Set(bad.map((f) => f.check));
    expect(checks.has("HOOK")).toBe(true);
    expect(checks.has("URGENCY")).toBe(true);
    expect(checks.has("PRICE")).toBe(true);
    expect(checks.has("ONE_CTA")).toBe(true);
  });
});
