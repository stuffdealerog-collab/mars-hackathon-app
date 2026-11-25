import { describe, expect, it } from "vitest";
import { answeredContact, answersText, mayTrackLinks, mergeAnswers } from "../src/lib/uslub/brain/answers";
import { questionsForBrand } from "../src/lib/uslub/brain/brand-questions";
import { planTypeFor } from "../src/lib/uslub/brain/channel-type";
import { runQuestions } from "../src/lib/uslub/brain/questions";
import type { BrandDNA } from "../src/lib/uslub/contract";

describe("runQuestions", () => {
  it("a business: the goal first (pre-filled 'sale'), then how customers order and the prices", () => {
    const q = runQuestions({ lang: "uz", channelType: "business", priceFacts: 0, products: ["Medovik", "Napoleon"] });
    expect(q.map((x) => x.key)).toEqual(["goal", "order", "prices"]);
    expect(q[0].prefill).toBe("sale");
    expect(q[2].prefill).toEqual([
      { name: "Medovik", price: "" },
      { name: "Napoleon", price: "" },
    ]);
  });

  it("a contact found in the posts turns the order question into a confirmation", () => {
    const q = runQuestions({ lang: "ru", channelType: "business", contact: "+998 90 123 45 67", priceFacts: 3 });
    const order = q.find((x) => x.key === "order");
    expect(order?.text).toBe("Заказы принимаете по +998 90 123 45 67?");
    expect(order?.prefill).toBe("phone");
    // 3 current prices are known: no prices question.
    expect(q.some((x) => x.key === "prices")).toBe(false);
  });

  it("old prices are confirmed, not asked again", () => {
    const q = runQuestions({ lang: "en", channelType: "business", priceFacts: 0, stalePrices: ["Medovik — 180 000 so'm"] });
    const p = q.find((x) => x.key === "prices");
    expect(p?.text).toMatch(/still current/);
    expect(p?.prefill).toEqual([{ name: "Medovik", price: "180 000 so'm" }]);
  });

  it("a blog is asked its goal (pre-filled 'grow') and what the channel is about, never prices or orders", () => {
    const q = runQuestions({ lang: "uz", channelType: "blog", priceFacts: 0, products: ["x"] });
    expect(q.map((x) => x.key)).toEqual(["goal", "about"]);
    expect(q[0].prefill).toBe("grow");
  });

  it("answered questions are never asked again; the answered goal decides the rest", () => {
    expect(runQuestions({ lang: "uz", channelType: "blog", answers: { goal: "grow", about: "kitoblar" } })).toEqual([]);
    // A shop that wants subscribers is asked what the channel is about.
    expect(runQuestions({ lang: "uz", channelType: "business", answers: { goal: "grow" } }).map((x) => x.key)).toEqual(["about"]);
    // An expert who wants orders is asked how customers order.
    expect(runQuestions({ lang: "uz", channelType: "expert", answers: { goal: "sale" }, priceFacts: 5 }).map((x) => x.key)).toEqual(["order"]);
  });

  it("the plan follows the goal: a shop wanting subscribers plans for growth, an expert wanting orders plans for sales", () => {
    expect(planTypeFor("business", "grow")).not.toBe("business");
    expect(planTypeFor("expert", "sale")).toBe("business");
    expect(planTypeFor("blog", undefined)).toBe("blog");
    expect(planTypeFor(undefined, undefined)).toBe("business");
  });

  it("questionsForBrand reads the brand: its type, the contact its posts end with, price posts", () => {
    const dna = { products: ["Patir"], postEnding: { pattern: "contact", contact: "📞 +998 90 123 45 67", examples: [] } } as unknown as BrandDNA;
    const q = questionsForBrand({ channelType: "business", dna, samplePosts: ["Patir 5 000 so'm", "Non 4 000 so'm", "Somsa 7 000 so'm"], knowledge: "" }, null, "uz");
    expect(q.map((x) => x.key)).toEqual(["goal", "order"]);
    expect(q[1].text).toContain("+998 90 123 45 67");
  });
});

describe("owner answers", () => {
  it("merge keeps what was not sent, trims, caps prices at 5", () => {
    const a = mergeAnswers({ goal: "sale", contact: "+998 90 000 00 00" }, { prices: Array.from({ length: 7 }, (_, i) => ({ name: ` Tort ${i} `, price: "100 000" })), at: "2026-11-25T00:00:00Z" });
    expect(a.goal).toBe("sale");
    expect(a.contact).toBe("+998 90 000 00 00");
    expect(a.prices).toHaveLength(5);
    expect(a.prices?.[0]).toEqual({ name: "Tort 0", price: "100 000" });
  });

  it("the answers become plain knowledge lines the facts step can quote", () => {
    const t = answersText({ orderHow: "phone", contact: "+998 90 123 45 67", prices: [{ name: "Medovik", price: "180 000 so'm" }] }, "ru");
    expect(t).toContain("Заказ: по телефону — +998 90 123 45 67");
    expect(t).toContain("Medovik — 180 000 so'm");
    expect(answersText(null)).toBe("");
  });

  it("the tracked link is opt-in and never on a brand without an owner", () => {
    expect(mayTrackLinks({ trackLinks: true }, null)).toBe(false);
    expect(mayTrackLinks({ trackLinks: true }, 42)).toBe(true);
    expect(mayTrackLinks({ orderHow: "mercat_link" }, 42)).toBe(true);
    expect(mayTrackLinks({}, 42)).toBe(false);
    expect(mayTrackLinks(null, 42)).toBe(false);
    expect(answeredContact({ orderHow: "mercat_link", contact: "x" })).toBeUndefined();
    expect(answeredContact({ orderHow: "manager", contact: "@dilnoza" })).toBe("@dilnoza");
  });
});
