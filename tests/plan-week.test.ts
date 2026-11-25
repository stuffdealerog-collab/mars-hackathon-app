import { beforeEach, describe, expect, it } from "vitest";
import { eventsOfYear, upcomingEvents } from "../src/lib/uslub/brain/calendar";
import { channelFactsKb, stalePriceLines } from "../src/lib/uslub/brain/channel-facts";
import { stripIdsAll } from "../src/lib/uslub/brain/copy";
import { langOf, wrongLanguage } from "../src/lib/uslub/brain/language";
import { distinctTopics, dropDuplicates, duplicateItems, factSourceOf, withTrackedLink } from "../src/lib/uslub/brain/plan-checks";
import { resetPlanOwnerCache, verifiedPlanBusiness } from "../src/lib/uslub/brain/plan-owner";
import { runRules } from "../src/lib/uslub/brain/rules";
import { buildSkeleton } from "../src/lib/uslub/brain/skeleton";
import type { ChannelData, RawPost } from "../src/lib/uslub/brain/types";
import { cleanBrief } from "../src/lib/uslub/slots";
import { planTrackedLink, withoutTrackedLinks } from "../src/lib/uslub/ending";

const NOV25 = Date.parse("2026-11-25T09:00:00+05:00");

describe("calendar (rolling, past 2027-01-14)", () => {
  it("a bakery on 2026-11-25 gets the New Year preorder; a clothing shop does not", () => {
    const ev = upcomingEvents("Toshkentdagi qandolatxona: tortlar va pirojniylar", NOV25);
    const ny = ev.find((e) => e.id === "newyear-preorder");
    expect(ny?.kind).toBe("preorder");
    expect(ny?.daysAway).toBeLessThanOrEqual(7);
    expect(upcomingEvents("kiyim do'koni", NOV25).some((e) => e.id === "newyear-preorder")).toBe(false);
  });

  it("Constitution Day is a notice (an hours question), never a content slot or a calendar finding", () => {
    const now = Date.parse("2026-11-30T09:00:00+05:00");
    const ev = upcomingEvents("kafe", now);
    expect(ev.find((e) => e.id === "constitution")?.kind).toBe("notice");
    const cal = ev.map((e) => ({ id: e.id, name: e.name.uz, daysAway: e.daysAway, kind: e.kind }));
    const sk = buildSkeleton({ now, stats: undefined, competitors: [], rules: [], shares: { reach: 30, trust: 40, sale: 30 }, category: "kafe", hasPriceFact: false, hasOfferFact: false, approvedPosts: 12, lang: "uz", calendar: cal.filter((e) => e.id === "constitution") });
    expect(sk.slots.some((s) => s.calendarEvent)).toBe(false);
  });

  it("Navruz and 8 March are found in 2027, Ramadan dates are marked to verify, Black Friday rolls", () => {
    const march = upcomingEvents("gul do'koni", Date.parse("2027-03-10T09:00:00+05:00"));
    expect(march.map((e) => e.id)).toEqual(expect.arrayContaining(["navruz"]));
    expect(upcomingEvents("gul do'koni", Date.parse("2027-03-02T09:00:00+05:00")).some((e) => e.id === "women-preorder" && e.daysAway === 0)).toBe(true);
    const y27 = eventsOfYear(2027);
    expect(y27.find((e) => e.id === "ramazon-hayit-2027")?.confidence).toBe("verify");
    expect(y27.find((e) => e.id === "blackfriday")?.date).toBe("2027-11-26");
    expect(eventsOfYear(2026).find((e) => e.id === "blackfriday")?.date).toBe("2026-11-27");
  });

  it("a preorder holiday takes a sale slot when there are prices", () => {
    const rules = [{ id: "R.CALENDAR", status: "fired" }] as never;
    const sk = buildSkeleton({
      now: NOV25,
      stats: undefined,
      competitors: [],
      rules,
      shares: { reach: 20, trust: 30, sale: 50 },
      category: "qandolat",
      hasPriceFact: true,
      hasOfferFact: false,
      approvedPosts: 12,
      lang: "uz",
      calendar: [{ id: "newyear-preorder", name: "Yangi yil buyurtmalari", daysAway: 6, kind: "preorder" }],
    });
    const slot = sk.slots.find((s) => s.calendarEvent);
    expect(slot?.goal).toBe("sale");
    expect(slot?.calendarKind).toBe("preorder");
  });

  it("R.CALENDAR never fires on a day off alone", () => {
    const rules = runRules(
      { channel: "x", postsInWindow: 0, maturePosts: 0, recentMedianN: 0, viewsAboveSubs: false, medianLowConfidence: true, postsPerWeek: 0, coldStart: true, formatLift: {}, hourLift: {}, weekdayLift: {}, langLift: {}, lengthLift: {}, saleShare: 0, promoShare: 0, ctaRate: 0, forwardShare: 0, hiddenPriceCount: 0, trustCoverage: 0, trustParts: [], emojiPer100: 0, hashtagsPerPost: 0, neuroDensity: 0, formatMix: { text: 0, photo: 0, album: 0, video: 0, other: 0 }, langShares: {}, offerTypeCounts60d: {}, lifts: [], suspectBoosted: false },
      { category: "kafe", competitors: [], calendar: [{ id: "constitution", name: "Constitution Day", daysAway: 5, kind: "notice" }] },
    );
    expect(rules.find((r) => r.id === "R.CALENDAR")?.status).toBe("not_fired");
  });
});

