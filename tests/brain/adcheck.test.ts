import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { adSignals, priceBand, uzs } from "../../src/lib/uslub/brain/adcheck";
import { parseChannelPage } from "../../src/lib/uslub/brain/scrape";
import { computeStats } from "../../src/lib/uslub/brain/stats";
import type { ChannelData, RawPost } from "../../src/lib/uslub/brain/types";
import { channelValidity, noPreview, previewRedirected, serviceTexts } from "../../src/lib/uslub/brain/validity";

const NOW = Date.parse("2026-11-24T08:00:00Z"); // 13:00 Tashkent
const H = 3_600_000;
const DAY = 24 * H;

const post = (id: number, ageMs: number, views: number | undefined, over: Partial<RawPost> = {}): RawPost => ({
  id,
  channel: "kanal",
  url: `https://t.me/kanal/${id}`,
  text: "Yangi non bor. Buyurtma uchun yozing",
  postedAt: new Date(NOW - ageMs).toISOString(),
  views,
  approx: false,
  media: "photo",
  isForward: false,
  links: [],
  ...over,
});

const channel = (posts: RawPost[], over: Partial<ChannelData> = {}): ChannelData => ({
  channel: "kanal",
  title: "Kanal",
  subscribers: 10_000,
  posts: [...posts].sort((a, b) => b.id - a.id),
  complete: false,
  pages: 1,
  ...over,
});

const check = (d: ChannelData, opts: Parameters<typeof adSignals>[3] = {}) => adSignals(d, computeStats(d, NOW), NOW, opts);
const sig = (r: ReturnType<typeof adSignals>, id: string) => r.signals.find((s) => s.id === id);

/** 40 posts every 2 days, uneven views around 3000, every 10th an ad, plus one 10 h old post still growing. */
function organic(): ChannelData {
  const f = [0.7, 1.3, 0.9, 1.6, 0.8, 1.1, 1.0, 0.6, 1.4, 1.2];
  const posts: RawPost[] = [];
  for (let i = 0; i < 40; i++) {
    const ad = i % 10 === 5;
    posts.push(post(1000 - i, 4 * DAY + i * 2 * DAY, Math.round(3000 * f[i % 10] * (ad ? 0.8 : 1)), ad ? { text: "#reklama Yangi do‘kon ochildi" } : {}));
  }
  posts.push(post(1001, 10 * H, 1200));
  return channel(posts);
}

/** Flat ~3000 views on every post, and fresh posts already at full views. */
function boosted(): ChannelData {
  const posts: RawPost[] = [];
  for (let i = 0; i < 30; i++) posts.push(post(500 - i, 4 * DAY + i * 2 * DAY, 3000 + (i % 3) * 10));
  posts.push(post(501, 5 * H, 2950), post(502, 10 * H, 2990), post(503, 20 * H, 3005));
  return channel(posts, { subscribers: 20_000 });
}

