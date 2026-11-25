import { describe, expect, it } from "vitest";
import { friendlyCount, groupDigits, MIN_SHOWN, pluralForm, tractionLine } from "./traction-words";

describe("friendlyCount", () => {
  it("keeps small counts exact", () => {
    expect(friendlyCount(0)).toEqual({ value: 0, more: false });
    expect(friendlyCount(13)).toEqual({ value: 13, more: false });
    expect(friendlyCount(19)).toEqual({ value: 19, more: false });
  });

  it("rounds down to tens, fifties and hundreds, and says when it rounded", () => {
    expect(friendlyCount(66)).toEqual({ value: 60, more: true });
    expect(friendlyCount(70)).toEqual({ value: 70, more: false });
    expect(friendlyCount(99)).toEqual({ value: 90, more: true });
    expect(friendlyCount(100)).toEqual({ value: 100, more: false });
    expect(friendlyCount(149)).toEqual({ value: 100, more: true });
    expect(friendlyCount(151)).toEqual({ value: 150, more: true });
    expect(friendlyCount(1234)).toEqual({ value: 1200, more: true });
  });

  it("never rounds up and never goes negative", () => {
    for (let n = 0; n < 3000; n += 7) {
      const { value, more } = friendlyCount(n);
      expect(value).toBeLessThanOrEqual(n);
      expect(more).toBe(value < n);
    }
    expect(friendlyCount(-5)).toEqual({ value: 0, more: false });
    expect(friendlyCount(66.9)).toEqual({ value: 60, more: true });
  });
});

describe("pluralForm", () => {
  it("follows Russian one / few / many", () => {
    expect([1, 21, 101].map((n) => pluralForm("ru", n))).toEqual(["one", "one", "one"]);
    expect([2, 3, 4, 22, 34].map((n) => pluralForm("ru", n))).toEqual(["few", "few", "few", "few", "few"]);
    expect([5, 11, 12, 14, 20, 25, 60, 111].map((n) => pluralForm("ru", n))).toEqual(Array(8).fill("many"));
  });

  it("needs only one and many in Uzbek and English", () => {
    expect(pluralForm("en", 1)).toBe("one");
    expect(pluralForm("en", 2)).toBe("many");
    expect(pluralForm("uz", 1)).toBe("one");
    expect(pluralForm("uz", 25)).toBe("many");
  });
});

describe("tractionLine", () => {
  it("says 'more than' whenever the people count was rounded", () => {
    expect(tractionLine("en", "people", 66)).toEqual({ figure: 60, before: "More than", after: "people have tried Mercat", sentence: "More than 60 people have tried Mercat" });
    expect(tractionLine("ru", "people", 66)).toEqual({ figure: 60, before: "Больше", after: "человек попробовали Mercat", sentence: "Больше 60 человек попробовали Mercat" });
    expect(tractionLine("uz", "people", 66)).toEqual({ figure: 60, before: "", after: "dan ortiq kishi Mercat’ni sinab ko‘rdi", sentence: "60 dan ortiq kishi Mercat’ni sinab ko‘rdi" });
  });

  it("gives an exact count plain words, in the right form", () => {
    expect(tractionLine("en", "people", 70)?.sentence).toBe("70 people have tried Mercat");
    expect(tractionLine("ru", "people", 70)?.sentence).toBe("70 человек попробовали Mercat");
    expect(tractionLine("ru", "people", 12)?.sentence).toBe("12 человек попробовали Mercat");
    expect(tractionLine("uz", "people", 70)?.before).toBe("");
  });

  it("keeps channels exact, with Russian forms", () => {
    expect(tractionLine("ru", "channels", 25)).toMatchObject({ figure: 25, after: "каналов уже разобрал Mercat" });
    expect(tractionLine("ru", "channels", 21)?.sentence).toBe("21 канал уже разобрал Mercat");
    expect(tractionLine("ru", "channels", 23)?.sentence).toBe("23 канала уже разобрал Mercat");
    expect(tractionLine("en", "channels", 25)?.sentence).toBe("25 channels analysed so far");
    expect(tractionLine("uz", "channels", 25)?.sentence).toBe("25 ta kanal tahlil qilindi");
  });

  it("hides counts too small to say anything, and broken numbers", () => {
    expect(tractionLine("en", "people", MIN_SHOWN.people - 1)).toBeNull();
    expect(tractionLine("en", "channels", MIN_SHOWN.channels - 1)).toBeNull();
    expect(tractionLine("en", "people", Number.NaN)).toBeNull();
    expect(tractionLine("en", "people", MIN_SHOWN.people)).not.toBeNull();
  });

  it("groups thousands the way the posts write numbers", () => {
    expect(groupDigits(1200, "uz")).toBe("1 200");
    expect(groupDigits(1200, "en")).toBe("1,200");
    expect(tractionLine("en", "people", 1234)?.sentence).toBe("More than 1,200 people have tried Mercat");
  });
});
