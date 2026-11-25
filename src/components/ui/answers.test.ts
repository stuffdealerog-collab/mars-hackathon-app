import { describe, expect, it } from "vitest";
import { answersBody, initialAnswers, type Question } from "./answers";

const goal: Question = {
  key: "goal",
  text: "Kanalning asosiy maqsadi nima?",
  input: "choice",
  options: [
    { value: "sale", label: "Ko‘proq buyurtma" },
    { value: "grow", label: "Ko‘proq obunachi" },
  ],
  prefill: "grow",
};
const order: Question = {
  key: "order",
  text: "Buyurtmalarni +998 90 123 45 67 orqali qabul qilasizmi?",
  input: "choice",
  options: ["phone", "manager", "own_bot", "site", "mercat_link"].map((value) => ({ value, label: value })),
  prefill: "phone",
};
const prices: Question = { key: "prices", text: "Narxlar?", input: "prices", prefill: [{ name: "Patir", price: "" }, { name: "Obi non", price: "" }] };
const about: Question = { key: "about", text: "Kanal nima haqida?", input: "text" };

describe("initialAnswers", () => {
  it("starts from the engine's prefill: the goal from the channel type, the product rows", () => {
    expect(initialAnswers([goal, order, prices])).toEqual({
      goal: "grow",
      order: "phone",
      prices: [
        { name: "Patir", price: "" },
        { name: "Obi non", price: "" },
        { name: "", price: "" },
      ],
    });
  });

  it("leaves a text question empty", () => {
    expect(initialAnswers([about])).toEqual({ about: "" });
  });
});

describe("answersBody", () => {
  it("sends only the questions that were asked, with known values", () => {
    expect(answersBody([goal, about], { goal: "sale", about: "  Bolalar kitoblari haqida  ", order: "phone" })).toEqual({ goal: "sale", about: "Bolalar kitoblari haqida" });
  });

  it("maps the order question to orderHow and keeps a typed contact", () => {
    expect(answersBody([order], { order: "manager", contact: " @nonvoy_admin " })).toEqual({ orderHow: "manager", contact: "@nonvoy_admin" });
  });

  it("never sends an option the engine did not offer", () => {
    expect(answersBody([goal], { goal: "everything" })).toBeNull();
  });

  it("keeps only full price rows, 5 at most", () => {
    const rows = [
      { name: "Patir", price: "12 000" },
      { name: "Obi non", price: "" },
      { name: "", price: "5 000" },
      ...Array.from({ length: 6 }, (_, i) => ({ name: `N${i}`, price: `${i + 1}000` })),
    ];
    const body = answersBody([prices], { prices: rows });
    expect(body?.prices?.[0]).toEqual({ name: "Patir", price: "12 000" });
    expect(body?.prices).toHaveLength(5);
  });

  it("is null when nothing was answered (the owner pressed save on an empty card)", () => {
    expect(answersBody([about, prices], { about: "  ", prices: [{ name: "", price: "" }] })).toBeNull();
  });
});
