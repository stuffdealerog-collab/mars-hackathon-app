import { describe, expect, it } from "vitest";
import type { Lang } from "../ui/format";
import { figureBelow, groupDigits, MIN_SHOWN, pluralForm, tractionLine, tractionNote } from "./traction-words";

const LANGS: Lang[] = ["uz", "ru", "en"];
const MORE = { uz: "dan ortiq", ru: "Больше", en: "More than" } as const;

describe("figureBelow", () => {
  it("gives the friendly figure strictly below the count", () => {
    expect(figureBelow(66)).toBe(60);
    expect(figureBelow(60)).toBe(50);
    expect(figureBelow(61)).toBe(60);
    expect(figureBelow(100)).toBe(90);
    expect(figureBelow(101)).toBe(100);
    expect(figureBelow(149)).toBe(100);
    expect(figureBelow(151)).toBe(150);
    expect(figureBelow(1000)).toBe(950);
    expect(figureBelow(1234)).toBe(1200);
  });

  it("is always below the count and never negative", () => {
    for (let n = 2; n < 5000; n += 1) {
      const f = figureBelow(n);
      expect(f).toBeLessThan(n);
      expect(f).toBeGreaterThanOrEqual(0);
    }
    expect(figureBelow(-5)).toBe(0);
    expect(figureBelow(Number.NaN)).toBe(0);
    expect(figureBelow(66.9)).toBe(60);
  });
});

describe("tractionLine: the label never says more than was measured", () => {
  it("prints a people figure below every measured count, with 'more than' in the words, in every language", () => {
    for (const lang of LANGS) {
      for (let n = 0; n < 3000; n += 1) {
        const line = tractionLine(lang, "people", n);
        if (n < MIN_SHOWN.people) {
          expect(line).toBeNull();
          continue;
        }
        expect(line).not.toBeNull();
        expect(line!.figure).toBeLessThan(n);
        expect(line!.sentence).toContain(MORE[lang]);
        expect(line!.sentence).toContain(groupDigits(line!.figure, lang));
      }
    }
  });

  it("never prints a channels figure above the count", () => {
    for (const lang of LANGS) {
      for (let n = MIN_SHOWN.channels; n < 500; n += 1) expect(tractionLine(lang, "channels", n)!.figure).toBeLessThanOrEqual(n);
    }
  });

  it("reads the people line in each language", () => {
    expect(tractionLine("en", "people", 66)).toEqual({ figure: 60, before: "More than", after: "people have tried Mercat", sentence: "More than 60 people have tried Mercat" });
    expect(tractionLine("ru", "people", 66)).toEqual({ figure: 60, before: "Больше", after: "человек попробовали Mercat", sentence: "Больше 60 человек попробовали Mercat" });
    expect(tractionLine("uz", "people", 66)).toEqual({ figure: 60, before: "", after: "dan ortiq kishi Mercat’ni sinab ko‘rdi", sentence: "60 dan ortiq kishi Mercat’ni sinab ko‘rdi" });
    // An exactly round count still says "more than" a figure below it.
    expect(tractionLine("en", "people", 70)?.sentence).toBe("More than 60 people have tried Mercat");
  });

  it("keeps channels exact, with Russian forms", () => {
    expect(tractionLine("ru", "channels", 25)).toMatchObject({ figure: 25, after: "каналов уже разобрал Mercat" });
    expect(tractionLine("ru", "channels", 21)?.sentence).toBe("21 канал уже разобрал Mercat");
    expect(tractionLine("ru", "channels", 23)?.sentence).toBe("23 канала уже разобрал Mercat");
    expect(tractionLine("en", "channels", 25)?.sentence).toBe("25 channels analysed so far");
    expect(tractionLine("uz", "channels", 25)?.sentence).toBe("25 ta kanal tahlil qilindi");
  });

  it("hides counts that are missing, too small or broken", () => {
    expect(tractionLine("en", "people", MIN_SHOWN.people - 1)).toBeNull();
    expect(tractionLine("en", "channels", MIN_SHOWN.channels - 1)).toBeNull();
    expect(tractionLine("en", "people", Number.NaN)).toBeNull();
    expect(tractionLine("en", "people", null)).toBeNull();
    expect(tractionLine("en", "people", undefined)).toBeNull();
    expect(tractionLine("en", "people", MIN_SHOWN.people)).not.toBeNull();
  });

  it("groups thousands the way the posts write numbers", () => {
    expect(groupDigits(1200, "uz")).toBe("1 200");
    expect(groupDigits(1200, "en")).toBe("1,200");
    expect(tractionLine("en", "people", 1234)?.sentence).toBe("More than 1,200 people have tried Mercat");
  });

  it("says in the note what was counted and what was not", () => {
    expect(tractionNote("en")).toMatch(/team left out/);
    expect(tractionNote("en")).toMatch(/website visitors are not counted/);
    expect(tractionNote("ru")).toMatch(/без нашей команды/);
    expect(tractionNote("uz")).toMatch(/jamoamizsiz/);
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