describe("one topic at most once a week", () => {
  const kb = "Kanal postlari (@tort):\n[2026-07-30] Medovik — 180 000 so'm. Napoleon — 150 000 so'm.\n\n[2026-11-01] Aksiya! 1-dekabrgacha 10% chegirma. Faqat shu hafta sovg'a quti.";
  const facts = [
    { id: "F1", type: "price", quote: "Medovik — 180 000 so'm" },
    { id: "F2", type: "price", quote: "Napoleon — 150 000 so'm" },
    { id: "F3", type: "offer", quote: "10% chegirma" },
    { id: "F4", type: "deadline", quote: "1-dekabrgacha" },
  ];
  const source = new Map(facts.map((f) => [f.id, factSourceOf(f.quote, kb)]).filter((x): x is [string, string] => Boolean(x[1])));
  const type = new Map(facts.map((f) => [f.id, f.type]));

  it("one promotion cited through its offer and its date is one topic; two products of one price list are not", () => {
    const items = [
      { slot: 1, hook: "Medovik torti", factIds: ["F1"] },
      { slot: 2, hook: "Napoleon torti", factIds: ["F2"] },
      { slot: 3, hook: "Chegirma bor", factIds: ["F3"] },
      { slot: 4, hook: "Dekabrgacha shoshiling", factIds: ["F4"] },
    ];
    const dups = duplicateItems(items, type, source);
    expect([...dups.keys()]).toEqual([4]);
    const { kept, dropped } = dropDuplicates(items, dups);
    expect(dropped).toEqual([4]);
    expect(kept.map((i) => i.slot)).toEqual([1, 2, 3]);
    expect(distinctTopics(facts, source)).toBe(3);
  });

  it("the tracked link is put in by code: in place of {{LINK}}, else appended once; none without the opt-in", () => {
    const link = "https://t.me/mercatai?start=src_ab12cd_2";
    expect(withTrackedLink("Yozing: {{LINK}}", link)).toBe(`Yozing: ${link}`);
    expect(withTrackedLink("Buyurtma bering", link)).toBe(`Buyurtma bering ${link}`);
    expect(withTrackedLink(`Yozing ${link}`, link)).toBe(`Yozing ${link}`);
    expect(withTrackedLink("Yozing: {{LINK}}", undefined)).toBe("Yozing");
    expect(withoutTrackedLinks(`Buyurtma: ${link}`)).toBe("Buyurtma");
    expect(planTrackedLink({ cta: `Yozing: ${link}` }, "mercatai")).toBe(link);
    expect(planTrackedLink({ cta: "Yozing: https://t.me/otherbot?start=src_ab12cd_2" }, "mercatai")).toBeUndefined();
    expect(planTrackedLink({ cta: `Yozing: ${link}` }, undefined)).toBeUndefined();
  });
});