describe("ad-placement signals", () => {
  it("an organic, uneven channel passes", () => {
    const r = check(organic());
    expect(sig(r, "err")?.status).toBe("ok");
    expect(sig(r, "flat")?.status).toBe("ok");
    expect(sig(r, "saturation")).toMatchObject({ status: "ok", display: "0/1" });
    expect(sig(r, "adLoad")?.status).toBe("ok");
    expect(sig(r, "adReach")?.status).toBe("ok");
    expect(sig(r, "adReach")?.n).toBe(4);
    expect(sig(r, "jumps")?.status).toBe("insufficient");
    expect(r.verdict).toBe("ok");
    expect(r.summary.uz).toMatch(/kafolat emas/);
  });

  it("flat views + early saturation = suspect, listed as signs not as a fact", () => {
    const r = check(boosted());
    expect(sig(r, "flat")?.status).toBe("warn");
    expect(sig(r, "saturation")).toMatchObject({ status: "warn", value: 3, display: "3/3" });
    expect(r.verdict).toBe("suspect");
    expect(r.summary.uz).toMatch(/Nakrutka belgilari bor/);
    expect(r.summary.uz).not.toMatch(/fake|soxta/i);
    expect(r.summary.ru).toMatch(/признаки накрутки/);
  });

  it("subscriber jumps: absolute step and 10× the normal daily change", () => {
    const abs = check(organic(), {
      history: [
        { at: "2026-11-20T00:00:00Z", subscribers: 4000 },
        { at: "2026-11-21T00:00:00Z", subscribers: 10_000 },
      ],
    });
    expect(sig(abs, "jumps")).toMatchObject({ status: "warn", value: 6000 });
    expect(abs.verdict).toBe("caution");

    const steady = [0, 1, 2, 3, 4].map((d) => ({ at: new Date(NOW - (6 - d) * DAY).toISOString(), subscribers: 9000 + d * 10 }));
    const rel = check(organic(), { history: [...steady, { at: new Date(NOW - DAY).toISOString(), subscribers: 9540 }] });
    expect(sig(rel, "jumps")?.status).toBe("warn");

    const calm = check(organic(), { history: steady });
    expect(sig(calm, "jumps")?.status).toBe("ok");
  });

  it("ERR outside 10–50% warns only above 1000 subscribers", () => {
    expect(sig(check(organic(), {}), "err")?.value).toBeCloseTo(0.3, 1);
    const dead = check({ ...organic(), subscribers: 100_000 });
    expect(sig(dead, "err")?.status).toBe("warn");
    expect(sig(dead, "err")?.note.uz).toMatch(/o‘lik yoki sotib olingan/);
    const small = check({ ...organic(), subscribers: 900 });
    expect(sig(small, "err")?.status).toBe("insufficient");
  });

  it("heavy ad load warns", () => {
    const posts = Array.from({ length: 10 }, (_, i) =>
      post(100 - i, 4 * DAY + i * DAY, 2000 + i * 150, i < 5 ? { text: "#reklama Kurs" } : {}),
    );
    const r = check(channel(posts));
    expect(sig(r, "adLoad")).toMatchObject({ status: "warn", value: 0.5 });
  });

  it("CPM: price per 1000 views from ad posts when n ≥ 3, else from the mature median", () => {
    const r = check(organic(), { priceUzs: 600_000 });
    expect(r.cpm?.basis).toBe("adPosts");
    expect(r.cpm?.value).toBeCloseTo((600_000 / (r.adMedian?.value as number)) * 1000, 6);
    expect(r.priceBand).toMatchObject({ low: 300_000, high: 500_000, position: "above" });

    const noAds = check(boosted(), { priceUzs: 300_000 });
    expect(noAds.cpm?.basis).toBe("mature");
    expect(noAds.cpm?.value).toBeCloseTo((300_000 / (noAds.matureMedian as number)) * 1000, 6);
    expect(noAds.cpm?.display).toMatch(/so‘m \/ 1000 ko‘rish$/);
    expect(check(organic()).cpm).toBeUndefined();
  });

  it("price tiers follow spot.uz (Jan 2025) and are labelled as a prior", () => {
    expect(priceBand(50_000)).toMatchObject({ low: 300_000, high: 500_000 });
    expect(priceBand(200_000)).toMatchObject({ low: 1_000_000, high: 2_000_000 });
    expect(priceBand(1_200_000)).toMatchObject({ low: 2_000_000, high: 15_000_000 });
    expect(priceBand(50_000)?.source).toMatch(/taxminiy.*spot\.uz/);
    expect(priceBand(undefined)).toBeUndefined();
    expect(uzs(1234567)).toBe("1 234 567");
  });

  it("thin data gives honest insufficient states, never a verdict", () => {
    const r = check(channel([post(1, 4 * DAY, 500), post(2, 5 * DAY, 700)], { subscribers: undefined }));
    expect(sig(r, "err")?.status).toBe("insufficient");
    expect(sig(r, "flat")?.status).toBe("insufficient");
    expect(sig(r, "saturation")?.status).toBe("insufficient");
    expect(sig(r, "adReach")?.status).toBe("insufficient");
    expect(r.verdict).toBe("insufficient");
    expect(r.summary.uz).toMatch(/yetarli emas/);
    expect(check(channel([])).signals.every((s) => s.status === "insufficient")).toBe(true);
  });

  it("real fixture (@safiabakery): 51% reach is normal for Uzbek channels (no 50% false alarm), CPM inside the spot.uz band", () => {
    const html = readFileSync(new URL("./fixtures/safiabakery.html", import.meta.url), "utf8");
    const page = parseChannelPage("safiabakery", html);
    const d: ChannelData = { channel: "safiabakery", title: page.title, subscribers: page.subscribers, posts: page.posts, complete: false, pages: 1 };
    const r = check(d, { priceUzs: 400_000 });
    expect(sig(r, "err")).toMatchObject({ status: "ok", display: "51%" });
    expect(sig(r, "flat")?.status).toBe("ok");
    expect(r.priceBand?.position).toBe("within");
    expect(r.cpm?.basis).toBe("mature");
    expect(channelValidity(d, NOW, { role: "competitor" }).code).toBe("ok");
    // With a niche band (real channels of the same niche) the line moves with the niche.
    const tight = check(d, { errBand: { low: 0.1, high: 0.45, label: "test niche, n=5" } });
    expect(sig(tight, "err")).toMatchObject({ status: "warn", threshold: "10%–45% (test niche, n=5)", source: "data" });
  });
});

describe("channel validity", () => {
  const SQUAT_HTML = [
    '<div class="tgme_channel_info_header_title"><span dir="auto">Hamkorlik uchun</span></div>',
    '<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap service_message js-widget_message" data-post="lesailes_uz/1"><div class="tgme_widget_message_text js-message_text" dir="auto">Channel created</div></div></div>',
    '<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap service_message js-widget_message" data-post="lesailes_uz/2"><div class="tgme_widget_message_text js-message_text" dir="auto">Channel name was changed to «<span class="tgme_widget_service_strong_text" dir="auto">Sotiladi</span>»</div></div></div>',
    '<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap service_message js-widget_message" data-post="lesailes_uz/3"><div class="tgme_widget_message_text js-message_text" dir="auto">Channel name was changed to «<span class="tgme_widget_service_strong_text" dir="auto">Hamkorlik uchun</span>»</div></div></div>',
  ].join("\n");

  it("reads rename history from service messages", () => {
    expect(serviceTexts(SQUAT_HTML)).toEqual([
      "Channel created",
      "Channel name was changed to «Sotiladi»",
      "Channel name was changed to «Hamkorlik uchun»",
    ]);
  });

  it("@lesailes_uz: 1 subscriber, «Hamkorlik uchun», no posts → squatted, not a benchmark", () => {
    const d = channel([], { channel: "lesailes_uz", title: "Hamkorlik uchun", subscribers: 1 });
    const v = channelValidity(d, NOW, { role: "competitor", serviceTexts: serviceTexts(SQUAT_HTML) });
    expect(v).toMatchObject({ ok: false, code: "squatted" });
    expect(v.message.uz).toBe("@lesailes_uz — 1 obunachi, kanal nomi «Hamkorlik uchun». Bu brend kanali emasga o‘xshaydi. Taqqoslashga olinmadi.");
    expect(v.evidence).toMatch(/renamed: «Sotiladi», «Hamkorlik uchun»/);
    expect(channelValidity(d, NOW, { role: "own" }).message.uz).toMatch(/Havolani tekshiring\.$/);
  });

  it("a brand-looking title with a 'for sale' rename and few subscribers is still squatted", () => {
    const d = channel([post(1, DAY, 3)], { title: "Les Ailes", subscribers: 40 });
    expect(channelValidity(d, NOW, { serviceTexts: ["Channel name was changed to «Sotiladi»"] }).code).toBe("squatted");
    expect(channelValidity(d, NOW).code).toBe("tiny");
  });

  it("a big real channel with 'reklama' in a rename is not called squatted", () => {
    const d = channel([post(1, DAY, 3000)], { title: "Uy jihozlari", subscribers: 25_000 });
    expect(channelValidity(d, NOW, { serviceTexts: ["Channel name was changed to «Reklama uchun»"] }).code).toBe("ok");
  });

  it("empty, tiny (competitors only), stale, ok", () => {
    expect(channelValidity(channel([], { title: "Kafe" }), NOW).code).toBe("empty");
    const small = channel([post(1, DAY, 50)], { subscribers: 120 });
    expect(channelValidity(small, NOW, { role: "competitor" }).code).toBe("tiny");
    expect(channelValidity(small, NOW, { role: "own" }).code).toBe("ok");
    const old = channel([post(1, 80 * DAY, 900)]);
    const v = channelValidity(old, NOW);
    expect(v.code).toBe("stale");
    expect(v.message.uz).toMatch(/80 kun oldin/);
    expect(channelValidity(organic(), NOW)).toMatchObject({ ok: true, code: "ok" });
  });

  it("no public preview (@bonapetit_uz redirects to the contact page)", () => {
    expect(previewRedirected("https://t.me/bonapetit_uz")).toBe(true);
    expect(previewRedirected("https://t.me/s/safiabakery")).toBe(false);
    expect(previewRedirected("not a url")).toBe(false);
    const v = noPreview("bonapetit_uz");
    expect(v).toMatchObject({ ok: false, code: "no_preview" });
    expect(v.message.uz).toMatch(/^@bonapetit_uz — ochiq ko‘rinishi yo‘q/);
  });
});