describe("no internal ids in briefs; the UI language", () => {
  it("bare fact ids and the punctuation they leave are removed from briefs", () => {
    expect(stripIdsAll("Use facts F16, F7, F14, F10")).toBe("");
    expect(stripIdsAll("Подача: по фактам F16 и F10,; фото торта.")).toBe("Подача: фото торта.");
    expect(stripIdsAll("Medovik narxi 180 000 so'm (F4, F9): surat vitrinada.")).toBe("Medovik narxi 180 000 so'm: surat vitrinada.");
    expect(stripIdsAll("F1 poygasi haqida")).toBe("F1 poygasi haqida");
    expect(cleanBrief("Faktlar: F3. Surat: vitrina")).not.toMatch(/F3/);
  });

  it("langOf tells Uzbek, Russian and English apart", () => {
    expect(langOf("Mijozlar uchun yangi narxlar va bonuslar haqida post")).toBe("uz");
    expect(langOf("Пост о новых ценах для клиентов")).toBe("ru");
    expect(langOf("A post about the new prices for our customers")).toBe("en");
    expect(langOf("Medovik 180k")).toBe("unknown");
    expect(wrongLanguage("Mijozlar uchun yangi narxlar va bonuslar haqida post", "ru")).toBe(true);
    expect(wrongLanguage("Пост о новых ценах для клиентов", "ru")).toBe(false);
  });
});

describe("facts from all collected posts", () => {
  const DAY = 86_400_000;
  const post = (id: number, daysAgo: number, text: string): RawPost => ({
    id,
    channel: "tort",
    url: `https://t.me/tort/${id}`,
    text,
    postedAt: new Date(NOV25 - daysAgo * DAY).toISOString(),
    views: 500,
    approx: false,
    media: "photo",
    isForward: false,
    links: [],
  });
  const data: ChannelData = {
    channel: "tort",
    posts: [
      ...Array.from({ length: 14 }, (_, i) => post(200 - i, i + 1, `Bugun vitrinada yangi pirojniylar, ertalabdan issiq. Keling, tatib ko'ring! ${i}`)),
      post(10, 118, "Narxlar: Medovik — 180 000 so'm, Napoleon — 150 000 so'm. Buyurtma 2 kun oldin."),
      { ...post(9, 60, "Hamkorimiz do'konidan sovg'a!"), isForward: true },
    ],
    complete: false,
    pages: 4,
  };

  it("a 118-day-old price card is in the facts, first; forwards are not", () => {
    const kb = channelFactsKb(data, NOV25);
    expect(kb.indexOf("Medovik — 180 000 so'm")).toBeGreaterThan(-1);
    expect(kb.indexOf("Medovik")).toBeLessThan(kb.indexOf("pirojniylar"));
    expect(kb).not.toContain("Hamkorimiz");
    expect((kb.match(/^\[\d{4}-\d{2}-\d{2}\]/gm) ?? []).length).toBe(15);
  });

  it("prices older than 90 days are asked to confirm", () => {
    const kb = channelFactsKb(data, NOV25);
    expect(stalePriceLines([{ type: "price", quote: "Medovik — 180 000 so'm", text: "Medovik — 180 000 so'm" }], kb, NOV25)).toEqual(["Medovik — 180 000 so'm"]);
  });
});

describe("the customer link names the business only for a verified admin", () => {
  beforeEach(() => resetPlanOwnerCache());
  const plan = { ownerTelegramId: 42, channel: "safiabakery", brandName: "Safia Bakery" };

  it("an admin of the channel: the business is named; the check is cached for an hour", async () => {
    let calls = 0;
    const api = async (chat: string, user: number) => {
      calls++;
      expect([chat, user]).toEqual(["@safiabakery", 42]);
      return { status: "administrator" };
    };
    expect(await verifiedPlanBusiness(plan, api)).toEqual({ name: "Safia Bakery", channel: "safiabakery" });
    await verifiedPlanBusiness(plan, api);
    expect(calls).toBe(1);
  });

  it("not an admin, no owner, or Telegram fails: nothing is named", async () => {
    expect(await verifiedPlanBusiness(plan, async () => ({ status: "member" }))).toBeNull();
    resetPlanOwnerCache();
    expect(await verifiedPlanBusiness({ ...plan, ownerTelegramId: null }, async () => ({ status: "creator" }))).toBeNull();
    expect(
      await verifiedPlanBusiness(plan, async () => {
        throw new Error("network");
      }),
    ).toBeNull();
  });
});
